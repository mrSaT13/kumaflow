/**
 * Remote Control Service - как в Feishin
 * Управление плеером через WebSocket
 */

import { app, ipcMain, BrowserWindow } from 'electron'
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import { join } from 'path'
import { readFile, writeFile, access } from 'fs/promises'
import * as https from 'https'
import * as http from 'http'
import * as crypto from 'crypto'

const APP_NAME = 'KumaFlow'

// ==================== ШИФРОВАНИЕ ПАРОЛЯ ====================

// Фиксированный ключ шифрования (не идеально, но лучше чем plaintext)
// В будущем можно использовать machine-specific ключ
const ENCRYPTION_KEY = crypto.scryptSync('kumaflow-remote-control-key-2025', 'salt', 32)
const IV_LENGTH = 16

function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let encrypted = cipher.update(password, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  // Возвращаем IV + encrypted для расшифровки
  return iv.toString('hex') + ':' + encrypted
}

function decryptPassword(encrypted: string): string {
  const [ivHex, encryptedHex] = encrypted.split(':')
  if (!ivHex || !encryptedHex) throw new Error('Invalid encrypted data')
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Путь к файлу конфигурации remote control
function getConfigPath(): string {
  return join(app.getPath('userData'), 'remote-control-config.json')
}

interface RemoteControlConfig {
  subsonicUrl?: string
  subsonicUsername?: string
  subsonicPasswordEncrypted?: string  // Зашифрованный пароль
  subsonicAuthType?: 'token' | 'password'
  enabled?: boolean
  port?: number
  selectedIp?: string
}

/**
 * Сохранить учётные данные Subsonic в зашифрованный JSON
 */
async function saveSubsonicCredentials(url: string, username: string, password: string, authType: 'token' | 'password') {
  try {
    const configPath = getConfigPath()
    let config: RemoteControlConfig = {}

    // Загружаем существующий конфиг
    try {
      const data = await readFile(configPath, 'utf-8')
      config = JSON.parse(data)
    } catch {
      // Файл не существует
    }

    config.subsonicUrl = url
    config.subsonicUsername = username
    config.subsonicPasswordEncrypted = encryptPassword(password)
    config.subsonicAuthType = authType

    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('[Remote] 🔐 Credentials saved to:', configPath)
  } catch (error) {
    console.error('[Remote] Failed to save credentials:', error)
  }
}

/**
 * Загрузить учётные данные Subsonic из зашифрованного JSON
 */
export async function loadSubsonicCredentials(): Promise<{ url: string; username: string; password: string; authType: 'token' | 'password' } | null> {
  try {
    const configPath = getConfigPath()
    const data = await readFile(configPath, 'utf-8')
    const config: RemoteControlConfig = JSON.parse(data)

    if (config.subsonicUrl && config.subsonicUsername && config.subsonicPasswordEncrypted) {
      const password = decryptPassword(config.subsonicPasswordEncrypted)
      console.log('[Remote] 🔓 Credentials loaded from:', configPath)
      return {
        url: config.subsonicUrl,
        username: config.subsonicUsername,
        password,
        authType: config.subsonicAuthType || 'password',
      }
    }
  } catch (error) {
    console.log('[Remote] No saved credentials found:', error)
  }
  return null
}

/**
 * Загрузить сохранённые настройки Remote Control
 */
export async function loadRemoteControlSettings(): Promise<{ enabled?: boolean; port?: number; ip?: string }> {
  try {
    const configPath = getConfigPath()
    const data = await readFile(configPath, 'utf-8')
    const config: RemoteControlConfig = JSON.parse(data)
    return {
      enabled: config.enabled,
      port: config.port,
      ip: config.selectedIp,
    }
  } catch {
    return {}
  }
}

interface RemoteConfig {
  enabled: boolean
  port: number
}

interface SubsonicAuth {
  url: string
  username: string
  password: string
  authType: 'token' | 'password'
  salt?: string
}

interface ClientWebSocket extends WebSocket {
  isAlive: boolean
}

let server: Server | undefined
let wsServer: WebSocketServer | undefined
let mainWindow: BrowserWindow | null = null
let subsonicAuth: SubsonicAuth | null = null // Учётные данные Subsonic

const settings: RemoteConfig = {
  enabled: false,
  port: 4333,
}

let currentState: any = {}

/**
 * Отправить сообщение клиенту
 */
function send(client: ClientWebSocket, event: string, data?: any) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ event, data }))
  }
}

