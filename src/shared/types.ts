import type { DisplayClass } from './displayClass'
import type {
  BenchmarkComponent,
  BenchmarkUniverse,
  CustomBenchmarkModel,
  CustomBenchmarkModelUpdate,
  NewCustomBenchmarkModel,
  SeriesPoint
} from './benchmarkCalc'
export type AssetClass = 'STOCK_ETF' | 'CRYPTO' | 'COMMODITY' | 'CASH_OTHER'
export type SecurityType = 'STOCK' | 'ETF'
export type CashSubType = 'CASH' | 'BOND' | 'REAL_ESTATE' | 'OTHER'
/**
 * Feinere Unterteilung eines Guthabens. Bewusst eine eigene Spalte statt zusätzlicher Werte in
 * sub_type: dessen CHECK-Beschränkung ließe sich nur durch einen Neuaufbau der Positionstabelle
 * erweitern, an der die Transaktionen per Fremdschlüssel mit Löschweitergabe hängen.
 */
export type CashType = 'CHECKING' | 'SAVINGS' | 'PHYSICAL' | 'FOREIGN' | 'WORK'
/** Nur für gewichtsbasierte COMMODITY-Positionen: in welcher Einheit `quantity` eingegeben wurde.
 *  Gold/Silber notieren in Feinunze, Kupfer in Pfund - siehe shared/commodities.ts. */
export type QuantityUnit = 'GRAM' | 'KG' | 'TROY_OUNCE' | 'POUND'

export interface Position {
  id: number
  assetClass: AssetClass
  securityType: SecurityType | null
  name: string
  symbol: string | null
  identifier: string | null
  /** Wertpapierkennnummer nach ISO 6166 - eindeutig je Tranche und damit der Schlüssel, mit dem die
   *  Länderaufteilung eines ETFs bei onvista abgefragt wird. */
  isin: string | null
  quantity: number
  quantityUnit: QuantityUnit | null
  currency: string
  avgCostBasis: number | null
  manualValue: number | null
  sector: string | null
  region: string | null
  subType: CashSubType | null
  /** Nur bei Guthaben gesetzt: Girokonto, Tagesgeld oder Bargeld. */
  cashType: CashType | null
  /** Kaufdatum, optional, als 'YYYY-MM-DD'. */
  purchaseDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  /** True, wenn diese Position Buchungen im Transaktions-Ledger hat - dann werden quantity/
   *  avgCostBasis daraus berechnet (siehe ledgerService.ts) statt manuell im Formular gepflegt. */
  hasTransactions: boolean
}

export type NewPosition = Omit<Position, 'id' | 'createdAt' | 'updatedAt' | 'hasTransactions'>
export type PositionUpdate = Partial<NewPosition> & { id: number }

/** Woher eine Änderung des Kontostands kam. */
export type CashBalanceSource = 'OPENING' | 'MANUAL' | 'BUDGET' | 'BUDGET_UNDO'

/**
 * Ein Eintrag im Verlauf eines Kontostands: der Stand NACH einer Änderung.
 *
 * Guthaben haben keinen Kurs, den man nachladen könnte - ihr Verlauf lässt sich nur mitschreiben,
 * während er entsteht. Deshalb hinterlassen beide Stellen, die einen Kontostand ändern (das
 * Positionsformular und die Budget-Buchungen), hier eine Zeile. Zwischen zwei Einträgen gilt der
 * ältere Stand unverändert fort.
 */
export interface CashBalanceEntry {
  id: number
  positionId: number
  /** Zeitpunkt der Änderung, ISO mit Uhrzeit. */
  recordedAt: string
  /** Kontostand nach der Änderung, in der Währung des Kontos. */
  balance: number
  currency: string
  source: CashBalanceSource
  /** Herkunft im Klartext, etwa Budgetposten und Monat - null bei Änderungen von Hand. */
  note: string | null
}

