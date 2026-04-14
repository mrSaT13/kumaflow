import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'
import { trackEvent, trackNightListening, checkAchievements } from '@/service/ml-event-tracker'
import { timeAwareHistory } from '@/service/time-aware-history'
import { moodDriftDetector } from '@/service/mood-drift-detector'
import { myWaveDiscoveryTracker } from '@/service/mywave-discoveries'
import { trackScorer } from '@/service/track-scorer'
import { usePlayerStore } from '@/store/player.store'

export interface TrackRating {
  songId: string
  songInfo?: {
    title?: string
    artist?: string
    artistId?: string
    genre?: string
    album?: string
  }
  like: boolean | null
  playCount: number
  skipCount: number
  lastPlayed: string | null
  // Audio analysis features
  bpm?: number
  energy?: number
  danceability?: number
  valence?: number
  acousticness?: number
  // Scoring system (Яндекс-подобная)
  score?: number // Общий вес трека (накапливается)
  replayCount?: number // Количество прослушиваний подряд (сильный сигнал)
  lastSkipTime?: number // Время когда пропустил (для анализа когда именно)
  // Temporal patterns
  hourPlayed?: number[] // В какие часы слушал (0-23)
  // Novelty tracking
  lastPlayedDate?: string // Дата последнего воспроизведения (YYYY-MM-DD)
  playsToday?: number // Сколько раз слушал сегодня
  daysSinceLastPlay?: number // Дней с последнего воспроизведения
  dayPlayed?: number[] // В какие дни недели слушал (0-6)
  // Novelty score
  firstHeard?: string // Когда впервые услышал
  noveltyScore?: number // Насколько трек "новый" для пользователя
}

export interface MLProfile {
  preferredGenres: Record<string, number>
  preferredArtists: Record<string, number>
  likedSongs: string[]
  dislikedSongs: string[]
  bannedArtists: string[]  // Полностью заблокированные артисты
  listeningHistory: TrackRating[]
}

interface MLStore {
  ratings: Record<string, TrackRating>
  profile: MLProfile

  // Actions
  rateSong: (songId: string, like: boolean | null, songInfo?: TrackRating['songInfo']) => Promise<void>
  incrementPlayCount: (songId: string, playProgress?: number) => void
  incrementSkipCount: (songId: string, skipTime?: number) => Promise<void>
  updateLastPlayed: (songId: string) => void
  saveTrackAnalysis: (songId: string, analysis: { bpm?: number; energy?: number; danceability?: number; valence?: number; acousticness?: number }) => void
  recordReplay: (songId: string) => Promise<void> // Записать повторное прослушивание
  calculateTrackScore: (songId: string) => number // Рассчитать вес трека
  calculateNoveltyScore: (songId: string) => number // Рассчитать novelty score
  getTemporalPatterns: (songId: string) => { preferredHours: number[], preferredDays: number[] } // Получить временные паттерны
  getProfile: () => MLProfile
  resetProfile: () => void
  exportProfile: () => string
  exportMLData: () => Promise<string>  // Расширенный экспорт ML-данных
  importProfile: (data: string) => void
  initializeFromFavorites: (favoriteArtists: { id: string; name: string }[]) => void
  initializeGenresFromNavidrome: (artists: { id: string; name: string; genres?: string[] }[]) => void
  banArtist: (artistId: string, artistName: string) => void  // Заблокировать артиста
  unbanArtist: (artistId: string, artistName: string) => void  // Разблокировать артиста
  addArtistGenres: (artistId: string, artistName: string, genres: Array<{ name: string; weight: number }>) => void  // Добавить жанры артиста
  addTrackMoods: (trackId: string, moods: Array<{ name: string; weight: number }>) => void  // Добавить настроения трека
  applyDecayFactor: () => void  // Применить затухание весов
}

const defaultProfile: MLProfile = {
  preferredGenres: {},
  preferredArtists: {},
  likedSongs: [],
  dislikedSongs: [],
  bannedArtists: [],  // По умолчанию нет заблокированных
  listeningHistory: [],
}