/**
 * Отправить сообщение всем клиентам
 */
function broadcast(event: string, data?: any) {
  if (wsServer) {
    wsServer.clients.forEach((client) => {
      send(client as ClientWebSocket, event, data)
    })
  }
}

/**
 * Обновить состояние
 */
export function updateRemoteState(state: any) {
  console.log('[Remote] 📡 updateRemoteState вызвана:', {
    title: state?.title,
    artist: state?.artist,
    isPlaying: state?.isPlaying,
    duration: state?.duration,
    progress: state?.progress,
    clients: wsServer ? wsServer.clients.size : 0,
  })

  currentState = { ...currentState, ...state }

  if (wsServer && wsServer.clients.size > 0) {
    console.log('[Remote] 📤 Broadcast к', wsServer.clients.size, 'клиентам')
    broadcast('state-update', state)
  } else {
    console.log('[Remote] ⚠️ Нет подключённых клиентов для broadcast')
  }
}

/**
 * Запустить сервер
 */
export async function startRemoteServer(config: RemoteConfig): Promise<void> {
  // 🔓 Загружаем сохранённые учётные данные если есть
  if (!subsonicAuth) {
    const saved = await loadSubsonicCredentials()
    if (saved) {
      subsonicAuth = { url: saved.url, username: saved.username, password: saved.password, authType: saved.authType }
      console.log('[Remote] 🔓 Loaded saved credentials for:', saved.username, '@', saved.url)
    }
  }

  return new Promise<void>((resolve, reject) => {
    try {
      settings.enabled = config.enabled
      settings.port = config.port

      if (server) {
        server.close()
      }

      if (wsServer) {
        wsServer.close()
      }

      // HTTP сервер для раздачи remote страницы
      server = createServer(async (req, res) => {
        try {
          const url = req.url || '/'

          // Проксирование запросов на обложки
          if (url.startsWith('/getCoverArt')) {
            // Извлекаем параметры из URL
            const queryString = url.split('?')[1] || ''
            const params = new URLSearchParams(queryString)
            const coverId = params.get('id') || ''
            const size = params.get('size') || '300'

            console.log('[Remote] Proxying cover art:', coverId, size)

            // Если учётные данные не настроены, возвращаем ошибку
            if (!subsonicAuth) {
              console.error('[Remote] Subsonic auth not set')
              res.writeHead(503)
              res.end('Subsonic authentication not configured')
              return
            }

            // Генерируем параметры аутентификации
            const salt = Math.random().toString(36).substring(2, 10)
            const coverUrl = new URL(`${subsonicAuth.url}/rest/getCoverArt.view`)
            coverUrl.searchParams.set('id', coverId)
            coverUrl.searchParams.set('size', size)
            coverUrl.searchParams.set('v', '1.16.1')
            coverUrl.searchParams.set('c', APP_NAME)
            coverUrl.searchParams.set('u', subsonicAuth.username)

            // ВАЖНО: Пробуем использовать пароль напрямую через ?p=password
            // Это работает для plaintext паролей И для MD5 хэшей (Navidrome принимает оба)
            coverUrl.searchParams.set('p', subsonicAuth.password)
            console.log('[Remote] Cover auth: password-based, length:', subsonicAuth.password?.length)
            
            console.log('[Remote] Cover URL:', coverUrl.toString().substring(0, 100) + '...')
            
            const lib = coverUrl.protocol === 'https:' ? https : http
            
            lib.get(coverUrl, (proxyRes) => {
              const contentType = proxyRes.headers['content-type'] || ''
              console.log('[Remote] Cover proxy response:', proxyRes.statusCode, contentType)

              // Если сервер вернул XML вместо изображения — это ошибка аутентификации или ID
              if (contentType.includes('xml') || contentType.includes('json')) {
                let errorBody = ''
                proxyRes.on('data', (chunk) => { errorBody += chunk })
                proxyRes.on('end', () => {
                  console.error('[Remote] Cover proxy got error response:', errorBody.substring(0, 500))
                  res.writeHead(502, { 'Content-Type': 'text/plain' })
                  res.end('Cover proxy error: Subsonic returned non-image response')
                })
                return
              }

              // Устанавливаем заголовки для CORS и кэширования
              res.writeHead(proxyRes.statusCode || 500, {
                'Content-Type': contentType || 'image/jpeg',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              })

              // Проксируем ответ напрямую
              proxyRes.pipe(res)
            }).on('error', (err) => {
              console.error('[Remote] Cover proxy error:', err)
              res.writeHead(500)
              res.end('Error loading cover art')
            })
            return
          }

          // Раздаём remote страницу — пробуем несколько путей
          if (url === '/' || url === '/index.html') {
            const possiblePaths = [
              join(app.getAppPath(), 'public', 'remote.html'),
              join(app.getAppPath(), 'electron', 'remote', 'index.html'),
              join(process.resourcesPath, 'app', 'public', 'remote.html'),
              join(app.getAppPath(), 'resources', 'app.asar.unpacked', 'public', 'remote.html'),
            ]

            let content: string | null = null
            let usedPath: string | null = null

            for (const p of possiblePaths) {
              try {
                const { accessSync } = await import('fs')
                accessSync(p)
                content = await readFile(p, 'utf-8')
                usedPath = p
                console.log(`[Remote] Serving page from: ${p}`)
                break
              } catch {
                // File not found, try next
              }
            }

            if (!content) {
              console.error('[Remote] Could not find remote.html. Tried:', possiblePaths)
              res.writeHead(500)
              res.end('Remote page not found')
              return
            }

            res.writeHead(200, {
              'Content-Type': 'text/html; charset=UTF-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            })
            res.end(content)
            return
          }

          res.writeHead(404)
          res.end('Not found')
        } catch (error) {
          res.writeHead(500)
          res.end('Error')
        }
      })

      // WebSocket сервер
      wsServer = new WebSocketServer({ 
        server,
        path: '/remote-ws'
      })

      wsServer.on('connection', (ws: ClientWebSocket, req: any) => {
        ws.isAlive = true

        // Track connected client
        const clientIp = req.socket?.remoteAddress || req.headers?.['x-forwarded-for'] || 'unknown'
        const userAgent = req.headers?.['user-agent'] || 'unknown'
        const clientInfo: ClientInfo = {
          ws,
          ip: clientIp,
          userAgent,
          connectedAt: Date.now(),
        }
        connectedClients.push(clientInfo)
        console.log(`[Remote] 📱 Client connected from ${clientIp} (${userAgent.substring(0, 50)}...) Total: ${connectedClients.length}`)

        // Отправляем текущее состояние при подключении
        send(ws, 'connected', { message: 'Connected to KumaFlow Remote' })
        send(ws, 'state-update', currentState)

        ws.on('pong', () => {
          ws.isAlive = true
        })

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString())
            handleRemoteMessage(message)
          } catch (error) {
            console.error('[Remote] Parse error:', error)
          }
        })

        ws.on('close', () => {
          console.log('[Remote] Client disconnected')
          // Remove from tracked clients
          const idx = connectedClients.findIndex(c => c.ws === ws)
          if (idx >= 0) {
            connectedClients.splice(idx, 1)
            console.log(`[Remote] 📱 Client disconnected. Total: ${connectedClients.length}`)
          }
        })

        ws.on('error', (error) => {
          console.error('[Remote] WebSocket error:', error)
        })
      })

      // Heartbeat - проверка живых подключений
      const heartbeat = setInterval(() => {
        if (wsServer) {
          wsServer.clients.forEach((ws) => {
            const client = ws as ClientWebSocket
            if (!client.isAlive) {
              client.terminate()
              return
            }
            client.isAlive = false
            client.ping()
          })
        }
      }, 30000)

      wsServer.on('close', () => {
        clearInterval(heartbeat)
      })

      server.listen(settings.port, () => {
        console.log(`[Remote] Server started on port ${settings.port}`)
        console.log(`[Remote] Open http://localhost:${settings.port}`)
        resolve()
      })

      server.on('error', (error: any) => {
        console.error('[Remote] Server error:', error)
        if (error.code === 'EADDRINUSE') {
          console.error(`[Remote] Port ${settings.port} is already in use!`)
        }
        reject(error)
      })

    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Остановить сервер
 */
export function stopRemoteServer() {
  return new Promise<void>((resolve) => {
    if (wsServer) {
      wsServer.clients.forEach((client) => client.close())
      wsServer.close(() => {
        console.log('[Remote] WebSocket server stopped')
      })
      wsServer = undefined
    }

    if (server) {
      server.close(() => {
        console.log('[Remote] HTTP server stopped')
      })
      server = undefined
    }

    settings.enabled = false
    resolve()
  })
}

/**
 * Обработка сообщений от remote клиентов
 */
function handleRemoteMessage(message: any) {
  console.log('[Remote] Message:', message)

  if (!mainWindow) {
    console.error('[Remote] Main window not available')
    return
  }

  // Преобразуем в формат плеера
  const payload = {
    action: message.event === 'previous' ? 'prev' :
            message.event === 'position' ? 'seek' : message.event,
    value: message.data?.value || message.data?.position,
  }

  console.log('[Remote] Forwarding to renderer:', payload)

  // Отправляем напрямую в renderer
  mainWindow.webContents.send('remote-control-command', payload)
}

/**
 * Настроить IPC обработчик для получения очереди от плеера
 * Вызывать после создания окна!
 */
export function setupRemoteQueueHandler() {
  const { ipcMain } = require('electron')

  // Очищаем предыдущие обработчики если есть
  ipcMain.removeAllListeners('remote-queue-response')

  ipcMain.on('remote-queue-response', (event, queue) => {
    console.log('[Remote] 📥 Queue response received:', queue?.length || 0, 'tracks')
    console.log('[Remote] WebSocket clients:', wsServer?.clients?.size || 0)

    // Отправляем очередь всем WebSocket клиентам
    if (wsServer && queue) {
      const message = JSON.stringify({ event: 'queue-update', data: queue })
      let sentCount = 0
      wsServer.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message)
          sentCount++
        }
      })
      console.log('[Remote] 📤 Queue sent to', sentCount, 'WebSocket clients')
    } else {
      console.warn('[Remote] ⚠️ Cannot send queue: wsServer=', !!wsServer, 'queue=', !!queue)
    }
  })

  console.log('[Remote] ✅ Queue IPC handler registered')
}

