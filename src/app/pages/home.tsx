import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PreviewListFallback,
} from '@/app/components/fallbacks/home-fallbacks'
import PreviewList from '@/app/components/home/preview-list'
import ArtistRadioCards from '@/app/components/home/artist-radio-cards'
import { NewReleasesCard } from '@/app/components/home/new-releases-card'
import { GlobalChartsCard } from '@/app/components/homepage/global-charts-card'
import {
  useGetMostPlayed,
  useGetRandomAlbums,
  useGetRecentlyAdded,
  useGetRecentlyPlayed,
} from '@/app/hooks/use-home'
import { ROUTES } from '@/routes/routesList'
import { useML } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { useMLPlaylists } from '@/store/ml-playlists.store'
import { generateMyWavePlaylist } from '@/service/ml-wave-service'
import { generateCSSGradient } from '@/utils/genreColors'
import { getGenres } from '@/service/subsonic-api'
import { toast } from 'react-toastify'
import { useQuery } from '@tanstack/react-query'
import { useHomepageSettings } from '@/store/homepage.store'

// Градиенты для жанров
const GENRE_GRADIENTS: Record<string, string> = {
  'Rock': 'from-red-600 via-red-500 to-orange-500',
  'Metal': 'from-gray-900 via-gray-800 to-black',
  'Pop': 'from-pink-500 via-purple-500 to-indigo-500',
  'Rap': 'from-yellow-600 via-orange-600 to-red-700',
  'Hip-Hop': 'from-yellow-600 via-orange-600 to-red-700',
  'Electronic': 'from-blue-600 via-purple-600 to-pink-600',
  'Dance': 'from-cyan-500 via-blue-500 to-purple-600',
  'Jazz': 'from-amber-700 via-amber-600 to-orange-700',
  'Classical': 'from-indigo-900 via-purple-900 to-indigo-800',
  'Blues': 'from-blue-900 via-blue-800 to-indigo-900',
  'Country': 'from-amber-600 via-orange-600 to-yellow-700',
  'Folk': 'from-green-700 via-emerald-600 to-teal-700',
  'R&B': 'from-purple-800 via-purple-700 to-pink-800',
  'Soul': 'from-rose-800 via-rose-700 to-red-800',
  'Reggae': 'from-green-600 via-yellow-500 to-red-600',
  'Latin': 'from-red-600 via-orange-500 to-yellow-500',
  'K-Pop': 'from-pink-400 via-purple-400 to-indigo-500',
  'Indie': 'from-teal-500 via-emerald-500 to-green-600',
  'Alternative': 'from-slate-600 via-gray-600 to-zinc-700',
  'Punk': 'from-red-700 via-red-600 to-orange-700',
  'Ambient': 'from-blue-400 via-cyan-400 to-teal-500',
  'House': 'from-violet-600 via-purple-600 to-fuchsia-700',
  'Techno': 'from-gray-700 via-gray-600 to-slate-700',
  'Trance': 'from-indigo-600 via-purple-600 to-pink-700',
  'Dubstep': 'from-red-900 via-red-800 to-orange-900',
  'Drum & Bass': 'from-blue-900 via-indigo-900 to-purple-900',
  'Acoustic': 'from-amber-700 via-amber-600 to-orange-600',
  'Soundtrack': 'from-yellow-700 via-amber-700 to-orange-800',
  'Videogame': 'from-green-500 via-emerald-500 to-teal-600',
  'Chill': 'from-cyan-500 via-blue-500 to-indigo-600',
  'Lo-Fi': 'from-purple-400 via-pink-400 to-rose-500',
}

