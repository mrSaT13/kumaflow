import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { clsx } from 'clsx'
import ImageHeader from '@/app/components/album/image-header'
import { ArtistImageViewer } from '@/app/components/artist/artist-image-viewer'
import ArtistTopSongs from '@/app/components/artist/artist-top-songs'
import { ArtistInfo } from '@/app/components/artist/info'
import { ArtistDiscography } from '@/app/components/artist/artist-discography'
import { NewReleases } from '@/app/components/artist/new-releases'
import RelatedArtistsList from '@/app/components/artist/related-artists'
import { AlbumFallback } from '@/app/components/fallbacks/album-fallbacks'
import { PreviewListFallback } from '@/app/components/fallbacks/home-fallbacks'
import { TopSongsTableFallback } from '@/app/components/fallbacks/table-fallbacks'
import { BadgesData } from '@/app/components/header-info'
import PreviewList from '@/app/components/home/preview-list'
import ListWrapper from '@/app/components/list-wrapper'
import {
  useGetArtist,
  useGetArtistInfo,
  useGetTopSongs,
} from '@/app/hooks/use-artist'
import ErrorPage from '@/app/pages/error-page'
import { ROUTES } from '@/routes/routesList'
import { sortRecentAlbums } from '@/utils/album'
import { Button } from '@/app/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { usePlayerActions } from '@/store/player.store'
import { generateArtistRadio } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { useArtistSubscriptions } from '@/store/artist-subscriptions.store'
import { artistTrackMonitor } from '@/service/artist-track-monitor'
import { useExternalApi } from '@/store/external-api.store'
import { lastFmService } from '@/service/lastfm-api'
import { fanartService } from '@/service/fanart-api'
import { wikipediaService } from '@/service/wikipedia-api'
import { Bell, BellOff, Radio, Loader2, ThumbsDown, Globe } from 'lucide-react'
import { useML, useMLActions } from '@/store/ml.store'
import { trackViewArtistPage } from '@/service/ml-event-tracker'

