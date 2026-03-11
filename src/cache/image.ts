// Очередь запросов для rate limiting
const requestQueue: Array<() => Promise<Response>> = []
let isProcessingQueue = false
const REQUEST_DELAY = 50 // 50ms между запросами (быстрее)
const MAX_RETRIES = 5
const MAX_CACHE_SIZE_MB = 500 // Максимальный размер кеша 500MB

async function processQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.length === 0) return

  isProcessingQueue = true

  while (requestQueue.length > 0) {
    const request = requestQueue.shift()
    if (request) {
      try {
        await request()
      } catch (error) {
        console.error('Queue request failed:', error)
      }
    }
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY))
  }

  isProcessingQueue = false
}

/**
 * Проверить размер кеша и очистить старые записи если превышен лимит
 */
async function checkAndCleanCache(): Promise<void> {
  try {
    const cache = await caches.open('images')
    const keys = await cache.keys()
    
    let totalSize = 0
    const entries: Array<{ url: Request; size: number; timestamp: number }> = []

    // Считаем размер каждой записи
    for (const key of keys) {
      try {
        const response = await cache.match(key)
        if (response) {
          const blob = await response.blob()
          const size = blob.size
          totalSize += size
          
          // Получаем timestamp из заголовков или используем 0
          const timestamp = parseInt(response.headers.get('x-timestamp') || '0')
          entries.push({ url: key, size, timestamp })
        }
      } catch (error) {
        console.error('Error reading cache entry:', error)
      }
    }

    const maxSizeBytes = MAX_CACHE_SIZE_MB * 1024 * 1024
    
    console.log(`[ImageCache] Size: ${(totalSize / (1024 * 1024)).toFixed(2)}MB / ${MAX_CACHE_SIZE_MB}MB (${keys.length} entries)`)

    // Если превышен лимит, удаляем старые записи
    if (totalSize > maxSizeBytes) {
      // Сортируем по timestamp (старые первые)
      entries.sort((a, b) => a.timestamp - b.timestamp)
      
      let freed = 0
      const targetFree = totalSize - maxSizeBytes
      
      for (const entry of entries) {
        if (freed >= targetFree) break
        
        await cache.delete(entry.url)
        freed += entry.size
        console.log(`[ImageCache] Deleted old entry: ${entry.url.url}`)
      }
      
      console.log(`[ImageCache] Freed ${(freed / (1024 * 1024)).toFixed(2)}MB`)
    }
  } catch (error) {
    console.error('Error checking cache size:', error)
  }
}

/**
 * Очистить весь кеш изображений
 */
export async function clearImageCache(): Promise<void> {
  try {
    await caches.delete('images')
    console.log('[ImageCache] Cache cleared')
  } catch (error) {
    console.error('Error clearing cache:', error)
  }
}

// Проверяем размер кеша при загрузке страницы
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => checkAndCleanCache(), 5000) // Через 5 секунд после загрузки
  })
}

export async function getCachedImage(url: string): Promise<string> {
  try {
    const cache = await caches.open('images')
    const cachedResponse = await cache.match(url)

    if (cachedResponse) {
      console.log('[ImageCache] Hit:', url)
      const blob = await cachedResponse.blob()
      return URL.createObjectURL(blob)
    }

    console.log('[ImageCache] Miss:', url)

    // Прямой fetch с retry
    const fetchWithRetry = async (retries = 0): Promise<string> => {
      try {
        const response = await fetch(url)

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After') || '2'
          const waitTime = parseInt(retryAfter) * 1000
          console.warn(`[ImageCache] Rate limited. Waiting ${waitTime}ms...`)

          if (retries < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, waitTime))
            return fetchWithRetry(retries + 1)
          }

          throw new Error('Rate limit exceeded')
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        // Кэшируем ответ
        const clonedResponse = response.clone()
        const headers = new Headers(clonedResponse.headers)
        headers.set('x-timestamp', Date.now().toString())
        
        await cache.put(url, clonedResponse)

        const blob = await response.blob()
        console.log('[ImageCache] Stored:', url)
        return URL.createObjectURL(blob)
      } catch (error) {
        console.error('[ImageCache] Fetch error:', error)
        // Возвращаем оригинальный URL при ошибке
        return url
      }
    }

    return fetchWithRetry()
  } catch (error) {
    console.error('[ImageCache] Error:', error)
    return url
  }
}
