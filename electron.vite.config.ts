import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // externalizeDepsPlugin: node_modules-Pakete bleiben normale require()-Aufrufe statt von esbuild
  // mitgebündelt zu werden. Nötig für yahoo-finance2, dessen Default-Export eine Klasse ist -
  // esbuilds ESM/CJS-Interop bricht das beim Bundling ("X is not a constructor"); Node's eigene
  // Modulauflösung zur Laufzeit funktioniert dagegen korrekt.
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  // Preload läuft unter sandbox:true in einem eingeschränkten Kontext, der kein require()
  // externer npm-Pakete erlaubt (z.B. @electron-toolkit/preload) - deshalb hier bewusst
  // KEIN externalizeDepsPlugin, damit alles in eine einzelne Datei gebündelt wird.
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
