import * as etfCompositionRepo from '../db/etfCompositionRepo'
import * as positionsRepo from '../db/positionsRepo'
import * as yahooService from './yahooService'
import * as onvistaService from './onvistaService'
import { sectorLabelDe } from '../../shared/sectors'
import type { EtfCompositionEntry, Position } from '../../shared/types'

const DAY_MS = 24 * 60 * 60 * 1000
/** Fondszusammensetzungen ändern sich langsam - einmal pro Woche neu holen reicht völlig. */
const MAX_AGE_MS = 7 * DAY_MS

/** Länder-Cache über alle Fonds hinweg: dieselbe Aktie steckt oft in mehreren ETFs. */
const countryCache = new Map<string, string | null>()

async function resolveCountry(symbol: string): Promise<string | null> {
  const cached = countryCache.get(symbol)
  if (cached !== undefined) return cached
  const profile = await yahooService.getAssetProfile(symbol)
  countryCache.set(symbol, profile.region)
  return profile.region
}

function isFresh(fetchedAt: string | null): boolean {
  if (fetchedAt === null) return false
  return Date.now() - new Date(fetchedAt).getTime() < MAX_AGE_MS
}

/**
 * Sorgt dafür, dass zu einem ETF eine ISIN gespeichert ist - sie ist der Schlüssel für die
 * onvista-Abfrage. Beim CSV-Import kommt sie aus der Broker-Datei; für Positionen, die von Hand
 * oder vor Einführung der Spalte angelegt wurden, wird sie einmalig über den Fondsnamen gesucht.
 * Bleibt die Suche unsicher, wird bewusst nichts gespeichert (siehe findIsinByName) - eine falsche
 * Tranche würde eine plausibel aussehende, aber falsche Länderaufteilung liefern.
 */
async function ensureIsin(position: Position): Promise<string | null> {
  if (position.isin) return position.isin
  const found = await onvistaService.findIsinByName(position.name)
  if (!found) return null
  positionsRepo.updatePosition({ id: position.id, isin: found.isin })
  console.log(`ISIN für "${position.name}" ermittelt: ${found.isin} (onvista: "${found.name}")`)
  return found.isin
}

/**
 * Holt Sektor- und Länderaufteilung eines ETFs.
 *
 * SEKTOREN kommen von Yahoo: dort ist die Gewichtung vollständig (summiert auf 100% des Fonds) und
 * die Bezeichnungen passen zu denen der Einzelaktien. Bewusst NICHT von onvista - dessen Branchen
 * heißen anders ("IT/Telekommunikation"), gemischt zerfiele derselbe Sektor in zwei Scheiben.
 *
 * LÄNDER kommen bevorzugt von onvista, das die vom Fondsanbieter gemeldete Aufteilung
 * veröffentlicht (bei den Fonds dieses Depots 96,7-100% Abdeckung). Yahoo gibt für Fonds keine
 * Länderaufteilung heraus; der bisherige Weg über die abrufbaren Top-Holdings kommt je nach Fonds
 * nur auf 37-68% und bleibt deshalb der Rückfall, wenn onvista nichts liefert.
 *
 * Der nicht abgedeckte Rest wird hier bewusst NICHT auf 100% hochgerechnet - die Entscheidung, ob
 * eine kleine Restlücke als Rundung geglättet oder offen ausgewiesen wird, trifft die
 * Renderer-Seite anhand der Abdeckung (siehe regionBreakdown).
 */
