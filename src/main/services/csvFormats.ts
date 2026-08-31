import type { TransactionType } from '../../shared/types'

/**
 * Einlesen von Broker-CSVs, gesteuert über die KOPFZEILE statt über fest verdrahtete
 * Spaltenpositionen.
 *
 * Hintergrund: Jeder Broker exportiert anders - anderes Trennzeichen, andere Spaltennamen, andere
 * Zahlen- und Datumsformate, teils englisch, teils deutsch. Zwei Formate sind hier exakt belegt
 * (siehe unten), für alles andere greift eine Zuordnung über Spaltennamen und deren gängige
 * Synonyme. Dadurch funktioniert der Import auch mit Exporten, die beim Bauen nicht vorlagen -
 * und wenn nicht, nennt die Fehlermeldung die tatsächlich gefundenen Spalten, statt nur
 * "Format nicht erkannt" zu sagen.
 */

export interface ParsedTransactionRow {
  name: string
  isin: string
  wkn: string
  type: TransactionType
  quantity: number
  price: number
  currency: string
  date: string
}

/** Welche Bedeutung eine Spalte hat. Mehrere Namen können auf dieselbe Bedeutung zeigen. */
type FieldKey =
  | 'date'
  | 'name'
  | 'isin'
  | 'wkn'
  | 'type'
  | 'quantity'
  | 'price'
  | 'amount'
  | 'currency'
  | 'status'

/**
 * Spaltennamen je Bedeutung, klein geschrieben und ohne Sonderzeichen verglichen.
 *
 * Belegte Quellen: "Name/ISIN/WKN/Status/Richtung/Ausführung Datum/Ausführung Kurs/Anzahl
 * ausgeführt" stammen aus einer echten finanzen.net-Zero-Orderübersicht; "date/time/status/
 * reference/description/assetType/type/isin/shares/price/amount/fee/tax/currency" aus der
 * Scalable-Capital-Vorlage von Portfolio Performance (csv-config.json im dortigen Quelltext).
 * Die übrigen Einträge sind gängige Schreibweisen anderer Exporte.
 */
const FIELD_SYNONYMS: Record<FieldKey, string[]> = {
  date: [
    'ausführung datum',
    'ausfuehrung datum',
    'datum',
    'date',
    'datetime',
    'valuta',
    'handelstag',
    'buchungstag',
    'timestamp'
  ],
  name: ['name', 'description', 'bezeichnung', 'wertpapier', 'instrument', 'security', 'titel'],
  isin: ['isin'],
  wkn: ['wkn'],
  type: ['richtung', 'type', 'transaction_type', 'transaktionstyp', 'art', 'typ', 'orderart'],
  quantity: [
    'anzahl ausgeführt',
    'anzahl ausgefuehrt',
    'anzahl',
    'shares',
    'quantity',
    'stück',
    'stueck'
  ],
  price: ['ausführung kurs', 'ausfuehrung kurs', 'kurs', 'price', 'preis', 'share_price'],
  amount: ['amount', 'betrag', 'gesamtbetrag', 'total', 'original_amount'],
  currency: ['currency', 'währung', 'waehrung', 'original_currency'],
  status: ['status', 'state']
}

/** Werte der Typ-Spalte, die einen Kauf bzw. Verkauf bedeuten. Alles andere wird übersprungen. */
const BUY_VALUES = new Set([
  'kauf',
  'buy',
  'purchase',
  'savings plan',
  'sparplan',
  'sparplanausführung',
  'einbuchung',
  'order_buy'
])
const SELL_VALUES = new Set(['verkauf', 'sell', 'sale', 'ausbuchung', 'order_sell'])

/** Nur abgeschlossene Buchungen zählen - Stornos und offene Orders dürfen nicht ins Depot. */
const EXECUTED_VALUES = new Set([
  'ausgeführt',
  'ausgefuehrt',
  'executed',
  'settled',
  'completed',
  'ok'
])

/**
 * UTF-8-Byte-Order-Mark (U+FEFF). Windows-Exporte stellen es der Datei voran, wodurch es im ERSTEN
 * Spaltennamen landet - aus "Name" wird ein unsichtbar vorangestelltes Zeichen plus "Name", was
 * jeden Namensvergleich brechen würde.
 * Bewusst als Zeichencode geschrieben: direkt im Quelltext wäre es ein unsichtbares Zeichen.
 */
