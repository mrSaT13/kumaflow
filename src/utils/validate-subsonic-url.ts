import { appName } from '@/utils/appName'

/**
 * Проверяет что URL — живой Subsonic/Navidrome endpoint (возвращает JSON, не HTML).
 */
export async function validateSubsonicUrl(
  url: string,
  timeoutMs = 5000,
): Promise<boolean> {
  try {
    const cleanUrl = url.replace(/\/$/, '')
    const params = new URLSearchParams({
      f: 'json',
      v: '1.16.0',
      c: appName,
      u: 'healthcheck',
      p: 'x',
    })
    const pingUrl = `${cleanUrl}/rest/ping.view?${params}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(pingUrl, {
      method: 'GET',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const text = await response.text()

    if (text.trimStart().startsWith('<')) {
      console.warn('[SubsonicURL] Got HTML instead of JSON:', cleanUrl)
      return false
    }

    const data = JSON.parse(text)
    return !!data['subsonic-response']
  } catch (error) {
    console.warn('[SubsonicURL] Validation failed:', url, error)
    return false
  }
}