const getGradient = (genreName: string): string => {
  if (GENRE_GRADIENTS[genreName]) return GENRE_GRADIENTS[genreName]
  for (const [key, gradient] of Object.entries(GENRE_GRADIENTS)) {
    if (genreName.toLowerCase().includes(key.toLowerCase())) return gradient
  }
  return 'from-primary via-primary/80 to-primary/60'
}

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isPlayingMyWave, setIsPlayingMyWave] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const { getProfile, ratings } = useML()
  const { setSongList } = usePlayerActions()
  const { settings: playlistSettings } = useMLPlaylists()
  const homepageSettings = useHomepageSettings()

  // Динамический градиент на основе предпочтений
  const profile = getProfile()

  // Сортируем жанры по весу и берём топ-8 для главной
  const topGenres = Object.entries(profile.preferredGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre]) => genre)

  const myWaveGradient = generateCSSGradient(topGenres, profile.preferredGenres)

  // Загружаем все жанры для сетки на главной (с кэшированием)
  const { data: allGenres = [] } = useQuery({
    queryKey: ['genres-all'],
    queryFn: getGenres,
    staleTime: 1000 * 60 * 30, // 30 минут
    gcTime: 1000 * 60 * 60, // 1 час в кэше
  })

  // Персональные жанры (топ из ML + популярные из Navidrome)
  const personalGenres = allGenres
    .filter(g => g.songCount && g.songCount > 0)
    .sort((a, b) => (b.songCount || 0) - (a.songCount || 0))
    .slice(0, 8)

  const handleGenreClick = async (genreName: string) => {
    setIsGenerating(genreName)
    try {
      const { getSongsByGenre } = await import('@/service/subsonic-api')
      const songs = await getSongsByGenre(genreName, 50)
      
      if (songs.length === 0) {
        toast.error(`Нет треков в жанре "${genreName}"`)
        setIsGenerating(null)
        return
      }

      const playlist = songs.map(song => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        coverUrl: song.coverArt ? `/rest/getCoverArt?id=${song.coverArt}&u=&t=&v=1.16.1&c=KumaFlow` : undefined,
        duration: song.duration,
        genre: song.genre,
      }))

      setSongList(playlist, 0)
      toast.success(`▶️ Запущено: ${genreName} (${playlist.length} треков)`, { type: 'success' })
    } catch (error) {
      console.error('Failed to generate genre playlist:', error)
      toast.error(`Ошибка генерации плейлиста "${genreName}"`)
    } finally {
      setIsGenerating(null)
    }
  }

  // Количество треков из настроек
  const trackCount = playlistSettings.maxTracks || 25

  const recentlyPlayed = useGetRecentlyPlayed()
  const mostPlayed = useGetMostPlayed()
  const recentlyAdded = useGetRecentlyAdded()
  const randomAlbums = useGetRandomAlbums()

  const handleMyWavePlay = async () => {
    if (isGenerating) return

    setIsPlayingMyWave(!isPlayingMyWave)
    setIsGenerating(true)

    try {
      // Генерация плейлиста на основе ML
      const profile = getProfile()
      const likedSongIds = profile.likedSongIds || []  // ИСПРАВЛЕНО: проверка на undefined

      console.log('Генерация "Моя волна"...')
      console.log('Лайкнутые треки:', likedSongIds.length)
      console.log('Все оценки:', Object.keys(ratings).length)

      // Генерируем плейлист
      const playlist = await generateMyWavePlaylist(likedSongIds, ratings, trackCount, true)

      console.log('Сгенерировано треков:', playlist.songs.length)

      if (playlist.songs.length > 0) {
        // Запускаем воспроизведение
        setSongList(playlist.songs, 0)

        console.log('✅ "Моя волна" запущена!')
      } else {
        console.warn('⚠️ Не удалось сгенерировать плейлист')
        alert('Пока нет данных для генерации плейлиста. Начните слушать музыку!')
      }
    } catch (error) {
      console.error('Ошибка генерации "Моя волна":', error)
      alert('Ошибка при генерации плейлиста. Попробуйте позже.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Фильтруем и сортируем секции по настройкам
  const getEnabledSections = () => {
    const allSections = [
      {
        id: 'genres' as const,
        title: 'Жанры',
        type: 'genres' as const,
        data: allGenres,
        loader: false,
      },
      {
        id: 'artistRadio' as const,
        title: 'В стиле',
        type: 'artistRadio' as const,
        data: [],
        loader: false,
      },
      {
        id: 'recentlyPlayed' as const,
        title: t('home.recentlyPlayed'),
        type: 'albums' as const,
        data: recentlyPlayed.data,
        loader: recentlyPlayed.isLoading,
        route: ROUTES.ALBUMS.RECENTLY_PLAYED,
      },
      {
        id: 'mostPlayed' as const,
        title: t('home.mostPlayed'),
        data: mostPlayed.data,
        loader: mostPlayed.isLoading,
        route: ROUTES.ALBUMS.MOST_PLAYED,
      },
      {
        id: 'recentlyAdded' as const,
        title: t('home.recentlyAdded'),
        data: recentlyAdded.data,
        loader: recentlyAdded.isLoading,
        route: ROUTES.ALBUMS.RECENTLY_ADDED,
      },
      {
        id: 'explore' as const,
        title: t('home.explore'),
        data: randomAlbums.data,
        loader: randomAlbums.isLoading,
        route: ROUTES.ALBUMS.RANDOM,
      },
    ]

    // Фильтруем включенные секции и сортируем по порядку
    return allSections
      .filter(section => {
        const setting = homepageSettings.sections.find(s => s.id === section.id)
        return setting?.enabled !== false
      })
      .sort((a, b) => {
        const orderA = homepageSettings.sections.find(s => s.id === a.id)?.order || 999
        const orderB = homepageSettings.sections.find(s => s.id === b.id)?.order || 999
        return orderA - orderB
      })
  }

  const sections = getEnabledSections()

  // // Получаем настройку нового дизайна
  // const { newHomepageDesign } = useHomepageSettings()

  // // Если включен новый дизайн - показываем NewHomepage
  // if (newHomepageDesign) {
  //   return <NewHomepage />
  // }

  return (
    <div className="w-full space-y-6">
      {/* Hero секция "Моя волна" */}
      <div 
        className="relative w-full h-[300px] rounded-2xl overflow-hidden shadow-xl mx-auto transition-all duration-1000"
        style={{ 
          background: myWaveGradient,
          backgroundSize: '200% 200%',
          animation: 'gradientShift 15s ease infinite'
        }}
      >
        <style>{`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
        
        {/* Размытые градиентные пятна */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-10 -left-10 w-64 h-64 bg-white/20 rounded-full blur-3xl opacity-40 animate-pulse" />
          <div className="absolute top-1/2 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl opacity-30" />
          <div className="absolute -bottom-10 left-1/2 w-64 h-64 bg-white/20 rounded-full blur-3xl opacity-40" />
        </div>

        {/* Контент */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-4 px-4">
          <button
            onClick={handleMyWavePlay}
            disabled={isGenerating}
            className={`
              px-10 py-5 rounded-xl text-xl font-bold
              bg-white/95 hover:bg-white
              text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 via-orange-600 to-pink-600
              shadow-xl transition-all duration-300
              ${isGenerating ? 'opacity-75 cursor-not-allowed' : ''}
              ${isPlayingMyWave && !isGenerating ? 'scale-105 ring-4 ring-white/50' : 'hover:scale-105'}
            `}
          >
            <span className="flex items-center gap-3">
              {isGenerating ? (
                <>
                  <span className="text-2xl animate-spin">⏳</span>
                  Генерация...
                </>
              ) : (
                <>
                  <span className={`text-2xl ${isPlayingMyWave ? 'animate-pulse' : ''}`}>
                    {isPlayingMyWave ? '🔊' : '▶'}
                  </span>
                  Моя волна
                </>
              )}
            </span>
          </button>

          <button
            onClick={() => window.location.hash = '/ml/stats'}
            className="px-5 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-all"
          >
            📊 ML Статистика
          </button>

          <p className="text-white/95 text-base max-w-sm text-center font-medium">
            Персональная музыка, которая подходит именно вам
          </p>
        </div>
      </div>

      {/* Динамическая отрисовка секций из настроек */}
      {sections.map((section) => {
        // Жанры
        if (section.id === 'genres') {
          return (
            <div key={section.id} className="px-8 pb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">{section.title}</h2>
                <button
                  onClick={() => navigate('/genres')}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  Все жанры →
                </button>
              </div>

              {section.data && section.data.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {section.data
                    .filter((g: any) => g.songCount && g.songCount > 0)
                    .sort((a: any, b: any) => (b.songCount || 0) - (a.songCount || 0))
                    .slice(0, 16)
                    .map((genre: any) => (
                      <button
                        key={genre.value}
                        onClick={() => handleGenreClick(genre.value)}
                        disabled={isGenerating === genre.value}
                        className="relative overflow-hidden rounded-lg shadow-md transition-all duration-300 hover:scale-105 hover:shadow-lg disabled:opacity-50"
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${getGradient(genre.value)} opacity-90`} />
                        <div className="relative p-4 text-center text-white">
                          <h3 className="font-bold text-sm line-clamp-2">
                            {genre.value}
                          </h3>
                          {genre.songCount && (
                            <p className="text-xs opacity-80 mt-1">
                              {genre.songCount} треков
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Загрузка жанров...
                </div>
              )}
            </div>
          )
        }

        // Радио артистов
        if (section.id === 'artistRadio') {
          return (
            <div key={section.id} className="px-8 pb-6">
              <ArtistRadioCards />
            </div>
          )
        }

        // Остальные секции
        if (section.loader) {
          return <PreviewListFallback key={section.title} />
        }

        if (!section.data || !section.data?.list) return null

        return (
          <PreviewList
            key={section.title}
            title={section.title}
            moreRoute={section.route}
            moreTitle={section.routeText}
            list={section.data.list}
            type={section.type || 'albums'}
          />
        )
      })}

      {/* Новинки подписок - ЗАКОММЕНТИРОВАНО (не работает) */}
      {/* <div className="px-8 pb-6">
        <NewReleasesCard />
      </div> */}

      {/* Global Charts - ЗАКОММЕНТИРОВАНО (не работает) */}
      {/* <div className="px-8 pb-6">
        <GlobalChartsCard />
      </div> */}
    </div>
  )
}
