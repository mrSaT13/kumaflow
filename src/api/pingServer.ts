import { AuthType } from '@/types/serverConfig'
import { appName } from '@/utils/appName'
import { getServerUrlCandidates } from '@/utils/server-config'
import { authQueryParams } from './httpClient'

export async function pingServer(
  url: string,
  user: string,
  password: string,
  authType: AuthType,
  protocolVersion?: string,
): Promise<boolean> {
  try {
    const query = {
      ...authQueryParams(user, password, authType),
      v: protocolVersion || '1.16.0',
      c: appName,
      f: 'json',
    }

    const queries = new URLSearchParams(query).toString()
    const candidates = getServerUrlCandidates(url)

    for (const baseUrl of candidates) {
      try {
        const response = await fetch(`${baseUrl}/rest/ping.view?${queries}`, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        })
        const text = await response.text()

        if (text.trimStart().startsWith('<')) {
          console.error('[pingServer] Server returned HTML instead of JSON:', baseUrl)
          continue
        }

        const data = JSON.parse(text)

        // Check if there's a version error (code 30)
        if (
          data['subsonic-response'].status === 'failed' &&
          data['subsonic-response'].error.code === 30 &&
          !protocolVersion
        ) {
          // Retry the request with the server's preferred version
          return await pingServer(
            baseUrl,
            user,
            password,
            authType,
            data['subsonic-response'].version,
          )
        }

        return data['subsonic-response'].status === 'ok'
      } catch (_) {
        // Try the next candidate URL.
      }
    }

    return false
  } catch (_) {
    return false
  }
}