const BOM = String.fromCharCode(0xfeff)

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text
}

function normalizeHeader(raw: string): string {
  return stripBom(raw)
    .replace(/^"|"$/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
}

/**
 * Zerlegt eine CSV-Zeile unter Beachtung von Anführungszeichen. Ein reines split() reicht nicht:
 * Wertpapiernamen enthalten regelmäßig das Trennzeichen ("Berkshire Hathaway Inc., Class B"), und
 * Exporte mit ISO-Zeitstempeln quoten grundsätzlich jedes Feld.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"' // verdoppeltes Anführungszeichen = ein echtes
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out.map((v) => v.trim().replace(/^"|"$/g, ''))
}

/** Trennzeichen aus der Kopfzeile ableiten: das, welches die meisten Felder ergibt. */
function detectDelimiter(headerLine: string): string {
  const candidates = [';', ',', '\t', '|']
  let best = ';'
  let bestCount = 0
  for (const d of candidates) {
    const count = splitCsvLine(headerLine, d).length
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/**
 * Zahl einlesen, ohne das Format je Zelle zu raten.
 *
 * "1.234" ist mehrdeutig - deutsch bedeutet es 1234, englisch 1,234. Deshalb wird das Format
 * EINMAL für die ganze Datei bestimmt (siehe detectGermanNumbers) und hier nur noch angewandt.
 */
function parseNumber(raw: string, germanFormat: boolean): number | null {
  const trimmed = raw.trim().replace(/[^\d,.-]/g, '')
  if (trimmed === '') return null
  const cleaned = germanFormat
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(/,/g, '')
  const value = Number(cleaned)
  return Number.isNaN(value) ? null : value
}

/**
 * Deutsches oder englisches Zahlenformat? Über die ganze Datei ausgezählt, damit einzelne
 * mehrdeutige Werte die Entscheidung nicht kippen.
 *
 * Betrachtet werden NUR die als Zahl erkannten Spalten (Stückzahl, Kurs, Betrag). Über alle Zellen
 * zu laufen wäre falsch: ein deutsches Datum "16.01.2026" sieht wie eine Zahl mit Punkten aus und
 * würde die Auszählung verfälschen.
 *
 * Je Wert gilt:
 * - beide Zeichen vorhanden ("1.234,56") -> das letzte ist das Dezimaltrennzeichen, eindeutig
 * - nur eines vorhanden -> die Stellenzahl dahinter entscheidet. Genau drei Stellen ("1.234" bzw.
 *   "1,234") sind mehrdeutig und werden nicht gezählt; jede andere Stellenzahl ("0.2490", "123,45")
 *   kann nur ein Dezimaltrennzeichen sein.
 */
function detectGermanNumbers(rows: string[][], numericColumns: number[]): boolean {
  let german = 0
  let english = 0
  for (const row of rows) {
    for (const col of numericColumns) {
      const cell = (row[col] ?? '').trim()
      if (!/^-?[\d.,]+$/.test(cell)) continue
      const lastComma = cell.lastIndexOf(',')
      const lastDot = cell.lastIndexOf('.')
      if (lastComma === -1 && lastDot === -1) continue

      if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) german++
        else english++
        continue
      }
      const sep = lastComma !== -1 ? lastComma : lastDot
      const decimals = cell.length - sep - 1
      if (decimals === 3) continue // mehrdeutig: Tausendertrenner oder Nachkommastellen
      if (lastComma !== -1) german++
      else english++
    }
  }
  // Im Zweifel deutsch: die hier unterstützten Broker exportieren für den deutschen Markt.
  return german >= english
}

/** Datum in 'YYYY-MM-DD'. Deckt dd.mm.yyyy, yyyy-mm-dd und ISO-Zeitstempel ab. */
function parseDate(raw: string): string | null {
  const value = raw.trim()
  if (value === '') return null

  const german = value.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
  if (german) return `${german[3]}-${german[2]}-${german[1]}`

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  return null
}

export interface CsvColumnMap {
  delimiter: string
  headers: string[]
  index: Partial<Record<FieldKey, number>>
}

/** Ordnet die Kopfzeile den bekannten Bedeutungen zu. */
export function mapColumns(headerLine: string): CsvColumnMap {
  const delimiter = detectDelimiter(headerLine)
  const headers = splitCsvLine(headerLine, delimiter).map(normalizeHeader)
  const index: Partial<Record<FieldKey, number>> = {}

  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS) as [FieldKey, string[]][]) {
    // Die Synonyme sind nach Genauigkeit sortiert und werden EINZELN durch die ganze Kopfzeile
    // gesucht. Andersherum (je Spalte prüfen, ob irgendein Synonym passt) gewänne die Reihenfolge
    // in der Datei: bei finanzen.net Zero stünde "Orderart" vor "Richtung" und "Anzahl" vor
    // "Anzahl ausgeführt" - beide Male die falsche Spalte. Erst exakt, dann als Teilstring.
    let found = -1
    for (const s of synonyms) {
      found = headers.indexOf(s)
      if (found !== -1) break
    }
    if (found === -1) {
      for (const s of synonyms) {
        found = headers.findIndex((h) => h.includes(s))
        if (found !== -1) break
      }
    }
    if (found !== -1) index[field] = found
  }
  return { delimiter, headers, index }
}

