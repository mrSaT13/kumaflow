import { useQuery } from '@tanstack/react-query'
import { getFavoriteSongs } from '@/queries/songs'
import { queryKeys } from '@/utils/queryKeys'

export function useFavoriteSongs() {
  return useQuery({
    queryKey: [queryKeys.favorites.songs],
    queryFn: getFavoriteSongs,
    // Мгновенно из кэша + автообновление в фоне.
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60 * 24,
    refetchInterval: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
}
