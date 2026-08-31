export type AssetClass = 'STOCK_ETF' | 'CRYPTO' | 'COMMODITY' | 'CASH_OTHER'
export type SecurityType = 'STOCK' | 'ETF'
export type CashSubType = 'CASH' | 'BOND' | 'REAL_ESTATE' | 'OTHER'
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

export interface HistoricalData {
  prices: HistoricalPriceEntry[]
  fxRates: HistoricalFxEntry[]
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
  unresolved: { name: string; isin: string }[]
}

export interface PortfolioApi {
  positions: {
    list(): Promise<Position[]>
    create(input: NewPosition): Promise<Position>
    update(input: PositionUpdate): Promise<Position>
    delete(id: number): Promise<void>
    deleteAll(): Promise<void>
    lookupSymbol(assetClass: AssetClass, query: string): Promise<SymbolSearchResult[]>
    getAssetProfile(identifier: string): Promise<AssetProfile>
  }
  prices: {
    refreshAll(): Promise<RefreshResult>
    getAll(): Promise<PriceCacheEntry[]>
    /** Live-Kurse für beliebige Identifier - für die Kursanzeige in den Suchvorschlägen. */
    getQuotes(assetClass: AssetClass, identifiers: string[]): Promise<SymbolQuote[]>
  }
  fx: {
    getAll(): Promise<FxRate[]>
  }
  snapshots: {
    list(): Promise<ValueSnapshot[]>
    reset(): Promise<RefreshResult>
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
  transactions: {
    list(): Promise<TransactionWithPosition[]>
    importCsv(broker: BrokerFormat, csvText: string): Promise<CsvImportResult>
    onImportProgress(callback: (event: CsvImportProgressEvent) => void): () => void
  }
}
