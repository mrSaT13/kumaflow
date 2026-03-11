import { useTranslation } from 'react-i18next'
import { useEffect, useState, useMemo } from 'react'
import { useML } from '@/store/ml.store'
import { useMLStore } from '@/store/ml.store'
import { useExternalApi, useExternalApiStore } from '@/store/external-api.store'
import { useAchievements } from '@/store/achievements.store'
import { fanartService } from '@/service/fanart-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import { useNavigate } from 'react-router-dom'
import { subsonic } from '@/service/subsonic'
import type { IArtist } from '@/types/responses/artist'
import { getTotalPlays } from '@/app/hooks/use-auto-scrobble'
import { ROUTES } from '@/routes/routesList'
import { toast } from 'react-toastify'
import { YandexMLImport } from '@/app/components/ml/yandex-ml-import'
import { OrchestratorStats } from '@/app/components/ml/orchestrator-stats'
import { MusicMapCard } from '@/app/components/ml/music-map-card'
import { getSimpleCoverArtUrl } from '@/api/httpClient'

export default function MLStats() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { ratings, profile } = useML()
  const { achievements, checkAll, getUnlockedCount, getTotalCount } = useAchievements()

  // Подписка на изменения в реальном времени
  const [totalPlays, setTotalPlays] = useState(0)
  const [totalSkips, setTotalSkips] = useState(0)
  const [artistImages, setArtistImages] = useState<Record<string, string>>({})
  const [artistNames, setArtistNames] = useState<Record<string, string>>({})
  const [artistAlbumCovers, setArtistAlbumCovers] = useState<Record<string, string[]>>({})
  const [favoriteArtists, setFavoriteArtists] = useState<Array<{ id: string; name: string; starred?: string; songCount?: number }>>([])
  const [navidromeStats, setNavidromeStats] = useState({
    lovedTracks: 0,
    totalPlays: 0,
  })
  const [showAllFavorites, setShowAllFavorites] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [hasImportedFromNavidrome, setHasImportedFromNavidrome] = useState(false)

  // Подсчитываем статистику
  const totalRatings = Object.entries(ratings).filter(([_, rating]) => rating.like !== null).length
  const likedCount = profile.likedSongs.length
  const dislikedCount = profile.dislikedSongs.length

  // Загружаем лайкнутых артистов и треки из Navidrome
  useEffect(() => {
    async function loadNavidromeData() {
      try {
        const { getFavoriteArtists, getStarredSongs } = await import('@/service/subsonic-api')
        
        // Загружаем артистов
        const favorites = await getFavoriteArtists()
        setFavoriteArtists(favorites.map(a => ({ 
          id: a.id, 
          name: a.name, 
          starred: a.starred,
          songCount: a.songCount 
        })))
        console.log('[ML Stats] Loaded favorite artists:', favorites.length)
        
        // Загружаем лайкнутые треки для статистики
        const starredSongs = await getStarredSongs()
        setNavidromeStats(prev => ({
          ...prev,
          lovedTracks: starredSongs.length
        }))
        console.log('[ML Stats] Loaded starred songs:', starredSongs.length)
      } catch (error) {
        console.error('Failed to load Navidrome data:', error)
      }
    }
    loadNavidromeData()
  }, [])

  // Автоматический импорт жанров при первом запуске (если жанров мало)
  useEffect(() => {
    // Проверяем есть ли уже жанры в ML профиле
    const hasGenres = Object.keys(profile.preferredGenres).length > 0
    const hasFewGenres = Object.keys(profile.preferredGenres).length < 5
    
    // Если жанров нет или их мало (< 5) и ещё не импортировали → импортируем
    if (!hasImportedFromNavidrome && (!hasGenres || hasFewGenres)) {
      console.log('[ML Stats] No genres found or too few, auto-importing from Navidrome...')
      handleImportFromNavidrome()
      setHasImportedFromNavidrome(true)
    }
  }, [profile.preferredGenres])

  // Загружаем картинки + имена для ВСЕХ артистов (ML + Navidrome)
  useEffect(() => {
    // Объединяем артистов из ML preferredArtists и Navidrome favoriteArtists
    const allArtistIds = new Set([
      ...Object.keys(profile.preferredArtists),
      ...favoriteArtists.map(a => a.id),
    ])

    if (allArtistIds.size === 0) return

    async function loadAllArtistInfo() {
      const images: Record<string, string> = {}
      const names: Record<string, string> = {}
      const albumCovers: Record<string, string[]> = {}

      console.log('[ML Stats] Loading info for all artists:', allArtistIds.size)

      const { settings } = useExternalApiStore.getState()
      const lastFmEnabled = settings.lastfmEnabled && settings.lastfmApiKey

      // Загружаем всех артистов
      for (const artistId of Array.from(allArtistIds)) {
        try {
          // Сначала проверяем есть ли уже данные
          if (names[artistId]) continue

          // Загружаем данные из Navidrome
          const artistData = await subsonic.artists.getOne(artistId)
          
          if (!artistData) continue

          // Имя артиста
          if (artistData.name) {
            names[artistId] = artistData.name
            console.log(`[ML Stats] ✅ Name for ${artistId}: ${artistData.name}`)
          }

          // Обложка артиста
          if (artistData.coverArt) {
            images[artistId] = getSimpleCoverArtUrl(artistData.coverArt, 'artist', '300')
            console.log(`[ML Stats] ✅ Image for ${artistData.name}`)
          }

          // Обложки альбомов для коллажа (первые 4)
          if (artistData.album && artistData.album.length > 0) {
            const covers = artistData.album.slice(0, 4).map(album => {
              const coverId = album.coverArt || album.id
              return coverId ? getSimpleCoverArtUrl(coverId, 'album', '200') : undefined
            }).filter((url): url is string => url !== undefined)

            if (covers.length > 0) {
              albumCovers[artistId] = covers
              console.log(`[ML Stats] ✅ ${covers.length} album covers for ${artistData.name}`)
            }
          }

          // Если нет картинки из Navidrome, пробуем Last.fm по имени
          if (!images[artistId] && lastFmEnabled && artistData.name) {
            try {
              const { lastFmService } = await import('@/service/lastfm-api')
              
              if (!lastFmService.isInitialized()) {
                lastFmService.initialize(settings.lastfmApiKey, settings.lastfmApiSecret)
              }

              const lastFmInfo = await lastFmService.getArtistInfo(artistData.name)
              if (lastFmInfo?.image) {
                images[artistId] = lastFmInfo.image
                console.log(`[ML Stats] ✅ Last.fm image for ${artistData.name}`)
              }
            } catch (error) {
              // Last.fm не дал картинку
            }
          }

        } catch (error) {
          console.error('Failed to load artist info:', artistId, error)
        }
      }

      // Обновляем состояния
      setArtistImages(prev => ({ ...prev, ...images }))
      setArtistNames(prev => ({ ...prev, ...names }))
      setArtistAlbumCovers(prev => ({ ...prev, ...albumCovers }))
      
      console.log('[ML Stats] Loaded:', Object.keys(names).length, 'names,', Object.keys(images).length, 'images')
    }

    loadAllArtistInfo()
  }, [profile.preferredArtists, favoriteArtists])

  // Догружаем коллаж для артистов при открытии спойлера
  useEffect(() => {
    if (!showAllFavorites || favoriteArtists.length <= 12) return

    // Находим артистов которые ещё не загружены (после 12)
    const artistsToLoad = favoriteArtists.slice(12).filter(a => !artistAlbumCovers[a.id])

    if (artistsToLoad.length === 0) return

    console.log('[ML Stats] Loading album covers for hidden artists:', artistsToLoad.length)

    async function loadMoreCovers() {
      const albumCovers: Record<string, string[]> = {}

      for (const artist of artistsToLoad) {
        try {
          const artistData = await subsonic.artists.getOne(artist.id)
          
          if (artistData?.album && artistData.album.length > 0) {
            const covers = artistData.album.slice(0, 4).map(album => {
              const coverId = album.coverArt || album.id
              return coverId ? getSimpleCoverArtUrl(coverId, 'album', '200') : undefined
            }).filter((url): url is string => url !== undefined)

            if (covers.length > 0) {
              albumCovers[artist.id] = covers
            }
          }
        } catch (error) {
          console.error('Failed to load album covers:', artist.id, error)
        }
      }

      setArtistAlbumCovers(prev => ({ ...prev, ...albumCovers }))
    }

    loadMoreCovers()
  }, [showAllFavorites, favoriteArtists, artistAlbumCovers])

  useEffect(() => {
    // Считаем прослушивания и скипы
    const ratingsArray = Object.values(ratings)
    const plays = ratingsArray.reduce((sum, r) => sum + (r.playCount || 0), 0)
    // Считаем скипы + дизлайки
    const skips = ratingsArray.reduce((sum, r) => sum + (r.skipCount || 0), 0)
    const dislikes = ratingsArray.filter(r => r.like === false).length
    // Пропущено = скипы + дизлайки (но не двойной счет)
    const totalSkipsCount = skips + dislikes

    // Используем getTotalPlays из localStorage
    const totalPlaysFromStorage = getTotalPlays()

    setTotalPlays(totalPlaysFromStorage > 0 ? totalPlaysFromStorage : plays)
    setTotalSkips(totalSkipsCount)

    // Проверяем достижения с учётом Navidrome
    const stats = {
      totalPlays: totalPlaysFromStorage > 0 ? totalPlaysFromStorage : plays,
      totalLikes: profile.likedSongs.length + navidromeStats.lovedTracks, // KumaFlow + Navidrome
      totalDislikes: profile.dislikedSongs.length,
      totalSkips: totalSkipsCount,
      totalPlaylists: 0, // Будет обновляться отдельно
      totalGenres: Object.keys(profile.preferredGenres).length,
      totalArtists: Object.keys(profile.preferredArtists).length + favoriteArtists.length, // ML + Navidrome
      daysSinceFirstListen: 0, // Можно вычислить из listeningHistory
    }
    checkAll(stats)
    
    console.log('[ML Stats] Achievement stats:', stats)

    // Загружаем информацию об артистах
    const loadArtistInfo = async () => {
      const topArtists = Object.entries(profile.preferredArtists)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)

      const images: Record<string, string> = {}
      const names: Record<string, string> = {}
      const mbids: Record<string, string> = {}

      console.log('[ML Stats] Loading artist info for top artists:', topArtists.map(([id]) => id))

      // Сначала получаем информацию из Navidrome
      for (const [artistId] of topArtists) {
        try {
          const artist = await subsonic.artists.getOne(artistId)
          if (artist) {
            // Проверяем есть ли coverArt и формируем полный URL
            if (artist.coverArt) {
              images[artistId] = `/rest/getCoverArt?id=${artist.coverArt}&u=${window.env?.username || ''}&t=${window.env?.token || ''}&v=1.16.1&c=KumaFlow`
              console.log(`[ML Stats] Got Navidrome image for ${artist.name}`)
            }
            names[artistId] = artist.name
            // Сохраняем MBID если есть
            if (artist.musicBrainzId) {
              mbids[artistId] = artist.musicBrainzId
              console.log(`[ML Stats] Got MBID for ${artist.name}: ${artist.musicBrainzId}`)
            }
          }
        } catch (error) {
          console.error('Failed to load artist from Navidrome:', error)
        }
      }

      // Затем пробуем получить HD изображения из Fanart.tv - ТОЛЬКО ЕСЛИ ВКЛЮЧЕН
      const { settings } = useExternalApiStore.getState()
      console.log('[ML Stats] Fanart.tv settings:', { 
        enabled: settings.fanartEnabled, 
        hasKey: !!settings.fanartApiKey 
      })
      
      // Загружаем Fanart.tv ТОЛЬКО если сервис включен
      if (settings.fanartEnabled && settings.fanartApiKey) {
        console.log('[ML Stats] Fanart.tv enabled, attempting to load HD images...')
        
        for (const [artistId] of topArtists) {
          try {
            let fanartLoaded = false
            
            // Если есть MBID, пробуем Fanart.tv
            if (mbids[artistId]) {
              console.log(`[ML Stats] Trying Fanart.tv with MBID for ${names[artistId]}`)
              const fanartImages = await fanartService.getArtistImages(mbids[artistId])
              if (fanartImages?.backgrounds?.[0]) {
                images[artistId] = fanartImages.backgrounds[0]
                console.log(`[ML Stats] ✅ Got Fanart.tv HD background for ${names[artistId]}`)
                fanartLoaded = true
              } else {
                console.log(`[ML Stats] ⚠️ No backgrounds found in Fanart.tv for ${names[artistId]}`)
              }
            }
            
            // Если нет MBID или Fanart.tv не нашёл, пробуем через Last.fm
            if (!fanartLoaded && names[artistId]) {
              console.log(`[ML Stats] Trying Last.fm to get MBID for ${names[artistId]}`)
              const { lastFmService } = await import('@/service/lastfm-api')
              const lastFmInfo = await lastFmService.getArtistInfo(names[artistId])
              
              if (lastFmInfo?.mbid) {
                console.log(`[ML Stats] Got MBID from Last.fm for ${names[artistId]}: ${lastFmInfo.mbid}`)
                const fanartImages = await fanartService.getArtistImages(lastFmInfo.mbid)
                if (fanartImages?.backgrounds?.[0]) {
                  images[artistId] = fanartImages.backgrounds[0]
                  console.log(`[ML Stats] ✅ Got Fanart.tv HD background for ${names[artistId]} via Last.fm`)
                  fanartLoaded = true
                } else {
                  console.log(`[ML Stats] ⚠️ No backgrounds in Fanart.tv for ${names[artistId]}`)
                }
              } else {
                console.log(`[ML Stats] ⚠️ No MBID found in Last.fm for ${names[artistId]}`)
              }
            }
            
            if (!fanartLoaded) {
              console.log(`[ML Stats] ⚠️ Could not load Fanart.tv image for ${names[artistId]}, keeping Navidrome image`)
            }
          } catch (error) {
            console.error('Failed to load artist image from Fanart.tv:', error)
            // Не прерываем загрузку, продолжаем со следующим артистом
          }
        }
      } else {
        console.log('[ML Stats] Fanart.tv is disabled, using Navidrome images only')
      }

      console.log('[ML Stats] Final artist images:', images)
      setArtistImages(images)
      setArtistNames(names)
    }

    loadArtistInfo()
  }, [ratings, profile.preferredArtists])

  // Топ жанры (ML preferredGenres + количество песен из Navidrome)
  const topGenres = Object.entries(profile.preferredGenres)
    .map(([genre, weight]) => {
      // Ищем жанр в Navidrome чтобы получить количество песен
      // (здесь можно добавить запрос к API для получения songCount по жанрам)
      return [genre, weight]
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // Топ артисты (ML preferredArtists + Navidrome лайки + songCount)
  const topArtists = useMemo(() => {
    return Object.entries(profile.preferredArtists)
      .map(([artistId, weight]) => {
        // Проверяем есть ли артист в лайкнутых из Navidrome
        const navidromeArtist = favoriteArtists.find(a => a.id === artistId)
        const navidromeBonus = navidromeArtist ? 5 : 0 // Бонус за лайк в Navidrome

        // Бонус за количество песен (если есть данные)
        const songCountBonus = navidromeArtist?.songCount ? Math.min(5, Math.floor(navidromeArtist.songCount / 10)) : 0

        return [artistId, weight + navidromeBonus + songCountBonus]
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [profile.preferredArtists, favoriteArtists]) // Пересчитываем при изменении favoriteArtists!

  // Логирование для отладки
  useEffect(() => {
    console.log('[ML Stats] profile.preferredArtists:', profile.preferredArtists)
    console.log('[ML Stats] favoriteArtists (из Navidrome):', favoriteArtists.length, 'artists')

    // Показываем расчёт для топ артистов
    const artistCalculations = Object.entries(profile.preferredArtists).map(([artistId, weight]) => {
      const nav = favoriteArtists.find(a => a.id === artistId)
      const navBonus = nav ? 5 : 0
      const songBonus = nav?.songCount ? Math.min(5, Math.floor(nav.songCount / 10)) : 0
      return {
        artistId,
        baseWeight: weight,
        navidromeBonus: navBonus,
        songCountBonus: songBonus,
        total: weight + navBonus + songBonus,
        name: artistNames[artistId] || nav?.name || 'Unknown'
      }
    })
    console.log('[ML Stats] Artist weight calculations:', artistCalculations)
    console.log('[ML Stats] topArtists (с бонусами):', topArtists)
  }, [profile.preferredArtists, favoriteArtists, artistNames])

  const handleArtistClick = (artistId: string) => {
    navigate(`/library/artists/${artistId}`)
  }

  // Импорт жанров из Navidrome
  const handleImportFromNavidrome = async () => {
    setIsImporting(true)
    try {
      const { getFavoriteArtists, getStarredSongs } = await import('@/service/subsonic-api')
      const { initializeFromFavorites, initializeGenresFromNavidrome } = useMLStore.getState()
      
      // Загружаем артистов
      const favoriteArtists = await getFavoriteArtists()
      console.log('[ML Stats] Importing from Navidrome:', favoriteArtists.length, 'artists')
      
      // Инициализируем артистов
      initializeFromFavorites(favoriteArtists)
      
      // Загружаем жанры артистов (первые 20)
      const artistsWithGenres = await Promise.all(
        favoriteArtists.slice(0, 20).map(async (artist) => {
          try {
            const artistData = await subsonic.artists.getOne(artist.id)
            return {
              id: artist.id,
              name: artist.name,
              genres: artistData?.genres || []
            }
          } catch (error) {
            console.error('Failed to load artist genres:', error)
            return { id: artist.id, name: artist.name, genres: [] }
          }
        })
      )
      
      // Инициализируем жанры артистов
      initializeGenresFromNavidrome(artistsWithGenres)
      
      // Загружаем жанры лайкнутых треков
      const starredSongs = await getStarredSongs()
      console.log('[ML Stats] Importing genres from', starredSongs.length, 'starred songs')
      
      // Собираем жанры из треков
      const trackGenres: Record<string, number> = {}
      starredSongs.forEach((song) => {
        if (song.genre) {
          // Вес = 0.5 за каждый трек (округляем до целого)
          trackGenres[song.genre] = (trackGenres[song.genre] || 0) + 0.5
        }
      })
      
      console.log('[ML Stats] Found genres from tracks:', trackGenres)
      
      // Увеличиваем веса существующих жанров или добавляем новые через set
      useMLStore.setState((state) => {
        const updatedGenres: string[] = []
        Object.entries(trackGenres).forEach(([genre, weight]) => {
          const currentWeight = state.profile.preferredGenres[genre] || 0
          const newWeight = currentWeight + Math.round(weight)
          state.profile.preferredGenres[genre] = newWeight
          updatedGenres.push(`${genre}: ${currentWeight} → ${newWeight}`)
          console.log(`[ML Stats] ${currentWeight > 0 ? '✅ Updated' : '✅ Added'} genre "${genre}": ${currentWeight} → ${newWeight}`)
        })
        
        console.log('[ML Stats] Updated genres:', updatedGenres)
        console.log('[ML Stats] Final preferredGenres:', state.profile.preferredGenres)
      })
      
      toast.success(`✅ Импортировано ${favoriteArtists.length} артистов и ${Object.keys(trackGenres).length} жанров!`)
      console.log('[ML Stats] Import complete!')
    } catch (error) {
      console.error('Failed to import from Navidrome:', error)
      toast.error('❌ Ошибка импорта')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="w-full space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">ML Статистика</h1>
        <p className="text-muted-foreground">
          Ваша персональная статистика прослушиваний и предпочтений
        </p>
        <div className="mt-4 flex gap-3 flex-wrap">
          <Button
            onClick={handleImportFromNavidrome}
            disabled={isImporting}
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            {isImporting ? (
              <>
                <span className="mr-2">⏳</span> Импорт из Navidrome...
              </>
            ) : (
              <>
                <span className="mr-2">📥</span> Импортировать жанры из Navidrome
              </>
            )}
          </Button>
          
          <Button
            onClick={() => document.getElementById('yandex-ml-import')?.scrollIntoView({ behavior: 'smooth' })}
            variant="outline"
            className="border-red-500/50 text-red-300 hover:bg-red-500/20"
          >
            <span className="mr-2">🎵</span> Импорт из Яндекс.Музыки
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Загрузит жанры лайкнутых артистов и треков из Navidrome для улучшения рекомендаций
        </p>
      </div>

      {/* Общая статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Оценённые треки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalRatings}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="default" className="bg-green-600">
                👍 {likedCount}
              </Badge>
              <Badge variant="secondary" className="bg-red-600 text-white">
                👎 {dislikedCount}
              </Badge>
              {navidromeStats.lovedTracks > 0 && (
                <Badge variant="secondary" className="bg-blue-600 text-white">
                  ❤️ {navidromeStats.lovedTracks}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Всего прослушиваний
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalPlays}</div>
            <p className="text-xs text-muted-foreground mt-2">
              🎵 KumaFlow + Navidrome
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Пропущено треков
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSkips}</div>
            <Progress 
              value={totalRatings > 0 ? (totalSkips / totalRatings) * 100 : 0} 
              className="h-2 mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {totalRatings > 0 ? Math.round((totalSkips / totalRatings) * 100) : 0}% от оценённых
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Любимых жанров
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Object.keys(profile.preferredGenres).length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              🎭 {topGenres.length} активных
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Любимые артисты
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{favoriteArtists.length}</div>
            <p className="text-xs text-muted-foreground mt-2">
              ❤️ Из Navidrome
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Лайкнутые артисты из Navidrome */}
      {favoriteArtists.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">❤️ Любимые артисты (Navidrome)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Артисты которых вы лайкнули в Navidrome
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {favoriteArtists.slice(0, showAllFavorites ? favoriteArtists.length : 12).map((artist, index) => {
                const imageUrl = artistImages[artist.id]
                const artistName = artistNames[artist.id] || artist.name
                const covers = artistAlbumCovers[artist.id] || []
                const hasImage = !!imageUrl
                const hasCovers = covers.length > 0

                return (
                  <div
                    key={artist.id}
                    className="animate-in fade-in zoom-in duration-300"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <button
                      onClick={() => navigate(ROUTES.ARTIST.PAGE(artist.id))}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-muted/50 transition-colors w-full"
                    >
                      {/* Коллаж из 4 обложек или кружок с буквой/картинкой */}
                      {hasCovers ? (
                        <div className="w-16 h-16 rounded-full overflow-hidden grid grid-cols-2 gap-0.5 bg-muted">
                          {covers.map((coverUrl, idx) => (
                            <img
                              key={idx}
                              src={coverUrl}
                              alt={`${artistName} album ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ))}
                        </div>
                      ) : hasImage ? (
                        <img
                          src={imageUrl}
                          alt={artistName}
                          className="w-16 h-16 rounded-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget
                            target.style.display = 'none'
                            const fallback = target.nextElementSibling as HTMLElement
                            if (fallback) fallback.classList.remove('hidden')
                          }}
                        />
                      ) : null}
                      
                      {/* Fallback с буквой */}
                      <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center text-2xl font-bold text-primary ${hasCovers || hasImage ? 'hidden' : ''}`}>
                        {artistName.charAt(0).toUpperCase()}
                      </div>
                      
                      <span className="text-sm font-medium text-center line-clamp-2">
                        {artistName}
                      </span>
                      {artist.starred && (
                        <Badge variant="secondary" className="text-xs">
                          ⭐ {new Date(artist.starred).toLocaleDateString()}
                        </Badge>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            
            {favoriteArtists.length > 12 && (
              <Button
                variant="ghost"
                onClick={() => setShowAllFavorites(!showAllFavorites)}
                className="w-full mt-4"
              >
                {showAllFavorites ? (
                  <>
                    <span className="mr-2">🔼</span> Свернуть
                  </>
                ) : (
                  <>
                    <span className="mr-2">🔽</span> + ещё {favoriteArtists.length - 12} артистов
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Топ жанры */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🎭 Топ жанры</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topGenres.length > 0 ? (
            topGenres.map(([genre, weight], index) => (
              <div key={genre} className="flex items-center gap-3">
                <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center">
                  {index + 1}
                </Badge>
                <span className="flex-1 font-medium">{genre}</span>
                <Progress value={Math.min(100, (weight / topGenres[0][1]) * 100)} className="h-2 w-32" />
                <span className="text-sm text-muted-foreground w-12 text-right">{weight}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              Пока нет данных. Пройдите холодный старт или слушайте музыку!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Топ артисты */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🎤 Топ артисты</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topArtists.length > 0 ? (
            topArtists.map(([artistId, weight], index) => (
              <button
                key={artistId}
                onClick={() => handleArtistClick(artistId)}
                className="w-full flex items-center gap-3 hover:bg-muted/50 p-2 rounded-lg transition-colors"
              >
                <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center flex-shrink-0">
                  {index + 1}
                </Badge>
                {artistImages[artistId] ? (
                  <img
                    src={artistImages[artistId]}
                    alt={artistNames[artistId] || 'Artist'}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50%" x="50%" text-anchor="middle" font-size="50">🎤</text></svg>'
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    🎤
                  </div>
                )}
                <span className="flex-1 font-medium text-left">
                  {artistNames[artistId] || `Артист #${artistId.slice(0, 8)}`}
                </span>
                <Progress value={Math.min(100, (weight / topArtists[0][1]) * 100)} className="h-2 w-32 flex-shrink-0" />
                <span className="text-sm text-muted-foreground w-12 text-right flex-shrink-0">{weight}</span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              Пока нет данных. Отметьте любимых артистов!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Достижения */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🏆 Достижения</CardTitle>
          <p className="text-sm text-muted-foreground">
            Разблокировано: {getUnlockedCount()} из {getTotalCount()}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                achievement.unlocked
                  ? 'bg-primary/10 border-primary/20'
                  : 'bg-muted/30 border-muted'
              }`}
            >
              <div className="text-3xl">{achievement.icon}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{achievement.title}</span>
                  {achievement.unlocked && (
                    <Badge variant="default" className="bg-green-600 text-xs">
                      ✅
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {achievement.description}
                </p>
                {!achievement.unlocked && (
                  <Progress
                    value={(achievement.progress / achievement.maxProgress) * 100}
                    className="h-1.5 mt-2"
                  />
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Кнопки действий */}
      <div className="flex gap-3">
        <Button
          onClick={() => window.location.hash = '/artists/cold-start'}
          className="flex-1"
        >
          🎯 Уточнить предпочтения
        </Button>

        <Button
          onClick={() => window.location.hash = '/'}
          variant="outline"
          className="flex-1"
        >
          🎵 Моя волна
        </Button>
      </div>

      {/* Статистика оркестратора */}
      <div id="orchestrator-stats" className="scroll-mt-4">
        <OrchestratorStats />
      </div>

      {/* Music Map */}
      <div id="music-map" className="scroll-mt-4">
        <MusicMapCard />
      </div>

      {/* Импорт из Яндекс.Музыки */}
      <div id="yandex-ml-import" className="scroll-mt-4">
        <YandexMLImport />
      </div>

      {/* Кнопка Wrapped */}
      <div className="pt-4 border-t">
        <Button
          onClick={() => window.location.hash = '/wrapped'}
          variant="outline"
          className="w-full border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
        >
          🎵 Итоги года
        </Button>
      </div>
    </div>
  )
}
