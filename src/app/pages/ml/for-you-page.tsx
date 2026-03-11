import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { useML } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { useExternalApi } from '@/store/external-api.store'
import { useArtistSubscriptions } from '@/store/artist-subscriptions.store'
import { generateDailyMix, generateDiscoverWeekly, generateMyWavePlaylist, generateSimilarArtistsPlaylist, generateDecadePlaylist, generateGenrePlaylist, generateMLRecommendations, generateTimeOfDayMix, generateActivityMix, generateBecauseYouListened, generateMoodMix, generateVibeMix, generateNewReleasesPlaylist } from '@/service/ml-wave-service'
import { getRandomSongs, getTopSongs } from '@/service/subsonic-api'
import { subsonic } from '@/service/subsonic'
import { httpClient } from '@/api/httpClient'
import { lastFmService } from '@/service/lastfm-api'
import { toast } from 'react-toastify'
import { trackEvent } from '@/service/ml-event-tracker'
import styles from './for-you-page.module.css'
import { getGenreColor } from '@/utils/genreColors'
import { InstantMixModal } from '@/app/components/ml/instant-mix-modal'
import { SongAlchemyModal } from '@/app/components/ml/song-alchemy-modal'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'

interface MLPlaylistCard {
  id: string
  title: string
  description: string
  icon: string
  color?: string
  trackCount?: number
  type: 'daily-mix' | 'discover-weekly' | 'my-wave' | 'trends' | 'new-releases' | 'similar-artists' | 'decade' | 'genre' | 'disliked' | 'time-of-day' | 'workout' | 'focus' | 'chill' | 'because-you-listened' | 'instant-mix' | 'ml-recommendations' | 'mood' | 'vibe-similarity' | 'new-releases-subscriptions'
  decade?: string
  genre?: string
  mood?: string
}