/**
 * Установить главное окно
 */
export function setRemoteMainWindow(window: BrowserWindow) {
  mainWindow = window
}

/**
 * Получить статус сервера
 */
export function getRemoteStatus() {
  return {
    enabled: settings.enabled,
    port: settings.port,
    clientCount: wsServer?.clients.size || 0,
  }
}

interface ClientInfo {
  ws: ClientWebSocket
  ip: string
  userAgent: string
  connectedAt: number
}

const connectedClients: ClientInfo[] = []

/**
 * Получить список подключённых клиентов
 */
export function getConnectedClients(): { ip: string; userAgent: string; connectedAt: number }[] {
  return connectedClients.map(c => ({
    ip: c.ip,
    userAgent: c.userAgent,
    connectedAt: c.connectedAt,
  }))
}

/**
 * Установить порт
 */
export function setRemotePort(port: number) {
  if (settings.enabled) {
    return false
  }
  settings.port = port
  return true
}

/**
 * Установить базовый URL приложения
 */
export async function setRemoteBaseAppUrl(url: string, username: string, password: string, authType: 'token' | 'password') {
  console.log('[Remote] setRemoteBaseAppUrl called:', {
    url,
    username,
    passwordLength: password?.length || 0,
    passwordStarts: password?.substring(0, 8) + '...',
    authType
  })
  subsonicAuth = { url, username, password, authType }
  console.log('[Remote] Subsonic auth set:', url, username, authType, 'password:', password ? '***' : 'EMPTY')

  // 💾 Сохраняем зашифрованный пароль
  if (password) {
    await saveSubsonicCredentials(url, username, password, authType)
  }
}
