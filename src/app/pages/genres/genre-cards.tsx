import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getGenres, getSongsByGenre } from '@/service/subsonic-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { toast } from 'react-toastify'
import { usePlayerActions } from '@/store/player.store'

interface Genre {
  value: string
  songCount?: number
  albumCount?: number
}

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
  'Funk': 'from-orange-600 via-red-600 to-pink-700',
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

export default function GenreCards() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const [genres, setGenres] = useState<Genre[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState<string | null>(null)

  useEffect(() => {
    async function loadGenres() {
      try {
        const genreList = await getGenres()
        // Сортируем по количеству песен
        const sorted = genreList
          .filter(g => g.songCount && g.songCount > 0)
          .sort((a, b) => (b.songCount || 0) - (a.songCount || 0))
        setGenres(sorted)
      } catch (error) {
        console.error('Failed to load genres:', error)
        toast.error('Не удалось загрузить жанры')
      } finally {
        setIsLoading(false)
      }
    }
    loadGenres()
  }, [])

  const handleGenreClick = async (genreName: string) => {
    setIsGenerating(genreName)
    try {
      console.log(`[GenreCards] Generating playlist for: ${genreName}`)
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

  const getGradient = (genreName: string): string => {
    // Пробуем точное совпадение
    if (GENRE_GRADIENTS[genreName]) {
      return GENRE_GRADIENTS[genreName]
    }
    
    // Пробуем частичное совпадение
    for (const [key, gradient] of Object.entries(GENRE_GRADIENTS)) {
      if (genreName.toLowerCase().includes(key.toLowerCase())) {
        return gradient
      }
    }
    
    // Дефолтный градиент
    return 'from-primary via-primary/80 to-primary/60'
  }

  if (isLoading) {
    return (
      <div className="w-full px-8 py-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">🎵 Жанры</h1>
          <p className="text-sm text-muted-foreground">
            Выберите жанр для воспроизведения
          </p>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-6xl animate-spin">⏳</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Жанры</h1>
        <p className="text-sm text-muted-foreground">
          Выберите жанр для воспроизведения
        </p>
      </div>

      {genres.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-4">
            <div className="text-6xl">🎵</div>
            <h2 className="text-xl font-bold">Нет жанров</h2>
            <p className="text-sm text-muted-foreground">
              Ваша библиотека пуста или жанры не определены
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {genres.map((genre) => {
            const gradient = getGradient(genre.value)
            const isGeneratingThis = isGenerating === genre.value
            
            return (
              <button
                key={genre.value}
                onClick={() => handleGenreClick(genre.value)}
                disabled={isGeneratingThis}
                className={`relative overflow-hidden rounded-lg shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-90`} />
                <div className="relative p-6 text-center text-white">
                  <div className="text-3xl mb-2">
                    {isGeneratingThis ? (
                      <span className="animate-spin inline-block">⏳</span>
                    ) : null}
                  </div>
                  <h3 className="font-bold text-lg mb-1 line-clamp-2">
                    {genre.value}
                  </h3>
                  {genre.songCount && (
                    <p className="text-sm opacity-80">
                      {genre.songCount} треков
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
