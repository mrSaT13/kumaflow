/**
 * Cold Start Onboarding - Геймифицированный холодный старт
 * Улучшенная версия с серьезным дизайном
 */

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { Progress } from '@/app/components/ui/progress'
import { Badge } from '@/app/components/ui/badge'
import { Card, CardContent } from '@/app/components/ui/card'
import { getGenres, getLimitedArtists, getFavoriteArtists, type SubsonicArtist } from '@/service/subsonic-api'
import { useML, useMLActions } from '@/store/ml.store'
import { useMLStore } from '@/store/ml.store'
import { subsonic } from '@/service/subsonic'
import { usePlayerActions } from '@/store/player.store'
import { generateArtistBasedPlaylist } from '@/service/ml-wave-service'
import { trackEvent } from '@/service/ml-event-tracker'
import { toast } from 'react-toastify'
import { Heart, Music, Trophy, Check, Sparkles, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Демо жанры
const DEMO_GENRES = [
  'Рок', 'Поп', 'Электронная', 'Хип-хоп', 'Джаз', 'Метал',
  'Инди', 'R&B', 'Классика', 'Блюз', 'Кантри', 'Фолк',
  'Регги', 'Соул', 'Фанк', 'Панк', 'Альтернатива', 'Амбиент',
  'Латина', 'K-Pop', 'J-Pop', 'Дэнс', 'Техно', 'Транс',
]

// Шаги онбординга
const ONBOARDING_STEPS = [
  {
    step: 1,
    title: 'Выберите любимые жанры',
    description: 'Коснитесь кружков с любимыми жанрами. Это поможет сделать рекомендации точнее и интереснее.',
    icon: Music,
    color: 'from-yellow-400 to-orange-500',
    reward: '+100 XP',
    minSelection: 3,
  },
  {
    step: 2,
    title: 'Выберите артистов',
    description: 'Отметь сердечком исполнителей, которые тебе нравятся.',
    icon: Heart,
    color: 'from-pink-400 to-red-500',
    reward: '+200 XP',
    minSelection: 5,
  },
  {
    step: 3,
    title: 'Профиль готов!',
    description: 'Твой персональный профиль создан! Теперь музыка будет подстраиваться под твой вкус.',
    icon: Trophy,
    color: 'from-purple-400 to-indigo-500',
    reward: '🎉 Бонус 500 XP!',
    minSelection: 0,
  },
]

export default function ColdStartOnboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [selectedArtists, setSelectedArtists] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)  // ДОБАВЛЕНО!

  // Данные
  const [genres, setGenres] = useState<string[]>(DEMO_GENRES)
  const [artists, setArtists] = useState<SubsonicArtist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMessage, setLoadingMessage] = useState('Загрузка...')

  const mlActions = useMLActions()
  const { setSongList } = usePlayerActions()

  // Загрузка данных
  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setLoadingMessage('Получаем жанры...')

      try {
        const genresData = await getGenres()
        if (genresData && genresData.length > 0) {
          setGenres(genresData.map(g => g.value))
        }

        setLoadingMessage('Получаем артисты...')
        const favoriteArtists = await getFavoriteArtists()
        const artistsData = await getLimitedArtists(100)

        if (favoriteArtists && favoriteArtists.length > 0) {
          setSelectedArtists(favoriteArtists.map(a => a.id))
          setArtists(favoriteArtists)
          
          const { initializeFromFavorites } = useMLStore.getState()
          initializeFromFavorites(favoriteArtists)
        } else {
          setArtists(artistsData || [])
        }

        setLoadingMessage('')
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Обработка выбора жанра
  const handleGenreSelect = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre]
    )
  }

  // Обработка выбора артиста
  const handleArtistSelect = (artistId: string) => {
    setSelectedArtists((prev) =>
      prev.includes(artistId)
        ? prev.filter((a) => a !== artistId)
        : [...prev, artistId]
    )
  }

  // Переход к следующему шагу
  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1)
    } else {
      handleComplete()
    }
  }

  // Завершение
  const handleComplete = async () => {
    setIsScanning(true)

    // Инициализация ML профиля
    const { initializeFromFavorites } = useMLStore.getState()
    if (artists.length > 0) {
      const favoriteArtists = artists.filter(a => selectedArtists.includes(a.id))
      initializeFromFavorites(favoriteArtists)
      
      // Инициализация жанров из артистов
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
            return { id: artist.id, name: artist.name, genres: [] }
          }
        })
      )
      
      const { initializeGenresFromNavidrome } = useMLStore.getState()
      initializeGenresFromNavidrome(artistsWithGenres)
    }

    // Анимация сканирования
    for (let i = 0; i <= 100; i += 5) {
      setScanProgress(i)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Генерация плейлиста с ОРКЕСТРАТОРОМ и Vibe Similarity!
    toast.info('🎵 Генерация персонального плейлиста...', {
      autoClose: 3000,
    })

    try {
      const playlist = await generateArtistBasedPlaylist(selectedArtists, 50)
      
      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        
        toast.success(`✅ Плейлист готов! ${playlist.songs.length} треков`, {
          autoClose: 5000,
        })
        
        // Помечаем как завершенное
        setIsComplete(true)
        
        // Трекаем событие
        trackEvent('onboarding_completed', {
          genres: selectedGenres.length,
          artists: selectedArtists.length,
        })
      } else {
        toast.error('❌ Не удалось сгенерировать плейлист', { autoClose: 5000 })
        setIsComplete(true)
      }
    } catch (error) {
      console.error('Failed to generate playlist:', error)
      toast.error('❌ Ошибка генерации плейлиста', { autoClose: 5000 })
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="w-full max-w-md space-y-6 p-6 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-white">Анализ предпочтений</h2>
          <p className="text-white/70">Генерация персонального плейлиста...</p>
          <Progress value={scanProgress} className="h-3" />
          <p className="text-white/70">{scanProgress}% завершено</p>
          
          {isComplete && (
            <Button 
              onClick={() => navigate('/')}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-500"
            >
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="w-full max-w-md space-y-6 p-6 text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-white">Загрузка...</h2>
          <p className="text-white/70">{loadingMessage}</p>
          <Progress value={undefined} className="h-3" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Прогресс бар */}
        <Card className="bg-white/10 border-white/20">
          <CardContent className="p-6 space-y-4">
            <Progress value={(step / 3) * 100} className="h-2" />
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {step === 1 && 'Выберите жанры'}
                  {step === 2 && 'Выберите артистов'}
                  {step === 3 && 'Готово к запуску'}
                </h1>
                <p className="text-white/70">
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
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-white/90">Минимум 3 жанра</span>
                <Badge className="text-lg px-4 py-2 bg-purple-500">
                  {selectedGenres.length} выбрано
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[500px] overflow-y-auto p-4">
                {genres.map((genre) => {
                  const isSelected = selectedGenres.includes(genre)
                  return (
                    <button
                      key={genre}
                      onClick={() => handleGenreSelect(genre)}
                      className={`
                        aspect-square rounded-lg flex items-center justify-center
                        transition-all duration-200
                        ${isSelected 
                          ? 'bg-purple-500 text-white shadow-lg' 
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }
                      `}
                    >
                      <span className="text-sm font-medium text-center px-2">{genre}</span>
                      {isSelected && <Check className="w-4 h-4 absolute top-2 right-2" />}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Шаг 2: Артисты */}
        {step === 2 && (
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-white/90">Минимум 5 артистов</span>
                <Badge className="text-lg px-4 py-2 bg-pink-500">
                  {selectedArtists.length} выбрано
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[500px] overflow-y-auto p-4">
                {artists.map((artist) => {
                  const isSelected = selectedArtists.includes(artist.id)
                  return (
                    <button
                      key={artist.id}
                      onClick={() => handleArtistSelect(artist.id)}
                      className={`
                        aspect-square rounded-lg flex flex-col items-center justify-center gap-2 p-3
                        transition-all duration-200
                        ${isSelected 
                          ? 'bg-pink-500 text-white shadow-lg' 
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }
                      `}
                    >
                      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl">
                        🎤
                      </div>
                      <span className="text-xs font-medium text-center line-clamp-2">{artist.name}</span>
                      {isSelected && <Check className="w-4 h-4 absolute top-2 right-2" />}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Шаг 3: Готово */}
        {step === 3 && (
          <Card className="bg-white/10 border-white/20">
            <CardContent className="p-8 space-y-6 text-center">
              <div className="text-6xl">🎵</div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-white">Всё готово!</h2>
                <p className="text-white/70">Персональный плейлист будет сгенерирован на основе:</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                <div className="p-4 rounded-lg bg-white/10">
                  <div className="text-3xl font-bold text-purple-400">{selectedGenres.length}</div>
                  <div className="text-sm text-white/70">жанров</div>
                </div>
                <div className="p-4 rounded-lg bg-white/10">
                  <div className="text-3xl font-bold text-pink-400">{selectedArtists.length}</div>
                  <div className="text-sm text-white/70">артистов</div>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500">
                <div className="text-lg font-bold text-white">ML профиль активирован</div>
                <div className="text-sm text-white/70">Оркестратор и Vibe Similarity включены</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Навигация */}
        <div className="flex justify-between pt-6 border-t border-white/20">
          <Button 
            variant="ghost" 
            onClick={() => setStep(step - 1)} 
            disabled={step === 1}
            className="text-white hover:bg-white/20"
          >
            Назад
          </Button>
          
          <Button 
            onClick={handleNext} 
            disabled={!canProceed()}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold px-8 py-6"
          >
            {step === 3 ? 'Запустить ▶' : 'Далее →'}
          </Button>
        </div>
      </div>
    </div>
  )
}
