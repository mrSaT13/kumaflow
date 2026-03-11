import { useState } from 'react'
import { usePlayerActions } from '@/store/player.store'
import { generateDecadePlaylist, generateGenrePlaylist } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'

const decades = [
  { id: '80s', name: '80-е', icon: '📼', color: 'from-pink-500 to-purple-500' },
  { id: '90s', name: '90-е', icon: '📀', color: 'from-blue-500 to-cyan-500' },
  { id: '2000s', name: '2000-е', icon: '💿', color: 'from-green-500 to-emerald-500' },
  { id: '2010s', name: '2010-е', icon: '🎧', color: 'from-yellow-500 to-orange-500' },
  { id: '2020s', name: '2020-е', icon: '🎵', color: 'from-red-500 to-pink-500' },
]

const popularGenres = [
  { id: 'Рок', icon: '🎸', color: 'from-red-600 to-orange-600' },
  { id: 'Поп', icon: '🎤', color: 'from-pink-500 to-purple-500' },
  { id: 'Электронная', icon: '🎹', color: 'from-blue-500 to-indigo-500' },
  { id: 'Хип-хоп', icon: '🎤', color: 'from-green-500 to-teal-500' },
  { id: 'Джаз', icon: '🎺', color: 'from-yellow-600 to-amber-600' },
  { id: 'Классика', icon: '🎻', color: 'from-purple-600 to-violet-600' },
  { id: 'Метал', icon: '🤘', color: 'from-gray-700 to-gray-900' },
  { id: 'Инди', icon: '🌿', color: 'from-emerald-500 to-green-500' },
]

export default function GenreDecadePlaylists() {
  const { setSongList } = usePlayerActions()
  const [isGenerating, setIsGenerating] = useState<string | null>(null)

  const handlePlayDecade = async (decade: string) => {
    setIsGenerating(decade)
    try {
      const playlist = await generateDecadePlaylist(decade, 30)
      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        toast(`▶️ Запущено: Хиты ${decade}`, { type: 'success' })
      } else {
        toast('Не удалось найти треки этого десятилетия', { type: 'warning' })
      }
    } catch (error) {
      console.error('Failed to generate decade playlist:', error)
      toast('Ошибка при генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  const handlePlayGenre = async (genre: string) => {
    setIsGenerating(genre)
    try {
      const playlist = await generateGenrePlaylist(genre, 30)
      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        toast(`▶️ Запущено: ${genre}`, { type: 'success' })
      } else {
        toast(`Нет треков в жанре "${genre}"`, { type: 'warning' })
      }
    } catch (error) {
      console.error('Failed to generate genre playlist:', error)
      toast('Ошибка при генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  return (
    <div className="w-full px-8 py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">🎵 Плейлисты по эпохам и жанрам</h1>
        <p className="text-muted-foreground">
          Выберите десятилетие или жанр для генерации плейлиста
        </p>
      </div>

      {/* Десятилетия */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">📅 По десятилетиям</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {decades.map((decade) => (
            <Card
              key={decade.id}
              className={`cursor-pointer transition-all hover:scale-105 bg-gradient-to-br ${decade.color} text-white`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-4xl text-center">{decade.icon}</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="font-bold mb-3">{decade.name}</p>
                <Button
                  onClick={() => handlePlayDecade(decade.id)}
                  disabled={isGenerating === decade.id}
                  className="w-full bg-white/20 hover:bg-white/30 text-white"
                  size="sm"
                >
                  {isGenerating === decade.id ? '⏳' : '▶'}
                  {isGenerating === decade.id ? '...' : 'Слушать'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Жанры */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">🎭 По жанрам</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {popularGenres.map((genre) => (
            <Card
              key={genre.id}
              className={`cursor-pointer transition-all hover:scale-105 bg-gradient-to-br ${genre.color} text-white`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-3xl text-center">{genre.icon}</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="font-bold mb-3">{genre.id}</p>
                <Button
                  onClick={() => handlePlayGenre(genre.id)}
                  disabled={isGenerating === genre.id}
                  className="w-full bg-white/20 hover:bg-white/30 text-white"
                  size="sm"
                >
                  {isGenerating === genre.id ? '⏳' : '▶'}
                  {isGenerating === genre.id ? '...' : 'Слушать'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