export interface PriceCacheEntry {
  identifier: string
  assetClass: AssetClass
  price: number
  currency: string
  fetchedAt: string
  fetchError: string | null
}

export interface FxRate {
  base: string
  quote: string
  rate: number
  fetchedAt: string
}

export interface SnapshotItem {
  assetClass: AssetClass
  valueEur: number
}

export interface ValueSnapshot {
  id: number
  takenAt: string
  totalValueEur: number
  items: SnapshotItem[]
}

export interface RefreshResult {
  updatedCount: number
  failedIdentifiers: string[]
  snapshotId: number | null
}

export interface SymbolSearchResult {
  identifier: string
  symbol: string
  name: string
  exchange: string | null
  securityType: SecurityType | null
  currency: string | null
  sector: string | null
  region: string | null
}

export interface Settings {
  baseCurrency: string
  autoRefreshEnabled: boolean
  autoRefreshIntervalMinutes: number
}

export interface AssetProfile {
  sector: string | null
  region: string | null
}

/** Aktueller Kurs eines Wertpapiers in seiner Notierungswährung - für die Kursanzeige in der Suche. */
export interface SymbolQuote {
  identifier: string
  price: number
  currency: string
}

export interface HistoricalPriceEntry {
  identifier: string
  assetClass: AssetClass
  date: string
  price: number
  currency: string
}

export interface HistoricalFxEntry {
  base: string
  quote: string
  date: string
  rate: number
}

/** Ein Stundenkurs. `ts` ist ein voller ISO-Zeitstempel, anders als beim Tagesverlauf. */
export interface IntradayPriceEntry {
  identifier: string
  assetClass: AssetClass
  ts: string
  price: number
  currency: string
}

export interface HistoricalData {
  prices: HistoricalPriceEntry[]
  fxRates: HistoricalFxEntry[]
  /** Stundenkurse der letzten Tage - trägt die kurzen Zeiträume (1 Tag, 1 Woche). */
  intraday: IntradayPriceEntry[]
}

/** Fortschrittsmeldung während `snapshots:reset` - eine pro Position, zweimal (processing, dann done). */
export interface ResetProgressEvent {
  positionId: number
  name: string
  status: 'processing' | 'done'
}

export type EtfCompositionKind = 'SECTOR' | 'COUNTRY'

/** Ein Bestandteil eines ETFs: entweder ein Sektor- oder ein Länderanteil (weight 0..1 am Fondsvermögen). */
export interface EtfCompositionEntry {
  identifier: string
  kind: EtfCompositionKind
  label: string
  weight: number
  fetchedAt: string
}

export type TransactionType = 'BUY' | 'SELL'

export interface Transaction {
  id: number
  positionId: number
  type: TransactionType
  quantity: number
  price: number
  currency: string
  /** Ausführungsdatum, 'YYYY-MM-DD'. */
  date: string
  /** Herkunft, z.B. 'FINANZEN_ZERO' bei CSV-Import, null bei manueller Erfassung/Migration. */
  broker: string | null
  notes: string | null
  /** Gesetzt, wenn diese Buchung von einem Sparplan erzeugt wurde - sie ist dann ein Platzhalter,
   *  bis die echte Abrechnung des Brokers per CSV eintrifft und sie ersetzt. */
  savingsPlanId: number | null
  createdAt: string
}

export interface TransactionWithPosition extends Transaction {
  positionName: string
  assetClass: AssetClass
}

/** Herkunftsvermerk für importierte Buchungen. Das Einlesen selbst läuft über die Kopfzeile der
 *  Datei (siehe csvFormats.ts), nicht über diese Auswahl. */
export type BrokerFormat = 'AUTO' | 'FINANZEN_ZERO' | 'TRADE_REPUBLIC' | 'SCALABLE_CAPITAL'

export interface CsvImportProgressEvent {
  rowIndex: number
  totalRows: number
  name: string
  status: 'resolving' | 'matched' | 'unresolved'
}

