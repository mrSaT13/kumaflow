import { electronApp, optimizer, platform } from '@electron-toolkit/utils'
import { app, ipcMain, protocol } from 'electron'
import { createAppMenu } from './core/menu'
import { initAutoUpdater } from './core/updater'
import { createWindow, mainWindow, sendToRenderer } from './window'
import { initAudiobookshelfIPC } from './core/audiobookshelf'
import { setupLocalMusicHandlers } from './core/local-music-handler'
import { startRemoteServer, stopRemoteServer, updateRemoteState, setRemoteMainWindow, getRemoteStatus, setRemotePort, setRemoteBaseAppUrl, setupRemoteQueueHandler, getConnectedClients } from '../../src/service/remote-server'
// 🆕 DLNA - dynamic import чтобы не тянуть localStorage в main process
// 🆕 DLNA - lazy getter чтобы не тянуть localStorage при старте
let _dlnaService: any = null
async function getDlnaService() {
  if (!_dlnaService) {
    const { dlnaService } = await import('../../src/service/dlna-service')
    _dlnaService = dlnaService
  }
  return _dlnaService
}
import { spawn } from 'child_process'
import { join } from 'path'
import * as fs from 'fs'

/* // TODO: Jellyfin/MusicAssistant integration
ipcMain.handle('server:detect-type', async (_event, url: string) => {
...
*/

export let isQuitting = false

// Храним выбранный IP для Remote Control
let selectedRemoteIp: string | null = null

// Helper: получить первый доступный локальный IP
function getFirstLocalIp(): string | null {
  try {
    const os = require('os')
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
      const iface = interfaces[name]
      if (!iface) continue
      for (const ip of iface) {
        if (ip.family === 'IPv4' && !ip.internal) {
          return ip.address
        }
      }
    }
  } catch (error) {
    console.error('[Main] Error getting local IP:', error)
  }
  return null
}

