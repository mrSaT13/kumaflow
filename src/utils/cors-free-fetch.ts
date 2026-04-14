/**
 * Универсальный HTTP клиент для обхода CORS
 * 
 * В Electron (production) — использует IPC (нет CORS)
 * В браузере (dev) — fallback на обычный fetch
 */

interface FetchResult {
  success: boolean
  data?: any
  status?: number
  error?: string
  text?: string
  contentType?: string
}

/**
 * Универсальный fetch — через IPC в Electron, напрямую в браузере
 */
export async function corsFreeFetch(
  url: string,
  options?: { method?: string; headers?: Record<string, string> }
): Promise<FetchResult> {
  // Если есть Electron IPC — используем его (обходит CORS)
  if (typeof window !== 'undefined' && (window as any).api?.server?.fetchJson) {
    try {
      return await (window as any).api.server.fetchJson(url, options)
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // Fallback: обычный fetch (будет заблокирован CORS в браузере для сторонних серверов)
  try {
    const response = await fetch(url, {
      method: options?.method || 'GET',
      headers: options?.headers,
      signal: AbortSignal.timeout(10000),
    })
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await response.json()
      return { success: true, status: response.status, data }
    } else {
      const text = await response.text()
      return { success: false, status: response.status, text: text.substring(0, 500), contentType }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Определить тип сервера через IPC (без CORS проблем)
 */
export async function detectServerTypeViaIpc(url: string): Promise<{ success: boolean; type?: string; error?: string }> {
  if (typeof window !== 'undefined' && (window as any).api?.server?.detectType) {
    return await (window as any).api.server.detectType(url)
  }
  return { success: false, error: 'IPC not available' }
}

/**
 * Ping сервера через IPC
 */
export async function pingServerViaIpc(url: string): Promise<{ success: boolean; protocolVersion?: string; serverType?: string; error?: string }> {
  if (typeof window !== 'undefined' && (window as any).api?.server?.ping) {
    return await (window as any).api.server.ping(url)
  }
  return { success: false, error: 'IPC not available' }
}

/**
 * Проверка доступен ли IPC
 */
export function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).api?.server
}
