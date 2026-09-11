import { ipcMain } from 'electron'
import * as benchmarkService from '../services/benchmarkService'
import * as etfCompositionService from '../services/etfCompositionService'
import * as priceService from '../services/priceService'
import * as customModelRepo from '../db/customModelRepo'
import {
  BENCHMARK_UNIVERSES,
  EQUITY_COMPONENTS,
  weightsSum,
  type BenchmarkUniverse,
  type CustomBenchmarkModelUpdate,
  type NewCustomBenchmarkModel
} from '../../shared/benchmarkCalc'
import type { AnalysisPrepareProgress, BenchmarkData } from '../../shared/types'

/**
 * Prüft ein selbst angelegtes Modell, bevor es in die Datenbank geht.
 *
 * Beides sind Fehler, die das Formular abfängt - hier stehen sie trotzdem, weil der Kanal auch
 * ohne das Formular erreichbar ist und ein namenloses Modell mit Gewichtssumme 0 später als leere
 * Zeile ohne Linie erschiene, ohne dass sich sagen ließe warum.
 */
function assertValidModel(input: NewCustomBenchmarkModel): void {
  if (input.name.trim().length === 0) throw new Error('Das Modell braucht einen Namen.')
  if (weightsSum(input.weights) <= 0) throw new Error('Das Modell braucht mindestens ein Gewicht.')
}

export function registerAnalyseHandlers(): void {
  ipcMain.handle('analyse:benchmarks', (_event, universe: BenchmarkUniverse, fromDate: string) =>
    benchmarkService.getBenchmarkSeries(universe, fromDate)
  )

  // Der langsame Weg: Vergleichsreihen holen und die eigenen Kursreihen so weit verlängern, wie
  // die Positionen tatsächlich gehalten wurden. Kann je nach Lücken eine Minute dauern, deshalb
  // mit Fortschrittsmeldungen - dasselbe Muster wie beim Zurücksetzen der Kurse.
  ipcMain.handle(
    'analyse:prepare',
    async (event, universe: BenchmarkUniverse, fromDate: string): Promise<BenchmarkData> => {
      const report = (progress: AnalysisPrepareProgress): void => {
        event.sender.send('analyse:prepare-progress', progress)
      }

      await benchmarkService.ensureBenchmarkData(universe, fromDate, (p) =>
        report({ phase: 'BENCHMARKS', ...p })
      )

      // Für den Zusammensetzungs-Vergleich: Sektoren und Länder der Aktienindizes. Ohne sie bleibt
      // dort nur die Anlageklassen-Ebene, weil die Modellseite keine Aufteilung hätte. Es sind
      // zwei Indizes, weil der norwegische Staatsfonds auf einem anderen aufsetzt als 60/40 & Co.
      const defs = BENCHMARK_UNIVERSES[universe]
      let doneIndices = 0
      for (const component of EQUITY_COMPONENTS) {
        const def = defs[component]
        report({
          phase: 'BENCHMARKS',
          done: doneIndices,
          total: EQUITY_COMPONENTS.length,
          label: `Zusammensetzung ${def.label}`
        })
        doneIndices++
        await etfCompositionService.ensureIndexComposition(def.identifier, def.isin)
      }

      await priceService.ensureHistoryForAnalysis(fromDate, (p) =>
        report({ phase: 'POSITIONS', ...p })
      )

      return benchmarkService.getBenchmarkSeries(universe, fromDate)
    }
  )

  ipcMain.handle('analyse:models:list', () => customModelRepo.listCustomModels())

  ipcMain.handle('analyse:models:create', (_event, input: NewCustomBenchmarkModel) => {
    assertValidModel(input)
    return customModelRepo.createCustomModel(input)
  })

  ipcMain.handle('analyse:models:update', (_event, input: CustomBenchmarkModelUpdate) => {
    assertValidModel(input)
    return customModelRepo.updateCustomModel(input)
  })

  ipcMain.handle('analyse:models:delete', (_event, id: number) =>
    customModelRepo.deleteCustomModel(id)
  )
}
