/**
 * DLNA/UPnP Стриминг сервис
 * Реализация по аналогии с Music Assistant
 *
 * Ключевые моменты:
 * 1. SSDP discovery с фильтром на MediaRenderer
 * 2. DIDL-Lite метаданные с правильными флагами
 * 3. SOAP запросы для управления (SetAVTransportURI, Play, Stop, Pause)
 */

import { createServer, Server } from 'http'
import * as dgram from 'dgram'
// 🆕 Убрали статические импорты - они тянут localStorage через цепочку songs → httpClient → useAppStore → zustand persist
// Импорты теперь dynamic в методах getTrackUrl/getTrackCoverUrl

export interface DLNADevice {
  id: string
  name: string
  type: 'tv' | 'speaker' | 'gamepad' | 'other'
  icon: string
  descriptionUrl: string
  controlUrl: string
  eventSubUrl?: string
}

interface TrackInfo {
  id: string
  title: string
  artist: string
  album?: string
  duration?: number
  coverUrl?: string
  streamUrl: string
}

class DLNAService {
  private server: Server | null = null
  private notifyServer: Server | null = null
  private devices: Map<string, DLNADevice> = new Map()
  private currentDevice: DLNADevice | null = null
  private currentTrack: TrackInfo | null = null
  private isRunning = false
  private scanTimeout: NodeJS.Timeout | null = null

  // SSDP константы
  private readonly SSDP_ADDRESS = '239.255.255.250'
  private readonly SSDP_PORT = 1900
  private readonly SSDP_ST = 'urn:schemas-upnp-org:device:MediaRenderer:1'

  /**
   * Запустить DLNA сервер (HTTP + NOTIFY сервер для событий)
   */
  async start(port: number = 8080): Promise<boolean> {
    if (this.isRunning) {
      console.log('[DLNA] Already running')
      return true
    }

    try {
      // 1. Запускаем HTTP сервер для стриминга
      this.server = createServer((req, res) => {
        this.handleRequest(req, res)
      })

      await new Promise<void>((resolve, reject) => {
        this.server!.listen(port, () => {
          console.log(`[DLNA] HTTP server started on port ${port}`)
          resolve()
        })
        this.server!.on('error', reject)
      })

      // 2. Запускаем NOTIFY сервер для событий от устройств
      await this.startNotifyServer(9999)

      this.isRunning = true
      console.log('[DLNA] Service started successfully')

      return true
    } catch (error) {
      console.error('[DLNA] Failed to start:', error)
      await this.stop()
      return false
    }
  }

