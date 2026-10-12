import { httpClient } from '@/api/httpClient'
import type { ISong } from '@/types/responses/song'

/**
 * httpClient<T> уже разворачивает обёртку 'subsonic-response', поэтому T —
 * это внутренняя полезная нагрузка. Раньше сюда передавался SubsonicResponse
 * (это база с status/version), из-за чего starred2 не находился и список
 * избранного всегда приходил пустым.
 */
interface Starred2Payload {
  starred2?: {
    song?: ISong[]
    album?: unknown[]
    artist?: unknown[]
  }
}

async function starItem(id: string) {
  await httpClient<Record<string, never>>('/star', {
    method: 'GET',
    query: {
      id,
    },
  })
}

async function unstarItem(id: string) {
  await httpClient<Record<string, never>>('/unstar', {
    method: 'GET',
    query: {
      id,
    },
  })
}

interface HandleStarItem {
  id: string
  starred: boolean
}

async function handleStarItem({ id, starred }: HandleStarItem) {
  if (starred) {
    await unstarItem(id)
  } else {
    await starItem(id)
  }
}

// 🆕 Получить избранные треки, альбомы, артисты
async function getStarred() {
  try {
    const response = await httpClient<Starred2Payload>('/getStarred2', {
      method: 'GET',
    })
    // getStarred2 возвращает { starred2: { song: [], album: [], artist: [] } }
    const starred2 = response?.data?.starred2
    console.log('[Star] getStarred2 response:', {
      songs: starred2?.song?.length || 0,
      albums: starred2?.album?.length || 0,
      artists: starred2?.artist?.length || 0,
    })
    return {
      songs: starred2?.song || [],
      albums: starred2?.album || [],
      artists: starred2?.artist || [],
    }
  } catch (error) {
    console.error('[Star] Failed to get starred:', error)
    return null
  }
}

export const star = {
  starItem,
  unstarItem,
  handleStarItem,
  getStarred,  // 🆕
}