export const useMLStore = createWithEqualityFn<MLStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          ratings: {},
          profile: defaultProfile,

          rateSong: async (songId, like, songInfo) => {
            // Сначала синхронное обновление state
            set((state) => {
              const existingRating = state.ratings[songId]
              const today = new Date().toISOString().split('T')[0]
              const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

              // Считаем daysSinceLastPlay
              let daysSinceLastPlay = existingRating?.daysSinceLastPlay || 0
              if (existingRating?.lastPlayedDate) {
                const lastPlay = new Date(existingRating.lastPlayedDate)
                const now = new Date()
                daysSinceLastPlay = Math.floor((now.getTime() - lastPlay.getTime()) / 86400000)
              }

              // Сбрасываем playsToday если новый день
              let playsToday = existingRating?.playsToday || 0
              if (existingRating?.lastPlayedDate !== today) {
                playsToday = 0
              }

              state.ratings[songId] = {
                ...existingRating,
                songId,
                songInfo: songInfo || existingRating?.songInfo,
                like,
                playCount: (existingRating?.playCount || 0) + 1,
                skipCount: existingRating?.skipCount || 0,
                lastPlayed: new Date().toISOString(),
                lastPlayedDate: today,
                playsToday: playsToday + 1,
                daysSinceLastPlay,
                // Novelty score: чем реже слушал - тем выше
                noveltyScore: Math.min(1.0, (daysSinceLastPlay || 1) / 30),
              }

              if (like === true) {
                if (!state.profile.likedSongs.includes(songId)) {
                  state.profile.likedSongs.push(songId)
                  if (state.profile.likedSongs.length === 1) {
                    trackEvent('first_like', { songId })
                  }
                }
                state.profile.dislikedSongs = state.profile.dislikedSongs.filter((id) => id !== songId)

                const currentSongInfo = songInfo || existingRating?.songInfo
                if (currentSongInfo?.genre) {
                  const currentGenreWeight = state.profile.preferredGenres[currentSongInfo.genre] || 0
                  state.profile.preferredGenres[currentSongInfo.genre] = currentGenreWeight + 1
                }
                if (currentSongInfo?.artistId) {
                  const currentArtistWeight = state.profile.preferredArtists[currentSongInfo.artistId] || 0
                  state.profile.preferredArtists[currentSongInfo.artistId] = currentArtistWeight + 1
                }

                moodDriftDetector.logPositiveInteraction(songId)

                if (currentSongInfo?.artistId) {
                  myWaveDiscoveryTracker.logLike(currentSongInfo.artistId)
                } else if (currentSongInfo?.artist) {
                  myWaveDiscoveryTracker.logLike(currentSongInfo.artist)
                }

                timeAwareHistory.logLike(songId)

                const currentSong = usePlayerStore.getState().songlist.currentSong
                if (currentSong?.id) {
                  const currentList = usePlayerStore.getState().songlist.currentList
                  const seedTracks = currentList.slice(0, 5)
                  const likedSong = currentList.find(s => s.id === songId)
                  if (likedSong) {
                    trackScorer.applyLikeFeedback(likedSong, seedTracks)
                    trackScorer.applyTrackAdjustment(songId, +0.15)
                  }
                }

                checkAchievements(state.profile)
              } else if (like === false) {
                if (!state.profile.dislikedSongs.includes(songId)) {
                  state.profile.dislikedSongs.push(songId)
                  if (state.profile.dislikedSongs.length === 1) {
                    trackEvent('first_dislike', { songId })
                  }
                }
                state.profile.likedSongs = state.profile.likedSongs.filter((id) => id !== songId)

                trackScorer.applyTrackAdjustment(songId, -0.2)
                const currentSong = usePlayerStore.getState().songlist.currentSong
                if (currentSong?.id) {
                  const currentList = usePlayerStore.getState().songlist.currentList
                  const seedTracks = currentList.slice(0, 5)
                  const dislikedSong = currentList.find(s => s.id === songId)
                  if (dislikedSong) {
                    trackScorer.applySkipFeedback(dislikedSong, seedTracks)
                  }
                }
              } else {
                state.profile.likedSongs = state.profile.likedSongs.filter((id) => id !== songId)
                state.profile.dislikedSongs = state.profile.dislikedSongs.filter((id) => id !== songId)
              }
            })

            // === MAB FEEDBACK: Async после set() ===
            const state = get()
            const rating = state.ratings[songId]
            const currentSongInfo = rating?.songInfo
            if (currentSongInfo?.artistId) {
              const { multiArmedBandit, calculateReward, getCurrentMABContext } = await import('@/service/multi-armed-bandit')
              const context = getCurrentMABContext()
              const reward = like === true ? calculateReward('like') : like === false ? calculateReward('dislike') : 0
              if (reward !== 0) {
                multiArmedBandit.recordReward(currentSongInfo.artistId, reward, context, 'artist', currentSongInfo.artist)
                if (currentSongInfo.genre) {
                  multiArmedBandit.recordReward(currentSongInfo.genre.toLowerCase(), reward, context, 'genre', currentSongInfo.genre)
                }
                console.log(`[MAB Feedback] ${like === true ? '🔼 Like' : '🔽 Dislike'}: ${reward > 0 ? '+' : ''}${reward} for artist ${currentSongInfo.artist}`)
              }
            }
          },

          incrementPlayCount: (songId, playProgress) => {
            set((state) => {
              const existingRating = state.ratings[songId]
              const currentHour = new Date().getHours()
              
              state.ratings[songId] = {
                ...existingRating,
                songId,
                playCount: (existingRating?.playCount || 0) + 1,
                skipCount: existingRating?.skipCount || 0,
                lastPlayed: existingRating?.lastPlayed || null,
                like: existingRating?.like ?? null,
                // Scoring: +10 за прослушивание
                score: (existingRating?.score || 0) + 10,
              }

              // Трекаем ночное прослушивание (22:00 - 06:00)
              if (currentHour >= 22 || currentHour < 6) {
                trackNightListening(currentHour)
              }

              // Если дослушал до конца (>90%), дополнительный бонус
              if (playProgress && playProgress > 90) {
                state.ratings[songId].score = (state.ratings[songId].score || 0) + 15
                console.log(`[ML Score] +15 за полное прослушивание: ${songId}`)

                // === MAB FEEDBACK: Полное прослушивание = +5 reward ===
                const songInfo = state.ratings[songId]?.songInfo
                if (songInfo?.artistId) {
                  // Отложенный import чтобы не блокировать основной поток
                  setTimeout(async () => {
                    const { multiArmedBandit, calculateReward, getCurrentMABContext } = await import('@/service/multi-armed-bandit')
                    const context = getCurrentMABContext()
                    const reward = calculateReward('full_play')
                    multiArmedBandit.recordReward(songInfo.artistId!, reward, context)
                    if (songInfo.genre) {
                      multiArmedBandit.recordReward(songInfo.genre.toLowerCase(), reward, context)
                    }
                    console.log(`[MAB Feedback] ▶️ Full play: +${reward} for artist ${songInfo.artist}`)
                  }, 0)
                }
              }

              const historyIndex = state.profile.listeningHistory.findIndex((r) => r.songId === songId)
              if (historyIndex >= 0) {
                state.profile.listeningHistory[historyIndex].playCount = state.ratings[songId].playCount
                state.profile.listeningHistory[historyIndex].score = state.ratings[songId].score
              } else {
                state.profile.listeningHistory.push(state.ratings[songId])
              }
            })
          },

          incrementSkipCount: async (songId, skipTime) => {
            set((state) => {
              const existingRating = state.ratings[songId]
              const skipCount = (existingRating?.skipCount || 0) + 1

              state.ratings[songId] = {
                ...existingRating,
                songId,
                playCount: existingRating?.playCount || 0,
                skipCount,
                lastPlayed: existingRating?.lastPlayed || null,
                like: existingRating?.like ?? null,
                lastSkipTime: skipTime || Date.now(),
                score: (existingRating?.score || 0) - (skipTime && skipTime < 30000 ? 15 : 5),
              }

              if (skipCount >= 3) {
                state.ratings[songId].like = false
                console.log(`[ML Score] Авто-дизлайк после ${skipCount} скипов: ${songId}`)
              }
            })

            // === MAB FEEDBACK: Скип = -5 или -2 reward ===
            const state = get()
            const songInfo = state.ratings[songId]?.songInfo
            if (songInfo?.artistId) {
              const { multiArmedBandit, calculateReward, getCurrentMABContext } = await import('@/service/multi-armed-bandit')
              const context = getCurrentMABContext()
              const action = skipTime && skipTime < 30000 ? 'skip_early' : 'skip_late'
              const reward = calculateReward(action)
              multiArmedBandit.recordReward(songInfo.artistId, reward, context)
              if (songInfo.genre) {
                multiArmedBandit.recordReward(songInfo.genre.toLowerCase(), reward, context)
              }
              console.log(`[MAB Feedback] ⏭️ Skip (${action}): ${reward} for artist ${songInfo.artist}`)
            }
          },

          recordReplay: async (songId) => {
            set((state) => {
              const existingRating = state.ratings[songId]
              const replayCount = (existingRating?.replayCount || 0) + 1

              state.ratings[songId] = {
                ...existingRating,
                songId,
                replayCount,
                score: (existingRating?.score || 0) + 50,
              }

              console.log(`[ML Score] +50 за повтор #${replayCount}: ${songId}`)
            })

            // === MAB FEEDBACK: Реплей = +15 reward ===
            const state = get()
            const songInfo = state.ratings[songId]?.songInfo
            if (songInfo?.artistId) {
              const { multiArmedBandit, calculateReward, getCurrentMABContext } = await import('@/service/multi-armed-bandit')
              const context = getCurrentMABContext()
              const reward = calculateReward('replay')
              multiArmedBandit.recordReward(songInfo.artistId, reward, context)
              if (songInfo.genre) {
                multiArmedBandit.recordReward(songInfo.genre.toLowerCase(), reward, context)
              }
              console.log(`[MAB Feedback] 🔁 Replay: +${reward} for artist ${songInfo.artist}`)
            }
          },

          calculateTrackScore: (songId) => {
            const state = get()
            const rating = state.ratings[songId]

            if (!rating) return 0

            let score = rating.score || 0

            // Бонус за лайк
            if (rating.like === true) score += 100

            // Штраф за дизлайк
            if (rating.like === false) score -= 100

            // Бонус за реплеи
            if (rating.replayCount) score += rating.replayCount * 50

            // Штраф за множественные скипы
            if (rating.skipCount && rating.skipCount > 1) score -= rating.skipCount * 10

            // === TIME-AWARE БОНУС ===
            // Бонус трекам которые слушали в ЭТО ЖЕ время суток ранее
            // Формула: 10 × (1 + playCount / 5) × recencyWeight
            const timeBonus = timeAwareHistory.getTimeBonus(songId)
            if (timeBonus.timeBonus > 0) {
              score += timeBonus.timeBonus
              console.log(`[ML Score] +${timeBonus.timeBonus.toFixed(1)} time-aware bonus for ${songId} (${timeBonus.playCountInTimeSlot} plays in time slot)`)
            }

            return score
          },

          calculateNoveltyScore: (songId) => {
            const state = get()
            const rating = state.ratings[songId]

            if (!rating) return 1.0 // Новый трек = максимальная новизна

            // Если трек уже много раз слушали, novelty низкий
            const playCount = rating.playCount || 0
            const replayCount = rating.replayCount || 0

            // Формула: novelty = 1 / (1 + playCount + replayCount * 2)
            const noveltyScore = 1 / (1 + playCount + replayCount * 2)

            // НЕ изменяем объект напрямую - просто возвращаем значение
            return noveltyScore
          },

          getTemporalPatterns: (songId) => {
            const state = get()
            const rating = state.ratings[songId]

            if (!rating || !rating.hourPlayed || !rating.dayPlayed) {
              return { preferredHours: [], preferredDays: [] }
            }

            // Считаем частоту по часам
            const hourCounts = new Map<number, number>()
            rating.hourPlayed.forEach(hour => {
              hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1)
            })

            // Считаем частоту по дням
            const dayCounts = new Map<number, number>()
            rating.dayPlayed.forEach(day => {
              dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
            })

            // Находим топ часы (>=3 прослушиваний)
            const preferredHours = Array.from(hourCounts.entries())
              .filter(([_, count]) => count >= 3)
              .map(([hour]) => hour)
              .sort((a, b) => a - b)

            // Находим топ дни (>=2 прослушиваний)
            const preferredDays = Array.from(dayCounts.entries())
              .filter(([_, count]) => count >= 2)
              .map(([day]) => day)
              .sort((a, b) => a - b)

            return { preferredHours, preferredDays }
          },

          updateLastPlayed: (songId) => {
            set((state) => {
              const existingRating = state.ratings[songId]
              const now = new Date()
              const currentHour = now.getHours()
              const currentDay = now.getDay()

              state.ratings[songId] = {
                ...existingRating,
                songId,
                lastPlayed: new Date().toISOString(),
                playCount: existingRating?.playCount || 0,
                skipCount: existingRating?.skipCount || 0,
                like: existingRating?.like ?? null,
                // Обновляем temporal patterns (НЕ изменяем likedSongs/dislikedSongs!)
                hourPlayed: [...(existingRating?.hourPlayed || []), currentHour],
                dayPlayed: [...(existingRating?.dayPlayed || []), currentDay],
                // Записываем когда впервые услышал
                firstHeard: existingRating?.firstHeard || now.toISOString(),
              }
            })
          },

          saveTrackAnalysis: (songId, analysis) => {
            set((state) => {
              const existingRating = state.ratings[songId]
              state.ratings[songId] = {
                ...existingRating,
                songId,
                bpm: analysis.bpm,
                energy: analysis.energy,
                danceability: analysis.danceability,
                valence: analysis.valence,
                acousticness: analysis.acousticness,
                playCount: existingRating?.playCount || 0,
                skipCount: existingRating?.skipCount || 0,
                lastPlayed: existingRating?.lastPlayed || null,
                like: existingRating?.like ?? null,
              }

              // Обновляем предпочтения на основе анализа (с округлением!)
              // Высокая энергия → предпочитаем энергичные треки
              if (analysis.energy !== undefined) {
                if (analysis.energy > 0.7) {
                  state.profile.preferredGenres['energetic'] = Math.round(((state.profile.preferredGenres['energetic'] || 0) + 0.1) * 10) / 10
                } else if (analysis.energy < 0.3) {
                  state.profile.preferredGenres['calm'] = Math.round(((state.profile.preferredGenres['calm'] || 0) + 0.1) * 10) / 10
                }
              }

              // Высокая танцевальность → предпочитаем танцевальные жанры
              if (analysis.danceability !== undefined && analysis.danceability > 0.7) {
                state.profile.preferredGenres['dance'] = Math.round(((state.profile.preferredGenres['dance'] || 0) + 0.1) * 10) / 10
              }

              // Высокая акустичность → предпочитаем акустические жанры
              if (analysis.acousticness !== undefined && analysis.acousticness > 0.7) {
                state.profile.preferredGenres['acoustic'] = Math.round(((state.profile.preferredGenres['acoustic'] || 0) + 0.1) * 10) / 10
              }

              console.log(`[ML Store] Saved analysis for track ${songId}:`, analysis)
            })
          },

          getProfile: () => {
            const state = get()
            return state.profile
          },

          // Применить Decay factor к весам жанров и артистов
          applyDecayFactor: () => {
            set((state) => {
              const now = new Date()
              const decayRate = 0.995 // 0.5% затухания в день
              const minWeight = 0.1 // Минимальный вес

              // Применяем decay к preferredGenres
              Object.keys(state.profile.preferredGenres).forEach(genre => {
                const currentWeight = state.profile.preferredGenres[genre]
                const decayedWeight = Math.max(minWeight, currentWeight * decayRate)
                state.profile.preferredGenres[genre] = Math.round(decayedWeight * 100) / 100
              })

              // Применяем decay к preferredArtists
              Object.keys(state.profile.preferredArtists).forEach(artistId => {
                const currentWeight = state.profile.preferredArtists[artistId]
                const decayedWeight = Math.max(minWeight, currentWeight * decayRate)
                state.profile.preferredArtists[artistId] = Math.round(decayedWeight * 100) / 100
              })

              console.log('[ML Store] Decay factor applied. Weights reduced by 0.5%')
            })
          },

          resetProfile: () => {
            set({
              ratings: {},
              profile: defaultProfile,
            })
          },

          exportProfile: () => {
            const state = get()
            return JSON.stringify({
              ratings: state.ratings,
              profile: state.profile,
            })
          },

          exportMLData: async () => {
            const state = get()
            const { analyzeTrack, detectMood } = await import('@/service/vibe-similarity')
            
            // 1. Собираем профиль
            const profile = state.profile
            
            // 2. Собираем ratings
            const ratings = state.ratings
            
            // 3. Анализируем треки
            const trackAnalysis = Object.entries(ratings)
              .filter(([_, rating]) => rating.playCount > 0)  // Только прослушанные
              .map(([songId, rating]) => {
                const features = analyzeTrack({
                  ...rating.songInfo,
                  playCount: rating.playCount,
                  genre: rating.songInfo?.genre || '',
                })
                const mood = detectMood(features)
                
                return {
                  songId,
                  title: rating.songInfo?.title || 'Unknown',
                  artist: rating.songInfo?.artist || 'Unknown',
                  genre: rating.songInfo?.genre || 'Unknown',
                  features,
                  mood,
                  playCount: rating.playCount,
                  skipCount: rating.skipCount || 0,
                  replayCount: rating.replayCount || 0,
                  score: rating.score || 0,
                  like: rating.like,
                }
              })
            
            // 4. Считаем временные паттерны
            const temporalPatterns = calculateTemporalPatterns(ratings)
            
            // 5. Считаем статистику
            const statistics = calculateStatistics(ratings, profile, trackAnalysis)
            
            // 6. Формируем полный экспорт
            const exportData = {
              version: '1.5.7',
              exportDate: new Date().toISOString(),
              profile,
              ratings,
              trackAnalysis,
              temporalPatterns,
              statistics,
            }
            
            return JSON.stringify(exportData, null, 2)
          },

          importProfile: (data) => {
            try {
              const parsed = JSON.parse(data)
              set({
                ratings: parsed.ratings || {},
                profile: parsed.profile || defaultProfile,
              })
            } catch (e) {
              console.error('Failed to import ML profile:', e)
            }
          },

          initializeFromFavorites: (favoriteArtists) => {
            set((state) => {
              console.log('[ML Store] initializeFromFavorites called with:', favoriteArtists.length, 'artists')

              // Инициализируем preferredArtists из лайкнутых артистов
              favoriteArtists.forEach((artist) => {
                const currentWeight = state.profile.preferredArtists[artist.id] || 0

                // Если артиста ещё нет в preferredArtists, добавляем с весом 5
                if (currentWeight === 0) {
                  state.profile.preferredArtists[artist.id] = 5
                  console.log(`[ML Store] ✅ Добавлен артист "${artist.name}" (${artist.id}): вес 5`)
                } else {
                  console.log(`[ML Store] ⚠️ Артист "${artist.name}" уже есть с весом ${currentWeight}`)
                }
              })

              console.log('[ML Store] preferredArtists после инициализации:', state.profile.preferredArtists)
            })
          },

          initializeGenresFromNavidrome: (artists) => {
            set((state) => {
              console.log('[ML Store] initializeGenresFromNavidrome called with:', artists.length, 'artists')
              
              const genreCounts: Record<string, number> = {}
              
              // Считаем жанры всех артистов
              artists.forEach((artist) => {
                if (artist.genres && artist.genres.length > 0) {
                  artist.genres.forEach((genre) => {
                    genreCounts[genre] = (genreCounts[genre] || 0) + 1
                  })
                }
              })
              
              // Инициализируем preferredGenres
              Object.entries(genreCounts).forEach(([genre, count]) => {
                const currentWeight = state.profile.preferredGenres[genre] || 0
                
                // Если жанра ещё нет, добавляем с весом = количество артистов этого жанра
                if (currentWeight === 0) {
                  state.profile.preferredGenres[genre] = count
                  console.log(`[ML Store] ✅ Добавлен жанр "${genre}": вес ${count}`)
                } else {
                  console.log(`[ML Store] ⚠️ Жанр "${genre}" уже есть с весом ${currentWeight}`)
                }
              })
              
              console.log('[ML Store] preferredGenres после инициализации:', state.profile.preferredGenres)
            })
          },

          banArtist: (artistId, artistName) => {
            set((state) => {
              // Инициализируем bannedArtists если нет
              if (!state.profile.bannedArtists) {
                state.profile.bannedArtists = []
              }
              
              // Добавляем в bannedArtists
              if (!state.profile.bannedArtists.includes(artistId)) {
                state.profile.bannedArtists.push(artistId)
                console.log(`[ML Store] 🚫 Artist banned: ${artistName} (${artistId})`)
              }

              // Удаляем из preferredArtists если есть
              if (state.profile.preferredArtists[artistId]) {
                delete state.profile.preferredArtists[artistId]
                console.log(`[ML Store] 🗑️ Removed from preferredArtists: ${artistName}`)
              }
            })
          },

          unbanArtist: (artistId, artistName) => {
            set((state) => {
              // Инициализируем bannedArtists если нет
              if (!state.profile.bannedArtists) {
                state.profile.bannedArtists = []
              }

              // Удаляем из bannedArtists
              const index = state.profile.bannedArtists.indexOf(artistId)
              if (index > -1) {
                state.profile.bannedArtists.splice(index, 1)
                console.log(`[ML Store] ✅ Artist unbanned: ${artistName} (${artistId})`)
              }
            })
          },

          addArtistGenres: (artistId, artistName, genres) => {
            set((state) => {
              // Инициализируем artistGenres если нет
              if (!state.profile.artistGenres) {
                state.profile.artistGenres = {}
              }
              
              // Добавляем жанры с весами
              genres.forEach(genre => {
                if (!state.profile.artistGenres![genre.name]) {
                  state.profile.artistGenres![genre.name] = { count: 0, artists: [] }
                }
                state.profile.artistGenres![genre.name].count += genre.weight
                if (!state.profile.artistGenres![genre.name].artists.includes(artistId)) {
                  state.profile.artistGenres![genre.name].artists.push(artistId)
                }
              })
              
              console.log(`[ML Store] 🎵 Added ${genres.length} genres for ${artistName}`)
            })
          },

          addTrackMoods: (trackId, moods) => {
            set((state) => {
              // Инициализируем trackMoods если нет
              if (!state.profile.trackMoods) {
                state.profile.trackMoods = {}
              }
              
              // Добавляем настроения с весами
              if (!state.profile.trackMoods![trackId]) {
                state.profile.trackMoods![trackId] = []
              }
              
              moods.forEach(mood => {
                // Проверяем что настроение ещё не добавлено
                const existing = state.profile.trackMoods![trackId].find(m => m.name === mood.name)
                if (!existing) {
                  state.profile.trackMoods![trackId].push(mood)
                }
              })
              
              console.log(`[ML Store] 🎭 Added ${moods.length} moods for track ${trackId}`)
            })
          },
        })),
        {
          name: 'ml_store',
        },
      ),
    ),
    {
      name: 'ml-persistence',
      storage: {
        getItem: async (name) => {
          const item = localStorage.getItem(name)
          return item ? JSON.parse(item) : null
        },
        setItem: async (name, value) => {
          localStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: async (name) => {
          localStorage.removeItem(name)
        },
      },
    },
  ),
)

