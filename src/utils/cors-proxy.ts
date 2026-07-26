/**
 * CORS Proxy Helper — используется только для сервисов без своего прокси
 * В Electron и в dev-режиме (через Vite proxy) не нужен
 */

const isBrowser = typeof window !== 'undefined' && !(window as any).api

const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
]

let currentProxyIndex = 0

export async function fetchWithCorsProxy(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  if (!isBrowser) {
    return fetch(url, options)
  }

  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const idx = (currentProxyIndex + i) % CORS_PROXIES.length
    const proxyUrl = CORS_PROXIES[idx] + encodeURIComponent(url)

    try {
      const response = await fetch(proxyUrl, {
        ...options,
        headers: { ...options?.headers, 'X-Requested-With': 'XMLHttpRequest' },
      })

      if (response.ok) {
        currentProxyIndex = idx
        return response
      }
    } catch {
      // try next proxy
    }
  }

  return fetch(url, options)
}

export async function fetchJsonWithCorsProxy<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithCorsProxy(url, options)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function testCorsProxy(): Promise<boolean> {
  try {
    const response = await fetchWithCorsProxy('https://httpbin.org/get')
    return response.ok
  } catch {
    return false
  }
}

export function getCorsProxyUrl(): string {
  return CORS_PROXIES[currentProxyIndex]
}
