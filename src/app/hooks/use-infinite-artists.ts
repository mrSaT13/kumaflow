import { useInfiniteQuery } from '@tanstack/react-query'
import { subsonic } from '@/service/subsonic'

const ARTISTS_PAGE_SIZE = 20

export function useInfiniteArtists() {
  return useInfiniteQuery({
    queryKey: ['artists', 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const result = await subsonic.artists.getPaginated({
        offset: pageParam * ARTISTS_PAGE_SIZE,
        limit: ARTISTS_PAGE_SIZE,
      })
      return {
        ...result,
        offset: pageParam * ARTISTS_PAGE_SIZE,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      // Если получили меньше чем лимит - больше нет данных
      if (!lastPage.hasMore) return undefined
      return allPages.length
    },
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      // Объединяем всех артистов из всех страниц
      artists: data.pages.flatMap((page) => page.artists),
      total: data.pages[data.pages.length - 1]?.total || 0,
    }),
  })
}
