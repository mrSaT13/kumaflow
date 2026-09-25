import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { createManualChunks } from './src/manual-chunks'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      minify: 'terser',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
        },
      },
      externalizeDeps: {
        exclude: [
          '@electron-toolkit/utils',
          'electron-store',
          'electron-dl',
          'electron-updater',
          'discord-rpc',
          // 1.6.2: node_modules не пакуется (см. electron-builder.yml files),
          // поэтому ws и music-metadata бандлим внутрь main
          'ws',
          'music-metadata',
        ],
      },
    },
  },
  preload: {
    build: {
      minify: 'terser',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
      },
      externalizeDeps: {
        exclude: ['@electron-toolkit/preload', 'electron-updater'],
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      minify: 'terser',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
        output: {
          manualChunks: createManualChunks,
        },
      },
    },
  },
})
