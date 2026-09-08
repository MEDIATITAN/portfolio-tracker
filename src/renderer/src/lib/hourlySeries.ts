import type {
  FxRate,
  HistoricalFxEntry,
  HistoricalPriceEntry,
  IntradayPriceEntry,
  Position
} from '@shared/types'
import { commodityPricingUnit } from '@shared/commodities'
import { convertQuantity, findFxRate } from '@shared/valueCalc'

export interface HourlyPoint {
  timestamp: number
  value: number
}

const HOUR_MS = 60 * 60 * 1000

/**
 * Wertverlauf in Stundenschritten - unabhängig davon, ob die App zu dieser Stunde lief.
 *
 * Warum es das braucht: Die gespeicherten Momentaufnahmen entstehen nur bei einem Kursabruf, also
 * nur bei geöffneter App. Über Nacht klaffte dadurch eine Lücke von vierzehn Stunden im
 * Tagesverlauf. Hier wird der Depotwert stattdessen für JEDE Stunde aus den Stundenkursen
 * nachgerechnet.
 *
 * Was das nicht heilen kann: Aktien und ETFs haben nachts und am Wochenende KEINEN Kurs, weil
 * dann nicht gehandelt wird. Ihr Beitrag bleibt in dieser Zeit auf dem letzten Kurs stehen - das
 * ist keine Näherung, sondern der tatsächliche Zustand. Bewegung kommt in diesen Stunden allein
 * von Krypto, das rund um die Uhr gehandelt wird.
 */
export function buildHourlySeries(
  positions: Position[],
  intraday: IntradayPriceEntry[],
  dailyPrices: HistoricalPriceEntry[],
  dailyFxRates: HistoricalFxEntry[],
  liveFxRates: FxRate[],
  fromMs: number,
  toMs: number
): HourlyPoint[] {
  if (positions.length === 0) return []

  const intradayByIdentifier = new Map<string, { ms: number; price: number; currency: string }[]>()
  for (const p of intraday) {
    const arr = intradayByIdentifier.get(p.identifier)
    const point = { ms: Date.parse(p.ts), price: p.price, currency: p.currency }
    if (arr) arr.push(point)
    else intradayByIdentifier.set(p.identifier, [point])
  }
  for (const arr of intradayByIdentifier.values()) arr.sort((a, b) => a.ms - b.ms)

  const dailyByIdentifier = new Map<string, { ms: number; price: number; currency: string }[]>()
  for (const p of dailyPrices) {
    const arr = dailyByIdentifier.get(p.identifier)
    // Ein Tageskurs gilt ab dem Ende seines Handelstages - vorher wäre er ein Blick in die Zukunft.
    const point = { ms: Date.parse(`${p.date}T23:59:59Z`), price: p.price, currency: p.currency }
    if (arr) arr.push(point)
    else dailyByIdentifier.set(p.identifier, [point])
  }
  for (const arr of dailyByIdentifier.values()) arr.sort((a, b) => a.ms - b.ms)

  const latestDailyFx = new Map<string, number>()
  for (const f of dailyFxRates) {
    if (f.base !== 'EUR' || f.rate === 0) continue
    latestDailyFx.set(f.quote, 1 / f.rate)
  }

  /**
   * Umrechnungsfaktor einer Marktwährung nach Euro. USDT ist keine Währung im Sinne der
   * Wechselkurstabelle, aber an den Dollar gebunden - Binance notiert darin.
   */
  function rateToEur(currency: string): number | null {
    if (currency === 'EUR') return 1
    const quote = currency === 'USDT' ? 'USD' : currency
    return findFxRate(liveFxRates, quote, 'EUR') ?? latestDailyFx.get(quote) ?? null
  }

  interface Tracked {
    position: Position
    pricingQuantity: number
    intradaySeries: { ms: number; price: number; currency: string }[]
    dailySeries: { ms: number; price: number; currency: string }[]
    intradayCursor: number
    dailyCursor: number
    /** Konstanter Eurobetrag (Cash) - dann werden keine Kurse gebraucht. */
    fixedEur: number | null
  }

  const tracked: Tracked[] = []
  for (const position of positions) {
    if (position.assetClass === 'CASH_OTHER') {
      const rate = rateToEur(position.currency)
      const value = position.manualValue
      tracked.push({
        position,
        pricingQuantity: 0,
        intradaySeries: [],
        dailySeries: [],
        intradayCursor: 0,
        dailyCursor: 0,
        // Cash schwankt innerhalb eines Tages nicht - es bleibt über den ganzen Zeitraum stehen.
        fixedEur: value !== null && rate !== null ? value * rate : null
      })
      continue
    }
    if (!position.identifier) continue

    const pricingUnit =
      position.assetClass === 'COMMODITY' ? commodityPricingUnit(position.identifier) : null
    const pricingQuantity =
      pricingUnit && position.quantityUnit
        ? convertQuantity(position.quantity, position.quantityUnit, pricingUnit)
        : position.quantity

    tracked.push({
      position,
      pricingQuantity,
      intradaySeries: intradayByIdentifier.get(position.identifier) ?? [],
      dailySeries: dailyByIdentifier.get(position.identifier) ?? [],
      intradayCursor: 0,
      dailyCursor: 0,
      fixedEur: null
    })
  }

  const points: HourlyPoint[] = []
  const start = Math.ceil(fromMs / HOUR_MS) * HOUR_MS

  for (let hour = start; hour <= toMs; hour += HOUR_MS) {
    let total = 0
    let contributions = 0

    for (const t of tracked) {
      if (t.fixedEur !== null) {
        total += t.fixedEur
        contributions++
        continue
      }
      // Die Stunden laufen aufsteigend, die Zeiger wandern deshalb nur vorwärts.
      while (
        t.intradayCursor < t.intradaySeries.length &&
        t.intradaySeries[t.intradayCursor].ms <= hour
      ) {
        t.intradayCursor++
      }
      while (t.dailyCursor < t.dailySeries.length && t.dailySeries[t.dailyCursor].ms <= hour) {
        t.dailyCursor++
      }
      const fromIntraday = t.intradayCursor > 0 ? t.intradaySeries[t.intradayCursor - 1] : null
      const fromDaily = t.dailyCursor > 0 ? t.dailySeries[t.dailyCursor - 1] : null
      // Der jüngere von beiden gewinnt: ein Stundenkurs von heute Mittag ist näher dran als der
      // Schlusskurs von gestern, ein Schlusskurs von gestern näher als ein Stundenkurs von vorletzter
      // Woche.
      const best =
        fromIntraday && fromDaily
          ? fromIntraday.ms >= fromDaily.ms
            ? fromIntraday
            : fromDaily
          : (fromIntraday ?? fromDaily)
      if (!best) continue
      const rate = rateToEur(best.currency)
      if (rate === null) continue
      total += t.pricingQuantity * best.price * rate
      contributions++
    }

    if (contributions > 0) points.push({ timestamp: hour, value: total })
  }

  return points
}
