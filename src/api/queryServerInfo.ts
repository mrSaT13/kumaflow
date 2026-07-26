import { AuthType } from '@/types/serverConfig'
import { appName } from '@/utils/appName'
import { getServerUrlCandidates } from '@/utils/server-config'
import { authQueryParams } from './httpClient'

export async function queryServerInfo(url: string) {
  try {
    const query = {
      ...authQueryParams('dummy', 'dummy', AuthType.PASSWORD), // Use dummy credentials, we don't want to actually be logged in
      v: '1.16.0',
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
        const data = await response.json()

        const extensionsMap: Record<string, number[]> = {}

        if (data['subsonic-response'].openSubsonic) {
          const response = await fetch(
            `${baseUrl}/rest/getOpenSubsonicExtensions.view?${queries}`,
            {
              method: 'GET',
              signal: AbortSignal.timeout(10000),
            },
          )

          const eData = await response.json()
          const extensions = eData['subsonic-response'].openSubsonicExtensions

          for (const extension of extensions) {
            extensionsMap[extension.name] = extension.versions
          }
        }

        return {
          protocolVersion: data['subsonic-response'].version,
          protocolVersionNumber: parseInt(
            data['subsonic-response'].version.replaceAll('.', ''),
          ),
          serverType: data['subsonic-response'].type.toLowerCase() || 'subsonic',
          extensionsSupported: extensionsMap,
        }
      } catch (_) {
        // Try the next candidate URL.
      }
    }

    throw new Error('Unable to query server info')
  } catch (_) {
    return {
      protocolVersion: '1.16.0',
      protocolVersionNumber: 1160,
      serverType: 'subsonic',
    }
  }
}