// Логирование в файл для production
const logPath = join(app.getPath('userData'), 'kumaflow-debug.log')
function logToFile(message: string) {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}\n`
  fs.appendFile(logPath, logMessage, (err) => {
    if (err) console.error('Failed to write to log file:', err)
  })
}

// Перехватываем console.log для логирования
const originalConsoleLog = console.log
console.log = (...args) => {
  logToFile(args.join(' '))
  originalConsoleLog(...args)
}

const currentDesktop = process.env.XDG_CURRENT_DESKTOP ?? ''

if (platform.isLinux && currentDesktop.toLowerCase().includes('gnome')) {
  process.env.XDG_CURRENT_DESKTOP = 'Unity'
}

const instanceLock = app.requestSingleInstanceLock()

if (!instanceLock) {
  app.quit()
} else {
  // Отключаем CORS для Electron (только для разработки!)
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
  app.commandLine.appendSwitch('disable-web-security')
  
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
    
    // Сначала создаём окно
    createWindow()
    
    // Устанавливаем главное окно для remote
    setRemoteMainWindow(mainWindow)

    // Настраиваем обработчик очереди для remote
    setupRemoteQueueHandler()

    // Инициализация Remote Control
    console.log('[Main] Initializing Remote Control...')
    
    // Регистрируем протокол для локальных файлов
    // Это позволяет загружать локальные аудиофайлы с кириллицей в пути
    protocol.registerFileProtocol('kumaflow-local', (request, callback) => {
      // Извлекаем путь из URL
      const url = request.url.replace('kumaflow-local://', '')
      const filePath = decodeURIComponent(url)
      
      console.log('[Protocol] kumaflow-local request:', filePath)
      
      // Проверяем существование файла
      import('fs').then(({ promises: fs }) => {
        fs.access(filePath).then(() => {
          callback({ path: filePath })
        }).catch((err) => {
          console.error('[Protocol] File access error:', err.message)
          callback({ error: -6 }) // ERR_FILE_NOT_FOUND
        })
      })
    })

    initAutoUpdater()
    initAudiobookshelfIPC()
    setupLocalMusicHandlers()
    
    // Remote Control IPC handlers
    ipcMain.handle('remote-control:start', async (event, port?: number) => {
      if (port) {
        setRemotePort(port)
      }
      await startRemoteServer({ enabled: true, port: port || 4333 })
      return getRemoteStatus()
    })

    ipcMain.handle('remote-control:stop', async () => {
      await stopRemoteServer()
      return getRemoteStatus()
    })

    ipcMain.handle('remote-control:get-status', () => {
      return getRemoteStatus()
    })

    ipcMain.handle('remote-control:get-url', () => {
      const status = getRemoteStatus()
      const ip = selectedRemoteIp || getFirstLocalIp() || 'localhost'
      return `http://${ip}:${status.port}`
    })

    ipcMain.handle('remote-control:get-all-ips', () => {
      const os = require('os')
      const interfaces = os.networkInterfaces()
      const ips: { ip: string; iface: string }[] = []

      for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name]
        if (!iface) continue
        for (const ip of iface) {
          if (ip.family === 'IPv4' && !ip.internal) {
            ips.push({ ip: ip.address, iface: name })
          }
        }
      }
      return ips
    })

    ipcMain.handle('remote-control:set-ip', (event, ip: string) => {
      selectedRemoteIp = ip
      console.log(`[Remote] IP set to: ${ip}`)
      return true
    })

    ipcMain.handle('remote-control:get-port', () => {
      return getRemoteStatus().port
    })

    ipcMain.handle('remote-control:set-port', (event, port: number) => {
      return setRemotePort(port)
    })

    // Установка Subsonic сервера для remote проксирования
    ipcMain.handle('remote-control:set-subsonic-url', async (event, url: string, username: string, password: string, authType: 'token' | 'password') => {
      await setRemoteBaseAppUrl(url, username, password, authType)
      return true
    })

    // Проверка есть ли сохранённые учётные данные
    ipcMain.handle('remote-control:hasSavedCredentials', async () => {
      const { loadRemoteControlSettings, loadSubsonicCredentials } = await import('../../src/service/remote-server')
      const creds = await loadSubsonicCredentials()
      return creds !== null
    })

    // Загрузить сохранённые настройки remote control
    ipcMain.handle('remote-control:loadSettings', async () => {
      const { loadRemoteControlSettings } = await import('../../src/service/remote-server')
      return loadRemoteControlSettings()
    })

    // Получить список подключённых клиентов
    ipcMain.handle('remote-control:get-connected-clients', () => {
      return getConnectedClients()
    })
    
    // DLNA IPC handlers
    ipcMain.handle('dlna:start', async (event, port?: number) => {
      console.log('[DLNA IPC] Start requested, port:', port || 8080)
      const dlnaService = await getDlnaService()
      const result = await dlnaService.start(port || 8080)
      console.log('[DLNA IPC] Start result:', result)
      return result
    })
    
    ipcMain.handle('dlna:stop', async () => {
      console.log('[DLNA IPC] Stop requested')
      const dlnaService = await getDlnaService()
      await dlnaService.stopServer()
      return true
    })
    
    ipcMain.handle('dlna:scan', async () => {
      console.log('[DLNA IPC] Scan requested')
      const dlnaService = await getDlnaService()
      const devices = await dlnaService.scanDevices(3000)
      console.log('[DLNA IPC] Scan result:', devices.length, 'devices')
      return devices
    })
    
    ipcMain.handle('dlna:cast', async (event, device: any, trackId: string) => {
      console.log('[DLNA IPC] Cast requested:', device.name, trackId)
      
      try {
        // Получаем информацию о треке из Subsonic
        const { subsonic } = await import('../../src/service/subsonic')
        const song = await subsonic.songs.getSong(trackId)
        
        if (!song) {
          console.error('[DLNA IPC] Track not found:', trackId)
          return false
        }
        
        // Формируем TrackInfo
        const trackInfo = {
          id: song.id,
          title: song.title || 'Unknown',
          artist: song.artist || 'Unknown',
          album: song.album,
          duration: song.duration,
          // Формируем полный URL обложки
          coverUrl: song.coverArt 
            ? `${subsonic.baseUrl}/rest/getCoverArt?id=${song.coverArt}&f=json`
            : undefined,
          streamUrl: `${subsonic.baseUrl}/rest/stream?id=${trackId}&f=json`,
        }
        
        console.log('[DLNA IPC] Track info:', trackInfo.title, 'by', trackInfo.artist)
        
        const dlnaService = await getDlnaService()
        const result = await dlnaService.castToDevice(device, trackInfo)
        console.log('[DLNA IPC] Cast result:', result)
        return result
      } catch (error) {
        console.error('[DLNA IPC] Cast error:', error)
        return false
      }
    })

    ipcMain.handle('dlna:getCurrentDevice', async () => {
      const dlnaService = await getDlnaService()
      const device = dlnaService.getCurrentDevice()
      return device
    })

    // Обработчик состояния плеера для remote clients
    ipcMain.on('player-state-update', (event, state) => {
      console.log('[Remote] ✅ Получено состояние от плеера:', {
        title: state?.title,
        artist: state?.artist,
        isPlaying: state?.isPlaying,
        duration: state?.duration,
        progress: state?.progress,
      })
      updateRemoteState(state)
    })

    // Остановка remote сервера при перезапуске приложения
    app.on('before-quit', async () => {
      console.log('[Remote] Shutting down remote server on app quit...')
      await stopRemoteServer()
    })

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
      
      // Ctrl+Shift+I для открытия DevTools в production
      if (input.control && input.shift && input.key === 'I') {
        window.webContents.openDevTools()
      }
    })
  })

  let isSaving = false

  app.on('before-quit', async (e) => {
    // Если уже сохраняем — выходим
    if (isSaving) {
      console.log('[App] Save complete, quitting...')
      isQuitting = true
      return
    }

    e.preventDefault()
    console.log('[App] before-quit triggered — saving all data...')

    // Принудительно сохраняем все данные перед выходом
    isSaving = true
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.webContents.executeJavaScript(`
          (async () => {
            try {
              const stores = ['ml_profile', 'ratings', 'settings', 'accounts-persistence', 
                             'homepage-settings', 'page-design-settings', 'theme-store',
                             'ml-playlists', 'ml-playlists-state', 'generated-playlists',
                             'app-persistence', 'auth-persistence', 'shared-accounts'];
              
              for (const key of stores) {
                const data = localStorage.getItem(key);
                if (data) {
                  console.log('[Save] ✓', key, '(' + data.length + ' bytes)');
                } else {
                  console.log('[Save] -', key, '(empty)');
                }
              }
              
              // Форсируем запись localStorage
              window.dispatchEvent(new Event('beforeunload'));
              await new Promise(r => setTimeout(r, 500));
            } catch (e) {
              console.error('[Save] Error:', e);
            }
          })();
        `)
        console.log('[App] Data save complete')
      } catch (err) {
        console.error('[App] Error saving data:', err)
      }
    }

    isQuitting = true
    isSaving = false
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (!platform.isMacOS) {
      app.quit()
    }
  })
}
