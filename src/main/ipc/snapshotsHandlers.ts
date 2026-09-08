import { ipcMain } from 'electron'
import * as snapshotsRepo from '../db/snapshotsRepo'
import * as priceService from '../services/priceService'
import type { DisplayClass } from '../../shared/displayClass'

export function registerSnapshotsHandlers(): void {
  ipcMain.handle('snapshots:list', () => snapshotsRepo.listSnapshots())

  ipcMain.handle('snapshots:reset', (event) =>
    priceService.resetAndRecalculate((progress) => {
      event.sender.send('snapshots:reset-progress', progress)
    })
  )

  // Gleicher Fortschrittskanal wie beim vollständigen Zurücksetzen - es kann ohnehin immer nur
  // eines von beiden gleichzeitig laufen.
  ipcMain.handle('snapshots:resetClass', (event, cls: DisplayClass) =>
    priceService.resetClass(cls, (progress) => {
      event.sender.send('snapshots:reset-progress', progress)
    })
  )
}