export class CsvFormatError extends Error {
  constructor(missing: string[], headers: string[]) {
    super(
      `CSV-Format nicht erkannt. Es fehlen: ${missing.join(', ')}.\n` +
        `Gefundene Spalten: ${headers.join(' | ')}`
    )
    this.name = 'CsvFormatError'
  }
}

/**
 * Liest eine Broker-CSV in Transaktionszeilen. Erwartet werden Datum, ein Wertpapier-Bezeichner
 * (ISIN oder Name), Stückzahl, Preis und eine Kauf/Verkauf-Angabe. Zeilen ohne diese Angaben oder
 * mit einem anderen Buchungstyp (Dividende, Einzahlung, Gebühr) werden still übersprungen - der
 * Import baut ein Wertpapierdepot auf, keine Kontobuchungen.
 */
export function parseBrokerCsv(csvText: string): ParsedTransactionRow[] {
  const text = stripBom(csvText)
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []

  const { delimiter, headers, index } = mapColumns(lines[0])

  const missing: string[] = []
  if (index.date === undefined) missing.push('Datum')
  if (index.isin === undefined && index.name === undefined) missing.push('ISIN oder Wertpapiername')
  if (index.quantity === undefined) missing.push('Stückzahl')
  if (index.price === undefined && index.amount === undefined) missing.push('Kurs oder Betrag')
  if (index.type === undefined) missing.push('Kauf/Verkauf-Angabe')
  if (missing.length > 0) throw new CsvFormatError(missing, headers)

  const rows = lines.slice(1).map((l) => splitCsvLine(l, delimiter))
  const numericColumns = [index.quantity, index.price, index.amount].filter(
    (i): i is number => i !== undefined
  )
  const germanNumbers = detectGermanNumbers(rows, numericColumns)

  const at = (row: string[], key: FieldKey): string => {
    const i = index[key]
    return i === undefined ? '' : (row[i] ?? '')
  }

  const out: ParsedTransactionRow[] = []
  for (const row of rows) {
    // Offene, stornierte oder abgelehnte Buchungen überspringen, falls der Export sie mitliefert.
    if (index.status !== undefined) {
      const status = at(row, 'status').toLowerCase()
      if (status !== '' && !EXECUTED_VALUES.has(status)) continue
    }

    const rawType = at(row, 'type').toLowerCase()
    const type: TransactionType | null = BUY_VALUES.has(rawType)
      ? 'BUY'
      : SELL_VALUES.has(rawType)
        ? 'SELL'
        : null
    if (type === null) continue

    const date = parseDate(at(row, 'date'))
    const quantity = parseNumber(at(row, 'quantity'), germanNumbers)
    if (date === null || quantity === null || quantity <= 0) continue

    // Manche Exporte führen keinen Stückkurs, sondern nur den Gesamtbetrag der Ausführung.
    let price = index.price === undefined ? null : parseNumber(at(row, 'price'), germanNumbers)
    if (price === null || price <= 0) {
      const amount = parseNumber(at(row, 'amount'), germanNumbers)
      price = amount === null ? null : Math.abs(amount) / quantity
    }
    if (price === null || price <= 0) continue

    out.push({
      name: at(row, 'name'),
      isin: at(row, 'isin'),
      wkn: at(row, 'wkn'),
      type,
      quantity,
      price,
      currency: at(row, 'currency').toUpperCase() || 'EUR',
      date
    })
  }
  return out
}
