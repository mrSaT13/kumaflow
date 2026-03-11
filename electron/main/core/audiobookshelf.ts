import { ipcMain } from 'electron'
import https from 'https'
import http from 'http'
import { IpcChannels } from '../../preload/types'

interface AudiobookshelfRequestPayload {
  url: string
  method: string
  body?: any
  apiKey?: string
}

/**
 * Выполнить HTTP запрос
 */
function makeRequest(payload: AudiobookshelfRequestPayload): Promise<any> {
  return new Promise((resolve, reject) => {
    const { url, method, body, apiKey } = payload
    
    const isHttps = url.startsWith('https://')
    const lib = isHttps ? https : http
    
    const options = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
    }
    
    const req = lib.request(url, options, (res: any) => {
      let data = ''
      
      res.on('data', (chunk: any) => {
        data += chunk
      })
      
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        } else {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            resolve(data)
          }
        }
      })
    })
    
    req.on('error', (error: any) => {
      reject(error)
    })
    
    if (body) {
      req.write(JSON.stringify(body))
    }
    
    req.end()
  })
}

/**
 * Инициализация IPC для проксирования запросов к Audiobookshelf
 * Обходит CORS ограничения, выполняя запросы из main процесса
 */
export function initAudiobookshelfIPC() {
  ipcMain.handle(
    IpcChannels.AudiobookshelfRequest,
    async (_, payload: AudiobookshelfRequestPayload) => {
      try {
        const response = await makeRequest(payload)
        return response
      } catch (error: any) {
        console.error('[Audiobookshelf IPC] Request failed:', error.message)
        throw new Error(error.message)
      }
    }
  )

  console.log('[Audiobookshelf IPC] Initialized')
}
