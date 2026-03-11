import { httpClient } from '@/api/httpClient'
import {
  ArtistInfoResponse,
  ArtistResponse,
  ArtistsResponse,
  ISimilarArtist,
} from '@/types/responses/artist'

interface GetArtistsPaginatedParams {
  offset?: number
  limit?: number
}

interface GetArtistsPaginatedResult {
  artists: ISimilarArtist[]
  hasMore: boolean
  total: number
}

async function getAll() {
  const response = await httpClient<ArtistsResponse>('/getArtists', {
    method: 'GET',
  })

  if (!response) return []

  const artistsList: ISimilarArtist[] = []

  response.data.artists.index.forEach((item) => {
    artistsList.push(...item.artist)
  })

  return artistsList.sort((a, b) => a.name.localeCompare(b.name))
}

async function getPaginated({
  offset = 0,
  limit = 20,
}: GetArtistsPaginatedParams): Promise<GetArtistsPaginatedResult> {
  const response = await httpClient<ArtistsResponse>('/getArtists', {
    method: 'GET',
    query: {
      offset: offset.toString(),
      limit: limit.toString(),
    },
  })

  if (!response || !response.data.artists) {
    return { artists: [], hasMore: false, total: 0 }
  }

  const artistsList: ISimilarArtist[] = []
  response.data.artists.index.forEach((item) => {
    artistsList.push(...item.artist)
  })

  // Сортируем по имени
  const sorted = artistsList.sort((a, b) => a.name.localeCompare(b.name))
  
  // Проверяем есть ли ещё артисты (если получили меньше лимита - это конец)
  const hasMore = sorted.length >= limit

  return {
    artists: sorted,
    hasMore,
    total: response.data.artists.index.reduce((sum, item) => sum + item.artist.length, 0),
  }
}

async function getOne(id: string) {
  const response = await httpClient<ArtistResponse>('/getArtist', {
    method: 'GET',
    query: {
      id,
    },
  })

  return response?.data.artist
}

async function getInfo(id: string) {
  const response = await httpClient<ArtistInfoResponse>('/getArtistInfo', {
    method: 'GET',
    query: {
      id,
    },
  })

  return response?.data.artistInfo
}

export const artists = {
  getOne,
  getInfo,
  getAll,
  getPaginated,
}
