import { ipcMain } from 'electron'
import * as snapshotsRepo from '../db/snapshotsRepo'
import * as priceService from '../services/priceService'

export function registerSnapshotsHandlers(): void {
  ipcMain.handle('snapshots:list', () => snapshotsRepo.listSnapshots())

  ipcMain.handle('snapshots:reset', (event) =>
    priceService.resetAndRecalculate((progress) => {
      event.sender.send('snapshots:reset-progress', progress)
    })
  )
}
