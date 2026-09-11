import * as savingsPlanRepo from '../db/savingsPlanRepo'
import * as positionsRepo from '../db/positionsRepo'
import * as transactionsRepo from '../db/transactionsRepo'
import * as historicalRepo from '../db/historicalRepo'
import * as intradayRepo from '../db/intradayRepo'
import * as priceCacheRepo from '../db/priceCacheRepo'
import * as fxRepo from '../db/fxRepo'
import * as ledgerService from './ledgerService'
import { PERIOD_MONTHS } from '../../shared/budget'
import { findFxRate } from '../../shared/valueCalc'
import type { SavingsPlan, SavingsPlanWithStats } from '../../shared/types'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Alle Ausführungstermine eines Plans von seinem Beginn bis `until`.
 *
 * Gerechnet wird in Monaten ab dem Startmonat, der Tag kommt aus executionDay - nicht durch
 * fortlaufendes Addieren von Tagen. Sonst wanderte ein Plan, der am 31. beginnt, über die Monate
 * hinweg immer weiter nach vorn.
 */
export function dueDates(plan: SavingsPlan, until: string): string[] {
  const step = PERIOD_MONTHS[plan.period]
  const start = new Date(`${plan.startDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return []

  const dates: string[] = []
  // Erster Termin: im Startmonat, falls der Ausführungstag noch nicht vorbei ist - sonst im
  // nächsten Zyklus. Ein am 20. angelegter Plan mit Termin zum 1. bucht nicht rückwirkend.
  const year = start.getUTCFullYear()
  let month = start.getUTCMonth()
  if (start.getUTCDate() > plan.executionDay) month += step

  for (let guard = 0; guard < 600; guard++) {
    const date = new Date(Date.UTC(year, month, plan.executionDay))
    const iso = date.toISOString().slice(0, 10)
    if (iso > until) break
    if (plan.endDate !== null && iso > plan.endDate) break
    dates.push(iso)
    month += step
  }
  return dates
}

/**
 * Wie viele Tage der Live-Kurs höchstens vom Ausführungstag entfernt sein darf, um ihn ersatzweise
 * zu verwenden. Deckt den heutigen Termin ab, für den es abends noch keinen Tagesschlusskurs gibt,
 * sowie ein Wochenende.
 */
const LIVE_PRICE_MAX_AGE_DAYS = 3

/**
 * Wie weit ein Stundenkurs vor der Ausführungszeit liegen darf. Vier Stunden decken eine
 * Mittagspause oder eine Uhrzeit kurz vor Börsenschluss ab; weiter zurück wäre der Tagesschluss
 * die bessere Angabe.
 */
const INTRADAY_TOLERANCE_MS = 4 * 60 * 60 * 1000

/** Wandelt Datum plus 'HH:MM' aus DEINER Zeitzone in den Zeitstempel um, unter dem Kurse liegen (UTC). */
function toTimestamp(date: string, time: string): number | null {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null
  return new Date(y, m - 1, d, hh, mm).getTime()
}

/**
 * Kurs zur eingestellten Uhrzeit, falls für diesen Zeitpunkt ein Stundenkurs vorliegt.
 *
 * Nur die letzten Tage sind abgedeckt (siehe INTRADAY_DAYS in priceService) und nicht jedes
 * Wertpapier hat Stundenkurse. Ohne Treffer gilt der Tagesschlusskurs - deshalb ist die Uhrzeit
 * eine Verfeinerung und keine Voraussetzung.
 */
function intradayPriceFor(
  identifier: string,
  date: string,
  time: string
): { price: number; currency: string } | null {
  const target = toTimestamp(date, time)
  if (target === null || target > Date.now()) return null
  const hit = intradayRepo.intradayPriceAt(
    identifier,
    new Date(target).toISOString(),
    new Date(target - INTRADAY_TOLERANCE_MS).toISOString()
  )
  return hit && hit.price > 0 ? { price: hit.price, currency: hit.currency } : null
}

/**
 * Kurs und Währung, mit denen eine Ausführung gebucht wird.
 *
 * Ist eine Uhrzeit eingestellt und liegt für sie ein Stundenkurs vor, gilt dieser. Sonst der
 * Tageskurs des Ausführungstages oder der letzte davor - an Wochenenden und Feiertagen wird nicht
 * gehandelt. Der Live-Kurs kommt nur für einen Termin von HEUTE in Frage: ihn auch für
 * zurückliegende Termine zu nehmen war ein Fehler - eine Ausführung vom April bekam dadurch den
 * Kurs von heute und damit eine falsche Stückzahl.
 *
 * Gibt es für einen zurückliegenden Termin keinen Kurs, wird nicht gebucht. Der Termin bleibt
 * offen und wird nachgeholt, sobald die Kursreihe weit genug zurückreicht (siehe
 * ensureHistoryForSavingsPlans) - eine Buchung mit geratenem Preis wäre schlimmer als eine späte.
 */
function priceFor(
  identifier: string,
  date: string,
  time: string | null
): { price: number; currency: string } | null {
  if (time !== null) {
    const hourly = intradayPriceFor(identifier, date, time)
    if (hourly) return hourly
  }
  const stored = historicalRepo.priceOnOrBefore(identifier, date)
  if (stored && stored.price > 0) {
    return { price: stored.price, currency: stored.currency }
  }
  const ageDays = (Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000
  if (ageDays > LIVE_PRICE_MAX_AGE_DAYS) return null
  const live = priceCacheRepo.listPriceCache().find((e) => e.identifier === identifier)
  if (live && live.price > 0 && live.fetchError === null) {
    return { price: live.price, currency: live.currency }
  }
  return null
}

/**
 * Rechnet den Sparplanbetrag in die Währung um, in der der Kurs notiert - erst dann ergibt
 * Betrag geteilt durch Kurs eine Stückzahl. Bevorzugt der Wechselkurs des Ausführungstages, sonst
 * der heutige.
 */
function amountInPriceCurrency(
  amount: number,
  from: string,
  to: string,
  date: string
): number | null {
  if (from === to) return amount
  const historical =
    historicalRepo.fxRateOnOrBefore(from, to, date) ??
    (() => {
      const back = historicalRepo.fxRateOnOrBefore(to, from, date)
      return back !== null && back !== 0 ? 1 / back : null
    })()
  if (historical !== null) return amount * historical
  const live = findFxRate(fxRepo.listFxRates(), from, to)
  return live === null ? null : amount * live
}

/**
 * Bucht alle fälligen Ausführungen nach und liefert deren Anzahl.
 *
 * Läuft bei jedem Kursabruf mit. Termine, die schon eine Buchung haben, werden übersprungen -
 * maßgeblich ist dabei der Monat und nicht das exakte Datum, denn die echte Abrechnung des Brokers
 * ersetzt die vorgemerkte Buchung und trägt dann ein anderes Datum (siehe csvImportService).
 * Ohne diese Regel hätte der Plan die ersetzte Ausführung sofort wieder angelegt.
 */
export function runDuePlans(): number {
  const now = today()
  const positions = new Map(positionsRepo.listPositions().map((p) => [p.id, p]))
  let booked = 0
  const touched = new Set<number>()

  for (const plan of savingsPlanRepo.listSavingsPlans()) {
    if (!plan.active) continue
    const position = positions.get(plan.positionId)
    if (!position || !position.identifier) continue

    const bookedMonths = new Set(
      transactionsRepo
        .listTransactionsByPosition(plan.positionId)
        .filter((t) => t.savingsPlanId === plan.id)
        .map((t) => t.date.slice(0, 7))
    )
    // Monate, in denen bereits ein echter Kauf steht, gelten als erledigt: dort hat die
    // Abrechnung des Brokers die Vormerkung ersetzt.
    for (const t of transactionsRepo.listTransactionsByPosition(plan.positionId)) {
      if (t.type === 'BUY' && t.savingsPlanId === null) bookedMonths.add(t.date.slice(0, 7))
    }

    for (const date of dueDates(plan, now)) {
      if (bookedMonths.has(date.slice(0, 7))) continue
      // Ist für heute eine Uhrzeit eingestellt, die noch nicht erreicht ist, wird noch nicht
      // gebucht - sonst bekäme die Ausführung einen Kurs von vor ihrem eigenen Termin.
      if (date === now && plan.executionTime !== null) {
        const target = toTimestamp(date, plan.executionTime)
        if (target !== null && Date.now() < target) continue
      }
      const quote = priceFor(position.identifier, date, plan.executionTime)
      if (!quote) continue
      const amount = amountInPriceCurrency(plan.amount, plan.currency, quote.currency, date)
      if (amount === null || amount <= 0) continue

      transactionsRepo.createTransaction({
        positionId: plan.positionId,
        type: 'BUY',
        quantity: amount / quote.price,
        price: quote.price,
        currency: quote.currency,
        date,
        broker: null,
        notes: 'Sparplan',
        savingsPlanId: plan.id
      })
      bookedMonths.add(date.slice(0, 7))
      touched.add(plan.positionId)
      booked++
    }
  }

  for (const positionId of touched) ledgerService.recomputePosition(positionId)
  if (booked > 0) console.log(`Sparpläne: ${booked} Ausführung(en) nachgebucht`)
  return booked
}

/** Die Pläne mit dem, was aus ihren Buchungen bisher geworden ist - für die Sparplan-Seite. */
export function listWithStats(): SavingsPlanWithStats[] {
  const positions = new Map(positionsRepo.listPositions().map((p) => [p.id, p]))
  const now = today()

  return savingsPlanRepo.listSavingsPlans().map((plan) => {
    const position = positions.get(plan.positionId)
    const bookings = transactionsRepo.listTransactionsByPlan(plan.id)
    const investedTotal = bookings.reduce((sum, t) => sum + t.quantity * t.price, 0)
    const quantityTotal = bookings.reduce((sum, t) => sum + t.quantity, 0)
    // Der nächste Termin ist der erste, der noch nicht gelaufen ist. Bewusst über die
    // Terminliste und nicht "letzte Buchung plus ein Monat": bei einem pausierten und wieder
    // gestarteten Plan wäre das falsch.
    const upcoming = dueDates(
      plan,
      new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    ).find((d) => d > now)

    return {
      ...plan,
      positionName: position?.name ?? 'Unbekannte Position',
      assetClass: position?.assetClass ?? 'STOCK_ETF',
      executions: bookings.length,
      investedTotal,
      quantityTotal,
      nextExecution: plan.active ? (upcoming ?? null) : null,
      lastExecution: bookings.length > 0 ? bookings[bookings.length - 1].date : null
    }
  })
}
