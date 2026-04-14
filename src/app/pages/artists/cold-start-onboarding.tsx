/**
 * Cold Start Onboarding V2 - Улучшенная версия
 * - Горизонтальный скролл жанров
 * - Сетка круглых аватаров
 * - Фильтрация по жанрам
 * - Индикация сердечком
 * - Адаптация под тему
 */

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import { Badge } from '@/app/components/ui/badge'
import { Card, CardContent } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import {
  getGenres,
  getLimitedArtists,
  getFavoriteArtists,
  getArtistInfo,
  getArtistInfo2,
  getSongsByGenre,
  search3,
  type SubsonicArtist,
  type SubsonicGenre,
} from '@/service/subsonic-api'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { useMLStore } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { generateArtistBasedPlaylist } from '@/service/ml-wave-service'
import { trackEvent } from '@/service/ml-event-tracker'
import { toast } from 'react-toastify'
import { Heart, Music, Trophy, Check, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

// Расширенный артист с жанрами
interface ArtistWithGenres extends SubsonicArtist {
  genres: string[]
}

export default function ColdStartOnboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedArtists, setSelectedArtists] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  // Данные
  const [genres, setGenres] = useState<SubsonicGenre[]>([])
  const [allArtists, setAllArtists] = useState<ArtistWithGenres[]>([])
  const [artistsByGenre, setArtistsByGenre] = useState<Record<string, ArtistWithGenres[]>>({})
  const [artistGenresCache, setArtistGenresCache] = useState<Record<string, string[]>>({})
  const [artistImagesCache, setArtistImagesCache] = useState<Record<string, string>>({})
  const [selectedGenreFilter, setSelectedGenreFilter] = useState<string>('Микс')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ArtistWithGenres[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [similarArtists, setSimilarArtists] = useState<ArtistWithGenres[]>([])
  const [isLoadingGenres, setIsLoadingGenres] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Загрузка...')

  const { setSongList } = usePlayerActions()

  // Debounced поиск
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([])
        setSimilarArtists([])
        return
      }

      setIsSearching(true)
      try {
        console.log('[ColdStart] Searching for:', searchQuery)
        const result = await search3(searchQuery, { artistCount: 20 })
        console.log('[ColdStart] Search results:', result?.artists?.length)

        if (result?.artists && result.artists.length > 0) {
          const artistsWithGenres: ArtistWithGenres[] = result.artists.map(a => ({
            ...a,
            genres: [],
          }))
          setSearchResults(artistsWithGenres)

          // Загружаем картинки
          const imagesCache: Record<string, string> = {}
          for (const artist of artistsWithGenres) {
            if (artist.coverArt) {
              imagesCache[artist.id] = getSimpleCoverArtUrl(artist.coverArt, 'artist', '300')
            }
          }
          setArtistImagesCache(prev => ({ ...prev, ...imagesCache }))
        } else {
          setSearchResults([])
        }
      } catch (error) {
        console.error('[ColdStart] Search failed:', error)
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Загрузка похожих артистов
  const loadSimilarArtists = async (artistId: string) => {
    try {
      console.log('[ColdStart] Loading similar artists for:', artistId)
      const info = await getArtistInfo2(artistId, 10)
      console.log('[ColdStart] Similar artists response:', info)
      
      if (info?.similarArtists && info.similarArtists.length > 0) {
        const similarWithGenres: ArtistWithGenres[] = info.similarArtists.map(a => ({
          ...a,
          genres: [],
        }))
        console.log('[ColdStart] Found similar artists:', similarWithGenres.length)
        setSimilarArtists(similarWithGenres)

        // Загружаем картинки
        const imagesCache: Record<string, string> = {}
        for (const artist of similarWithGenres) {
          if (artist.coverArt) {
            imagesCache[artist.id] = getSimpleCoverArtUrl(artist.coverArt, 'artist', '300')
          }
        }
        setArtistImagesCache(prev => ({ ...prev, ...imagesCache }))
      } else {
        console.log('[ColdStart] No similar artists found')
        setSimilarArtists([])
      }
    } catch (error) {
      console.error('[ColdStart] Failed to load similar artists:', error)
      setSimilarArtists([])
    }
  }

  // Загрузка данных
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setLoadingMessage('Получаем жанры...')

      try {
        console.log('[ColdStart] Loading genres...')
        const genresData = await getGenres()
        console.log('[ColdStart] Genres loaded:', genresData?.length)
        setGenres(genresData || [])

        // Загружаем артистов
        setLoadingMessage('Получаем артисты...')
        console.log('[ColdStart] Loading favorite artists...')
        const favoriteArtists = await getFavoriteArtists()
        console.log('[ColdStart] Favorite artists:', favoriteArtists?.length)

        console.log('[ColdStart] Loading limited artists...')
        const artistsData = await getLimitedArtists(100)
        console.log('[ColdStart] Limited artists:', artistsData?.length)

        const allArtistsData = favoriteArtists?.length ? favoriteArtists : artistsData
        console.log('[ColdStart] Total artists to process:', allArtistsData?.length)

        // Загружаем картинки для всех артистов
        const imagesCache: Record<string, string> = {}
        const artistsWithGenres: ArtistWithGenres[] = await Promise.all(
          (allArtistsData || []).map(async a => {
            // Загружаем жанры
            let artistGenres: string[] = []
            try {
              console.log(`[ColdStart] Loading genres for artist: ${a.name}`)
              const info = await getArtistInfo(a.id)
              artistGenres = info?.genres || []
              console.log(`[ColdStart] Artist ${a.name} genres:`, artistGenres)
            } catch (e) {
              console.error(`[ColdStart] Failed to load genres for ${a.name}:`, e)
              artistGenres = []
            }

            // Загружаем картинку через getSimpleCoverArtUrl как в ML Статистике
            let imageUrl = ''
            if (a.coverArt) {
              imageUrl = getSimpleCoverArtUrl(a.coverArt, 'artist', '300')
              console.log(`[ColdStart] Artist ${a.name} image URL:`, imageUrl)
            } else {
              console.log(`[ColdStart] Artist ${a.name} has no coverArt`)
            }

            if (imageUrl) {
              imagesCache[a.id] = imageUrl
            }

            return {
              ...a,
              genres: artistGenres,
            }
          })
        )

        console.log('[ColdStart] Setting artists:', artistsWithGenres.length)
        console.log('[ColdStart] Setting images cache:', Object.keys(imagesCache).length)
        setAllArtists(artistsWithGenres)
        setArtistImagesCache(imagesCache)

        // Если есть любимые артисты - выбираем их
        if (favoriteArtists?.length) {
          setSelectedArtists(favoriteArtists.map(a => a.id))
          const { initializeFromFavorites } = useMLStore.getState()
          initializeFromFavorites(favoriteArtists)
        }

        setLoadingMessage('')
      } catch (error) {
        console.error('[ColdStart] Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Ленивая загрузка жанров для артистов
  const loadArtistGenres = async (artistId: string) => {
    if (artistGenresCache[artistId]) return artistGenresCache[artistId]

    try {
      const info = await getArtistInfo(artistId)
      const artistGenres = info?.genres || []
      setArtistGenresCache(prev => ({ ...prev, [artistId]: artistGenres }))
      return artistGenres
    } catch {
      return []
    }
  }

  // Фильтрация артистов по жанру + поиск
  const filteredArtists = useMemo(() => {
    // Если есть поиск - показываем результаты поиска
    if (searchQuery.trim() && searchResults.length > 0) {
      return searchResults
    }

    let filtered: ArtistWithGenres[] = []

    // Фильтр по жанру
    if (selectedGenreFilter !== 'Микс') {
      // Используем загруженных артистов жанра
      filtered = artistsByGenre[selectedGenreFilter] || []
    } else {
      // Микс - все артисты
      filtered = allArtists
    }

    // Поиск по имени (если нет результатов search3)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(artist =>
        artist.name.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [allArtists, artistsByGenre, selectedGenreFilter, searchQuery, searchResults])

  // Обработка выбора жанра (шаг 1)
  const handleGenreSelect = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    )
  }

  // Обработка выбора артиста (шаг 2)
  const handleArtistSelect = async (artistId: string) => {
    const isSelected = selectedArtists.includes(artistId)

    if (!isSelected) {
      // Загружаем похожих артистов если выбрали из поиска
      if (searchQuery.trim() && searchResults.length > 0) {
        await loadSimilarArtists(artistId)
      }
    } else {
      // Если сняли выделение - очищаем похожих
      setSimilarArtists([])
    }

    setSelectedArtists(prev =>
      prev.includes(artistId) ? prev.filter(a => a !== artistId) : [...prev, artistId]
    )
  }

  // Обработка выбора жанра-фильтра
  const handleGenreFilterSelect = async (genre: string) => {
    console.log('[ColdStart] Genre filter selected:', genre)
    setSelectedGenreFilter(genre)

    // Если выбран конкретный жанр (не Микс) и ещё не загружали
    if (genre !== 'Микс' && !artistsByGenre[genre]) {
      setIsLoadingGenres(true)
      setLoadingMessage(`Загрузка артистов жанра ${genre}...`)

      try {
        console.log(`[ColdStart] Loading artists for genre: ${genre}`)
        // Получаем песни жанра
        const songs = await getSongsByGenre(genre, 100)
        console.log(`[ColdStart] Got ${songs.length} songs for genre ${genre}`)

        // Собираем уникальных артистов
        const artistMap = new Map<string, ArtistWithGenres>()
        for (const song of songs) {
          if (!artistMap.has(song.artistId)) {
            artistMap.set(song.artistId, {
              id: song.artistId,
              name: song.artist,
              coverArt: song.coverArt,
              genres: [genre],
            })
          }
        }

        const genreArtists = Array.from(artistMap.values())
        console.log(`[ColdStart] Found ${genreArtists.length} unique artists for genre ${genre}`)

        // Загружаем картинки
        const imagesCache: Record<string, string> = {}
        for (const artist of genreArtists) {
          if (artist.coverArt) {
            imagesCache[artist.id] = getSimpleCoverArtUrl(artist.coverArt, 'artist', '300')
          }
        }

        setArtistsByGenre(prev => ({ ...prev, [genre]: genreArtists }))
        setArtistImagesCache(prev => ({ ...prev, ...imagesCache }))
      } catch (error) {
        console.error(`[ColdStart] Failed to load artists for genre ${genre}:`, error)
      } finally {
        setIsLoadingGenres(false)
        setLoadingMessage('')
      }
    }
  }

  // Логирование фильтрации
  useEffect(() => {
    console.log('[ColdStart] Filter changed:', {
      selectedGenreFilter,
      totalArtists: allArtists.length,
      filteredArtists: filteredArtists.length,
    })
  }, [selectedGenreFilter, filteredArtists.length, allArtists.length])

  const handleNext = () => {
    if (step < 3) setStep(step + 1)
    else handleComplete()
  }

  const handleComplete = async () => {
    setIsScanning(true)

    const { initializeFromFavorites } = useMLStore.getState()
    const favoriteArtists = allArtists.filter(a => selectedArtists.includes(a.id))

    // 🔒 ЛАЙКАЕМ АРТИСТОВ В NAVIDROME!
    console.log('[ColdStart] Liking', favoriteArtists.length, 'artists in Navidrome...')
    const { star } = await import('@/service/star')
    for (const artist of favoriteArtists) {
      try {
        await star.starItem(artist.id)
        console.log(`[ColdStart] ⭐ Liked artist: ${artist.name} (${artist.id})`)
      } catch (error) {
        console.warn(`[ColdStart] Failed to like artist ${artist.name}:`, error)
      }
    }

    // 1. Инициализируем preferredArtists (лайкнутые артисты)
    initializeFromFavorites(favoriteArtists)
    console.log('[ColdStart] Initialized preferredArtists:', favoriteArtists.length, 'artists')

    // 2. Инициализация жанров
    const artistsWithGenres = await Promise.all(
      favoriteArtists.slice(0, 20).map(async artist => {
        const genres = artistGenresCache[artist.id] || []
        return { id: artist.id, name: artist.name, genres }
      })
    )

    const { initializeGenresFromNavidrome } = useMLStore.getState()
    initializeGenresFromNavidrome(artistsWithGenres)

    console.log('[ColdStart] ML Profile initialized:')
    const profile = useMLStore.getState().getProfile()
    console.log('[ColdStart] - preferredArtists:', Object.keys(profile.preferredArtists).length)
    console.log('[ColdStart] - preferredGenres:', Object.keys(profile.preferredGenres).length)
    console.log('[ColdStart] - likedSongs:', profile.likedSongs.length, '(заполняется явно через лайки треков)')

    // Анимация сканирования
    for (let i = 0; i <= 100; i += 5) {
      setScanProgress(i)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Генерация плейлиста
    toast.info('🎵 Генерация персонального плейлиста...', { autoClose: 3000 })

    try {
      const playlist = await generateArtistBasedPlaylist(selectedArtists, 50)

      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        toast.success(`✅ Плейлист готов! ${playlist.songs.length} треков`, { autoClose: 5000 })
        setIsComplete(true)

        trackEvent('onboarding_completed', {
          genres: selectedGenres.length,
          artists: selectedArtists.length,
        })
      } else {
        toast.error('❌ Не удалось сгенерировать плейлист')
        setIsComplete(true)
      }
    } catch (error) {
      console.error('Failed to generate playlist:', error)
      toast.error('❌ Ошибка генерации плейлиста')
      setIsComplete(true)
    }
  }

  const canProceed = () => {
    if (step === 1) return selectedGenres.length >= 3
    if (step === 2) return selectedArtists.length >= 5
    return true
  }

  // Экран сканирования
  if (isScanning) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background">
        <div className="w-full max-w-md space-y-6 p-6 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold">Анализ предпочтений</h2>
          <p className="text-muted-foreground">Генерация персонального плейлиста...</p>
          <Progress value={scanProgress} className="h-3" />
          <p className="text-muted-foreground">{scanProgress}% завершено</p>

          {isComplete && (
            <Button onClick={() => navigate('/')} className="w-full">
              Перейти к плееру →
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Экран загрузки
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted to-background">
        <div className="w-full max-w-md space-y-6 p-6 text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold">Загрузка...</h2>
          <p className="text-muted-foreground">{loadingMessage}</p>
          <Progress value={undefined} className="h-3" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted to-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Прогресс бар */}
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-4">
            <Progress value={(step / 3) * 100} className="h-2" />
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">
                  {step === 1 && 'Выберите жанры'}
                  {step === 2 && 'Выберите артистов'}
                  {step === 3 && 'Готово к запуску'}
                </h1>
                <p className="text-muted-foreground">
                  {step === 1 && 'Минимум 3 жанра для точных рекомендаций'}
                  {step === 2 && 'Минимум 5 артистов для персонализации'}
                  {step === 3 && 'Профиль настроен'}
                </p>
              </div>
              <Badge variant="secondary" className="text-lg px-4 py-2">
                Шаг {step} / 3
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Шаг 1: Жанры */}
        {step === 1 && (
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Минимум 3 жанра</span>
                <Badge className="text-lg px-4 py-2">
                  {selectedGenres.length} выбрано
                </Badge>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[500px] overflow-y-auto p-4">
                {genres.map(genre => {
                  const isSelected = selectedGenres.includes(genre.value)
                  return (
                    <button
                      key={genre.value}
                      onClick={() => handleGenreSelect(genre.value)}
                      className={cn(
                        'aspect-square rounded-full flex items-center justify-center transition-all duration-200 border-2',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-lg'
                          : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                      )}
                    >
                      <span className="text-sm font-medium text-center px-2">{genre.value}</span>
                      {isSelected && <Check className="w-4 h-4 absolute top-2 right-2" />}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Шаг 2: Артисты с жанрами */}
        {step === 2 && (
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Минимум 5 артистов</span>
                <Badge className="text-lg px-4 py-2">
                  {selectedArtists.length} выбрано
                </Badge>
              </div>

              {/* Поиск артистов */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск артистов по всему серверу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
                {isSearching && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Результаты поиска */}
              {searchQuery.trim() && searchResults.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Найдено: {searchResults.length} артистов
                    </span>
                  </div>
                </div>
              )}

              {/* Жанр-табы с горизонтальным скроллом */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <Button
                  variant={selectedGenreFilter === 'Микс' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleGenreFilterSelect('Микс')}
                  className="flex-shrink-0"
                >
                  🎵 Микс
                </Button>
                {genres.slice(0, 20).map(genre => (
                  <Button
                    key={genre.value}
                    variant={selectedGenreFilter === genre.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleGenreFilterSelect(genre.value)}
                    className="flex-shrink-0"
                  >
                    {genre.value}
                  </Button>
                ))}
              </div>

              {/* Сетка круглых аватаров */}
              <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[400px] overflow-y-auto p-4 pb-32">
                {isLoadingGenres ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-12">
                    <div className="text-4xl mb-4">⏳</div>
                    <p className="text-muted-foreground">Загрузка артистов...</p>
                  </div>
                ) : filteredArtists.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-12">
                    <div className="text-4xl mb-4">😕</div>
                    <p className="text-muted-foreground">Артисты не найдены</p>
                  </div>
                ) : (
                  filteredArtists.map(artist => {
                    const isSelected = selectedArtists.includes(artist.id)
                    const imageUrl = artistImagesCache[artist.id]

                    return (
                      <button
                        key={artist.id}
                        onClick={() => handleArtistSelect(artist.id)}
                        className="flex flex-col items-center gap-2 group"
                      >
                        {/* Круглый аватар с обводкой */}
                        <div className={cn(
                          'relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 transition-all duration-200',
                          isSelected
                            ? 'border-primary shadow-lg shadow-primary/20'
                            : 'border-transparent group-hover:border-muted-foreground/30'
                        )}>
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={artist.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <Music className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}

                          {/* Сердечко при выборе */}
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <Heart className="w-8 h-8 text-primary fill-primary" />
                            </div>
                          )}
                        </div>

                        {/* Имя артиста */}
                        <span className="text-xs font-medium text-center line-clamp-2 max-w-[80px]">
                          {artist.name}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>

              {/* Похожие артисты */}
              {similarArtists.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Heart className="w-4 h-4 text-primary fill-primary" />
                    <span className="text-sm font-medium">Похожие артисты</span>
                  </div>
                  <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {similarArtists.map(artist => {
                      const isSelected = selectedArtists.includes(artist.id)
                      const imageUrl = artistImagesCache[artist.id]

                      return (
                        <button
                          key={artist.id}
                          onClick={() => handleArtistSelect(artist.id)}
                          className="flex flex-col items-center gap-1 group"
                        >
                          <div className={cn(
                            'relative w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden border-2 transition-all duration-200',
                            isSelected
                              ? 'border-primary shadow-lg'
                              : 'border-transparent group-hover:border-muted-foreground/30'
                          )}>
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={artist.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-muted flex items-center justify-center">
                                <Music className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            {isSelected && (
                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                <Heart className="w-5 h-5 text-primary fill-primary" />
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-center line-clamp-1 max-w-[60px]">
                            {artist.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Шаг 3: Готово */}
        {step === 3 && (
          <Card className="bg-card border-border">
            <CardContent className="p-8 space-y-6 text-center">
              <div className="text-6xl">🎵</div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Всё готово!</h2>
                <p className="text-muted-foreground">
                  Персональный плейлист будет сгенерирован на основе:
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-primary">{selectedGenres.length}</div>
                  <div className="text-sm text-muted-foreground">жанров</div>
                </div>
                <div className="p-4 rounded-lg bg-muted">
                  <div className="text-3xl font-bold text-primary">{selectedArtists.length}</div>
                  <div className="text-sm text-muted-foreground">артистов</div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-gradient-to-r from-primary to-primary/80">
                <div className="text-lg font-bold text-primary-foreground">
                  ML профиль активирован
                </div>
                <div className="text-sm text-primary-foreground/80">
                  Оркестратор и Vibe Similarity включены
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Плавающая кнопка навигации */}
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-auto z-50">
          <div className="bg-card border-border rounded-lg shadow-2xl p-4 flex justify-between items-center max-w-md ml-auto">
            <Button
              variant="ghost"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className="text-foreground"
            >
              Назад
            </Button>

            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="hidden md:inline-flex">
                Шаг {step} / 3
              </Badge>
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                className="bg-gradient-to-r from-primary to-primary/80 font-semibold px-8"
              >
                {step === 3 ? 'Запустить ▶' : 'Далее →'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
