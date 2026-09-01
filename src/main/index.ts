import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import { getDb } from './db'
import { registerIpcHandlers } from './ipc'
import {
  mergeDuplicatesByIsin,
  migrateExistingPositionsToTransactions
} from './services/ledgerService'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.paokn.portfolio-tracker')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // DB-Schema initialisieren, bevor IPC-Handler registriert werden, die darauf zugreifen.
  getDb()
  migrateExistingPositionsToTransactions()
  // Dasselbe Wertpapier kann aus zwei Broker-Importen unter verschiedenen Börsenplätzen liegen
  // ('IWDA.L' gegen 'IWDA.AS'). Beim Start einmal über die ISIN zusammenführen - idempotent,
  // ohne Doppelungen ein no-op.
  {
    const dedupe = mergeDuplicatesByIsin()
    if (dedupe.merged > 0)
      console.log(
        `${dedupe.merged} doppelte Position(en) zusammengeführt:`,
        dedupe.removed.join(', ')
      )
  }
  registerIpcHandlers()

  createWindow()

  // Auto-Update: prüft beim Start gegen die GitHub Releases des Repos (siehe electron-builder.yml
  // publish-Konfiguration) und lädt eine neuere Version im Hintergrund herunter; sobald sie fertig
  // ist, zeigt Electron eine native Benachrichtigung und installiert sie beim nächsten Neustart der
  // App. Nur in der gepackten App relevant - im Dev-Modus gibt es kein app-update.yml und keinen
  // sinnvollen Vergleichspunkt.
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('Auto-Update-Prüfung fehlgeschlagen:', err)
    })
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