export async function ensureComposition(position: Position): Promise<void> {
  const identifier = position.identifier
  if (!identifier || position.securityType !== 'ETF') return
  if (isFresh(etfCompositionRepo.lastFetchedAt(identifier))) return

  try {
    const now = new Date().toISOString()
    const entries: Omit<EtfCompositionEntry, 'identifier'>[] = []

    const holdings = await yahooService.getTopHoldings(identifier)
    for (const s of holdings?.sectorWeightings ?? []) {
      if (s.weight > 0)
        entries.push({
          kind: 'SECTOR',
          label: sectorLabelDe(s.sector),
          weight: s.weight,
          fetchedAt: now
        })
    }

    const isin = await ensureIsin(position)
    const fromOnvista = isin ? await onvistaService.getCountryBreakdown(isin) : null

    if (fromOnvista) {
      for (const w of fromOnvista.weights) {
        entries.push({ kind: 'COUNTRY', label: w.country, weight: w.weight, fetchedAt: now })
      }
    } else if (holdings) {
      // Rückfall: Länder der abrufbaren Top-Holdings einzeln auflösen und summieren.
      const byCountry = new Map<string, number>()
      for (const h of holdings.holdings) {
        if (h.weight <= 0) continue
        const country = await resolveCountry(h.symbol)
        if (!country) continue
        byCountry.set(country, (byCountry.get(country) ?? 0) + h.weight)
      }
      for (const [country, weight] of byCountry) {
        entries.push({ kind: 'COUNTRY', label: country, weight, fetchedAt: now })
      }
    }

    if (entries.length > 0) etfCompositionRepo.replaceComposition(identifier, entries)
  } catch (err) {
    console.error(`ETF-Zusammensetzung für ${identifier} konnte nicht geladen werden:`, err)
  }
}

/**
 * Stuft Anleihen-ETFs automatisch als Anleihe ein.
 *
 * Erkannt wird das am Bestand des Fonds, nicht am Namen: Yahoo liefert unter topHoldings die Anteile
 * bondPosition und stockPosition. Nachgemessen liegt bondPosition bei Anleihen-ETFs bei ~1,0 (iShares
 * $ Treasury 20+: 0,9997; iShares Core Euro Govt Bond: 0,999) und bei Aktien-ETFs bei exakt 0. Eine
 * Namensprüfung auf "Bond" oder "Treasury" wäre dagegen bei Mischfonds und fremdsprachigen
 * Bezeichnungen unzuverlässig.
 *
 * Gekennzeichnet wird über sub_type='BOND' - die Anlageklasse bleibt STOCK_ETF, damit Kursabruf und
 * Historie unverändert weiterlaufen (siehe shared/displayClass.ts).
 */
export async function reclassifyBondEtfs(): Promise<number> {
  const candidates = positionsRepo
    .listPositions()
    .filter(
      (p) =>
        p.assetClass === 'STOCK_ETF' &&
        p.securityType === 'ETF' &&
        p.subType !== 'BOND' &&
        p.identifier
    )

  let moved = 0
  for (const position of candidates) {
    try {
      const holdings = await yahooService.getTopHoldings(position.identifier!)
      if (!holdings) continue
      if (holdings.bondPosition > 0.5 && holdings.bondPosition > holdings.stockPosition) {
        positionsRepo.updatePosition({ id: position.id, subType: 'BOND' })
        moved++
      }
    } catch (err) {
      console.error(`Anleihen-Einstufung von ${position.identifier} fehlgeschlagen:`, err)
    }
  }
  return moved
}

/**
 * Physisch besicherte Rohstoff-ETCs (Gold, Silber, Öl, Uran ...) führt Yahoo als "EQUITY", weshalb
 * sie beim Import als Aktie in "Aktien & ETFs" landen - sie halten aber echtes Metall/Rohöl, keine
 * Firmenanteile, und haben deshalb weder Sektor noch Land. Erkennungsmerkmal (nicht hartkodiert auf
 * bestimmte Ticker): als Aktie eingestuft, aber Yahoo liefert dafür WEDER ein Unternehmensprofil
 * NOCH eine Fondszusammensetzung. Solche Positionen werden einmalig in die Anlageklasse
 * "Rohstoffe & Edelmetalle" umgestuft, wo sie sachlich hingehören.
 */
export async function reclassifyCommodityEtcs(): Promise<number> {
  const candidates = positionsRepo
    .listPositions()
    .filter(
      (p) =>
        p.assetClass === 'STOCK_ETF' &&
        p.securityType === 'STOCK' &&
        !p.sector &&
        !p.region &&
        p.identifier
    )

  let moved = 0
  for (const position of candidates) {
    try {
      const profile = await yahooService.getAssetProfile(position.identifier!)
      if (profile.sector || profile.region) continue // echtes Unternehmen, nur Profil bisher nicht geladen
      const holdings = await yahooService.getTopHoldings(position.identifier!)
      if (holdings) continue // echter Fonds
      positionsRepo.updatePosition({ id: position.id, assetClass: 'COMMODITY' })
      moved++
    } catch (err) {
      console.error(`Einstufung von ${position.identifier} konnte nicht geprüft werden:`, err)
    }
  }
  return moved
}
