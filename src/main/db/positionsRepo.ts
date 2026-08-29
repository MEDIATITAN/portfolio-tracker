import { getDb } from './index'
import type {
  AssetClass,
  CashSubType,
  NewPosition,
  Position,
  PositionUpdate,
  QuantityUnit,
  SecurityType
} from '../../shared/types'

interface PositionRow {
  id: number
  asset_class: AssetClass
  security_type: SecurityType | null
  name: string
  symbol: string | null
  identifier: string | null
  quantity: number
  quantity_unit: QuantityUnit | null
  currency: string
  avg_cost_basis: number | null
  manual_value: number | null
  sector: string | null
  region: string | null
  sub_type: CashSubType | null
  purchase_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToPosition(row: PositionRow): Position {
  return {
    id: row.id,
    assetClass: row.asset_class,
    securityType: row.security_type,
    name: row.name,
    symbol: row.symbol,
    identifier: row.identifier,
    quantity: row.quantity,
    quantityUnit: row.quantity_unit,
    currency: row.currency,
    avgCostBasis: row.avg_cost_basis,
    manualValue: row.manual_value,
    sector: row.sector,
    region: row.region,
    subType: row.sub_type,
    purchaseDate: row.purchase_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function hasOwn<T extends object>(input: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function pick<K extends keyof NewPosition>(
  input: Partial<NewPosition>,
  existing: NewPosition,
  key: K
): NewPosition[K] {
  return hasOwn(input, key) ? (input[key] as NewPosition[K]) : existing[key]
}

export function listPositions(): Position[] {
  const rows = getDb()
    .prepare('SELECT * FROM positions ORDER BY asset_class, name')
    .all() as unknown as PositionRow[]
  return rows.map(rowToPosition)
}

export function getPositionById(id: number): Position {
  const row = getDb().prepare('SELECT * FROM positions WHERE id = ?').get(id) as unknown as
    | PositionRow
    | undefined
  if (!row) throw new Error(`Position ${id} nicht gefunden`)
  return rowToPosition(row)
}

export function createPosition(input: NewPosition): Position {
  const result = getDb()
    .prepare(
      `INSERT INTO positions
        (asset_class, security_type, name, symbol, identifier, quantity, quantity_unit, currency, avg_cost_basis, manual_value, sector, region, sub_type, purchase_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.assetClass,
      input.securityType,
      input.name,
      input.symbol,
      input.identifier,
      input.quantity,
      input.quantityUnit,
      input.currency,
      input.avgCostBasis,
      input.manualValue,
      input.sector,
      input.region,
      input.subType,
      input.purchaseDate,
      input.notes
    )
  return getPositionById(Number(result.lastInsertRowid))
}

export function updatePosition(input: PositionUpdate): Position {
  const existing = getPositionById(input.id)
  const merged: NewPosition = {
    assetClass: pick(input, existing, 'assetClass'),
    securityType: pick(input, existing, 'securityType'),
    name: pick(input, existing, 'name'),
    symbol: pick(input, existing, 'symbol'),
    identifier: pick(input, existing, 'identifier'),
    quantity: pick(input, existing, 'quantity'),
    quantityUnit: pick(input, existing, 'quantityUnit'),
    currency: pick(input, existing, 'currency'),
    avgCostBasis: pick(input, existing, 'avgCostBasis'),
    manualValue: pick(input, existing, 'manualValue'),
    sector: pick(input, existing, 'sector'),
    region: pick(input, existing, 'region'),
    subType: pick(input, existing, 'subType'),
    purchaseDate: pick(input, existing, 'purchaseDate'),
    notes: pick(input, existing, 'notes')
  }
  getDb()
    .prepare(
      `UPDATE positions SET
        asset_class = ?, security_type = ?, name = ?, symbol = ?, identifier = ?,
        quantity = ?, quantity_unit = ?, currency = ?, avg_cost_basis = ?, manual_value = ?,
        sector = ?, region = ?, sub_type = ?, purchase_date = ?, notes = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    )
    .run(
      merged.assetClass,
      merged.securityType,
      merged.name,
      merged.symbol,
      merged.identifier,
      merged.quantity,
      merged.quantityUnit,
      merged.currency,
      merged.avgCostBasis,
      merged.manualValue,
      merged.sector,
      merged.region,
      merged.subType,
      merged.purchaseDate,
      merged.notes,
      input.id
    )
  return getPositionById(input.id)
}

export function deletePosition(id: number): void {
  getDb().prepare('DELETE FROM positions WHERE id = ?').run(id)
}

export function listDistinctIdentifiers(): { identifier: string; assetClass: AssetClass }[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT identifier, asset_class FROM positions
       WHERE identifier IS NOT NULL AND identifier != ''
         AND asset_class IN ('STOCK_ETF', 'CRYPTO', 'COMMODITY')`
    )
    .all() as unknown as { identifier: string; asset_class: AssetClass }[]
  return rows.map((r) => ({ identifier: r.identifier, assetClass: r.asset_class }))
}
