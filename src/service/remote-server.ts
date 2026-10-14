/**
 * Remote Control Service - как в Feishin
 * Управление плеером через WebSocket
 */

import { app, BrowserWindow } from 'electron'
import { createServer, Server } from 'http'
import { WebSocket, WebSocketServer } from 'ws'
import { join, dirname } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
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
  pin?: string
}

/**
 * Сохранить часть настроек Remote Control (port/ip/pin/enabled) в JSON
 */
async function saveRemoteSettings(partial: Partial<RemoteControlConfig>) {
  try {
    const configPath = getConfigPath()
    let config: RemoteControlConfig = {}
    try {
      const data = await readFile(configPath, 'utf-8')
      config = JSON.parse(data)
    } catch {
      // файла нет — создаём
    }
    config = { ...config, ...partial }
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error) {
    console.error('[Remote] Failed to save settings:', error)
  }
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
export async function loadRemoteControlSettings(): Promise<{ enabled?: boolean; port?: number; ip?: string; hasPin?: boolean }> {
  try {
    const configPath = getConfigPath()
    const data = await readFile(configPath, 'utf-8')
    const config: RemoteControlConfig = JSON.parse(data)
    return {
      enabled: config.enabled,
      port: config.port,
      ip: config.selectedIp,
      hasPin: !!config.pin,
    }
  } catch {
    return {}
  }
}

/**
 * PIN-защита: получить / установить / проверить
 */
export async function getRemotePin(): Promise<string | null> {
  if (currentPin) return currentPin
  try {
    const configPath = getConfigPath()
    const data = await readFile(configPath, 'utf-8')
    const config: RemoteControlConfig = JSON.parse(data)
    if (config.pin) {
      currentPin = config.pin
      return currentPin
    }
  } catch {
    // нет файла
  }
  return null
}

export async function setRemotePin(pin: string | null): Promise<boolean> {
  const clean = (pin || '').trim()
  // PIN: пусто = снять защиту, иначе 4-12 цифр
  if (clean && !/^\d{4,12}$/.test(clean)) {
    return false
  }
  currentPin = clean || null
  await saveRemoteSettings({ pin: clean || undefined })
  // удаляем ключ если пустой, чтобы hasPin был false
  if (!clean) {
    try {
      const configPath = getConfigPath()
      const data = await readFile(configPath, 'utf-8')
      const config: RemoteControlConfig = JSON.parse(data)
      delete (config as any).pin
      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch { /* ignore */ }
  }
  console.log(`[Remote] PIN ${currentPin ? 'установлен' : 'снят'}`)
  return true
}

function isPinAuthorized(reqUrl: string): boolean {
  if (!currentPin) return true
  try {
    // req.url вида "/?pin=1234" или "/remote-ws?pin=1234"
    const u = new URL(reqUrl, 'http://localhost')
    return u.searchParams.get('pin') === currentPin
  } catch {
    return false
  }
}

function buildPinLoginPage(): string {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KumaFlow Remote — PIN</title>
<style>body{font-family:system-ui,sans-serif;background:#0f0f1a;color:#f0f0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}form{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);padding:32px;border-radius:16px;text-align:center}input{font-size:24px;letter-spacing:8px;text-align:center;padding:10px;width:180px;border-radius:8px;border:1px solid #6366f1;background:#1a1a2e;color:#fff;margin:12px 0}button{background:#6366f1;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:16px;cursor:pointer}</style>
</head><body><form onsubmit="location.search='?pin='+document.getElementById('p').value;return false"><h2>🔒 KumaFlow Remote</h2><p>Введите PIN-код</p><input id="p" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="off"><br><button>Войти</button></form></body></html>`
}

interface RemoteConfig {
  enabled: boolean
  port: number
  host?: string
  pin?: string | null
}

interface SubsonicAuth {
  url: string
  username: string
  password: string
  authType: 'token' | 'password'
  salt?: string
}

/**
 * Минимальная поверхность ws-сокета, которую использует remote-сервер.
 * Пакет `ws` не поставляет собственных деклараций, а @types/ws в зависимостях
 * нет, поэтому описываем используемые члены явно (иначе `extends WebSocket`
 * давал пустой интерфейс и readyState/send/on считались несуществующими).
 */
interface ClientWebSocket {
  isAlive: boolean
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  terminate(): void
  ping(): void
  on(event: 'message', listener: (data: { toString(): string }) => void): void
  on(event: 'pong' | 'close' | 'error', listener: (payload?: unknown) => void): void
}

let server: Server | undefined
let wsServer: WebSocketServer | undefined
let mainWindow: BrowserWindow | null = null
let subsonicAuth: SubsonicAuth | null = null // Учётные данные Subsonic

const settings: RemoteConfig = {
  enabled: false,
  port: 4333,
  host: '0.0.0.0',
}

let currentPin: string | null = null
let currentHost = '0.0.0.0'
// Папка, откуда отдали remote.html — там же лежат иконки для PWA/favicon
let remoteAssetDir: string | null = null

// mDNS-анонс `_kumaflow-remote._tcp` для мобильного пульта
// (mDNS discovery в мобайле + скан подсети как фолбек).
// bonjour-service — опциональный: без него просто нет анонса, сервер работает.
let bonjourInstance: any = null

function startMdnsAdvertise(port: number) {
  stopMdnsAdvertise()
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Bonjour = require('bonjour-service')
    const BonjourCtor = Bonjour.Bonjour || Bonjour.default || Bonjour
    bonjourInstance = new BonjourCtor()
    const os = require('os')
    const hostName = (() => {
      try {
        return os.hostname() || 'KumaFlow'
      } catch {
        return 'KumaFlow'
      }
    })()
    let version = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      version = require('../../package.json').version || ''
    } catch {
      // ignore
    }
    bonjourInstance.publish({
      name: `KumaFlow ${hostName}`,
      type: 'kumaflow-remote',
      port,
      txt: { name: hostName, pin: currentPin ? '1' : '0', version },
    })
    console.log(`[Remote] mDNS announced as _kumaflow-remote._tcp on port ${port}`)
  } catch (error) {
    console.log('[Remote] mDNS unavailable (bonjour-service not installed?), skip:', (error as Error)?.message)
    bonjourInstance = null
  }
}

function stopMdnsAdvertise() {
  try {
    bonjourInstance?.unpublishAll?.()
    bonjourInstance?.destroy?.()
  } catch (_) {
    // ignore
  }
  bonjourInstance = null
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

/** Соль для token-авторизации Subsonic/Navidrome — та же, что в src/utils/salt.ts */
const REMOTE_SALT = '40n50kuPl4y3r'

/** md5(hex) — для сборки токена из plaintext-пароля. */
function md5Hex(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex')
}

/**
 * Варианты URL обложки: сохранённый пароль может быть plaintext (нужен ?p=)
 * или уже MD5-токеном (нужен ?t=+?s=). Возвращаем в порядке предпочтения,
 * чтобы работал и Navidrome, и обычный OpenSubsonic.
 *
 * ВАЖНО: coverId и size ОБЯЗАТЕЛЬНО ставятся в запрос. Раньше они не
 * попадали в URL вообще, Navidrome получал getCoverArt без id и отдавал свой
 * placeholder — картинку «диск + НавиДром». Прокси её принимал, потому что
 * Content-Type был image/*, и remote-страница показывала заглушку вместо обложки.
 * f=json тоже убран: getCoverArt отдаёт бинарь независимо от f.
 */
function buildCoverAuthVariants(
  auth: SubsonicAuth,
  coverId: string,
  size: string,
): URL[] {
  const base = auth.url.replace(/\/+$/, '')
  const mk = (apply: (q: URLSearchParams) => void): URL => {
    const u = new URL(`${base}/rest/getCoverArt.view`)
    u.searchParams.set('v', '1.16.1')
    u.searchParams.set('c', APP_NAME)
    u.searchParams.set('u', auth.username)
    u.searchParams.set('id', coverId)
    if (size) u.searchParams.set('size', size)
    apply(u.searchParams)
    return u
  }
  const pw = (auth.password || '').trim()
  const isMd5 = /^[0-9a-f]{32}$/i.test(pw)
  const out: URL[] = []
  if (auth.authType === 'token') {
    if (isMd5) {
      out.push(mk((q) => { q.set('t', pw); q.set('s', auth.salt || REMOTE_SALT) }))
      out.push(mk((q) => { q.set('p', pw) }))
    } else {
      out.push(mk((q) => { q.set('t', md5Hex(pw + (auth.salt || REMOTE_SALT))); q.set('s', auth.salt || REMOTE_SALT) }))
      out.push(mk((q) => { q.set('p', pw) }))
    }
  } else {
    out.push(mk((q) => { q.set('p', pw) }))
    if (isMd5) {
      out.push(mk((q) => { q.set('t', pw); q.set('s', auth.salt || REMOTE_SALT) }))
    } else {
      out.push(mk((q) => { q.set('t', md5Hex(pw + (auth.salt || REMOTE_SALT))); q.set('s', auth.salt || REMOTE_SALT) }))
    }
  }
  return out
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

  // PIN: приоритет — явно переданный, затем сохранённый в файле
  if (config.pin !== undefined) {
    const clean = (config.pin || '').trim()
    currentPin = clean || null
  } else if (!currentPin) {
    try {
      const data = await readFile(getConfigPath(), 'utf-8')
      const cfg: RemoteControlConfig = JSON.parse(data)
      currentPin = cfg.pin?.trim() || null
    } catch { /* нет файла */ }
  }
  if (config.host) currentHost = config.host
  else if (!currentHost) currentHost = '0.0.0.0'

  return new Promise<void>((resolve, reject) => {
    try {
      settings.enabled = config.enabled
      settings.port = config.port
      settings.host = currentHost
      settings.pin = currentPin

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

            if (!coverId) {
              res.writeHead(400)
              res.end('Missing cover art id')
              return
            }

            // Если учётные данные не настроены, возвращаем ошибку
            if (!subsonicAuth) {
              console.error('[Remote] Subsonic auth not set')
              res.writeHead(503)
              res.end('Subsonic authentication not configured')
              return
            }

            // Проксируем обложку на Subsonic/Navidrome.
            // Авторизация неоднозначна: сохранённый пароль может быть plaintext
            // (тогда сервер ждёт ?p=) либо уже MD5-токеном (тогда нужен ?t=+?s=).
            // Поэтому строим варианты и берём первый, что вернул картинку.
            const variants = buildCoverAuthVariants(subsonicAuth, coverId, size)
            let lastErr = ''
            let done = false

            const tryNext = (idx: number) => {
              if (done) return
              if (idx >= variants.length) {
                done = true
                console.error('[Remote] Cover failed for all auth variants:', coverId, lastErr)
                res.writeHead(502, { 'Content-Type': 'text/plain' })
                res.end('Cover proxy error: Subsonic returned non-image response')
                return
              }
              const coverUrl = variants[idx]
              const lib = coverUrl.protocol === 'https:' ? https : http
              console.log(
                `[Remote] Cover attempt ${idx + 1}/${variants.length} id=${coverId} ` +
                `auth=${coverUrl.searchParams.has('t') ? 'token' : 'password'}`,
              )

              lib.get(coverUrl, (proxyRes) => {
                const contentType = String(proxyRes.headers['content-type'] || '')
                const isImage = contentType.startsWith('image/')
                if (isImage) {
                  done = true
                  res.writeHead(proxyRes.statusCode || 200, {
                    'Content-Type': contentType || 'image/jpeg',
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                  })
                  proxyRes.pipe(res)
                  return
                }
                // Не картинка (XML/JSON ошибка) — читаем тело для диагностики и пробуем дальше
                let body = ''
                proxyRes.on('data', (c) => { body += c })
                proxyRes.on('end', () => {
                  lastErr = `${proxyRes.statusCode} ${contentType} ${body.slice(0, 300)}`
                  console.warn('[Remote] Cover non-image response:', lastErr)
                  tryNext(idx + 1)
                })
              }).on('error', (err) => {
                lastErr = String(err)
                console.warn('[Remote] Cover request error:', err)
                tryNext(idx + 1)
              })
            }

            tryNext(0)
            return
          }


          // PWA/иконки для remote-страницы: манифест — строкой,
          // картинки — из той же папки, где лежал remote.html (out/renderer в сборке).
          if (url === '/manifest.webmanifest') {
            res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=UTF-8', 'Cache-Control': 'public, max-age=86400' })
            res.end(JSON.stringify({
              name: 'KumaFlow Remote',
              short_name: 'KumaFlow',
              description: 'Управление KumaFlow с телефона',
              start_url: '/',
              scope: '/',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#0b0620',
              theme_color: '#0b0620',
              icons: [
                { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
              ],
            }))
            return
          }

          const assetRoutes: Record<string, { file: string; type: string }> = {
            '/icon-192.png': { file: 'icon-192x192.png', type: 'image/png' },
            '/icon-512.png': { file: 'icon-512x512.png', type: 'image/png' },
            '/apple-touch-icon.png': { file: 'icon-192x192.png', type: 'image/png' },
            '/favicon.ico': { file: 'icon.ico', type: 'image/x-icon' },
          }
          const assetRoute = assetRoutes[url.split('?')[0]]
          if (assetRoute) {
            const dirs: string[] = []
            if (remoteAssetDir) dirs.push(remoteAssetDir)
            try {
              const appPath = app.getAppPath()
              dirs.push(join(appPath, 'out', 'renderer'), join(appPath, 'public'), join(__dirname, '..', 'renderer'))
            } catch { /* ignore */ }
            for (const d of dirs) {
              try {
                const fp = join(d, assetRoute.file)
                if (!existsSync(fp)) continue
                const buf = await readFile(fp)
                res.writeHead(200, { 'Content-Type': assetRoute.type, 'Cache-Control': 'public, max-age=86400' })
                res.end(buf)
                return
              } catch { /* next */ }
            }
            res.writeHead(404)
            res.end('Not found')
            return
          }

          // Раздаём remote страницу — пробуем несколько путей
          // ВАЖНО: в packaged-версии файл лежит в out/renderer/remote.html внутри app.asar,
          // а app.getAppPath() указывает на корень asar — DEV-путь public/ там отсутствует.
          if (url === '/' || url === '/index.html' || url.startsWith('/?') || url.startsWith('/index.html?')) {
            // PIN-защита: без верного ?pin= отдаём страницу входа
            if (!isPinAuthorized(url)) {
              res.writeHead(401, { 'Content-Type': 'text/html; charset=UTF-8' })
              res.end(buildPinLoginPage())
              return
            }
            const appPath = app.getAppPath()
            const possiblePaths = [
              join(appPath, 'out', 'renderer', 'remote.html'),
              join(dirname(process.execPath), 'resources', 'app.asar', 'out', 'renderer', 'remote.html'),
              join(process.resourcesPath, 'app.asar', 'out', 'renderer', 'remote.html'),
              join(process.resourcesPath, 'app', 'out', 'renderer', 'remote.html'),
              join(appPath, 'public', 'remote.html'),
              join(appPath, 'electron', 'remote', 'index.html'),
            ]
            // __dirname в packaged: .../app.asar/out/main → ../renderer/remote.html
            try {
              const fromMain = join(__dirname, '..', 'renderer', 'remote.html')
              if (!possiblePaths.includes(fromMain)) possiblePaths.unshift(fromMain)
            } catch { /* ignore */ }

            let content: string | null = null

            for (const p of possiblePaths) {
              try {
                if (!existsSync(p)) continue
                content = await readFile(p, 'utf-8')
                remoteAssetDir = dirname(p) // иконки/PWA лежат рядом
                console.log(`[Remote] Serving page from: ${p}`)
                break
              } catch {
                // File not found, try next
              }
            }

            if (!content) {
              console.error('[Remote] Could not find remote.html. Tried:', possiblePaths)
              res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' })
              res.end('Remote page not found. Tried: ' + possiblePaths.join(' | '))
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
        // PIN-защита для WebSocket
        const wsUrl = (req as any)?.url || '/remote-ws'
        if (!isPinAuthorized(wsUrl)) {
          console.warn('[Remote] WS rejected: bad PIN from', (req.socket as any)?.remoteAddress)
          try { (ws as any).close(4401, 'bad pin') } catch { /* ignore */ }
          return
        }
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

      server.listen(settings.port, currentHost, () => {
        console.log(`[Remote] Server started on ${currentHost}:${settings.port}${currentPin ? ' (PIN защищён)' : ''}`)
        console.log(`[Remote] Open http://localhost:${settings.port}`)
        startMdnsAdvertise(settings.port)
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
    stopMdnsAdvertise()
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

  ipcMain.on('remote-queue-response', (_event, queue) => {
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
    host: currentHost,
    hasPin: !!currentPin,
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
  void saveRemoteSettings({ port })
  return true
}

/**
 * Установить адрес привязки (0.0.0.0 = все интерфейсы, включая VPN)
 */
export function setRemoteHost(host: string) {
  if (settings.enabled) {
    return false
  }
  currentHost = host?.trim() || '0.0.0.0'
  settings.host = currentHost
  void saveRemoteSettings({ selectedIp: currentHost })
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
