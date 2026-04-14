/**
 * WebSocket Remote Control Service
 * 
 * Управление плеером через WebSocket с мобильных устройств
 */

import { WebSocketServer, WebSocket } from 'ws'
import { app, BrowserWindow, ipcMain } from 'electron'
import { playerState } from '../../electron/main/core/playerState'

interface RemoteClient {
  id: string
  ws: WebSocket
  connectedAt: Date
  lastActivity: Date
}

export class RemoteControlService {
  private wss: WebSocketServer | null = null
  private httpServer: any = null
  private clients: Map<string, RemoteClient> = new Map()
  private mainWindow: BrowserWindow | null = null
  private port: number = 4334  // Порт по умолчанию (как в Feishin)
  private enabled: boolean = false

  /**
   * Установить порт
   */
  setPort(port: number) {
    if (this.enabled) {
      console.log('[Remote] Cannot change port while server is running')
      return false
    }
    this.port = port
    return true
  }

  /**
   * Получить порт
   */
  getPort(): number {
    return this.port
  }

  /**
   * Инициализация WebSocket сервера
   */
  init(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    
    // Загружаем настройку включён ли remote
    const settings = this.loadSettings()
    this.enabled = settings.remoteEnabled ?? false
    
    if (this.enabled) {
      this.start()
    }
    
    // Подписываемся на события плеера
    this.setupPlayerListeners()
  }

