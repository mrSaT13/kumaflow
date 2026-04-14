import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getStarredSongs } from '@/service/subsonic-api'
import { queryKeys } from '@/utils/queryKeys'
import { useEffect } from 'react'

export function useStarredSongs() {
  const queryClient = useQueryClient()
  
  const query = useQuery({
    queryKey: [queryKeys.star.all],
    queryFn: getStarredSongs,
    staleTime: 5 * 60 * 1000, // 5 минут
  })
  
  // Слушаем событие обновления лайкнутых треков
  useEffect(() => {
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: [queryKeys.star.all] })
    }
    
    window.addEventListener('refresh-starred', handleRefresh)
    return () => window.removeEventListener('refresh-starred', handleRefresh)
  }, [queryClient])
  
  return query
}
