import { useInfiniteQuery } from '@tanstack/react-query'
import debounce from 'lodash/debounce'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { AlbumsFallback } from '@/app/components/fallbacks/album-fallbacks'
import ListWrapper from '@/app/components/list-wrapper'
import { MainGrid } from '@/app/components/main-grid'
import { EmptyPodcastsPage } from '@/app/components/podcasts/empty-page'
import { EmptyPodcastsResults } from '@/app/components/podcasts/empty-results'
import { PodcastsHeader } from '@/app/components/podcasts/header'
import { PodcastListImage } from '@/app/components/podcasts/list-image'
import { PreviewCard } from '@/app/components/preview-card/card'
import { Button } from '@/app/components/ui/button'
import { getPodcastList, searchPodcasts } from '@/queries/podcasts'
import { ROUTES } from '@/routes/routesList'
import { useLocalPodcastsStore } from '@/store/local-podcasts.store'
import {
  AlbumsFilters,
  AlbumsSearchParams,
  PodcastsOrderByOptions,
  SortOptions,
} from '@/utils/albumsFilter'
import { queryKeys } from '@/utils/queryKeys'
import { getMainScrollElement } from '@/utils/scrollPageToTop'
import { SearchParamsHandler } from '@/utils/searchParamsHandler'
import { exportPodcasts, downloadPodcastsExport, importPodcasts, showPodcastImportDialog, readImportFile } from '@/service/podcast-export'
import { toast } from 'react-toastify'
import { Download, Upload } from 'lucide-react'

const { Query, MainFilter } = AlbumsSearchParams

export default function PodcastsList() {
  const defaultPerPage = 40
  const scrollDivRef = useRef<HTMLDivElement | null>(null)
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { getSearchParam } = new SearchParamsHandler(searchParams)
  const { Title } = PodcastsOrderByOptions
  const { Asc } = SortOptions
  
  // Получаем локальные подкасты
  const localPodcasts = useLocalPodcastsStore((state) => state.podcasts)
  const { addPodcast: addLocalPodcast } = useLocalPodcastsStore()

  const currentFilter = getSearchParam<string>(MainFilter, '')
  const orderByFilter = getSearchParam<PodcastsOrderByOptions>('orderBy', Title)
  const sortFilter = getSearchParam<SortOptions>('sort', Asc)
  const query = getSearchParam<string>(Query, '')
  const isSearchState = currentFilter === AlbumsFilters.Search
  
  // Экспорт подкастов
  const handleExport = () => {
    if (localPodcasts.length === 0) {
      toast.info('Нет подкастов для экспорта')
      return
    }
    downloadPodcastsExport(localPodcasts)
    toast.success(`Экспортировано ${localPodcasts.length} подкаст(ов)`)
  }
  
  // Импорт подкастов
  const handleImport = async () => {
    try {
      const file = await showPodcastImportDialog()
      if (!file) return
      
      const json = await readImportFile(file)
      const result = await importPodcasts(json)
      
      if (result.podcasts.length > 0) {
        result.podcasts.forEach(podcast => addLocalPodcast(podcast))
        toast.success(`Импортировано ${result.podcasts.length} подкаст(ов)`)
      }
      
      if (result.errors.length > 0) {
        toast.warning(`Ошибки: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      console.error('[Podcast] Import error:', error)
      toast.error('Ошибка импорта')
    }
  }

  useEffect(() => {
    scrollDivRef.current = getMainScrollElement()
  }, [])

  const fetchPodcasts = async ({ pageParam = 1 }) => {
    if (isSearchState && query !== '') {
      return searchPodcasts({
        query,
        filter_by: 'title',
        page: pageParam,
        per_page: defaultPerPage,
      })
    }

    return getPodcastList({
      order_by: orderByFilter,
      sort: sortFilter,
      page: pageParam,
      per_page: defaultPerPage,
    })
  }

  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: [
      queryKeys.podcast.all,
      currentFilter,
      query,
      orderByFilter,
      sortFilter,
    ],
    queryFn: fetchPodcasts,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  })

  useEffect(() => {
    const scrollElement = scrollDivRef.current
    if (!scrollElement) return

    const handleScroll = debounce(() => {
      const { scrollTop, clientHeight, scrollHeight } = scrollElement

      const isNearBottom =
        scrollTop + clientHeight >= scrollHeight - scrollHeight / 4

      if (isNearBottom) {
        if (hasNextPage) fetchNextPage()
      }
    }, 200)

    scrollElement.addEventListener('scroll', handleScroll)
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [fetchNextPage, hasNextPage])

  if (isLoading) return <AlbumsFallback />
  if (!data) return <EmptyPodcastsPage />

  const items = data.pages.flatMap((page) => page.podcasts) || []
  
  // Добавляем локальные подкасты к серверным
  const allItems = [
    ...items,
    ...localPodcasts.map(lp => ({
      id: lp.id,
      title: lp.title,
      author: lp.author,
      episode_count: lp.episodeCount,
      image_url: lp.imageUrl,  // Правильное поле для image
      coverArt: lp.imageUrl,    // Дублируем для совместимости
      isLocal: true,
    }))
  ]

  if (allItems.length === 0) {
    if (isSearchState) return <EmptyPodcastsResults />

    return <EmptyPodcastsPage />
  }

  return (
    <div className="w-full h-full">
      <PodcastsHeader />
      
      {/* Кнопки импорта/экспорта */}
      <div className="flex justify-end gap-2 px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleImport}
        >
          <Upload className="w-4 h-4 mr-2" />
          Импорт
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={localPodcasts.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Экспорт ({localPodcasts.length})
        </Button>
      </div>

      <ListWrapper>
        <MainGrid data-testid="podcasts-grid">
          {allItems.map((podcast, index) => {
            // Уникальный ключ для локальных и серверных подкастов
            // Используем index как fallback если ID повторяется
            const key = podcast.isLocal 
              ? `local-${podcast.id}-${index}` 
              : `server-${podcast.id}-${index}`
            
            return (
              <PreviewCard.Root key={key}>
                <PreviewCard.ImageWrapper link={ROUTES.PODCASTS.PAGE(podcast.id)}>
                  <PodcastListImage podcast={podcast} />
                </PreviewCard.ImageWrapper>
                <PreviewCard.InfoWrapper>
                  <PreviewCard.Title link={ROUTES.PODCASTS.PAGE(podcast.id)}>
                    {podcast.title}
                  </PreviewCard.Title>
                  <PreviewCard.Subtitle>{podcast.author}</PreviewCard.Subtitle>
                  <PreviewCard.Subtitle className="mt-[1px]">
                    {t('podcasts.header.episodeCount', {
                      count: podcast.episode_count,
                    })}
                  </PreviewCard.Subtitle>
                </PreviewCard.InfoWrapper>
              </PreviewCard.Root>
            )
          })}
        </MainGrid>
      </ListWrapper>
    </div>
  )
}
