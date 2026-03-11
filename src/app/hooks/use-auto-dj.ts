import { useEffect, useRef } from 'react'
import { usePlayerStore, usePlayerActions } from '@/store/player.store'
import { useAutoDJSettings, useAutoDJActions } from '@/store/auto-dj.store'
import { generateTrackRadio, generateArtistRadio } from '@/service/ml-wave-service'
import { generateSmartAutoDJ, canUseSmartAutoDJ, getLastPlayedTracks } from '@/service/smart-auto-dj'
import { toast } from 'react-toastify'
import { trackEvent } from '@/service/ml-event-tracker'

/**
 * Smart Auto-DJ 2.0 - Умное продление плейлиста
 * 
 * АРХИТЕКТУРА КОМБАЙНА:
 * 1. Оркестратор видит последние 5 треков плейлиста
 * 2. Спрашивает у ML: "какие треки добавить?"
 * 3. ML возвращает 20-30 кандидатов
 * 4. Оркестратор анализирует вайб кандидатов
 * 5. Говорит Автоди-джею: "добавь в таком порядке: 3, 1, 4, 2..."
 * 6. Автоди-джей добавляет треки УЖЕ отсортированными
 * 
 * ПРЕИМУЩЕСТВА:
 * - Плавные переходы между треками (energy, BPM, key)
 * - Разнообразие артистов (не 2-3 артиста подряд)
 * - Баланс знакомое/новое (70/30)
 */
export function useAutoDJ() {
  const settings = useAutoDJSettings()
  const { toggleEnabled } = useAutoDJActions()

  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const songlist = usePlayerStore((state) => state.songlist.currentList)
  const currentSongIndex = usePlayerStore((state) => state.songlist.currentSongIndex)
  const { setNextOnQueue } = usePlayerActions()

  const lastTriggeredRef = useRef<string | null>(null)
  const isProcessingRef = useRef(false)

  useEffect(() => {
    // Если Авто-микс выключен, ничего не делаем
    if (!settings.enabled) return

    // Если нет текущего трека, ничего не делаем
    if (!currentSong?.id) return

    // Считаем сколько треков осталось
    const remaining = songlist.length - currentSongIndex - 1

    // Если треков достаточно, ничего не делаем
    if (remaining > settings.timing) return

    // Если уже обрабатываем, пропускаем
    if (isProcessingRef.current) return

    // Если уже срабатывало для этого трека, пропускаем
    if (lastTriggeredRef.current === currentSong.id) return

    // Запускаем генерацию
    generateNextTracks()
  }, [currentSongIndex, songlist.length, settings.enabled, settings.timing])

  async function generateNextTracks() {
    isProcessingRef.current = true
    lastTriggeredRef.current = currentSong.id

    // Если воспроизводится аудиокнига - НЕ генерируем AutoDJ
    if ((currentSong as any).isAudiobook) {
      console.log('[AutoDJ] ⏭️ Skipping for audiobook')
      isProcessingRef.current = false
      return
    }

    try {
      let songs = []

      // ============================================
      // SMART AUTO-DJ 2.0: Комбайн с Оркестратором
      // ============================================
      // Проверяем что songlist это массив
      const songlistArray = Array.isArray(songlist) ? songlist : []
      
      if (canUseSmartAutoDJ(songlistArray, currentSongIndex)) {
        console.log('[AutoDJ] 🧠 Using Smart Auto-DJ 2.0...')
        
        // Генерируем умное продление
        const result = await generateSmartAutoDJ(
          currentSong,
          songlistArray,
          {
            count: settings.itemCount,
            candidateCount: settings.itemCount * 3,
            addBridges: true,          // Добавлять мосты
            energyCurve: 'wave',       // Энергетическая волна
            respectTimeOfDay: true,    // Учитывать время суток
          }
        )
        
        songs = result.songs
        
        console.log(`[AutoDJ] ✅ Smart Auto-DJ: ${result.addedCount} треков, Energy: ${result.avgEnergy.toFixed(2)}, BPM: ${result.avgBpm}`)
      } 
      // ============================================
      // FALLBACK: Старый добрый Track Radio
      // ============================================
      else {
        console.log('[AutoDJ] Using classic Track Radio (fallback)...')
        
        // 1. Пробуем сгенерировать через Navidrome Subsonic API
        try {
          const trackRadio = await generateTrackRadio(currentSong.id, settings.itemCount)
          songs = trackRadio.songs
        } catch (navidromeError) {
          console.warn('[AutoDJ] Navidrome generation failed, trying Last.fm fallback:', navidromeError)

          // 2. Fallback: Last.fm similar artists
          const { lastFmService } = await import('@/service/lastfm-api')
          const { useExternalApiStore } = await import('@/store/external-api.store')

          const state = useExternalApiStore.getState()
          if (state.settings.lastFmEnabled && state.settings.lastFmApiKey) {
            const similarArtists = await lastFmService.getSimilarArtists(currentSong.artist, 10)

            if (similarArtists.length > 0) {
              // Получаем треки похожих артистов из Navidrome
              const { getTopSongs } = await import('@/service/navidrome-api')
              const similarSongs: any[] = []

              for (const artist of similarArtists.slice(0, 3)) {
                try {
                  const topSongs = await getTopSongs(artist.name, 5)
                  similarSongs.push(...topSongs)
                } catch (err) {
                  console.warn(`[AutoDJ] Failed to get songs for ${artist.name}:`, err)
                }
              }

              songs = similarSongs
              console.log('[AutoDJ] Using Last.fm fallback')
            }
          }
        }
      }

      // Фильтруем треки которые уже есть в очереди
      const queueSongIds = new Set(songlist.map(s => s.id))
      const uniqueSongs = songs.filter(s => !queueSongIds.has(s.id))

      if (uniqueSongs.length > 0) {
        // Добавляем в очередь - передаем ПРОСТО МАССИВ треков
        setNextOnQueue(uniqueSongs)

        // Трекаем событие
        trackEvent('playlist_generated', {
          type: 'smart-auto-dj',
          songCount: uniqueSongs.length,
          triggeredBy: currentSong.id,
        })

        // Уведомляем пользователя
        toast(`🤖 Авто-микс: добавлено ${uniqueSongs.length} треков`, {
          type: 'success',
          autoClose: 3000,
        })

        console.log(`🤖 Авто-микс: добавлено ${uniqueSongs.length} треков`)
      }
    } catch (error) {
      console.error('Авто-микс ошибка:', error)
      toast('Авто-микс: ошибка генерации', { type: 'error' })
    } finally {
      isProcessingRef.current = false
    }
  }

  return {
    isEnabled: settings.enabled,
    toggle: toggleEnabled,
  }
}
