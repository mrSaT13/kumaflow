import { useQuery } from '@tanstack/react-query'
import { subsonic } from '@/service/subsonic'
import { queryKeys } from '@/utils/queryKeys'

export const useGetAlbum = (albumId: string) => {
  return useQuery({
    queryKey: [queryKeys.album.single, albumId],
    queryFn: () => subsonic.albums.getOne(albumId),
  })
}

export const useGetAlbumInfo = (albumId: string) => {
  return useQuery({
    queryKey: [queryKeys.album.info, albumId],
    queryFn: () => subsonic.albums.getInfo(albumId),
    enabled: !!albumId,
  })
}

export const useGetArtistAlbums = (artistId: string) => {
  return useQuery({
    queryKey: [queryKeys.album.moreAlbums, artistId],
    queryFn: () => subsonic.artists.getOne(artistId),
    enabled: !!artistId,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 минут
    retry: 2,
    onError: (error) => {
      console.error('[useGetArtistAlbums] Error fetching artist:', artistId, error)
    },
    onSuccess: (data) => {
      console.log('[useGetArtistAlbums] Fetched artist:', artistId, 'albums:', data?.album?.length || 0)
    },
  })
}

export const useGetGenreAlbums = (genre: string) => {
  return useQuery({
    queryKey: [queryKeys.album.genreAlbums, genre],
    queryFn: () =>
      subsonic.albums.getAlbumList({
        type: 'byGenre',
        genre,
        size: 16,
      }),
    enabled: !!genre,
  })
}