export default function MLForYouPage() {
  const [activeTab, setActiveTab] = useState<'for-you' | 'trends' | 'discover'>('for-you')
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [isInstantMixOpen, setIsInstantMixOpen] = useState(false)
  const [isAlchemyOpen, setIsAlchemyOpen] = useState(false)

  const { getProfile, ratings } = useML()
  const { setSongList } = usePlayerActions()
  const { addPlaylist, getPlaylist } = useMLPlaylistsStateActions()
  const { settings } = useExternalApi()

  // Activity Mixer - Миксы для занятий (11 типов, без дублей с Mood)
  const activityMixers = [
    { id: 'meditation', name: '🧘 Медитация', color: 'from-indigo-600 to-purple-700', icon: '🧘' },
    { id: 'deepwork', name: '📚 Глубокая работа', color: 'from-blue-600 to-cyan-700', icon: '📚' },
    { id: 'running', name: '🏃 Бег', color: 'from-red-600 to-orange-700', icon: '🏃' },
    { id: 'workout', name: '🏋️ Силовая', color: 'from-red-700 to-red-900', icon: '🏋️' },
    { id: 'cycling', name: '🚴 Вело', color: 'from-green-500 to-teal-600', icon: '🚴' },
    { id: 'creativity', name: '🎨 Творчество', color: 'from-pink-500 to-rose-600', icon: '🎨' },
    { id: 'cooking', name: '🍳 Кулинария', color: 'from-yellow-500 to-orange-600', icon: '🍳' },
    { id: 'reading', name: '🌙 Чтение', color: 'from-slate-600 to-gray-700', icon: '🌙' },
    { id: 'gaming', name: '🎮 Гейминг', color: 'from-violet-600 to-purple-700', icon: '🎮' },
    { id: 'sleep', name: '🛁 Сон', color: 'from-blue-800 to-indigo-900', icon: '🛁' },
    { id: 'acoustic', name: '🎸 Акустика', color: 'from-amber-600 to-yellow-700', icon: '🎸' },
  ]

  const handleActivityClick = async (activity: string) => {
    setIsGenerating(activity)
    try {
      const profile = getProfile()
      const likedSongIds = profile.likedSongs
      const preferredGenres = profile.preferredGenres

      const activityPlaylist = await generateActivityMix(activity, likedSongIds, ratings, preferredGenres, 25)
      setSongList(activityPlaylist.songs, 0)

      // Отправляем событие для статистики оркестратора
      window.dispatchEvent(new CustomEvent('playlist_generated'))
      trackEvent('playlist_generated', { type: `activity-${activity}`, songCount: activityPlaylist.songs.length })
      
      const activityName = activityMixers.find(a => a.id === activity)?.name || activity
      toast(`🎵 ${activityName} сгенерирован!`, { type: 'success' })
    } catch (error) {
      console.error('Activity mix error:', error)
      toast('Ошибка генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  // Mood Mixer - настоящие настроения (6 типов, без дублей с Activity)
  const moodMixers = [
    { id: 'happy', name: '😊 Счастливое', color: 'from-yellow-400 to-orange-500', icon: '😊' },
    { id: 'sad', name: '😢 Грустное', color: 'from-blue-600 to-indigo-700', icon: '😢' },
    { id: 'energetic', name: '⚡ Энергичное', color: 'from-red-500 to-pink-600', icon: '⚡' },
    { id: 'party', name: '🎉 Вечеринка', color: 'from-purple-500 to-pink-500', icon: '🎉' },
    { id: 'melancholy', name: '🌧️ Меланхолия', color: 'from-gray-600 to-slate-700', icon: '🌧️' },
    { id: 'aggressive', name: '🔥 Агрессивное', color: 'from-red-700 to-orange-800', icon: '🔥' },
  ]

  const handleMoodClick = async (mood: string) => {
    setIsGenerating(mood)
    try {
      const profile = getProfile()
      const likedSongIds = profile.likedSongs
      const preferredGenres = profile.preferredGenres

      const moodPlaylist = await generateMoodMix(likedSongIds, ratings, preferredGenres, mood, 25)
      setSongList(moodPlaylist.songs, 0)

      // Отправляем событие для статистики оркестратора
      window.dispatchEvent(new CustomEvent('playlist_generated'))
      trackEvent('playlist_generated', { type: `mood-${mood}`, songCount: moodPlaylist.songs.length })
      
      const moodName = moodMixers.find(m => m.id === mood)?.name || mood
      toast(`🎵 ${moodName} сгенерирован!`, { type: 'success' })
    } catch (error) {
      console.error('Mood mix error:', error)
      toast('Ошибка генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  const handlePlayPlaylist = async (playlist: MLPlaylistCard) => {
    setIsGenerating(playlist.id)
    
    try {
      const profile = getProfile()
      const likedSongIds = profile.likedSongs
      const preferredGenres = profile.preferredGenres
      const preferredArtists = profile.preferredArtists
      const dislikedSongIds = profile.dislikedSongs

      let songs: ISong[] = []

      // Генерируем плейлист в зависимости от типа
      switch (playlist.type) {
        case 'instant-mix':
          // Открываем модальное окно поиска
          setIsInstantMixOpen(true)
          setIsGenerating(null)
          return
        
        case 'song-alchemy':
          // Открываем модальное окно Song Alchemy
          setIsAlchemyOpen(true)
          setIsGenerating(null)
          return
        
        case 'ml-recommendations':
          const mlRecs = await generateMLRecommendations(
            likedSongIds,
            ratings,
            preferredGenres,
            profile.preferredArtists,
            25
          )
          songs = mlRecs.songs
          trackEvent('playlist_generated', { type: 'ml-recommendations', songCount: songs.length })
          toast('🤖 ML Рекомендации сгенерированы!', { type: 'success' })
          break

        case 'disliked':
          // Плейлист из дизлайкнутых треков
          if (dislikedSongIds.length === 0) {
            toast('Пока нет дизлайкнутых треков', { type: 'info' })
            setIsGenerating(null)
            return
          }
          const dislikedSongs = await Promise.all(
            dislikedSongIds.map(id => subsonic.songs.getSong(id).catch(() => null))
          )
          songs = dislikedSongs.filter((s): s is ISong => s !== null)
          toast(`▶️ Запущено: Дизлайки (${songs.length} треков)`, { type: 'success' })
          break

        case 'new-releases-subscriptions':
          // Новинки из подписанных артистов
          const newReleasesSubs = await generateNewReleasesPlaylist(25)
          songs = newReleasesSubs.songs

          if (songs.length === 0) {
            toast('Нет новых треков от подписанных артистов', { type: 'info' })
            setIsGenerating(null)
            return
          }

          trackEvent('playlist_generated', {
            type: 'new-releases-subscriptions',
            songCount: songs.length,
            subscriptionsCount: useArtistSubscriptions.getState().subscriptions.length,
          })
          toast(`🎵 Новинки подписок: ${songs.length} треков`, { type: 'success' })
          break

        case 'daily-mix':
          const dailyMix = await generateDailyMix(likedSongIds, preferredGenres, 25)
          songs = dailyMix.playlist.songs
          addPlaylist({
            id: dailyMix.metadata.id,
            type: 'daily-mix',
            name: dailyMix.metadata.name,
            description: dailyMix.metadata.description,
            songs: dailyMix.playlist.songs,
            createdAt: dailyMix.metadata.createdAt,
            expiresAt: dailyMix.metadata.expiresAt,
          })
          trackEvent('playlist_generated', { type: 'daily-mix', songCount: songs.length })
          break

        case 'discover-weekly':
          const discover = await generateDiscoverWeekly(likedSongIds, preferredGenres, 20)
          songs = discover.playlist.songs
          addPlaylist({
            id: discover.metadata.id,
            type: 'discover-weekly',
            name: discover.metadata.name,
            description: discover.metadata.description,
            songs: discover.playlist.songs,
            createdAt: discover.metadata.createdAt,
            expiresAt: discover.metadata.expiresAt,
          })
          break

        case 'my-wave':
          const myWave = await generateMyWavePlaylist(likedSongIds, ratings, 25)
          songs = myWave.songs
          trackEvent('playlist_generated', { type: 'my-wave', songCount: songs.length })
          toast('🌊 Моя волна сгенерирована!', { type: 'success' })
          break

        case 'vibe-similarity':
          // Получаем все треки для анализа
          const allSongs = await getRandomSongs(100)
          if (allSongs.length === 0) {
            toast('Нет треков для анализа', { type: 'info' })
            setIsGenerating(null)
            return
          }
          
          // Берём последние 5 лайкнутых треков для усреднения
          let seedTrackId: string
          if (likedSongIds.length >= 5) {
            // Берём последние 5
            const recentLiked = likedSongIds.slice(-5)
            // Выбираем случайный из них
            seedTrackId = recentLiked[Math.floor(Math.random() * recentLiked.length)]
            console.log('[VibeMix] Using recent liked tracks:', recentLiked)
          } else if (likedSongIds.length > 0) {
            // Если мало лайков, берём случайный
            seedTrackId = likedSongIds[Math.floor(Math.random() * likedSongIds.length)]
          } else {
            // Если нет лайков, берём первый трек
            seedTrackId = allSongs[0].id
          }
          
          const vibePlaylist = await generateVibeMix(seedTrackId, allSongs, 25)
          songs = vibePlaylist.songs
          trackEvent('playlist_generated', { type: 'vibe-similarity', songCount: songs.length })
          toast('🎵 Vibe Similarity сгенерирован на основе ваших лайков!', { type: 'success' })
          break

        case 'time-of-day':
          const timeMix = await generateTimeOfDayMix(likedSongIds, ratings, preferredGenres, 25)
          songs = timeMix.songs
          trackEvent('playlist_generated', { type: 'time-of-day', songCount: songs.length, timeOfDay: timeMix.timeOfDay })
          toast(`${timeMix.name} сгенерирован!`, { type: 'success' })
          break

        case 'because-you-listened':
          const bclPlaylist = await generateBecauseYouListened(likedSongIds, ratings, preferredArtists, 25)
          songs = bclPlaylist.songs
          trackEvent('playlist_generated', { type: 'because-you-listened', songCount: songs.length })
          toast('🎵 Потому что вы слушали... сгенерировано!', { type: 'success' })
          break

        case 'trends':
          // 1. Локальные треки с playCount
          const localTopTracks = Object.entries(ratings)
            .filter(([_, rating]) => rating.playCount > 0)
            .sort((a, b) => (b[1] as any).playCount - (a[1] as any).playCount)
            .slice(0, 10)
            .map(([id]) => id)

          // 2. Топ из Navidrome
          let navidromeTopSongs: ISong[] = []
          try {
            const navidromeTop = await getTopSongs('', 15)
            navidromeTopSongs = await Promise.all(
              navidromeTop.map(song => subsonic.songs.getSong(song.id).catch(() => null))
            ).then(results => results.filter((s): s is ISong => s !== null))
            console.log(`[Trends] Navidrome: ${navidromeTopSongs.length} треков`)
          } catch (error) {
            console.warn('[Trends] Failed to get Navidrome top songs:', error)
          }

          // 3. Last.fm Global Top (если включен)
          let lastFmSongs: ISong[] = []
          let lastFmSimilarTracks: ISong[] = []
          if (settings.lastFmEnabled && lastFmService.isInitialized()) {
            try {
              // Получаем глобальный топ из Last.fm
              const lastFmTop = await lastFmService.getGlobalTopTracks(20)
              console.log(`[Trends] Last.fm Global Top: ${lastFmTop.length} треков`)

              // Ищем эти треки в Navidrome
              for (const lastFmTrack of lastFmTop) {
                if (lastFmSongs.length >= 5) break // Максимум 5 точных совпадений

                // Ищем трек по названию и артисту в Navidrome
                try {
                  const searchResponse = await httpClient<{
                    searchResult3?: {
                      song?: { song: any[] }
                      artist?: { artist: any[] }
                    }
                  }>('search3', {
                    query: {
                      query: `${lastFmTrack.artist} ${lastFmTrack.name}`,
                      songCount: '5',
                      artistCount: '0',
                      albumCount: '0',
                    },
                  })

                  const foundSongs = searchResponse?.data?.searchResult3?.song?.song || []
                  if (foundSongs.length > 0) {
                    // Проверяем совпадение по названию
                    const matchedSong = foundSongs.find(s =>
                      s.title.toLowerCase().includes(lastFmTrack.name.toLowerCase()) ||
                      lastFmTrack.name.toLowerCase().includes(s.title.toLowerCase())
                    )

                    if (matchedSong && !navidromeTopSongs.find(s => s.id === matchedSong.id)) {
                      const songDetails = await subsonic.songs.getSong(matchedSong.id).catch(() => null)
                      if (songDetails && !lastFmSongs.find(s => s.id === songDetails.id)) {
                        lastFmSongs.push(songDetails)
                        console.log(`[Trends] ✓ Найдено: "${lastFmTrack.artist} - ${lastFmTrack.name}" → "${songDetails.title}"`)
                      }
                    }
                  }
                  
                  // Если трек не найден, ищем похожие у похожих артистов
                  if (lastFmSongs.length < 5 && lastFmSimilarTracks.length < 5) {
                    const similarTracks = await lastFmService.getSimilarTracks(lastFmTrack.name, lastFmTrack.artist, 5)
                    console.log(`[Trends] Не найдено "${lastFmTrack.name}", ищем похожие: ${similarTracks.length}`)
                    
                    for (const similarTrack of similarTracks) {
                      if (lastFmSimilarTracks.length >= 5) break
                      
                      try {
                        const similarSearch = await httpClient<{
                          searchResult3?: {
                            song?: { song: any[] }
                          }
                        }>('search3', {
                          query: {
                            query: `${similarTrack.artist} ${similarTrack.name}`,
                            songCount: '3',
                            artistCount: '0',
                            albumCount: '0',
                          },
                        })
                        
                        const foundSongs = similarSearch?.data?.searchResult3?.song?.song || []
                        if (foundSongs.length > 0) {
                          const matchedSong = foundSongs[0]
                          const songDetails = await subsonic.songs.getSong(matchedSong.id).catch(() => null)
                          
                          if (songDetails && 
                              !lastFmSongs.find(s => s.id === songDetails.id) &&
                              !lastFmSimilarTracks.find(s => s.id === songDetails.id) &&
                              !navidromeTopSongs.find(s => s.id === songDetails.id)) {
                            lastFmSimilarTracks.push(songDetails)
                            console.log(`[Trends] ~ Похожее: "${similarTrack.artist} - ${similarTrack.name}" → "${songDetails.title}"`)
                          }
                        }
                      } catch (error) {
                        console.warn(`[Trends] Search similar error:`, error)
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[Trends] Search error for "${lastFmTrack.artist} - ${lastFmTrack.name}":`, error)
                }
              }
              console.log(`[Trends] Last.fm: найдено ${lastFmSongs.length} точных + ${lastFmSimilarTracks.length} похожих треков`)
            } catch (error) {
              console.warn('[Trends] Last.fm error:', error)
            }
          }

          // 4. Комбинируем все источники
          const allSongIds = [...localTopTracks]

          // Добавляем треки из Navidrome которых нет в локальных
          for (const song of navidromeTopSongs) {
            if (!allSongIds.includes(song.id) && allSongIds.length < 25) {
              allSongIds.push(song.id)
            }
          }

          // Добавляем точные совпадения из Last.fm
          for (const song of lastFmSongs) {
            if (!allSongIds.includes(song.id) && allSongIds.length < 25) {
              allSongIds.push(song.id)
            }
          }

          // Добавляем похожие треки из Last.fm (если точных мало)
          for (const song of lastFmSimilarTracks) {
            if (!allSongIds.includes(song.id) && allSongIds.length < 25) {
              allSongIds.push(song.id)
            }
          }

          if (allSongIds.length === 0) {
            toast('Пока нет прослушанных треков', { type: 'info' })
            setIsGenerating(null)
            return
          }

          const trendSongs = await Promise.all(
            allSongIds.map(id => subsonic.songs.getSong(id).catch(() => null))
          )
          songs = trendSongs.filter((s): s is ISong => s !== null)

          const exactCount = lastFmSongs.filter(s => allSongIds.includes(s.id)).length
          const similarCount = lastFmSimilarTracks.filter(s => allSongIds.includes(s.id)).length
          
          if (exactCount > 0 || similarCount > 0) {
            const parts = []
            if (exactCount > 0) parts.push(`${exactCount} из Last.fm`)
            if (similarCount > 0) parts.push(`${similarCount} похожих`)
            toast(`▶️ Популярное: ${songs.length} треков (${parts.join(', ')})`, { type: 'success' })
          } else {
            toast(`▶️ Запущено: Популярное (${songs.length} треков)`, { type: 'success' })
          }
          break

        case 'new-releases':
          // Получаем случайные треки (имитация новинок)
          const newReleasesSongs = await getRandomSongs(30)
          songs = newReleasesSongs
          toast('▶️ Запущено: Новинки', { type: 'success' })
          break

        case 'similar-artists':
          // Генерируем на основе случайного артиста из лайкнутых
          const likedArtists = Object.keys(profile.preferredArtists)
          if (likedArtists.length === 0) {
            toast('Сначала выберите артистов в холодном старте', { type: 'warning' })
            setIsGenerating(null)
            return
          }
          const randomArtistId = likedArtists[Math.floor(Math.random() * likedArtists.length)]
          const similarPlaylist = await generateSimilarArtistsPlaylist(randomArtistId, 25)
          songs = similarPlaylist.songs
          trackEvent('radio_started', { type: 'similar-artists', artistId: randomArtistId, songCount: songs.length })
          toast('🎵 Похожих исполнителей сгенерировано!', { type: 'success' })
          break

        case 'decade':
          if (!playlist.decade) return
          const decadePlaylist = await generateDecadePlaylist(playlist.decade, 30)
          songs = decadePlaylist.songs
          toast(`📻 Хиты ${playlist.title} сгенерированы!`, { type: 'success' })
          break

        case 'genre':
          if (!playlist.genre) return
          const genrePlaylist = await generateGenrePlaylist(playlist.genre, 30)
          songs = genrePlaylist.songs
          toast(`🎵 ${playlist.title} сгенерировано!`, { type: 'success' })
          break

        default:
          toast('Этот плейлист ещё не готов', { type: 'info' })
          setIsGenerating(null)
          return
      }

      if (songs && songs.length > 0) {
        setSongList(songs, 0)
        toast(`▶️ Запущено: ${playlist.title}`, { type: 'success' })
      } else {
        toast('Не удалось сгенерировать плейлист', { type: 'error' })
      }
    } catch (error) {
      console.error('Ошибка генерации плейлиста:', error)
      toast('Ошибка при генерации плейлиста', { type: 'error' })
    } finally {
      setIsGenerating(null)
    }
  }

  const playlistsByTab: Record<string, MLPlaylistCard[]> = {
    'for-you': [
      {
        id: 'time-of-day',
        title: '🕐 Микс по времени суток',
        description: 'Подборка под текущее время дня',
        icon: '🕐',
        color: 'from-blue-400 via-purple-400 to-pink-400',
        type: 'time-of-day'
      },
      {
        id: 'instant-mix',
        title: '⚡ Instant Mix',
        description: 'Микс на основе трека, артиста или жанра',
        icon: '🎯',
        color: 'from-purple-600 to-pink-600',
        type: 'instant-mix'
      },
      {
        id: 'ml-recommendations',
        title: 'ML Рекомендации',
        description: 'Попытка угадать что вам понравится',
        icon: '🤖',
        color: 'from-indigo-500 to-purple-600',
        type: 'ml-recommendations'
      },
      { 
        id: 'my-wave', 
        title: 'Моя волна', 
        description: 'Персональный плейлист на основе ваших предпочтений', 
        icon: '🌊', 
        color: 'from-yellow-400 via-orange-400 to-pink-500',
        type: 'my-wave'
      },
      { 
        id: 'daily-mix-1', 
        title: 'Ежедневный микс', 
        description: 'Обновляется каждые 24 часа', 
        icon: '✨', 
        color: 'from-purple-500 to-pink-500',
        type: 'daily-mix'
      },
      {
        id: 'discover-weekly',
        title: 'Открытия недели',
        description: 'Новые треки для вас каждую неделю',
        icon: '🧭',
        color: 'from-green-500 to-emerald-500',
        type: 'discover-weekly'
      },
      {
        id: 'because-you-listened',
        title: '🎵 Потому что вы слушали...',
        description: 'На основе ваших любимых артистов',
        icon: '💕',
        color: 'from-pink-400 to-rose-500',
        type: 'because-you-listened'
      },
      {
        id: 'vibe-similarity',
        title: '🎵 Vibe Similarity',
        description: 'Похожие треки по аудио-признакам',
        icon: '🎵',
        color: 'from-indigo-500 to-purple-600',
        type: 'vibe-similarity'
      },
      {
        id: 'new-releases-subscriptions',
        title: '🎵 Новинки подписок',
        description: 'Новые треки от подписанных артистов',
        icon: '🆕',
        color: 'from-green-500 via-emerald-500 to-teal-500',
        type: 'new-releases-subscriptions'
      },
      {
        id: 'song-alchemy',
        title: '🧪 Song Alchemy',
        description: 'Создайте плейлист по параметрам настроения',
        icon: '✨',
        color: 'from-purple-600 to-pink-600',
        type: 'song-alchemy'
      },
      {
        id: 'disliked',
        title: 'Дизлайки',
        description: 'Треки которые вам не понравились',
        icon: '👎',
        color: 'from-gray-600 to-gray-800',
        type: 'disliked'
      },
    ],
    'trends': [
      {
        id: 'top-tracks',
        title: 'Популярное',
        description: 'Чаще всего слушают в вашей библиотеке',
        icon: '📈',
        color: 'from-red-500 to-orange-500',
        type: 'trends'
      },
    ],
    'discover': [
      {
        id: 'new-releases',
        title: 'Новинки',
        description: 'Свежие релизы любимых жанров',
        icon: '🆕',
        color: 'from-indigo-500 to-purple-500',
        type: 'new-releases'
      },
      {
        id: 'similar-artists',
        title: 'Похожие исполнители',
        description: 'Откройте новое на основе ваших лайков',
        icon: '🎵',
        color: 'from-pink-500 to-rose-500',
        type: 'similar-artists'
      },
      // Десятилетия
      {
        id: '80s',
        title: '80-е',
        description: 'Хиты 1980-1989',
        icon: '📼',
        color: 'from-pink-500 to-purple-600',
        type: 'decade',
        decade: '80s'
      },
      {
        id: '90s',
        title: '90-е',
        description: 'Хиты 1990-1999',
        icon: '📀',
        color: 'from-blue-500 to-cyan-600',
        type: 'decade',
        decade: '90s'
      },
      {
        id: '2000s',
        title: '2000-е',
        description: 'Хиты 2000-2009',
        icon: '💿',
        color: 'from-green-500 to-emerald-600',
        type: 'decade',
        decade: '2000s'
      },
      {
        id: '2010s',
        title: '2010-е',
        description: 'Хиты 2010-2019',
        icon: '🎧',
        color: 'from-yellow-500 to-orange-600',
        type: 'decade',
        decade: '2010s'
      },
      {
        id: '2020s',
        title: '2020-е',
        description: 'Хиты 2020-2029',
        icon: '🎵',
        color: 'from-red-500 to-pink-600',
        type: 'decade',
        decade: '2020s'
      },
    ],
  }

  const currentPlaylists = playlistsByTab[activeTab]

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {activeTab === 'for-you' && '✨ Для вас'}
          {activeTab === 'trends' && '📈 Тренды'}
          {activeTab === 'discover' && '🧭 Открытия'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeTab === 'for-you' && 'Персональные рекомендации на основе ваших предпочтений'}
          {activeTab === 'trends' && 'Популярное в вашей библиотеке'}
          {activeTab === 'discover' && 'Новые треки, исполнители и хиты десятилетий'}
        </p>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 border-b border-border">
        <button
          className={`px-4 py-2 font-medium transition-colors rounded-t-lg ${
            activeTab === 'for-you' ? 'text-primary border-b-2 border-primary bg-muted' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('for-you')}
        >
          Для вас
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors rounded-t-lg ${
            activeTab === 'trends' ? 'text-primary border-b-2 border-primary bg-muted' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('trends')}
        >
          Тренды
        </button>
        <button
          className={`px-4 py-2 font-medium transition-colors rounded-t-lg ${
            activeTab === 'discover' ? 'text-primary border-b-2 border-primary bg-muted' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('discover')}
        >
          Открытия
        </button>
      </div>

      {/* Сетка плейлистов */}
      <div className={styles.grid}>
        {currentPlaylists.map((playlist) => {
          // Генерируем градиент для каждой карточки
          let cardGradient = playlist.color || 'from-gray-600 to-gray-800'

          // Для жанров используем точные цвета из genreColors
          if (playlist.type === 'genre' && playlist.genre) {
            const genreColor = getGenreColor(playlist.genre)
            return (
              <div
                key={playlist.id}
                className={`${styles.card} ${styles.animatedGradient} ${isGenerating === playlist.id ? 'opacity-75' : ''}`}
                style={{
                  background: `linear-gradient(-45deg, ${genreColor}, ${genreColor}DD, ${genreColor}BB, ${genreColor})`,
                  backgroundSize: '400% 400%',
                }}
              >
                <div className={styles.content}>
                  <span className={styles.icon}>{playlist.icon}</span>
                  <h3 className={styles.title}>{playlist.title}</h3>
                  <p className={styles.description}>{playlist.description}</p>
                  {isGenerating === playlist.id && (
                    <span className={styles.generating}>⏳ Генерация...</span>
                  )}
                </div>
                <button
                  className={styles.playButton}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlayPlaylist(playlist)
                  }}
                  disabled={isGenerating !== null}
                >
                  {isGenerating === playlist.id ? '⏳' : '▶'}
                </button>
              </div>
            )
          }

          return (
            <div
              key={playlist.id}
              className={`${styles.card} bg-gradient-to-br ${cardGradient} ${styles.animatedGradient} ${isGenerating === playlist.id ? 'opacity-75' : ''}`}
            >
              <div className={styles.content}>
                <span className={styles.icon}>{playlist.icon}</span>
                <h3 className={styles.title}>{playlist.title}</h3>
                <p className={styles.description}>{playlist.description}</p>
                {isGenerating === playlist.id && (
                  <span className={styles.generating}>⏳ Генерация...</span>
                )}
              </div>
              <button
                className={styles.playButton}
                onClick={(e) => {
                  e.stopPropagation()
                  handlePlayPlaylist(playlist)
                }}
                disabled={isGenerating !== null}
              >
                {isGenerating === playlist.id ? '⏳' : '▶'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Mood Mixer - Сетка настроений */}
      {activeTab === 'for-you' && (
        <Card className="bg-gradient-to-br from-purple-900/50 to-indigo-900/50 border-purple-500/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <span className="text-2xl">🎭</span>
              Миксы по настроению
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Выберите настроение и получите персональный плейлист
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-3">
              {moodMixers.map((mood) => (
                <button
                  key={mood.id}
                  onClick={() => handleMoodClick(mood.id)}
                  disabled={isGenerating !== null}
                  className={`
                    relative overflow-hidden rounded-lg p-4 text-center
                    bg-gradient-to-br ${mood.color}
                    hover:scale-105 transition-transform duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg hover:shadow-xl
                    backdrop-blur-md
                    border border-white/30
                    before:absolute before:inset-0 before:bg-white/10 before:backdrop-blur-md before:pointer-events-none
                  `}
                >
                  <div className="relative z-10">
                    <div className="text-3xl mb-2">{mood.icon}</div>
                    <div className="text-sm font-medium text-white drop-shadow-lg">{mood.name}</div>
                  </div>
                  {isGenerating === mood.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                      <span className="text-white">⏳</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Mixer - Миксы для занятий */}
      {activeTab === 'for-you' && (
        <Card className="bg-gradient-to-br from-emerald-900/50 to-teal-900/50 border-emerald-500/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <span className="text-2xl">🏃</span>
              Миксы для занятий
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              12 плейлистов для разных активностей (BPM и energy оптимизированы)
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {activityMixers.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => handleActivityClick(activity.id)}
                  disabled={isGenerating !== null}
                  className={`
                    relative overflow-hidden rounded-lg p-3 text-center
                    bg-gradient-to-br ${activity.color}
                    hover:scale-105 transition-transform duration-200
                    disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg hover:shadow-xl
                    backdrop-blur-md
                    border border-white/30
                    before:absolute before:inset-0 before:bg-white/10 before:backdrop-blur-md before:pointer-events-none
                  `}
                >
                  <div className="relative z-10">
                    <div className="text-2xl mb-1">{activity.icon}</div>
                    <div className="text-xs font-medium text-white drop-shadow-lg">{activity.name}</div>
                  </div>
                  {isGenerating === activity.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                      <span className="text-white">⏳</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Модальное окно Instant Mix */}
      <InstantMixModal open={isInstantMixOpen} onClose={() => setIsInstantMixOpen(false)} />

      {/* Модальное окно Song Alchemy */}
      <SongAlchemyModal open={isAlchemyOpen} onClose={() => setIsAlchemyOpen(false)} />
    </div>
  )
}