export interface CsvImportResult {
  transactionsImported: number
  positionsAffected: number
  /** Buchungen, die schon genauso in der Datenbank standen und deshalb nicht erneut
   *  angelegt wurden - typisch beim zweiten Einlesen derselben Datei. */
  duplicatesSkipped: number
  /** Vom Sparplan vorgemerkte Buchungen, die durch die echte Abrechnung ersetzt wurden. */
  planBookingsReplaced: number
  unresolved: { name: string; isin: string }[]
}

export type BudgetItemType = 'INCOME' | 'EXPENSE'
export type BudgetPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

/** Ein wiederkehrender Posten im Geldfluss: Gehalt, Miete, Versicherung. */
export interface BudgetItem {
  id: number
  type: BudgetItemType
  name: string
  /** Betrag je Periode, so wie er tatsächlich abgebucht wird - nicht auf den Monat gerechnet. */
  amount: number
  currency: string
  period: BudgetPeriod
  category: string | null
  /**
   * Konto, von dem abgebucht wird bzw. auf dem eingeht - eine Position der Klasse CASH_OTHER.
   * Gesetzt, verändert dieser Posten den Kontostand jeden Monat tatsächlich.
   */
  accountPositionId: number | null
  /**
   * Ab welchem Monat gebucht wird ('YYYY-MM'), gesetzt beim Zuordnen des Kontos. Frühere Monate
   * bleiben unangetastet: eine Zuordnung soll nicht rückwirkend Geld vom Konto nehmen.
   */
  accountSince: string | null
  /** Ausgeschaltete Posten bleiben stehen, zählen aber nicht mit - z.B. ein pausiertes Abo. */
  active: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type NewBudgetItem = Omit<BudgetItem, 'id' | 'createdAt' | 'updatedAt' | 'accountSince'> & {
  accountSince?: string | null
}
export type BudgetItemUpdate = Partial<NewBudgetItem> & { id: number }

/**
 * Eine tatsächlich auf ein Konto gebuchte Monatsrate eines Budgetpostens.
 *
 * Festgehalten wird jede einzelne, aus zwei Gründen: ein Monat darf nur einmal gebucht werden,
 * und eine Buchung muss sich zurücknehmen lassen - der Kontostand ist echtes Geld, kein Diagramm.
 */
export interface BudgetBooking {
  id: number
  budgetItemId: number
  positionId: number
  /** 'YYYY-MM' */
  month: string
  /** In der Währung des Kontos. Positiv = Zufluss, negativ = Abbuchung. */
  amount: number
  /**
   * Gesetzt, wenn die Buchung zurückgenommen wurde. Die Zeile bleibt als Beleg stehen: sie
   * verhindert, dass derselbe Monat gleich wieder gebucht wird.
   */
  revertedAt: string | null
  createdAt: string
}

/** Ein gebuchter Monat, zusammengefasst für die Liste mit dem Zurücknehmen-Knopf. */
export interface BudgetBookingMonth {
  month: string
  count: number
  /** Summe aller Buchungen des Monats, in Euro. */
  netEur: number
}

/**
 * Ein Sparplan: ein fester Betrag, der in regelmäßigen Abständen in ein bestimmtes Wertpapier
 * fließt. Anders als ein Budgetposten hängt er an einer Position - er kauft ja etwas.
 */
export interface SavingsPlan {
  id: number
  /** Wertpapier, in das der Plan läuft. */
  positionId: number
  /** Betrag je Ausführung, nicht auf den Monat gerechnet. */
  amount: number
  currency: string
  period: BudgetPeriod
  /** Tag im Monat, an dem ausgeführt wird - auf 1 bis 28 begrenzt, damit jeder Monat ihn hat. */
  executionDay: number
  /**
   * Uhrzeit der Ausführung als 'HH:MM' in deiner Zeitzone, oder null.
   *
   * Optional, weil sie nur begrenzt etwas ändert: Stundenkurse liegen nur für die letzten Tage
   * vor, ältere Ausführungen bekommen so oder so den Tagesschlusskurs. Gesetzt, wird eine heute
   * fällige Ausführung außerdem erst nach dieser Uhrzeit gebucht.
   */
  executionTime: string | null
  /** Ab wann der Plan läuft, 'YYYY-MM-DD'. Frühere Ausführungen werden nachgebucht. */
  startDate: string
  /** Ab wann er nicht mehr läuft, oder null für unbefristet. */
  endDate: string | null
  active: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type NewSavingsPlan = Omit<SavingsPlan, 'id' | 'createdAt' | 'updatedAt'>
export type SavingsPlanUpdate = Partial<NewSavingsPlan> & { id: number }

/** Ein Sparplan mit dem, was aus seinen Buchungen bisher geworden ist. */
export interface SavingsPlanWithStats extends SavingsPlan {
  positionName: string
  assetClass: AssetClass
  /** Zahl der bereits gebuchten Ausführungen. */
  executions: number
  /** Summe der tatsächlich gebuchten Beträge, in der Währung der Buchungen. */
  investedTotal: number
  /** Stückzahl, die über diesen Plan zusammengekommen ist. */
  quantityTotal: number
  /** Datum der nächsten fälligen Ausführung, oder null bei beendetem Plan. */
  nextExecution: string | null
  /** Datum der letzten gebuchten Ausführung, oder null. */
  lastExecution: string | null
}

/** Eine Baustein-Kursreihe des Analyse-Bereichs, bereits nach Euro umgerechnet. */
export interface BenchmarkComponentSeries {
  component: BenchmarkComponent
  identifier: string
  label: string
  /** Notierungswährung der Quelle - nur zur Anzeige, die Punkte sind in Euro. */
  sourceCurrency: string
  points: SeriesPoint[]
}

export interface BenchmarkData {
  universe: BenchmarkUniverse
  series: BenchmarkComponentSeries[]
  /** Bausteine ohne Daten; Modelle, die sie brauchen, lassen sich dann nicht rechnen. */
  missing: BenchmarkComponent[]
  /**
   * Erster Tag, an dem ALLE vorhandenen Bausteine einen Kurs haben - also der früheste Tag, ab dem
   * sich überhaupt vergleichen lässt.
   *
   * Ohne diese Angabe sah eine zu kurze Reihe aus wie eine vollständige: `missing` bleibt leer,
   * sobald jeder Baustein irgendwelche Kurse hat. Ein Wechsel von "1 Jahr" auf "3 Jahre" zeigte
   * dadurch stillschweigend weiter nur ein Jahr, statt die fehlenden zwei nachzuladen.
   */
  coversFrom: string | null
}

export interface AnalysisPrepareProgress {
  /** BENCHMARKS lädt die Vergleichsreihen, POSITIONS verlängert die eigenen Kursreihen. */
  phase: 'BENCHMARKS' | 'POSITIONS'
  done: number
  total: number
  label: string
}

/** Eine Person, deren Vermögen die App führt - jede mit eigener Datenbank. */
export interface Profile {
  id: string
  name: string
}

export interface ProfileList {
  activeId: string
  profiles: Profile[]
}

export interface PortfolioApi {
  positions: {
    list(): Promise<Position[]>
    create(input: NewPosition): Promise<Position>
    update(input: PositionUpdate): Promise<Position>
    delete(id: number): Promise<void>
    deleteAll(): Promise<void>
    /** 'BOND' sucht einzelne Anleihen bei onvista (WKN, ISIN oder Name) - siehe shared/bonds.ts. */
    lookupSymbol(kind: DisplayClass, query: string): Promise<SymbolSearchResult[]>
    getAssetProfile(identifier: string): Promise<AssetProfile>
  }
  prices: {
    refreshAll(): Promise<RefreshResult>
    getAll(): Promise<PriceCacheEntry[]>
    /** Live-Kurse für beliebige Identifier - für die Kursanzeige in den Suchvorschlägen. */
    getQuotes(kind: DisplayClass, identifiers: string[]): Promise<SymbolQuote[]>
  }
  fx: {
    getAll(): Promise<FxRate[]>
  }
  snapshots: {
    list(): Promise<ValueSnapshot[]>
    reset(): Promise<RefreshResult>
    /** Setzt nur die Kursreihen eines Bereichs zurück; der Snapshot-Verlauf bleibt unberührt. */
    resetClass(cls: DisplayClass): Promise<RefreshResult>
    onResetProgress(callback: (event: ResetProgressEvent) => void): () => void
  }
  settings: {
    get(): Promise<Settings>
    set(input: Partial<Settings>): Promise<Settings>
  }
  historical: {
    list(): Promise<HistoricalData>
  }
  etfComposition: {
    list(): Promise<EtfCompositionEntry[]>
  }
  cashHistory: {
    /** Der Verlauf aller Kontostände, chronologisch - je Konto gruppiert wird im Renderer. */
    list(): Promise<CashBalanceEntry[]>
  }
  profiles: {
    list(): Promise<ProfileList>
    create(name: string): Promise<Profile>
    rename(id: string, name: string): Promise<void>
    delete(id: string): Promise<void>
    /** Öffnet die Datenbank dieses Profils; danach lädt die Oberfläche neu. */
    switchTo(id: string): Promise<void>
  }
  budget: {
    list(): Promise<BudgetItem[]>
    create(input: NewBudgetItem): Promise<BudgetItem>
    update(input: BudgetItemUpdate): Promise<BudgetItem>
    delete(id: number): Promise<void>
    /** Die bisher auf Konten gebuchten Monate, neuester zuerst. */
    listBookings(): Promise<BudgetBookingMonth[]>
    /** Bucht alle fälligen Monate auf die zugeordneten Konten und liefert deren Anzahl. */
    runBookings(): Promise<number>
    /** Nimmt alle Buchungen eines Monats zurück und stellt die Kontostände wieder her. */
    undoBookingMonth(month: string): Promise<void>
  }
  savingsPlans: {
    list(): Promise<SavingsPlanWithStats[]>
    create(input: NewSavingsPlan): Promise<SavingsPlan>
    update(input: SavingsPlanUpdate): Promise<SavingsPlan>
    /** Löscht den Plan. Bereits gebuchte Ausführungen bleiben im Depot stehen. */
    delete(id: number): Promise<void>
    /** Bucht alle fälligen Ausführungen nach und liefert, wie viele es waren. */
    run(): Promise<number>
  }
  transactions: {
    list(): Promise<TransactionWithPosition[]>
    /** Löscht eine einzelne Buchung; Bestand und Einstandspreis der Position werden danach
     *  neu nach FIFO gerechnet. */
    delete(id: number): Promise<void>
    importCsv(broker: BrokerFormat, csvText: string): Promise<CsvImportResult>
    onImportProgress(callback: (event: CsvImportProgressEvent) => void): () => void
  }
  analyse: {
    /** Die gespeicherten Vergleichsreihen ab einem Stichtag, in Euro. Lädt nichts nach. */
    benchmarks(universe: BenchmarkUniverse, fromDate: string): Promise<BenchmarkData>
    /** Holt fehlende Vergleichsreihen und verlängert die eigenen Kursreihen bis zum Stichtag. */
    prepare(universe: BenchmarkUniverse, fromDate: string): Promise<BenchmarkData>
    onPrepareProgress(callback: (event: AnalysisPrepareProgress) => void): () => void
    /** Die selbst angelegten Vergleichsmodelle - die fest eingebauten stehen im Code. */
    listModels(): Promise<CustomBenchmarkModel[]>
    createModel(input: NewCustomBenchmarkModel): Promise<CustomBenchmarkModel>
    updateModel(input: CustomBenchmarkModelUpdate): Promise<CustomBenchmarkModel>
    deleteModel(id: number): Promise<void>
  }
}