export const useML = () => useMLStore((state) => state)

// Проверка сохранения bannedArtists
if (typeof window !== 'undefined') {
  useMLStore.subscribe(
    (state) => state.profile.bannedArtists,
    (bannedArtists) => {
      console.log('[ML Store] Banned artists changed:', bannedArtists)
      console.log('[ML Store] Full profile saved to localStorage')
    }
  )
}

export const useMLActions = () => useMLStore((state) => ({
  rateSong: state.rateSong,
  incrementPlayCount: state.incrementPlayCount,
  incrementSkipCount: state.incrementSkipCount,
  updateLastPlayed: state.updateLastPlayed,
  saveTrackAnalysis: state.saveTrackAnalysis,
  recordReplay: state.recordReplay,
  calculateTrackScore: state.calculateTrackScore,
  calculateNoveltyScore: state.calculateNoveltyScore,
  getTemporalPatterns: state.getTemporalPatterns,
  getProfile: state.getProfile,
  resetProfile: state.resetProfile,
  exportProfile: state.exportProfile,
  importProfile: state.importProfile,
  initializeFromFavorites: state.initializeFromFavorites,
  initializeGenresFromNavidrome: state.initializeGenresFromNavidrome,
  banArtist: state.banArtist,
  unbanArtist: state.unbanArtist,
  addArtistGenres: state.addArtistGenres,
  addTrackMoods: state.addTrackMoods,
  applyDecayFactor: state.applyDecayFactor,
  exportMLData: state.exportMLData,  // Добавлено
}))

