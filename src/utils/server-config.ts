import type { AuthType } from '@/types/serverConfig'

export interface ServerConnectionData {
  url?: string
  username?: string
  password?: string
  authType?: AuthType | null
  isServerConfigured?: boolean
}

export function isValidServerConnection(data: ServerConnectionData): boolean {
  return !!(
    data.isServerConfigured &&
    data.url?.trim() &&
    data.username?.trim() &&
    data.password?.trim()
  )
}

export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false
  }

  const [a, b] = parts
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

export function getServerUrlCandidates(url: string): string[] {
  const normalizedUrl = normalizeServerUrl(url)
  const candidates = new Set<string>([normalizedUrl])

  try {
    const parsedUrl = new URL(normalizedUrl)
    const { protocol, port, hostname } = parsedUrl

    if (hostname === '0.0.0.0') {
      const localhost = `${protocol}//localhost${port ? `:${port}` : ''}`
      candidates.add(localhost)
      return [...candidates]
    }

    if (isPrivateIpv4(hostname)) {
      const localhost = `${protocol}//localhost${port ? `:${port}` : ''}`
      const loopback = `${protocol}//127.0.0.1${port ? `:${port}` : ''}`
      candidates.add(localhost)
      candidates.add(loopback)
    }
  } catch (_) {
    // Ignore malformed URL and keep original candidate only.
  }

  return [...candidates]
}