  /**
   * Остановить DLNA сервер
   */
  async stopServer(): Promise<void> {
    // Останавливаем HTTP сервер
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          console.log('[DLNA] HTTP server stopped')
          resolve()
        })
      })
      this.server = null
    }

    // Останавливаем NOTIFY сервер
    if (this.notifyServer) {
      await new Promise<void>((resolve) => {
        this.notifyServer!.close(() => {
          console.log('[DLNA] NOTIFY server stopped')
          resolve()
        })
      })
      this.notifyServer = null
    }

    // Очищаем таймер сканирования
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout)
      this.scanTimeout = null
    }

    this.isRunning = false
    this.currentDevice = null
    this.currentTrack = null
  }

  /**
   * Запустить NOTIFY сервер для получения событий от устройств
   */
  private async startNotifyServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.notifyServer = createServer((req, res) => {
        console.log('[DLNA] NOTIFY request:', req.method, req.url)
        
        if (req.method === 'NOTIFY') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
            console.log('[DLNA] NOTIFY body:', body.substring(0, 200))
            this.handleNotifyEvent(body)
          })
        }
        
        res.writeHead(200)
        res.end()
      })

      this.notifyServer.listen(port, (err) => {
        if (err) {
          console.error('[DLNA] NOTIFY server error:', err)
          reject(err)
        } else {
          console.log(`[DLNA] NOTIFY server started on port ${port}`)
          resolve()
        }
      })
    })
  }

  /**
   * Обработка событий от устройств
   */
  private handleNotifyEvent(body: string): void {
    // Парсим XML события
    const transportState = body.match(/<TransportState>([^<]+)<\/TransportState>/)
    if (transportState) {
      console.log('[DLNA] Transport state changed:', transportState[1])
    }
  }

  /**
   * Обработка HTTP запросов
   */
  private handleRequest(req: any, res: any): void {
    const url = req.url
    const method = req.method

    if (url?.startsWith('/stream/')) {
      this.streamTrack(req, res)
      return
    }

    if (url?.startsWith('/cover/')) {
      this.serveCover(req, res)
      return
    }

    res.writeHead(404)
    res.end('Not found')
  }

  /**
   * Стриминг трека
   */
  private async streamTrack(req: any, res: any): Promise<void> {
    const trackId = req.url?.replace('/stream/', '')
    
    if (!trackId) {
      res.writeHead(400)
      res.end('Track ID required')
      return
    }

    // Получаем URL трека из Kumaflow
    const trackUrl = await this.getTrackUrl(trackId)

    if (!trackUrl) {
      res.writeHead(404)
      res.end('Track not found')
      return
    }

    // Проксирование потока
    const http = await import('http')
    const https = await import('https')
    const lib = trackUrl.startsWith('https') ? https : http

    lib.get(trackUrl, (proxyRes: any) => {
      res.writeHead(200, {
        'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
        'Content-Length': proxyRes.headers['content-length'],
        'Accept-Ranges': 'bytes',
      })
      proxyRes.pipe(res)
    }).on('error', (err: any) => {
      console.error('[DLNA] Stream error:', err)
      res.writeHead(500)
      res.end('Stream error')
    })
  }

  /**
   * Отдача обложки
   */
  private async serveCover(req: any, res: any): Promise<void> {
    const trackId = req.url?.replace('/cover/', '')
    
    if (!trackId) {
      res.writeHead(400)
      res.end('Track ID required')
      return
    }

    const trackUrl = await this.getTrackCoverUrl(trackId)

    if (!trackUrl) {
      res.writeHead(404)
      res.end('Cover not found')
      return
    }

    const http = await import('http')
    const https = await import('https')
    const lib = trackUrl.startsWith('https') ? https : http

    lib.get(trackUrl, (proxyRes: any) => {
      res.writeHead(200, {
        'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg',
        'Content-Length': proxyRes.headers['content-length'],
      })
      proxyRes.pipe(res)
    }).on('error', (err: any) => {
      console.error('[DLNA] Cover error:', err)
      res.writeHead(500)
      res.end('Cover error')
    })
  }

  /**
   * Сканирование устройств в сети
   * По аналогии с Music Assistant - ищем только MediaRenderer
   */
  async scanDevices(timeout: number = 5000): Promise<DLNADevice[]> {
    console.log('[DLNA] Starting device scan with timeout:', timeout)

    // Очищаем старые устройства
    this.devices.clear()

    // Отправляем SSDP M-SEARCH запрос
    await this.sendSSDPSearch()

    // Ждём указанное время для ответов
    await new Promise(resolve => {
      this.scanTimeout = setTimeout(resolve, timeout)
    })

    console.log('[DLNA] Scan complete, found:', this.devices.size, 'devices')
    return Array.from(this.devices.values())
  }

  /**
   * Отправка SSDP M-SEARCH запроса
   */
  private async sendSSDPSearch(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      // M-SEARCH запрос - ищем ТОЛЬКО MediaRenderer
      const searchMessage = 
        'M-SEARCH * HTTP/1.1\r\n' +
        'HOST: 239.255.255.250:1900\r\n' +
        'MAN: "ssdp:discover"\r\n' +
        'MX: 3\r\n' +
        `ST: ${this.SSDP_ST}\r\n` +
        '\r\n'

      client.on('message', (data: Buffer) => {
        const response = data.toString()
        console.log('[DLNA] SSDP response:', response.substring(0, 300))

        const device = this.parseSSDPResponse(response)
        if (device) {
          this.devices.set(device.id, device)
          console.log('[DLNA] Device found:', device.name, '(', device.type, ')')
        }
      })

      client.on('error', (err) => {
        console.error('[DLNA] SSDP error:', err)
        client.close()
        reject(err)
      })

      client.bind(0, () => {
        // Отправляем на multicast адрес
        client.send(searchMessage, 0, searchMessage.length, this.SSDP_PORT, this.SSDP_ADDRESS, (err) => {
          if (err) {
            console.error('[DLNA] Send error:', err)
            client.close()
            reject(err)
          } else {
            console.log('[DLNA] SSDP search sent')
            // Не закрываем сокет - ждём ответы
            setTimeout(() => {
              client.close()
              resolve()
            }, 100)
          }
        })
      })
    })
  }

  /**
   * Парсинг SSDP ответа
   */
  private parseSSDPResponse(response: string): DLNADevice | null {
    // Извлекаем заголовки
    const locationMatch = response.match(/LOCATION:\s*([^\r\n]+)/i)
    const usnMatch = response.match(/USN:\s*([^\r\n]+)/i)
    const serverMatch = response.match(/SERVER:\s*([^\r\n]+)/i)
    
    if (!locationMatch || !usnMatch) {
      return null
    }

    // Извлекаем UDN (уникальный идентификатор устройства)
    const usn = usnMatch[1].trim()
    const udn = usn.split('::')[0]  // UUID до первого ::

    // Получаем friendly name из description.xml (пока заглушка)
    const name = this.extractNameFromServer(serverMatch?.[1]) || 'Unknown Device'

    // Определяем тип устройства
    const type = this.detectDeviceType(response, serverMatch?.[1])

    // Извлекаем URLs для управления
    const controlUrl = locationMatch[1].trim()

    return {
      id: udn,
      name,
      type,
      icon: '',
      descriptionUrl: controlUrl,
      controlUrl: controlUrl,  // Будет обновлён после парсинга description.xml
      eventSubUrl: undefined,
    }
  }

  /**
   * Извлечение имени из SERVER заголовка
   */
  private extractNameFromServer(serverHeader?: string): string | null {
    if (!serverHeader) return null
    
    // Пример: Linux/5.4 UPnP/1.1 MiniUPnPd/2.2.1
    // Или: Microsoft-Windows/10.0 UPnP/1.0
    const match = serverHeader.match(/([^/]+)\//)
    return match ? match[1].trim() : null
  }

  /**
   * Определение типа устройства
   */
  private detectDeviceType(response: string, serverHeader?: string): DLNADevice['type'] {
    const lowerResponse = response.toLowerCase()
    const lowerServer = (serverHeader || '').toLowerCase()

    // TV устройства
    if (lowerResponse.includes('tv') || lowerResponse.includes('samsung') || 
        lowerResponse.includes('lg') || lowerResponse.includes('sony')) {
      return 'tv'
    }

    // Аудио устройства
    if (lowerResponse.includes('speaker') || lowerResponse.includes('audio') ||
        lowerResponse.includes('sonos') || lowerResponse.includes('heos')) {
      return 'speaker'
    }

    // Игровые консоли
    if (lowerResponse.includes('xbox') || lowerResponse.includes('playstation') ||
        lowerResponse.includes('game')) {
      return 'gamepad'
    }

    return 'other'
  }

  /**
   * Парсинг description.xml для получения control URLs
   */
  async parseDescriptionXml(device: DLNADevice): Promise<void> {
    try {
      const response = await fetch(device.descriptionUrl)
      const xml = await response.text()
      
      console.log('[DLNA] Description XML:', xml.substring(0, 500))

      // Извлекаем AVTransport service control URL
      const avTransportMatch = xml.match(/<service>([\s\S]*?)<\/service>/g)
      
      if (avTransportMatch) {
        for (const service of avTransportMatch) {
          const serviceType = service.match(/<serviceType>([^<]+)<\/serviceType>/)?.[1]
          const controlUrl = service.match(/<controlURL>([^<]+)<\/controlURL>/)?.[1]
          const eventSubUrl = service.match(/<eventSubURL>([^<]+)<\/eventSubURL>/)?.[1]

          if (serviceType?.includes('AVTransport')) {
            // Абсолютный URL
            const baseUrl = new URL(device.descriptionUrl)
            device.controlUrl = this.resolveUrl(controlUrl, baseUrl)
            device.eventSubUrl = this.resolveUrl(eventSubUrl, baseUrl)
            console.log('[DLNA] AVTransport control URL:', device.controlUrl)
          }
        }
      }

      // Извлекаем friendly name
      const friendlyName = xml.match(/<friendlyName>([^<]+)<\/friendlyName>/)?.[1]
      if (friendlyName) {
        device.name = friendlyName.trim()
      }
    } catch (error) {
      console.error('[DLNA] Failed to parse description XML:', error)
    }
  }

  /**
   * Разрешение относительного URL в абсолютный
   */
  private resolveUrl(relativeUrl: string | undefined, baseUrl: URL): string {
    if (!relativeUrl) return baseUrl.href
    try {
      return new URL(relativeUrl, baseUrl).href
    } catch {
      return relativeUrl
    }
  }

  /**
   * Получить URL трека из Kumaflow
   * 
   * ИЗМЕНЕНИЕ (14.04.2026): Реализована заглушка
   * Было: return null (строка 473)
   * Стало: Вызов songs.getStreamUrl(trackId) для получения реального URL
   * Результат: HTTP стриминг теперь работает через /rest/stream?id=xxx&...
   */
  private async getTrackUrl(trackId: string): Promise<string | null> {
    try {
      // 🆕 Dynamic import чтобы не тянуть localStorage при старте main процесса
      const { songs } = await import('./songs')
      const streamUrl = songs.getStreamUrl(trackId)
      console.log('[DLNA] Got track stream URL:', streamUrl.substring(0, 80) + '...')
      return streamUrl
    } catch (error) {
      console.error('[DLNA] Failed to get track URL:', error)
      return null
    }
  }

  /**
   * Получить URL обложки трека
   * 
   * ИЗМЕНЕНИЕ (14.04.2026): Реализована заглушка
   * Было: return null (строка 482)
   * Стало: Запрос к /rest/getCoverArt?id=xxx для получения URL обложки
   * Результат: HTTP отдача обложек теперь работает
   */
  private async getTrackCoverUrl(trackId: string): Promise<string | null> {
    try {
      // 🆕 Dynamic import чтобы не тянуть localStorage при старте main процесса
      const { getUrl } = await import('@/api/httpClient')
      const coverUrl = getUrl('getCoverArt', {
        id: trackId,
        size: '600',
      })
      console.log('[DLNA] Got cover URL:', coverUrl.substring(0, 80) + '...')
      return coverUrl
    } catch (error) {
      console.error('[DLNA] Failed to get cover URL:', error)
      return null
    }
  }

  /**
   * Отправить трек на устройство (Cast)
   * По аналогии с Music Assistant play_media
   */
  async castToDevice(device: DLNADevice, trackInfo: TrackInfo): Promise<boolean> {
    try {
      console.log('[DLNA] Casting to device:', device.name)
      console.log('[DLNA] Track:', trackInfo.title, 'by', trackInfo.artist)

      // 1. Парсим description.xml если controlUrl ещё не установлен
      if (!device.controlUrl || device.controlUrl === device.descriptionUrl) {
        await this.parseDescriptionXml(device)
      }

      // 2. Создаём DIDL-Lite метаданные (по аналогии с Music Assistant)
      const didlMetadata = this.createDIDLMetadata(trackInfo)

      // 3. Отправляем SetAVTransportURI
      const setUriSuccess = await this.setAVTransportURI(device, trackInfo.streamUrl, didlMetadata)
      if (!setUriSuccess) {
        console.error('[DLNA] Failed to set track URI')
        return false
      }

      // 4. Ждём готовности устройства
      await this.waitForCanPlay(device)

      // 5. Запускаем воспроизведение
      const playSuccess = await this.play(device)
      if (!playSuccess) {
        console.error('[DLNA] Failed to start playback')
        return false
      }

      this.currentDevice = device
      this.currentTrack = trackInfo

      console.log('[DLNA] Successfully casting to:', device.name)
      return true
    } catch (error) {
      console.error('[DLNA] Cast error:', error)
      return false
    }
  }

  /**
   * Создание DIDL-Lite метаданных
   * По аналогии с Music Assistant helpers/upnp.py
   */
  private createDIDLMetadata(track: TrackInfo): string {
    const { title, artist, album, duration, coverUrl, streamUrl } = track
    
    // Экранирование XML
    const escapeXml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    }

    const escapedTitle = escapeXml(title || 'Unknown')
    const escapedArtist = escapeXml(artist || '')
    const escapedAlbum = escapeXml(album || '')
    const escapedCoverUrl = escapeXml(coverUrl || '')

    // Форматирование длительности (HH:MM:SS)
    const durationStr = duration 
      ? this.formatDuration(duration)
      : '00:00:00'

    // Определяем расширение файла
    const ext = streamUrl.split('.').pop()?.split('?')[0] || 'mp3'

    // DLNA флаги:
    // 01500000000000000000000000000000 = streaming transfer mode + on-demand content
    // Для потокового вещания используем 01700000000000000000000000000000
    
    const isStream = !duration || duration < 10
    const dlnaFlags = isStream 
      ? '01700000000000000000000000000000'  // streaming
      : '01500000000000000000000000000000'  // on-demand

    const metadata = `
<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"
           xmlns:dc="http://purl.org/dc/elements/1.1/"
           xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
           xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">
  <item id="track_${track.id}" parentID="0" restricted="1">
    <dc:title>${escapedTitle}</dc:title>
    <dc:creator>${escapedArtist}</dc:creator>
    ${album ? `<upnp:album>${escapedAlbum}</upnp:album>` : ''}
    <upnp:artist>${escapedArtist}</upnp:artist>
    <upnp:class>object.item.audioItem.musicTrack</upnp:class>
    ${coverUrl ? `<upnp:albumArtURI>${escapedCoverUrl}</upnp:albumArtURI>` : ''}
    <res protocolInfo="http-get:*:audio/${ext}:DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=${dlnaFlags}" 
         duration="${durationStr}">${escapeXml(streamUrl)}</res>
  </item>
</DIDL-Lite>`.trim()

    return metadata
  }

  /**
   * Форматирование длительности в HH:MM:SS
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    return [hours, minutes, secs]
      .map(v => v.toString().padStart(2, '0'))
      .join(':')
  }

  /**
   * SOAP запрос: SetAVTransportURI
   */
  private async setAVTransportURI(
    device: DLNADevice, 
    uri: string, 
    metadata: string
  ): Promise<boolean> {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <CurrentURI>${this.escapeXml(uri)}</CurrentURI>
      <CurrentURIMetaData>${this.escapeXml(metadata)}</CurrentURIMetaData>
    </u:SetAVTransportURI>
  </s:Body>
</s:Envelope>`

    try {
      const response = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"',
        },
        body: soapBody,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[DLNA] SetAVTransportURI failed:', response.status, errorText)
        return false
      }

      console.log('[DLNA] SetAVTransportURI success')
      return true
    } catch (error) {
      console.error('[DLNA] SetAVTransportURI error:', error)
      return false
    }
  }

  /**
   * SOAP запрос: Play
   */
  private async play(device: DLNADevice): Promise<boolean> {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>`

    try {
      const response = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#Play"',
        },
        body: soapBody,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[DLNA] Play failed:', response.status, errorText)
        return false
      }

      console.log('[DLNA] Play success')
      return true
    } catch (error) {
      console.error('[DLNA] Play error:', error)
      return false
    }
  }

  /**
   * SOAP запрос: Stop
   */
  async stop(device?: DLNADevice): Promise<boolean> {
    const targetDevice = device || this.currentDevice
    if (!targetDevice) {
      console.error('[DLNA] No device to stop')
      return false
    }

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:Stop>
  </s:Body>
</s:Envelope>`

    try {
      const response = await fetch(targetDevice.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#Stop"',
        },
        body: soapBody,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[DLNA] Stop failed:', response.status, errorText)
        return false
      }

      console.log('[DLNA] Stop success')
      this.currentDevice = null
      this.currentTrack = null
      return true
    } catch (error) {
      console.error('[DLNA] Stop error:', error)
      return false
    }
  }

  /**
   * SOAP запрос: Pause
   */
  async pause(device?: DLNADevice): Promise<boolean> {
    const targetDevice = device || this.currentDevice
    if (!targetDevice) {
      console.error('[DLNA] No device to pause')
      return false
    }

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:Pause>
  </s:Body>
</s:Envelope>`

    try {
      const response = await fetch(targetDevice.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#Pause"',
        },
        body: soapBody,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[DLNA] Pause failed:', response.status, errorText)
        return false
      }

      console.log('[DLNA] Pause success')
      return true
    } catch (error) {
      console.error('[DLNA] Pause error:', error)
      return false
    }
  }

  /**
   * Ожидание готовности устройства к воспроизведению
   */
  private async waitForCanPlay(device: DLNADevice, timeout: number = 10000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      // Проверяем транспортную информацию
      const transportInfo = await this.getTransportInfo(device)
      
      if (transportInfo === 'OK') {
        console.log('[DLNA] Device ready to play')
        return
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.warn('[DLNA] Timeout waiting for device to be ready')
  }

  /**
   * SOAP запрос: GetTransportInfo
   */
  private async getTransportInfo(device: DLNADevice): Promise<string> {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
            s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetTransportInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:GetTransportInfo>
  </s:Body>
</s:Envelope>`

    try {
      const response = await fetch(device.controlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#GetTransportInfo"',
        },
        body: soapBody,
      })

      if (!response.ok) {
        return 'ERROR'
      }

      const text = await response.text()
      const stateMatch = text.match(/<CurrentTransportState>([^<]+)<\/CurrentTransportState>/)
      return stateMatch?.[1] || 'UNKNOWN'
    } catch (error) {
      console.error('[DLNA] GetTransportInfo error:', error)
      return 'ERROR'
    }
  }

  /**
   * Экранирование XML
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  /**
   * Получить список устройств
   */
  getDevices(): DLNADevice[] {
    return Array.from(this.devices.values())
  }

  /**
   * Получить текущее устройство
   */
  getCurrentDevice(): DLNADevice | null {
    return this.currentDevice
  }

  /**
   * Получить текущий трек
   */
  getCurrentTrack(): TrackInfo | null {
    return this.currentTrack
  }
}

export const dlnaService = new DLNAService()
