/**
 * CORS Proxy Helper
 * 
 * Для обхода CORS политики при запросах к внешним API
 * 
 * ВАЖНО: В Electron версии CORS не нужен - работает напрямую!
 */

// Включаем CORS proxy только для браузера (не Electron)
const isBrowser = typeof window !== 'undefined' && !window.api

// Несколько CORS proxy для надежности
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/',
]

let currentProxyIndex = 0

/**
 * Fetch с CORS proxy (с авто-переключением между proxy)
 */
export async function fetchWithCorsProxy(
  url: string,
  options?: RequestInit
): Promise<Response> {
  if (!isBrowser) {
    // Electron - прямой запрос без CORS
    console.log('[CORS] Electron detected - direct request')
    return fetch(url, options)
  }

  // Браузер - пробуем proxy по очереди
  console.log('[CORS] Browser detected - trying proxy...')
  
  // Пробуем каждый proxy пока не получится
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length
    const proxyUrl = CORS_PROXIES[proxyIndex] + encodeURIComponent(url)
    
    try {
      console.log(`[CORS] Trying proxy ${proxyIndex + 1}: ${CORS_PROXIES[proxyIndex].substring(0, 30)}...`)
      const response = await fetch(proxyUrl, {
        ...options,
        // Некоторые proxy требуют заголовок
        headers: {
          ...options?.headers,
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
      
      if (response.ok) {
        console.log(`[CORS] Proxy ${proxyIndex + 1} succeeded!`)
        currentProxyIndex = proxyIndex
        return response
      }
    } catch (error) {
      console.warn(`[CORS] Proxy ${proxyIndex + 1} failed:`, (error as Error).message)
    }
  }
  
  // Все proxy не сработали - пробуем прямой запрос (вдруг сработает)
  console.log('[CORS] All proxies failed, trying direct request...')
  try {
    return await fetch(url, options)
  } catch (error) {
    console.error('[CORS] Direct request also failed:', (error as Error).message)
    throw error
  }
}

/**
 * JSON запрос с CORS proxy
 */
export async function fetchJsonWithCorsProxy<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetchWithCorsProxy(url, options)
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  return response.json()
}

/**
 * Проверка работает ли CORS proxy
 */
export async function testCorsProxy(): Promise<boolean> {
  const testUrl = 'https://httpbin.org/get'
  try {
    const response = await fetchWithCorsProxy(testUrl)
    return response.ok
  } catch {
    return false
  }
}
