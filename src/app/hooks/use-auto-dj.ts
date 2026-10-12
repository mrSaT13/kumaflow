import { useEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import { trackEvent } from '@/service/ml-event-tracker'
import { generateTrackRadio } from '@/service/ml-wave-service'
import { canUseSmartAutoDJ, generateSmartAutoDJ } from '@/service/smart-auto-dj'
import { useAutoDJActions, useAutoDJSettings } from '@/store/auto-dj.store'
import {
  selectCurrentSong,
  usePlayerActions,
  usePlayerStore,
} from '@/store/player.store'
import type { ISong } from '@/types/responses/song'

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

  const currentSong = usePlayerStore(selectCurrentSong)
  const songlist = usePlayerStore((state) => state.songlist.currentList)
  const currentSongIndex = usePlayerStore(
    (state) => state.songlist.currentSongIndex,
  )
  const { setNextOnQueue } = usePlayerActions()

  const lastTriggeredRef = useRef<string | null>(null)
  const isProcessingRef = useRef(false)
  /** id треков, добавленных авто-миксом и ещё не сыгранных — потолок очереди. */
  const autoDjAddedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Если нет текущего трека, ничего не делаем
    if (!currentSong?.id) return

    // Считаем сколько треков осталось
    const remaining = songlist.length - currentSongIndex - 1

    // Очередь кончилась — это самая дорогая точка потери пользователя,
    // поэтому докладываем независимо от настройки авто-микса. Иначе при
    // выключенном по умолчанию авто-миксе очередь всегда просто обрывалась.
    const queueIsEmpty = remaining <= 0
    if (!queueIsEmpty && !settings.enabled) return

    // Если треков достаточно, ничего не делаем
    if (!queueIsEmpty && remaining > settings.timing) return

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
      let songs: ISong[] = []

      // ============================================
      // SMART AUTO-DJ 2.0: Комбайн с Оркестратором
      // ============================================
      // Проверяем что songlist это массив
      const songlistArray = Array.isArray(songlist) ? songlist : []

      // Потолок авто-докладки — считаем ДО запроса, иначе размер пачки
      // не связан с тем, сколько реально можно положить в очередь.
      //
      // Что было без этого: itemCount=25 -> мозгу уходит min(20, 25)=20 ->
      // мозг отдаёт 20 -> в smart-auto-dj проверка `fresh.length >= count`
      // (20 >= 25) проваливается -> локальный ML докладывает хвост из 5.
      // И эти 5 приходят из локального ML, который про пилюли волны не
      // знает вообще: ровно тот класс бага, который мы чинили в мозге.
      // Плюс 20 треков посчитаны впустую, если в очередь влезает 10.
      //
      // Считаем ТОЛЬКО то, что добавил авто-микс, и никогда не режем чужое:
      // в обычном плейлисте очередь пользовательская, удалять из неё треки
      // без спроса нельзя. Ref самозакрывающийся — выбывшее (сыгранное или
      // удалённое руками) выпадает при следующем проходе.
      const cap = settings.queueCap || 0
      let wantCount = settings.itemCount
      if (cap > 0) {
        const live = new Set(
          songlistArray.slice(currentSongIndex + 1).map((s) => s.id),
        )
        for (const id of [...autoDjAddedRef.current]) {
          if (!live.has(id)) autoDjAddedRef.current.delete(id)
        }
        const pending = autoDjAddedRef.current.size
        if (pending >= cap) {
          console.log(
            `[AutoDJ] Потолок ${cap}: в очереди уже ${pending} треков авто-микса, не докладываю`,
          )
          return
        }
        wantCount = Math.max(1, Math.min(wantCount, cap - pending))
      }

      if (canUseSmartAutoDJ(songlistArray, currentSongIndex)) {
        console.log('[AutoDJ] 🧠 Using Smart Auto-DJ 2.0...')

        // Генерируем умное продление
        const result = await generateSmartAutoDJ(currentSong, songlistArray, {
          count: wantCount,
          candidateCount: wantCount * 3,
          addBridges: true, // Добавлять мосты
          energyCurve: 'wave', // Энергетическая волна
          respectTimeOfDay: true, // Учитывать время суток
          // Без индекса остаток очереди считался как полная длина, и мозг
          // не дозапрашивался при очереди длиннее 5 треков.
          currentIndex: currentSongIndex,
        })

        songs = result.songs

        console.log(
          `[AutoDJ] ✅ Smart Auto-DJ: ${result.addedCount} треков, Energy: ${result.avgEnergy.toFixed(2)}, BPM: ${result.avgBpm}`,
        )
      }
      // ============================================
      // FALLBACK: Старый добрый Track Radio
      // ============================================
      else {
        console.log('[AutoDJ] Using classic Track Radio (fallback)...')

        // 1. Пробуем сгенерировать через Navidrome Subsonic API
        try {
          const trackRadio = await generateTrackRadio(
            currentSong.id,
            settings.itemCount,
          )
          songs = trackRadio.songs
        } catch (navidromeError) {
          console.warn(
            '[AutoDJ] Navidrome generation failed, trying Last.fm fallback:',
            navidromeError,
          )

          // 2. Fallback: Last.fm similar artists
          const { lastFmService } = await import('@/service/lastfm-api')
          const { useExternalApiStore } = await import(
            '@/store/external-api.store'
          )

          const state = useExternalApiStore.getState()
          if (state.settings.lastFmEnabled && state.settings.lastFmApiKey) {
            const similarArtists = await lastFmService.getSimilarArtists(
              currentSong.artist,
              10,
            )

            if (similarArtists.length > 0) {
              // Получаем треки похожих артистов из библиотеки.
              // Именно subsonic-api: у него getTopSongs(artistName, size).
              // В navidrome-api одноимённая функция ждёт serverUrl/token/artistId.
              const { getTopSongs } = await import('@/service/subsonic-api')
              const similarSongs: ISong[] = []

              for (const artist of similarArtists.slice(0, 3)) {
                try {
                  const topSongs = await getTopSongs(artist.name, 5)
                  similarSongs.push(...topSongs)
                } catch (err) {
                  console.warn(
                    `[AutoDJ] Failed to get songs for ${artist.name}:`,
                    err,
                  )
                }
              }

              songs = similarSongs
              console.log('[AutoDJ] Using Last.fm fallback')
            }
          }
        }
      }

      // Фильтруем треки которые уже есть в очереди
      const queueSongIds = new Set(songlist.map((s) => s.id))
      let uniqueSongs = songs.filter((s) => !queueSongIds.has(s.id))

      // Последний рубеж. Раньше цепочка заканчивалась на Last.fm, и если он
      // был выключен или упал, songs оставался пустым — очередь просто
      // кончалась и сессия умирала. Рандом из библиотеки не идеален по
      // вайбу, но очередь, которая не кончается, важнее идеального подбора.
      if (uniqueSongs.length === 0) {
        console.log('[AutoDJ] ⚠️ Все источники пусты, беру случайные треки')
        try {
          const { getRandomSongs } = await import('@/service/subsonic-api')
          const { isArtistBanned } = await import('@/service/ban-filter')
          const { useMLStore } = await import('@/store/ml.store')

          const banned = useMLStore.getState().profile.bannedArtists || []
          const fetched = await getRandomSongs(100)

          uniqueSongs = fetched.filter(
            (s) =>
              !queueSongIds.has(s.id) &&
              !s.isAudiobook &&
              !isArtistBanned(s.artistId, s.artist, banned),
          )

          console.log(
            `[AutoDJ] 🆘 Аварийный набор: ${uniqueSongs.length} треков`,
          )
        } catch (randomError) {
          console.error('[AutoDJ] Аварийный набор не удался:', randomError)
        }
      }

      if (uniqueSongs.length > 0) {
        // Размер пачки уже посчитан выше (wantCount) с учётом потолка.
        // Здесь только страховка: аварийный и фолбек-пути (Last.fm, рандом
        // из библиотеки) про потолок не знают и могут вернуть больше.
        if (cap > 0) {
          uniqueSongs = uniqueSongs.slice(
            0,
            Math.max(1, cap - autoDjAddedRef.current.size),
          )
          if (uniqueSongs.length === 0) return
        }

        for (const s of uniqueSongs) autoDjAddedRef.current.add(s.id)

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