export default function Artist() {
  const { t } = useTranslation()
  const { artistId } = useParams() as { artistId: string }
  const { setSongList } = usePlayerActions()
  const { subscribe, unsubscribe, isSubscribed } = useArtistSubscriptions()
  const { settings } = useExternalApi()
  const { profile } = useML()
  const mlActions = useMLActions()

  const [isGeneratingRadio, setIsGeneratingRadio] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false)
  const [artistBannerUrl, setArtistBannerUrl] = useState<string | undefined>(undefined)
  const [artistLogoUrl, setArtistLogoUrl] = useState<string | undefined>(undefined)
  const [wikiUrl, setWikiUrl] = useState<string | undefined>(undefined)

  const subscribed = isSubscribed(artistId)
  const isBanned = profile.bannedArtists?.includes(artistId) || false

  const {
    data: artist,
    isLoading: artistIsLoading,
    isFetched,
  } = useGetArtist(artistId)
  const { data: artistInfo, isLoading: artistInfoIsLoading } =
    useGetArtistInfo(artistId)
  const { data: topSongs, isLoading: topSongsIsLoading } = useGetTopSongs(
    artist?.name,
  )

  // Загрузка логотипа из Fanart.tv
  useEffect(() => {
    // Сбрасываем логотип при смене артиста
    setArtistLogoUrl(undefined)
    
    if (!settings.fanartShowBanner || !artistInfo?.musicBrainzId) return

    const loadLogo = async () => {
      const images = await fanartService.getArtistImages(artistInfo.musicBrainzId)
      if (images?.logos?.[0]) {
        setArtistLogoUrl(images.logos[0].url)
        console.log('[Artist] Fanart.tv logo loaded:', images.logos[0].url)
      } else {
        console.log('[Artist] Fanart.tv no logos found for', artist.name)
      }
    }

    loadLogo()
  }, [settings.fanartShowBanner, artistInfo?.musicBrainzId, artist?.name])

  // Загрузка Wikipedia информации
  useEffect(() => {
    setWikiUrl(undefined)
    
    if (!artist?.name) return

    const loadWiki = async () => {
      const wikiInfo = await wikipediaService.searchArtist(artist.name)
      if (wikiInfo?.wikiUrl) {
        setWikiUrl(wikiInfo.wikiUrl)
        console.log('[Artist] Wikipedia page found:', wikiInfo.wikiUrl)
      }
    }

    loadWiki()
  }, [artist?.name])

  // Загрузка баннера из Fanart.tv если включено в настройках
  useEffect(() => {
    if (!settings.fanartShowBanner) {
      console.log('[Artist] Fanart.tv banner disabled in settings')
      return
    }

    const mbid = artistInfo?.musicBrainzId
    if (!mbid) {
      console.log('[Artist] No MusicBrainz ID available for Fanart.tv')
      return
    }

    console.log('[Artist] Loading Fanart.tv banner for MBID:', mbid)

    const loadBanner = async () => {
      try {
        const images = await fanartService.getArtistImages(mbid)
        console.log('[Artist] Fanart.tv response:', images)
        
        // Пробуем сначала фоны, потом логотипы
        if (images?.backgrounds?.[0]) {
          setArtistBannerUrl(images.backgrounds[0])
          console.log('[Artist] Fanart.tv banner loaded:', images.backgrounds[0])
        } else if (images?.logos?.[0]) {
          // Если нет фонов, используем логотип (с прозрачностью)
          setArtistBannerUrl(images.logos[0])
          console.log('[Artist] Fanart.tv logo loaded (no backgrounds):', images.logos[0])
        } else {
          console.log('[Artist] Fanart.tv no backgrounds or logos found')
        }
      } catch (error) {
        console.error('[Artist] Fanart.tv error:', error)
      }
    }

    loadBanner()
  }, [settings.fanartShowBanner, artistInfo?.musicBrainzId])

  // Автозапуск мониторинга при включённом Last.fm
  useEffect(() => {
    if (settings.lastFmEnabled && lastFmService.isInitialized()) {
      artistTrackMonitor.startMonitoring()
    }
    return () => {
      artistTrackMonitor.stopMonitoring()
    }
  }, [settings.lastFmEnabled])

  // Трекинг просмотра страницы артиста
  useEffect(() => {
    if (artist?.id && artist?.name) {
      trackViewArtistPage(artist.id, artist.name)
      console.log('[Artist] Page view tracked:', artist.name)
    }
  }, [artist?.id, artist?.name])

  if (artistIsLoading) return <AlbumFallback />
  if (isFetched && !artist) {
    return <ErrorPage status={404} statusText="Not Found" />
  }
  if (!artist) return <AlbumFallback />

  function getSongCount() {
    if (!artist) return null
    if (artist.albumCount === undefined) return null
    if (artist.albumCount === 0) return null
    if (!artist.album) return null
    let artistSongCount = 0

    artist.album.forEach((album) => {
      artistSongCount += album.songCount
    })

    return t('playlist.songCount', { count: artistSongCount })
  }

  function formatAlbumCount() {
    if (!artist) return null
    if (artist.albumCount === undefined) return null
    if (artist.albumCount === 0) return null

    return t('artist.info.albumsCount', { count: artist.albumCount })
  }

  const albumCount = formatAlbumCount()
  const songCount = getSongCount()

  const badges: BadgesData = [
    {
      content: albumCount,
      type: 'link',
      link: ROUTES.ALBUMS.ARTIST(artist.id, artist.name),
    },
    {
      content: songCount,
      type: 'link',
      link: ROUTES.SONGS.ARTIST_TRACKS(artist.id, artist.name),
    },
  ]

  const handlePlayArtistRadio = async () => {
    setIsGeneratingRadio(true)
    try {
      const playlist = await generateArtistRadio(artistId, 50)
      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        toast(`▶️ Запущено радио: ${artist.name}`, { type: 'success' })
      } else {
        toast('Не удалось сгенерировать радио', { type: 'error' })
      }
    } catch (error) {
      console.error('Failed to generate artist radio:', error)
      toast('Ошибка при генерации радио', { type: 'error' })
    } finally {
      setIsGeneratingRadio(false)
    }
  }

  const handleToggleSubscription = async () => {
    setIsSubscribing(true)
    try {
      if (subscribed) {
        unsubscribe(artistId)
        toast(`❌ Отписка от ${artist.name}`, { type: 'info' })
      } else {
        subscribe(artistId, artist.name)
        toast(`✅ Подписка на ${artist.name}! Будем уведомлять о новых треках`, {
          type: 'success',
          autoClose: 5000,
        })

        // Сразу проверим артиста
        await artistTrackMonitor.checkArtistNow(artistId)
      }
    } catch (error) {
      console.error('Subscription error:', error)
      toast('Ошибка подписки', { type: 'error' })
    } finally {
      setIsSubscribing(false)
    }
  }

  const handleBanArtist = async () => {
    if (!artistId || !artist.name) return
    
    mlActions.banArtist(artistId, artist.name)
    toast(`🚫 ${artist.name} заблокирован! Не будет добавляться в плейлисты`, {
      type: 'warning',
      autoClose: 5000,
    })
  }

  const handleUnbanArtist = async () => {
    if (!artistId || !artist.name) return
    
    mlActions.unbanArtist(artistId, artist.name)
    toast(`✅ ${artist.name} разблокирован!`, {
      type: 'success',
      autoClose: 3000,
    })
  }

  const recentAlbums = artist.album ? sortRecentAlbums(artist.album) : []

  return (
    <div className="w-full">
      <ImageHeader
        type={t('artist.headline')}
        title={artist.name}
        coverArtId={artist.coverArt || artist.artistImageUrl}
        coverArtType="artist"
        coverArtSize="700"
        coverArtAlt={artist.name}
        badges={badges}
        bannerUrl={artistBannerUrl}
        logoUrl={artistLogoUrl}
        onCoverClick={() => setIsImageViewerOpen(true)}
        actions={
          <div className="flex gap-2">
            {/* Wikipedia */}
            {wikiUrl && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => wikipediaService.openWikiPage(wikiUrl)}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full hover:bg-blue-600/20 text-muted-foreground hover:text-blue-600"
                  >
                    <Globe className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Wikipedia
                </TooltipContent>
              </Tooltip>
            )}

            {/* Заблокировать/Разблокировать артиста */}
            {isBanned ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleUnbanArtist}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full hover:bg-green-600/20 text-muted-foreground hover:text-green-600"
                  >
                    <ThumbsDown className="h-5 w-5 rotate-180" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Разблокировать артиста
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleBanArtist}
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full hover:bg-red-600/20 text-muted-foreground hover:text-red-600"
                  >
                    <ThumbsDown className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Заблокировать артиста (не будет в плейлистах)
                </TooltipContent>
              </Tooltip>
            )}

            {/* Подписка на артиста */}
            {settings.lastFmEnabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleToggleSubscription}
                    disabled={isSubscribing}
                    variant="ghost"
                    size="icon"
                    className={clsx(
                      'h-10 w-10 rounded-full',
                      subscribed
                        ? 'bg-red-600/20 hover:bg-red-600/30 text-red-600'
                        : 'hover:bg-green-600/20 text-muted-foreground hover:text-green-600'
                    )}
                  >
                    {isSubscribing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : subscribed ? (
                      <BellOff className="h-5 w-5" />
                    ) : (
                      <Bell className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {subscribed
                    ? 'Отписаться от новых треков'
                    : 'Подписаться на новые треки'}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Радио артиста */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handlePlayArtistRadio}
                  disabled={isGeneratingRadio}
                  variant="ghost"
                  size="icon"
                  className={clsx(
                    'h-10 w-10 rounded-full',
                    isGeneratingRadio
                      ? 'bg-primary/20 text-primary'
                      : 'hover:bg-primary/20 text-muted-foreground hover:text-primary'
                  )}
                >
                  {isGeneratingRadio ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Radio className="h-5 w-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isGeneratingRadio ? 'Генерация...' : 'Радио артиста'}
              </TooltipContent>
            </Tooltip>
          </div>
        }
      />

      <ListWrapper>
        <ArtistInfo artist={artist} />

        {/* Новые релизы из Apple Music - выше популярного! */}
        <NewReleases artistName={artist.name} />

        {topSongsIsLoading && <TopSongsTableFallback />}
        {topSongs && !topSongsIsLoading && topSongs.length > 0 && (
          <ArtistTopSongs topSongs={topSongs} artist={artist} />
        )}

        {recentAlbums.length > 0 && (
          <PreviewList
            title={t('artist.recentAlbums')}
            list={recentAlbums}
            moreTitle={t('album.more.discography')}
            moreRoute={ROUTES.ALBUMS.ARTIST(artist.id, artist.name)}
          />
        )}

        {artistInfoIsLoading && <PreviewListFallback />}
        {artistInfo?.similarArtist && !artistInfoIsLoading && (
          <RelatedArtistsList
            title={t('artist.relatedArtists')}
            similarArtists={artistInfo.similarArtist}
          />
        )}
        
        {/* Дискография из Discogs */}
        <ArtistDiscography artistName={artist.name} />
      </ListWrapper>
      
      {/* Просмотрщик обложек */}
      <ArtistImageViewer
        open={isImageViewerOpen}
        onOpenChange={setIsImageViewerOpen}
        artistName={artist.name}
        artistId={artistId}
        defaultImageUrl={artist.artistImageUrl}
      />
    </div>
  )
}