  /**
   * Запуск WebSocket сервера
   */
  start() {
    if (this.wss) {
      console.log('[Remote] WebSocket server already running')
      return
    }

    try {
      // Создаём HTTP сервер для раздачи remote страницы
      const http = require('http')
      const fs = require('fs')
      const path = require('path')
      
      this.httpServer = http.createServer((req: any, res: any) => {
        // Раздаём remote страницу
        const remotePath = path.join(app.getAppPath(), 'electron', 'remote', 'index.html')
        
        fs.readFile(remotePath, 'utf8', (err: any, data: any) => {
          if (err) {
            console.error('[Remote] Error reading index.html:', err)
            res.writeHead(500)
            res.end('Error loading page')
            return
          }
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(data)
        })
      })

      // Создаём WebSocket сервер на том же порту
      this.wss = new WebSocketServer({ 
        server: this.httpServer,
        path: '/remote-ws'
      })

      this.httpServer.listen(this.port, () => {
        console.log(`[Remote] HTTP+WebSocket server started on port ${this.port}`)
        console.log(`[Remote] Open http://localhost:${this.port} in browser`)
      })
      
      this.httpServer.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[Remote] Port ${this.port} is already in use!`)
          console.error('[Remote] Please stop the other instance or use a different port')
          toast.show(`Port ${this.port} is already in use!`, { type: 'error' })
        }
      })

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req)
      })

      this.wss.on('error', (error) => {
        console.error('[Remote] WebSocket server error:', error)
      })

      this.enabled = true
      this.saveSettings()
    } catch (error) {
      console.error('[Remote] Failed to start WebSocket server:', error)
    }
  }

  /**
   * Подписка на события плеера для отправки клиентам
   */
  private setupPlayerListeners() {
    if (!this.mainWindow) return
    
    ipcMain.on('player-state-changed', (_, state) => {
      // Отправляем обновление всем клиентам
      this.broadcastState(state)
    })
  }

  /**
   * Остановка WebSocket сервера
   */
  stop() {
    if (this.wss) {
      // Закрываем все подключения
      this.clients.forEach((client) => {
        client.ws.close()
      })
      this.clients.clear()

      this.wss.close(() => {
        console.log('[Remote] WebSocket server stopped')
      })
      this.wss = null
    }
    
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log('[Remote] HTTP server stopped')
      })
      this.httpServer = null
    }
    
    this.enabled = false
    this.saveSettings()
  }

  /**
   * Обработка нового подключения
   */
  private handleConnection(ws: WebSocket, req: any) {
    const clientId = this.generateClientId()
    const client: RemoteClient = {
      id: clientId,
      ws,
      connectedAt: new Date(),
      lastActivity: new Date(),
    }

    this.clients.set(clientId, client)
    console.log(`[Remote] Client connected: ${clientId} (${this.clients.size} total)`)

    // Отправляем клиенту его ID
    this.sendToClient(client, {
      event: 'connected',
      clientId,
      message: 'Connected to Kumaflow Remote',
    })

    // Отправляем текущее состояние плеера
    this.sendCurrentState(client)

    // Обработка сообщений от клиента
    ws.on('message', (data) => {
      client.lastActivity = new Date()
      this.handleMessage(client, data)
    })

    // Обработка отключения
    ws.on('close', () => {
      this.clients.delete(clientId)
      console.log(`[Remote] Client disconnected: ${clientId} (${this.clients.size} total)`)
    })

    // Обработка ошибок
    ws.on('error', (error) => {
      console.error(`[Remote] Client error ${clientId}:`, error)
      this.clients.delete(clientId)
    })

    // Ping для поддержания соединения
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
      } else {
        clearInterval(pingInterval)
      }
    }, 30000)
  }

  /**
   * Обработка сообщений от клиента
   */
  private handleMessage(client: RemoteClient, data: any) {
    try {
      const message = JSON.parse(data.toString())
      
      console.log(`[Remote] Message from ${client.id}:`, message.event)

      switch (message.event) {
        case 'play':
          this.mainWindow?.webContents.send('remote-control', { action: 'play' })
          break
          
        case 'pause':
          this.mainWindow?.webContents.send('remote-control', { action: 'pause' })
          break
          
        case 'toggle':
          this.mainWindow?.webContents.send('remote-control', { action: 'toggle' })
          break
          
        case 'next':
          this.mainWindow?.webContents.send('remote-control', { action: 'next' })
          break
          
        case 'previous':
          this.mainWindow?.webContents.send('remote-control', { action: 'prev' })
          break
          
        case 'volume':
          this.mainWindow?.webContents.send('remote-control', { 
            action: 'volume', 
            value: message.data?.value 
          })
          break
          
        case 'position':
          this.mainWindow?.webContents.send('remote-control', {
            action: 'seek',
            value: message.data?.position
          })
          break

        case 'like':
          this.mainWindow?.webContents.send('remote-control', { action: 'like' })
          break

        case 'dislike':
          this.mainWindow?.webContents.send('remote-control', { action: 'dislike' })
          break

        case 'shuffle':
          this.mainWindow?.webContents.send('remote-control', { action: 'shuffle' })
          break

        case 'repeat':
          this.mainWindow?.webContents.send('remote-control', { action: 'repeat' })
          break

        case 'get-queue':
          this.mainWindow?.webContents.send('remote-control', { action: 'get-queue' })
          break

        case 'get-state':
          // Запрашиваем текущее состояние у плеера
          this.sendCurrentState(client)
          break
          
        case 'ping':
          this.sendToClient(client, { event: 'pong', timestamp: Date.now() })
          break
          
        default:
          console.warn(`[Remote] Unknown event: ${message.event}`)
      }
    } catch (error) {
      console.error('[Remote] Error handling message:', error)
    }
  }

  /**
   * Отправка текущего состояния плеера клиенту
   */
  private sendCurrentState(client: RemoteClient) {
    // Запрашиваем у основного окна текущее состояние
    this.mainWindow?.webContents.send('remote-control', { 
      action: 'get-state', 
      clientId: client.id 
    })
  }

  /**
   * Отправка состояния плеера всем клиентам
   */
  broadcastState(state: any) {
    console.log('[Remote] Broadcasting state to', this.clients.size, 'clients:', state)
    this.clients.forEach((client) => {
      this.sendToClient(client, {
        event: 'state-update',
        state,
      })
    })
  }

  /**
   * Отправка очереди воспроизведения
   */
  private sendQueue(client: RemoteClient) {
    this.mainWindow?.webContents.send('remote-control', { 
      action: 'get-queue', 
      clientId: client.id 
    })
  }

  /**
   * Отправка сообщения конкретному клиенту
   */
  private sendToClient(client: RemoteClient, message: any) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message))
    }
  }

  /**
   * Генерация уникального ID клиента
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Загрузка настроек
   */
  private loadSettings(): any {
    try {
      const userDataPath = app.getPath('userData')
      const settingsPath = require('path').join(userDataPath, 'settings.json')
      const fs = require('fs')
      
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8')
        return JSON.parse(data)
      }
    } catch (error) {
      console.error('[Remote] Error loading settings:', error)
    }
    return {}
  }

  /**
   * Сохранение настроек
   */
  private saveSettings() {
    try {
      const userDataPath = app.getPath('userData')
      const settingsPath = require('path').join(userDataPath, 'settings.json')
      const fs = require('fs')
      
      const settings = this.loadSettings()
      settings.remoteEnabled = this.enabled
      
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    } catch (error) {
      console.error('[Remote] Error saving settings:', error)
    }
  }

  /**
   * Получить статус сервера
   */
  getStatus() {
    return {
      enabled: this.enabled,
      port: this.port,
      clientCount: this.clients.size,
      clients: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        connectedAt: c.connectedAt,
        lastActivity: c.lastActivity,
      })),
    }
  }

  /**
   * Получить все доступные IP адреса
   */
  getAllLocalIps(): { ip: string; iface: string }[] {
    const ips: { ip: string; iface: string }[] = []
    try {
      const os = require('os')
      const interfaces = os.networkInterfaces()

      for (const name of Object.keys(interfaces)) {
        const iface = interfaces[name]
        if (!iface) continue

        for (const ip of iface) {
          if (ip.family === 'IPv4' && !ip.internal) {
            ips.push({ ip: ip.address, iface: name })
          }
        }
      }
    } catch (error) {
      console.error('[Remote] Error getting local IPs:', error)
    }
    return ips
  }

  /**
   * Получить локальный IP адрес
   */
  getLocalIp(): string {
    const allIps = this.getAllLocalIps()
    if (allIps.length > 0) {
      return allIps[0].ip
    }
    return 'localhost'
  }

  /**
   * Получить URL для подключения
   */
  getConnectionUrl() {
    const localIp = this.getLocalIp()
    return `http://${localIp}:${this.port}`  // Просто IP:порт, без /remote
  }

  /**
   * Получить WebSocket URL для подключения
   */
  getWebSocketUrl() {
    const localIp = this.getLocalIp()
    return `ws://${localIp}:${this.port}/remote-ws`
  }
}

// Экспорт единственного экземпляра
export const remoteControlService = new RemoteControlService()
