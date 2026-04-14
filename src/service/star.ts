import { httpClient } from '@/api/httpClient'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'

async function starItem(id: string) {
  await httpClient<SubsonicResponse>('/star', {
    method: 'GET',
    query: {
      id,
    },
  })
}

async function unstarItem(id: string) {
  await httpClient<SubsonicResponse>('/unstar', {
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
    const response = await httpClient<SubsonicResponse>('/getStarred2', {
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
