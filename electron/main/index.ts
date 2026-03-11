import { electronApp, optimizer, platform } from '@electron-toolkit/utils'
import { app, ipcMain } from 'electron'
import { createAppMenu } from './core/menu'
import { initAutoUpdater } from './core/updater'
import { createWindow, mainWindow, sendToRenderer } from './window'
import { initAudiobookshelfIPC } from './core/audiobookshelf'
import { spawn } from 'child_process'
import { join } from 'path'

export let isQuitting = false

const currentDesktop = process.env.XDG_CURRENT_DESKTOP ?? ''

if (platform.isLinux && currentDesktop.toLowerCase().includes('gnome')) {
  process.env.XDG_CURRENT_DESKTOP = 'Unity'
}

const instanceLock = app.requestSingleInstanceLock()

if (!instanceLock) {
  app.quit()
} else {
  createAppMenu()

  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }

    mainWindow.focus()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.kumaflow.app')

    initAutoUpdater()
    initAudiobookshelfIPC()
    
    // Yandex Music Auth IPC
    ipcMain.handle('yandex-music:auth', async (_, { login, password }) => {
      console.log('[YandexAuth] Starting auth for:', login)
      
      return new Promise((resolve) => {
        const scriptPath = join(app.getAppPath(), 'electron/main/yandex-auth.py')
        console.log('[YandexAuth] Script path:', scriptPath)
        
        const python = spawn('python3', [scriptPath, login, password])
        
        let output = ''
        let error = ''
        
        python.stdout.on('data', (data) => {
          console.log('[YandexAuth] stdout:', data.toString())
          output += data.toString()
        })
        
        python.stderr.on('data', (data) => {
          console.error('[YandexAuth] stderr:', data.toString())
          error += data.toString()
        })
        
        python.on('close', (code) => {
          console.log('[YandexAuth] Process closed with code:', code)
          if (code === 0) {
            try {
              const result = JSON.parse(output)
              resolve(result)
            } catch (e) {
              console.error('[YandexAuth] Parse error:', e)
              resolve({ error: 'Failed to parse response' })
            }
          } else {
            resolve({ error: error || 'Authentication failed' })
          }
        })
        
        python.on('error', (err) => {
          console.error('[YandexAuth] Spawn error:', err)
          resolve({ error: err.message })
        })
      })
    })
    
    // Yandex Music API IPC (через Node.js для обхода CORS)
    ipcMain.handle('yandex-music:api', async (_, { endpoint, token, params }) => {
      console.log('[YandexAPI] Request:', endpoint, params)

      return new Promise((resolve) => {
        const https = require('https')

        const url = new URL(`https://api.music.yandex.net${endpoint}`)
        Object.entries(params || {}).forEach(([key, value]) => {
          url.searchParams.set(key, value)
        })

        console.log('[YandexAPI] Full URL:', url.toString())

        const options = {
          method: 'GET',
          headers: {
            'Authorization': `OAuth ${token}`,
          },
        }

        const req = https.request(url, options, (res) => {
          let data = ''

          res.on('data', (chunk) => {
            data += chunk
          })

          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (e) {
              resolve({ error: 'Failed to parse response' })
            }
          })
        })

        req.on('error', (err) => {
          console.error('[YandexAPI] Request error:', err)
          resolve({ error: err.message })
        })

        req.end()
      })
    })

    // External fetch proxy (for CORS)
    ipcMain.handle('fetch-external', async (_, { url }) => {
      console.log('[ExternalFetch] Fetching:', url)

      return new Promise((resolve, reject) => {
        const https = require('https')
        const http = require('http')

        const lib = url.startsWith('https') ? https : http

        const req = lib.get(url, {
          headers: {
            'Accept-Encoding': 'gzip, deflate',
          },
        }, (res: any) => {
          let data = ''

          // Обработка gzip
          if (res.headers['content-encoding'] === 'gzip') {
            const zlib = require('zlib')
            const chunks: Buffer[] = []

            res.on('data', (chunk: Buffer) => {
              chunks.push(chunk)
            })

            res.on('end', () => {
              const buffer = Buffer.concat(chunks)
              zlib.gunzip(buffer, (err: Error, decompressed: Buffer) => {
                if (err) {
                  console.error('[ExternalFetch] Gzip decompress error:', err)
                  reject(err)
                  return
                }

                const text = decompressed.toString('utf8')
                console.log('[ExternalFetch] Decompressed response:', text.substring(0, 200))

                try {
                  const json = JSON.parse(text)
                  resolve(json)
                } catch (e) {
                  console.warn('[ExternalFetch] Not JSON, returning raw text')
                  resolve({ _raw: text, _isRaw: true })
                }
              })
            })
          } else {
            // Обычный ответ без сжатия
            res.on('data', (chunk: string) => {
              data += chunk
            })

            res.on('end', () => {
              console.log('[ExternalFetch] Raw response:', data.substring(0, 200))

              try {
                const json = JSON.parse(data)
                resolve(json)
              } catch (e) {
                console.warn('[ExternalFetch] Not JSON, returning raw text')
                resolve({ _raw: data, _isRaw: true })
              }
            })
          }
        })

        req.on('error', (err) => {
          console.error('[ExternalFetch] Request error:', err)
          reject(err)
        })

        req.end()
      })
    })

    // Last.fm Scrobble IPC (для обхода CORS)
    ipcMain.handle('lastfm-scrobble', async (_, { url, method, body }) => {
      console.log('[Last.fm IPC] Scrobbling:', url.substring(0, 80) + '...')
      console.log('[Last.fm IPC] Body:', body?.substring(0, 150) + '...')

      return new Promise((resolve, reject) => {
        const https = require('https')
        const http = require('http')

        const lib = url.startsWith('https') ? https : http

        // Last.fm требует POST с body
        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body || ''),
          },
        }

        const req = lib.request(url, options, (res: any) => {
          let data = ''

          res.on('data', (chunk: string) => {
            data += chunk
          })

          res.on('end', () => {
            console.log('[Last.fm IPC] Raw response:', data.substring(0, 300))
            
            // Last.fm возвращает XML, парсим его
            try {
              // Проверяем статус в XML
              const statusMatch = data.match(/<lfm status="([^"]+)"/)
              if (statusMatch) {
                const status = statusMatch[1]
                console.log('[Last.fm IPC] LFM status:', status)
                
                if (status === 'ok') {
                  // Успех!
                  resolve({ status: 'ok', raw: data })
                } else {
                  // Ошибка Last.fm
                  const errorMatch = data.match(/<error code="(\d+)">([^<]+)<\/error>/)
                  const errorCode = errorMatch ? errorMatch[1] : 'unknown'
                  const errorMessage = errorMatch ? errorMatch[2] : 'Unknown error'
                  console.error('[Last.fm IPC] LFM error:', errorCode, errorMessage)
                  resolve({ error: 'Last.fm error', code: errorCode, message: errorMessage, raw: data })
                }
              } else {
                // Не XML ответ
                console.error('[Last.fm IPC] Unknown response format:', data.substring(0, 100))
                resolve({ error: 'Unknown response format', raw: data })
              }
            } catch (e) {
              console.error('[Last.fm IPC] Parse error:', e, data)
              resolve({ error: 'Parse error', message: e.message, raw: data })
            }
          })
        })

        req.on('error', (err: any) => {
          console.error('[Last.fm IPC] Request error:', err)
          reject(err)
        })

        // ОТПРАВЛЯЕМ BODY!
        if (body) {
          req.write(body)
        }

        req.end()
      })
    })

    createWindow()
  })

  app.on('activate', function () {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    } else if (!mainWindow.isVisible()) {
      mainWindow.show()
    }

    mainWindow.focus()
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)

    window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F11') {
        event.preventDefault()
      }
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    if (!platform.isMacOS) {
      app.quit()
    }
  })
}
