import { getDb } from './index'
import {
  BENCHMARK_COMPONENTS,
  normalizeWeights,
  type BenchmarkWeights,
  type CustomBenchmarkModel,
  type CustomBenchmarkModelUpdate,
  type NewCustomBenchmarkModel
} from '../../shared/benchmarkCalc'

interface Row {
  id: number
  name: string
  weights: string
  created_at: string
  updated_at: string
}

/**
 * Gewichte aus der JSON-Spalte lesen.
 *
 * Bewusst wehrhaft: gelesen werden nur bekannte Bausteine, und nur endliche Zahlen über null. Eine
 * von Hand verbogene Datei soll den Analyse-Bereich nicht mit NaN-Kurven fluten, sondern das
 * betroffene Modell nur um den unsinnigen Baustein ärmer machen.
 */
function parseWeights(json: string): BenchmarkWeights {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return {}
  }
  if (typeof raw !== 'object' || raw === null) return {}

  const source = raw as Record<string, unknown>
  const weights: BenchmarkWeights = {}
  for (const component of BENCHMARK_COMPONENTS) {
    const value = source[component]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) weights[component] = value
  }
  return weights
}

function rowToModel(row: Row): CustomBenchmarkModel {
  return {
    id: row.id,
    name: row.name,
    weights: parseWeights(row.weights),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** Gewichte so ablegen, wie der Vergleich sie braucht: auf Summe 1 normiert (siehe normalizeWeights). */
function serializeWeights(weights: BenchmarkWeights): string {
  return JSON.stringify(normalizeWeights(weights))
}

export function listCustomModels(): CustomBenchmarkModel[] {
  const rows = getDb()
    .prepare('SELECT * FROM custom_benchmark_models ORDER BY id')
    .all() as unknown as Row[]
  return rows.map(rowToModel)
}

export function getCustomModelById(id: number): CustomBenchmarkModel {
  const row = getDb()
    .prepare('SELECT * FROM custom_benchmark_models WHERE id = ?')
    .get(id) as unknown as Row | undefined
  if (!row) throw new Error(`Modell ${id} nicht gefunden`)
  return rowToModel(row)
}

export function createCustomModel(input: NewCustomBenchmarkModel): CustomBenchmarkModel {
  const result = getDb()
    .prepare('INSERT INTO custom_benchmark_models (name, weights) VALUES (?, ?)')
    .run(input.name.trim(), serializeWeights(input.weights))
  return getCustomModelById(Number(result.lastInsertRowid))
}

export function updateCustomModel(input: CustomBenchmarkModelUpdate): CustomBenchmarkModel {
  getCustomModelById(input.id) // wirft, wenn es das Modell nicht mehr gibt
  getDb()
    .prepare(
      `UPDATE custom_benchmark_models
         SET name = ?, weights = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    )
    .run(input.name.trim(), serializeWeights(input.weights), input.id)
  return getCustomModelById(input.id)
}

export function deleteCustomModel(id: number): void {
  getDb().prepare('DELETE FROM custom_benchmark_models WHERE id = ?').run(id)
}