// ========================================
// Helper функции для экспорта ML-данных
// ========================================

/**
 * Расчёт временных паттернов прослушивания
 */
function calculateTemporalPatterns(ratings: Record<string, any>) {
  const hourCount = new Array(24).fill(0)
  const dayCount = new Array(7).fill(0)
  let totalPlays = 0
  
  Object.values(ratings).forEach((rating: any) => {
    if (rating.playCount > 0) {
      totalPlays += rating.playCount
      
      // Часы
      if (rating.hourPlayed) {
        rating.hourPlayed.forEach((hour: number) => {
          hourCount[hour]++
        })
      }
      
      // Дни недели
      if (rating.dayPlayed) {
        rating.dayPlayed.forEach((day: number) => {
          dayCount[day]++
        })
      }
    }
  })
  
  // Находим предпочтительные часы (топ-5)
  const preferredHours = hourCount
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(h => h.hour)
  
  // Находим предпочтительные дни (топ-3)
  const preferredDays = dayCount
    .map((count, day) => ({ day, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(d => d.day)
  
  // Распределение по времени суток
  const morning = hourCount.slice(6, 12).reduce((a, b) => a + b, 0)
  const day = hourCount.slice(12, 18).reduce((a, b) => a + b, 0)
  const evening = hourCount.slice(18, 23).reduce((a, b) => a + b, 0)
  const night = hourCount.slice(0, 6).reduce((a, b) => a + b, 0) + hourCount[23]
  
  const total = morning + day + evening + night || 1
  
  return {
    preferredHours,
    preferredDays,
    timeOfDayDistribution: {
      morning: Math.round((morning / total) * 100) / 100,
      day: Math.round((day / total) * 100) / 100,
      evening: Math.round((evening / total) * 100) / 100,
      night: Math.round((night / total) * 100) / 100,
    },
  }
}

/**
 * Расчёт статистики
 */
function calculateStatistics(ratings: Record<string, any>, profile: any, trackAnalysis: any[]) {
  const totalPlays = Object.values(ratings).reduce((sum, r: any) => sum + (r.playCount || 0), 0)
  const totalArtists = Object.keys(profile.preferredArtists || {}).length
  const totalGenres = Object.keys(profile.preferredGenres || {}).length

  // Средний score
  const scores = Object.values(ratings)
    .filter((r: any) => r.score > 0)
    .map((r: any) => r.score)
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0

  // Топ артист
  const artistPlays: Record<string, number> = {}
  Object.values(ratings).forEach((r: any) => {
    if (r.playCount > 0 && r.songInfo?.artist) {
      artistPlays[r.songInfo.artist] = (artistPlays[r.songInfo.artist] || 0) + r.playCount
    }
  })
  const topArtist = Object.entries(artistPlays)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'

  // Топ жанр
  const genrePlays: Record<string, number> = {}
  Object.values(ratings).forEach((r: any) => {
    if (r.playCount > 0 && r.songInfo?.genre) {
      genrePlays[r.songInfo.genre] = (genrePlays[r.songInfo.genre] || 0) + r.playCount
    }
  })
  const topGenre = Object.entries(genrePlays)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'

  // Listening streak (дней подряд)
  const listeningStreak = calculateListeningStreak(ratings)

  // % проанализированной библиотеки (async — считается отдельно)
  const libraryAnalyzed = calculateLibraryAnalysis(trackAnalysis)

  return {
    totalPlays,
    totalArtists,
    totalGenres,
    averageScore,
    topArtist,
    topGenre,
    listeningStreak,
    libraryAnalyzed,
  }
}

/**
 * Расчёт процента проанализированной библиотеки
 * ИЗМЕНЕНИЕ (14.04.2026): Реализована заглушка
 * Было: trackAnalysis.length > 0 ? 1 : 0 (строка 905)
 * Стало: реальный расчёт на основе ratings
 * 
 * NOTE: Async версия (calculateLibraryAnalysisAsync) была удалена
 * так как calculateStatistics вызывается синхронно.
 * В будущем можно сделать async calculateStatistics и вызывать через .then()
 */
function calculateLibraryAnalysis(trackAnalysis: any[]): number {
  // trackAnalysis — это треки которые были прослушаны (playCount > 0)
  const analyzedCount = trackAnalysis.length
  
  // Используем ratings для оценки общего количества
  // Это не идеально, но работает синхронно
  // В будущем можно кэшировать totalSongs из search API
  
  if (analyzedCount === 0) return 0
  
  // Эвристика: если проанализировано > 0 треков, 
  // считаем что это минимум 1% библиотеки (если треков мало)
  // или больше если много треков прослушано
  
  // Простой подход: на основе количества прослушанных треков
  // 0 треков = 0%, 100 треков = ~5%, 1000 треков = ~50%
  // Это эвристика, не точный расчёт
  
  // Используем логарифмическую шкалу для более реалистичной оценки
  const estimatedPercent = Math.log10(analyzedCount + 1) * 20  // 1 трека = 6%, 10 = 20%, 100 = 40%, 1000 = 60%
  
  return Math.min(100, Math.max(0, estimatedPercent))
}

/**
 * Async версия расчёта библиотеки (для будущего использования)
 * Можно вызывать из async функций для точного расчёта
 */
export async function calculateLibraryAnalysisAsync(trackAnalysis: any[]): Promise<number> {
  try {
    const analyzedCount = trackAnalysis.length
    
    if (analyzedCount === 0) return 0
    
    // Получаем общее количество треков через search API
    const { search } = await import('@/service/search')
    const searchResult = await search.get({
      query: '',
      songCount: 1,
      songOffset: 0,
      artistCount: 0,
      albumCount: 0,
    })
    
    const totalSongs = searchResult?.song?.length === 0 && searchResult ? 
      (searchResult as any).totalSongs || 0 : 
      0
    
    if (totalSongs === 0) {
      const { library } = await import('@/service/library')
      const libData = await library.get()
      const estimatedTotal = libData?.songCount || 0
      
      if (estimatedTotal > 0) {
        return Math.min(100, (analyzedCount / estimatedTotal) * 100)
      }
    } else {
      return Math.min(100, (analyzedCount / totalSongs) * 100)
    }
    
    return analyzedCount > 0 ? 1 : 0
  } catch (error) {
    console.error('[ML Stats Async] Failed to calculate:', error)
    return trackAnalysis.length > 0 ? 1 : 0
  }
}

/**
 * Расчёт listening streak (дней подряд)
 */
function calculateListeningStreak(ratings: Record<string, any>): number {
  const dates = new Set<string>()
  
  Object.values(ratings).forEach((r: any) => {
    if (r.lastPlayedDate) {
      dates.add(r.lastPlayedDate)
    }
  })
  
  if (dates.size === 0) return 0
  
  const sortedDates = Array.from(dates).sort().map(d => new Date(d))
  let streak = 1
  let currentStreak = 1
  
  for (let i = 1; i < sortedDates.length; i++) {
    const diff = Math.round((sortedDates[i].getTime() - sortedDates[i-1].getTime()) / 86400000)
    
    if (diff === 1) {
      currentStreak++
    } else if (diff > 1) {
      currentStreak = 1
    }
    
    streak = Math.max(streak, currentStreak)
  }
  
  return streak
}

// Экспортируем хелперы для использования в UI
export { calculateTemporalPatterns, calculateStatistics }
