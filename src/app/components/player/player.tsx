import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Share2, Smartphone, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { getSongStreamUrl } from '@/api/httpClient'
import { getProxyURL } from '@/api/podcastClient'
import { MiniPlayerButton } from '@/app/components/mini-player/button'
import { RadioInfo } from '@/app/components/player/radio-info'
import { TrackInfo } from '@/app/components/player/track-info'
import { useAutoScrobble } from '@/app/hooks/use-auto-scrobble'
import { useAutoDJ } from '@/app/hooks/use-auto-dj'
import { useRemotePlayback } from '@/app/hooks/use-remote-playback'
import { applyGain } from '@/features/player/audio-graph'
import { podcasts } from '@/service/podcasts'
import { getAudiobookshelfApi } from '@/service/audiobookshelf-api'
import { useAppStore } from '@/store/app.store'
import {
  getVolume,
  usePlayerActions,
  usePlayerDuration,
  usePlayerIsPlaying,
  usePlayerLoop,
  usePlayerMediaType,
  usePlayerProgress,
  usePlayerRef,
  usePlayerSonglist,
  usePlayerStore,
  useReplayGainState,
  useSongColor,
  selectCurrentSong,
} from '@/store/player.store'
import { isBrainActive } from '@/store/brain.store'
import { useMLStore } from '@/store/ml.store'
import { wavePublish } from '@/service/brain-wave'
import { isWavePlaylistName } from '@/service/wave-identity'
import { StreakWidget } from '@/app/components/streak/streak-widget'
import { useDopamineSettings } from '@/store/dopamine.store'
import { getGenreColor } from '@/utils/genreColors'
import { Button } from '@/app/components/ui/button'
import { LoopState } from '@/types/playerContext'
import { hasPiPSupport } from '@/utils/browser'
import { logger } from '@/utils/logger'
import { ReplayGainParams } from '@/utils/replayGain'
import { AudioPlayer } from './audio'
import { PlayerClearQueueButton } from './clear-queue-button'
import { PlayerControls } from './controls'
import { PlayerExpandButton } from './expand-button'
import { PlayerLyricsButton } from './lyrics-button'
import { PlayerQueueButton } from './queue-button'
import { PodcastInfo } from './podcast-info'
import { PodcastPlaybackRate } from './podcast-playback-rate'
import { PlayerProgress } from './progress'
import { QualityBadge } from './quality-badge'
import { PlayerVolume } from './volume'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'

const MemoTrackInfo = memo(TrackInfo)
const MemoRadioInfo = memo(RadioInfo)
const MemoPodcastInfo = memo(PodcastInfo)
const MemoPlayerControls = memo(PlayerControls)
const MemoPlayerProgress = memo(PlayerProgress)

/**
 * Лайк трека для пульта: флаг userFavorite в объекте очереди может быть
 * stale (трек лайкнут раньше или с другого клиента), поэтому добиваем
 * рейтингом ML-профиля. Чисто синхронно — безопасно для sendState.
 */
function resolveRemoteLiked(song: any): boolean {
  try {
    if (song?.userFavorite) return true
    const id = song?.id
    if (id === undefined || id === null || id === '') return false
    const liked: string[] =
      useMLStore.getState()?.profile?.likedSongs ?? []
    return liked.includes(String(id))
  } catch {
    return !!song?.userFavorite
  }
}

/**
 * Громкость для пульта: читаем стор (единственный источник истины),
 * а НЕ audio.volume — при живом WebAudio-графе элемент навсегда прибит
 * к 1 (звук идёт через gain-узел), и пульт вечно видел 100.
 * Заодно лечит `0 || 50`: мут теперь честно 0, а не 50.
 */
function resolveRemoteVolume(storeVolume: unknown): number {
  const v =
    typeof storeVolume === 'number' && Number.isFinite(storeVolume)
      ? Math.round(storeVolume)
      : 50
  return Math.max(0, Math.min(100, v))
}
const MemoPlayerQueueButton = memo(PlayerQueueButton)
const MemoPlayerClearQueueButton = memo(PlayerClearQueueButton)
const MemoPlayerVolume = memo(PlayerVolume)
const MemoPodcastPlaybackRate = memo(PodcastPlaybackRate)
const MemoMiniPlayerButton = memo(MiniPlayerButton)
const MemoPlayerExpandButton = memo(PlayerExpandButton)
const MemoPlayerLyricsButton = memo(PlayerLyricsButton)
const MemoAudioPlayer = memo(AudioPlayer)

/**
 * Прогресс сверху панели как у Яндекса: тонкая полоса по верхней кромке.
 * - клик/перемотка (широкая зона попадания 16px, z-10 поверх сетки),
 * - точка playhead только при наведении,
 * - время (наведение / всего) только при наведении, под курсором.
 * Цвет — под жанр/обложку трека.
 */
function TopEdgeProgress({
  audioRef,
  barColor,
}: {
  audioRef: RefObject<HTMLAudioElement>
  barColor: string
}) {
  const progress = usePlayerProgress()
  const duration = usePlayerDuration()
  const { setProgress } = usePlayerActions()
  const [hovering, setHovering] = useState(false)
  const [hoverRatio, setHoverRatio] = useState(0)

  const hasDuration =
    !!duration && Number.isFinite(duration) && duration > 0
  const pct = hasDuration ? Math.min(100, (progress / duration) * 100) : 0

  const ratioFromEvent = (clientX: number, el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const seekTo = (clientX: number, el: HTMLDivElement) => {
    if (!hasDuration) return
    const value = Math.floor(ratioFromEvent(clientX, el) * duration)
    if (audioRef.current) audioRef.current.currentTime = value
    setProgress(value)
  }

  if (!hasDuration) return null

  const previewTime = Math.floor(hoverRatio * duration)
  // Пузырёк держим внутри панели, чтобы не резался скруглением
  const bubbleRatio = Math.min(0.94, Math.max(0.06, hoverRatio))

  return (
    <div
      onClick={(e) => seekTo(e.clientX, e.currentTarget)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={(e) =>
        setHoverRatio(ratioFromEvent(e.clientX, e.currentTarget))
      }
      className="group/top absolute top-0 left-0 right-0 z-10 flex h-[14px] cursor-pointer items-start"
    >
      {/* Сама полоса — тонкая, на ховере толще как у Яндекса */}
      <div className="relative h-[5px] w-full rounded-full bg-foreground/10 transition-all duration-150 group-hover/top:h-[8px]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: barColor }}
        />
        {/* Точка playhead — только при наведении */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md opacity-0 transition-opacity duration-150 group-hover/top:opacity-100"
          style={{ left: `${pct}%`, width: 12, height: 12 }}
        />
      </div>
      {/* Время — только при наведении, под курсором */}
      {hovering && (
        <div
          className="absolute top-[18px] -translate-x-1/2 rounded-md bg-popover border border-border px-2 py-0.5 text-xs whitespace-nowrap shadow-lg pointer-events-none"
          style={{ left: `${bubbleRatio * 100}%` }}
        >
          {convertSecondsToTime(previewTime)} /{' '}
          {convertSecondsToTime(duration)}
        </div>
      )}
    </div>
  )
}

export function Player() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const radioRef = useRef<HTMLAudioElement>(null)
  const podcastRef = useRef<HTMLAudioElement>(null)
  
  const {
    setAudioPlayerRef,
    setCurrentDuration,
    setProgress,
    setPlayingState,
    handleSongEnded,
    getCurrentProgress,
    getCurrentPodcastProgress,
  } = usePlayerActions()
  const { currentList, currentSongIndex, radioList, podcastList } =
    usePlayerSonglist()
  const isPlaying = usePlayerIsPlaying()
  const { isSong, isRadio, isPodcast } = usePlayerMediaType()
  const loopState = usePlayerLoop()
  const audioPlayerRef = usePlayerRef()
  const currentPlaybackRate = usePlayerStore((state) => state.playerState.currentPlaybackRate)
  const { replayGainType, replayGainPreAmp, replayGainDefaultGain } =
    useReplayGainState()

  // Auto scrobble hook
  useAutoScrobble()

  // Auto DJ hook - умное продление плейлиста
  useAutoDJ()

  // Handoff: продолжить с другого устройства (мозг)
  const remotePlayback = useRemotePlayback()

  // 🔴 Remote: Авто-отправка очереди при смене трека
  useEffect(() => {
    // Отправляем очередь только если есть треки
    if (!currentList || currentList.length === 0) return

    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.send) return

    const queue = currentList.slice(0, 50).map((song: any, i: number) => ({
      id: song?.id || '',
      title: song?.title || 'Unknown',
      artist: song?.artist || '',
      album: song?.album || '',
      // Обложка нужна remote-странице: в очереди раньше были только тексты,
      // поэтому список на телефоне шёл без картинок.
      coverArt: song?.coverArt
        ? `/getCoverArt?id=${encodeURIComponent(song.coverArt)}&size=120`
        : '',
      active: i === currentSongIndex,
    }))

    electronAPI.send('remote-queue-response', queue)
  }, [currentSongIndex, currentList])

  // Функция "Поделиться"
  const handleShare = useCallback(() => {
    const currentTrack = currentList[currentSongIndex]
    if (!currentTrack) return

    // Формируем умную ссылку
    const shareText = `@track:${currentTrack.artist} - ${currentTrack.title}`
    
    // Копируем в буфер
    navigator.clipboard.writeText(shareText)
      .then(() => {
        console.log('[Player] Copied to clipboard:', shareText)
        toast('📋 Скопировано! Вставьте в поиск', { type: 'success' })
      })
      .catch(err => {
        console.error('[Player] Failed to copy:', err)
        toast('Ошибка копирования', { type: 'error' })
      })
  }, [currentList, currentSongIndex])

  const song = currentList[currentSongIndex]
  const radio = radioList[currentSongIndex]
  const podcast = podcastList[currentSongIndex]

  // Логирование для отладки аудиокниг
  useEffect(() => {
    if (song?.isAudiobook) {
      console.log('[Player] Audiobook detected:', {
        id: song.id,
        title: song.title,
        url: song.url,
        isAudiobook: song.isAudiobook,
      })
    }
  }, [song])

  const getAudioRef = useCallback(() => {
    if (isRadio) return radioRef
    if (isPodcast) return podcastRef

    return audioRef
  }, [isPodcast, isRadio])

  // biome-ignore lint/correctness/useExhaustiveDependencies: audioRef needed
  useEffect(() => {
    if (!isSong && !song) return

    if (audioPlayerRef === null && audioRef.current)
      setAudioPlayerRef(audioRef.current)
  }, [audioPlayerRef, audioRef, isSong, setAudioPlayerRef, song])

  useEffect(() => {
    const audio = podcastRef.current
    if (!audio || !isPodcast) return

    audio.playbackRate = currentPlaybackRate
  }, [currentPlaybackRate, isPodcast])

  const setupDuration = useCallback(() => {
    const audio = getAudioRef().current
    if (!audio) return

    const audioDuration = Math.floor(audio.duration)
    const infinityDuration = audioDuration === Infinity

    if (!infinityDuration) {
      setCurrentDuration(audioDuration)
    }

    if (isPodcast && infinityDuration && podcast) {
      setCurrentDuration(podcast.duration)
    }

    if (isPodcast) {
      const podcastProgress = getCurrentPodcastProgress()

      logger.info('[Player] - Resuming episode from:', {
        seconds: podcastProgress,
      })

      setProgress(podcastProgress)
      audio.currentTime = podcastProgress
    } else {
      const progress = getCurrentProgress()
      audio.currentTime = progress
    }
  }, [
    getAudioRef,
    isPodcast,
    podcast,
    setCurrentDuration,
    getCurrentPodcastProgress,
    setProgress,
    getCurrentProgress,
  ])

  // Сохранение прогресса для аудиокниг
  const saveAudiobookProgress = useCallback(async (currentTime: number, duration: number) => {
    if (!song?.isAudiobook || !song.id) return

    try {
      const api = getAudiobookshelfApi()
      const isFinished = currentTime >= duration - 1
      
      await api.updateProgress(song.id, currentTime, duration, isFinished)
      
      logger.info('[Player] Audiobook progress saved:', {
        id: song.id,
        currentTime,
        duration,
        isFinished,
      })
    } catch (error) {
      logger.error('[Player] Error saving audiobook progress:', error)
    }
  }, [song])

  const setupProgress = useCallback(() => {
    const audio = getAudioRef().current
    if (!audio) return

    const currentProgress = Math.floor(audio.currentTime)
    setProgress(currentProgress)
  }, [getAudioRef, setProgress])

  // Отдельный эффект для сохранения прогресса аудиокниг
  useEffect(() => {
    if (!song?.isAudiobook) return

    const audio = getAudioRef().current
    if (!audio) return

    const saveInterval = setInterval(() => {
      if (audio.duration && !isNaN(audio.duration) && audio.currentTime > 0) {
        saveAudiobookProgress(audio.currentTime, audio.duration)
      }
    }, 30000) // Каждые 30 секунд

    return () => clearInterval(saveInterval)
  }, [song, saveAudiobookProgress, getAudioRef])

  // Отправка состояния плеера для Remote Control (только в Electron)
  useEffect(() => {
    // В Electron electronAPI доступен через window.electronAPI
    const electronAPI = (window as any).electronAPI

    // console.log('[Remote] electronAPI доступен:', !!electronAPI)  // 🤫 Убрано из логов

    if (!electronAPI) {
      // console.log('[Remote] НЕ в Electron, пропускаем')  // 🤫 Убрано из логов
      return
    }

    // console.log('[Remote] electronAPI найден, настраиваем отправку')  // 🤫 Убрано из логов

    // Проверяем, включён ли Remote Control
    const checkRemoteEnabled = () => {
      const appState = useAppStore.getState()
      const enabled = appState?.remoteControl?.enabled || false
      return enabled
    }

    // ✅ DEBOUNCE: отправляем не чаще чем раз в 2 секунды
    let lastSendTime = 0
    const DEBOUNCE_MS = 2000

    const sendState = () => {
      const now = Date.now()
      if (now - lastSendTime < DEBOUNCE_MS) {
        return // Пропускаем если слишком часто
      }
      lastSendTime = now

      const isRemoteEnabled = checkRemoteEnabled()
      if (!isRemoteEnabled) {
        return
      }

      const audio = getAudioRef().current
      if (!audio) return

      const currentSong = selectCurrentSong(usePlayerStore.getState())

      // Формируем полный URL для обложки
      const getCoverArtUrl = (coverArtId?: string) => {
        if (!coverArtId) return ''
        if (coverArtId.startsWith('http')) return coverArtId
        return `/getCoverArt?id=${encodeURIComponent(coverArtId)}&size=300`
      }

      // Получаем shuffle и repeat из store
      const store = usePlayerStore.getState()
      const loopStateToMode = (loopState: any) => {
        switch (loopState) {
          case 2: return 'one'
          case 1: return 'all'
          default: return 'off'
        }
      }

      const state = {
        isPlaying: !audio.paused,
        title: currentSong?.title || song?.title || 'Нет трека',
        artist: currentSong?.artist || song?.artist || '',
        album: currentSong?.album || song?.album || '',
        coverArt: getCoverArtUrl(currentSong?.coverArt || song?.coverArt),
        duration: Math.floor(audio.duration) || 0,
        progress: Math.floor(audio.currentTime) || 0,
        volume: resolveRemoteVolume(store.playerState.volume),
        isShuffle: store.playerState.isShuffleActive,
        repeatMode: loopStateToMode(store.playerState.loopState),
        isLiked: resolveRemoteLiked(currentSong),
      }

      // console.log('[Remote] Отправляем состояние:', state)  // 🤫 Убрано из логов

      // Отправляем в main процесс для remote clients
      try {
        electronAPI.send('player-state-update', state)
        // console.log('[Remote] Состояние ОТПРАВЛЕНО в main process')  // 🤫 Убрано из логов
      } catch (error) {
        console.error('[Remote] ОШИБКА отправки:', error)  // ❗ Ошибки оставляем
      }
    }

    const audio = getAudioRef().current
    if (!audio) return

    // Отправляем состояние при изменении
    audio.addEventListener('play', sendState)
    audio.addEventListener('pause', sendState)
    audio.addEventListener('timeupdate', sendState)
    audio.addEventListener('volumechange', sendState)
    
    // Отправляем начальное состояние
    setTimeout(sendState, 500)
    
    return () => {
      audio.removeEventListener('play', sendState)
      audio.removeEventListener('pause', sendState)
      audio.removeEventListener('timeupdate', sendState)
      audio.removeEventListener('volumechange', sendState)
    }
  }, [song, getAudioRef])

  // Живая очередь мозгу с позицией воспроизведения.
  // Именно position_sec позволяет «Продолжить с …» на телефоне/вебе
  // начать с того же места. Троттлинг 5с — внутри wavePublish.
  useEffect(() => {
    const audio = getAudioRef().current
    if (!audio) return

    const publishNow = () => {
      if (!isBrainActive()) return
      const st = usePlayerStore.getState()
      const queue = st.songlist.currentList.map((t) => t.id).filter(Boolean)
      const playlistName = st.songlist.currentPlaylistName ?? null
      wavePublish(queue, selectCurrentSong(st)?.id ?? null, {
        positionSec: Math.floor(audio.currentTime || 0),
        durationSec: Math.floor(audio.duration || 0) || undefined,
        paused: audio.paused,
      }, {
        playlistName,
        // Природа ленты едет вместе с очередью. Проверка та же, что в playSong:
        // по имени плейлиста, иначе принимающее устройство не поймёт,
        // что продолжает Мою волну.
        isWave: isWavePlaylistName(playlistName),
      })
    }

    audio.addEventListener('play', publishNow)
    audio.addEventListener('pause', publishNow)
    audio.addEventListener('timeupdate', publishNow)
    audio.addEventListener('seeked', publishNow)
    audio.addEventListener('ended', publishNow)
    const timer = setInterval(publishNow, 15000)

    return () => {
      audio.removeEventListener('play', publishNow)
      audio.removeEventListener('pause', publishNow)
      audio.removeEventListener('timeupdate', publishNow)
      audio.removeEventListener('seeked', publishNow)
      audio.removeEventListener('ended', publishNow)
      clearInterval(timer)
    }
  }, [song, getAudioRef])

  // Обработчик команд от Remote Control (только в Electron)
  useEffect(() => {
    // В Electron ipcRenderer доступен через window.electronAPI
    const electronAPI = (window as any).electronAPI
    const api = (window as any).api

    console.log('[Player] electronAPI available:', !!electronAPI)
    console.log('[Player] api available:', !!api)
    console.log('[Player] api.onRemoteCommand available:', !!api?.onRemoteCommand)

    if (!electronAPI && !api) {
      // Не в Electron, пропускаем
      console.warn('[Player] Not in Electron or API not available')
      return
    }

    const handleRemoteCommand = async (_event: any, payload: any) => {
      console.log('[Player] Remote command:', payload)

      try {
        // Получаем ТЕКУЩИЙ трек из store (не из замыкания!)
        const store = (await import('@/store/player.store')).usePlayerStore.getState()
        const currentSong = selectCurrentSong(store)

        console.log('[Player] Remote command - currentSong:', currentSong?.title, currentSong?.id)

        switch (payload.action) {
          // Отдельных play()/pause() в actions нет — состояние переключается
          // через setPlayingState.
          case 'play': {
            store.actions.setPlayingState(true)
            break
          }
          case 'pause': {
            store.actions.setPlayingState(false)
            break
          }
          case 'toggle': {
            store.actions.togglePlayPause()
            break
          }
          case 'next': {
            store.actions.playNextSong()
            break
          }
          case 'prev': {
            store.actions.playPrevSong()
            break
          }
          case 'volume': {
            if (payload.value !== undefined) {
              store.actions.setVolume(payload.value)
            }
            break
          }
          case 'seek': {
            const audio = getAudioRef().current
            if (payload.value !== undefined && audio) {
              audio.currentTime = payload.value
            }
            break
          }
          case 'shuffle': {
            if (payload.enabled !== undefined) {
              const store = usePlayerStore.getState()
              if (payload.enabled && !store.playerState.isShuffleActive) {
                store.actions.toggleShuffle()
              } else if (!payload.enabled && store.playerState.isShuffleActive) {
                store.actions.toggleShuffle()
              }
            }
            break
          }
          case 'repeat': {
            if (payload.mode !== undefined) {
              const store = usePlayerStore.getState()
              const { LoopState } = await import('@/types/playerContext')
              const targetMode = payload.mode === 'one' ? LoopState.One :
                                 payload.mode === 'all' ? LoopState.All : LoopState.Off
              while (store.playerState.loopState !== targetMode) {
                store.actions.toggleLoop()
              }
            }
            break
          }
          case 'like': {
            console.log('[Player] ❤️ Like command received')
            console.log('[Player] ❤️ currentSong:', currentSong?.title, currentSong?.id)
            console.log('[Player] ❤️ electronAPI:', typeof electronAPI)

            if (currentSong?.id) {
              try {
                const { subsonic } = await import('@/service/subsonic')
                const currentlyLiked = currentSong.userFavorite || false
                console.log('[Player] ❤️ currentlyLiked:', currentlyLiked)

                if (currentlyLiked) {
                  await subsonic.star.unstarItem(currentSong.id)
                  console.log('[Player] ❤️ Unliked song:', currentSong.id)
                } else {
                  await subsonic.star.starItem(currentSong.id)
                  console.log('[Player] ❤️ Liked song:', currentSong.id)
                }

                // Обновляем состояние в player store
                await store.actions.starCurrentSong()
                console.log('[Player] ❤️ Player store updated')

                // Получаем обновлённый currentSong из store
                const updatedStore = usePlayerStore.getState()
                const updatedCurrentSong = selectCurrentSong(updatedStore)
                const newLikedStatus = updatedCurrentSong?.userFavorite || false
                console.log('[Player] ❤️ New liked status:', newLikedStatus)

                // Обновляем ML ratings
                const { useMLStore } = await import('@/store/ml.store')
                // Действия в ml.store лежат на корне стора, без actions.
                const mlStore = useMLStore.getState()
                await mlStore.rateSong(currentSong.id, !currentlyLiked, {
                  title: currentSong.title,
                  artist: currentSong.artist,
                  album: currentSong.album,
                  genre: currentSong.genre,
                })
                console.log('[Player] ❤️ ML ratings updated')

                // Обновляем UI - триггерим обновление через событие
                // Страницы могут слушать это событие и обновлять свои данные
                window.dispatchEvent(new CustomEvent('player-rating-updated', {
                  detail: { 
                    songId: updatedCurrentSong.id, 
                    liked: newLikedStatus,
                    timestamp: Date.now()
                  }
                }))

                // Отправляем обновлённое состояние в Remote
                if (electronAPI && typeof electronAPI.send === 'function') {
                  const audio = getAudioRef().current
                  if (audio) {
                    const state = {
                      isPlaying: !audio.paused,
                      title: updatedCurrentSong.title || 'Нет трека',
                      artist: updatedCurrentSong.artist || '',
                      album: updatedCurrentSong.album || '',
                      coverArt: updatedCurrentSong.coverArt ? `/getCoverArt?id=${encodeURIComponent(updatedCurrentSong.coverArt)}&size=300` : '',
                      duration: Math.floor(audio.duration) || 0,
                      progress: Math.floor(audio.currentTime) || 0,
                      volume: resolveRemoteVolume(updatedStore.playerState.volume),
                      isShuffle: updatedStore.playerState.isShuffleActive,
                      repeatMode: updatedStore.playerState.loopState === 2 ? 'one' : updatedStore.playerState.loopState === 1 ? 'all' : 'off',
                      isLiked: newLikedStatus,
                    }
                    console.log('[Player] ❤️ Sending state update to Remote')
                    electronAPI.send('player-state-update', state)
                  }
                } else {
                  console.error('[Player] ❤️ electronAPI.send not available!')
                }
              } catch (error) {
                console.error('[Player] ❤️ Like error:', error)
              }
            } else {
              console.warn('[Player] ❤️ No song ID available for like')
            }
            break
          }
          case 'dislike': {
            console.log('[Player] 👎 Dislike command received')

            // Получаем актуальный трек из store
            const store = usePlayerStore.getState()
            const currentSong = selectCurrentSong(store)

            if (currentSong?.id) {
              try {
                const { subsonic } = await import('@/service/subsonic')
                await subsonic.star.unstarItem(currentSong.id)
                console.log('[Player] 👎 Disliked song:', currentSong.id)

                // Обновляем player store
                await store.actions.starCurrentSong()

                // Обновляем ML ratings
                const { useMLStore } = await import('@/store/ml.store')
                const mlStore = useMLStore.getState()
                await mlStore.rateSong(currentSong.id, false, {
                  title: currentSong.title,
                  artist: currentSong.artist,
                  album: currentSong.album,
                  genre: currentSong.genre,
                })
                console.log('[Player] 👎 ML ratings updated')

                // Отправляем обновлённое состояние в Remote
                if (electronAPI && typeof electronAPI.send === 'function') {
                  const audio = getAudioRef().current
                  if (audio) {
                    const updatedStore = usePlayerStore.getState()
                    const updatedSong = selectCurrentSong(updatedStore)
                    const state = {
                      isPlaying: !audio.paused,
                      title: updatedSong.title || 'Нет трека',
                      artist: updatedSong.artist || '',
                      album: updatedSong.album || '',
                      coverArt: updatedSong.coverArt ? `/getCoverArt?id=${encodeURIComponent(updatedSong.coverArt)}&size=300` : '',
                      duration: Math.floor(audio.duration) || 0,
                      progress: Math.floor(audio.currentTime) || 0,
                      volume: resolveRemoteVolume(updatedStore.playerState.volume),
                      isShuffle: updatedStore.playerState.isShuffleActive,
                      repeatMode: updatedStore.playerState.loopState === 2 ? 'one' : updatedStore.playerState.loopState === 1 ? 'all' : 'off',
                      isLiked: false,
                    }
                    electronAPI.send('player-state-update', state)
                  }
                }
              } catch (error) {
                console.error('[Player] 👎 Dislike error:', error)
              }
            }
            break
          }
          case 'get-queue': {
            // Отправить очередь воспроизведения
            console.log('[Player] ⏰ Received get-queue command')
            const store = usePlayerStore.getState()
            const currentList = store.songlist.currentList || []
            const currentIndex = store.songlist.currentSongIndex || 0

            const queue = currentList.slice(0, 50).map((song: any, i: number) => ({
              id: song?.id || '',
              title: song?.title || 'Unknown',
              artist: song?.artist || '',
              album: song?.album || '',
              coverArt: song?.coverArt
                ? `/getCoverArt?id=${encodeURIComponent(song.coverArt)}&size=120`
                : '',
              active: i === currentIndex,
            }))

            console.log('[Player] ⏰ Queue prepared:', queue.length, 'tracks')
            console.log('[Player] ⏰ electronAPI:', typeof electronAPI)
            console.log('[Player] ⏰ electronAPI.send:', typeof electronAPI?.send)

            // Отправляем через electronAPI.send (ipcRenderer)
            if (electronAPI && typeof electronAPI.send === 'function') {
              console.log('[Player] ⏰ Sending queue via electronAPI.send...')
              try {
                electronAPI.send('remote-queue-response', queue)
                console.log('[Player] ⏰ Queue sent successfully!')
              } catch (err) {
                console.error('[Player] ⏰ Error sending queue:', err)
              }
            } else {
              console.error('[Player] ⏰ electronAPI.send not available!')
              console.log('[Player] ⏰ electronAPI keys:', electronAPI ? Object.keys(electronAPI) : 'none')
            }
            break
          }
        }
      } catch (error) {
        console.error('[Player] Remote command error:', error)
      }
    }

    // Слушаем IPC события через window.api.onRemoteCommand
    if (api?.onRemoteCommand) {
      console.log('[Player] Using api.onRemoteCommand')
      api.onRemoteCommand(handleRemoteCommand)
    } else if (electronAPI?.on) {
      console.log('[Player] Using electronAPI.on for remote-control')
      // Слушаем оба события (две разные системы Remote)
      electronAPI.on('remote-control', handleRemoteCommand)
      electronAPI.on('remote-control-command', handleRemoteCommand)
    } else {
      console.warn('[Player] No IPC listener method available')
    }

    return () => {
      if (api?.removeRemoteCommandListener) {
        api.removeRemoteCommandListener()
      } else if (electronAPI?.removeAllListeners) {
        electronAPI.removeAllListeners('remote-control-command')
      }
    }
  }, [])

  const setupInitialVolume = useCallback(() => {
    const audio = getAudioRef().current
    if (!audio) return

    // Не audio.volume напрямую: громкостью владеет applyGain.
    applyGain(audio, getVolume() / 100)
  }, [getAudioRef, getVolume])

  const sendFinishProgress = useCallback(() => {
    if (!isPodcast || !podcast) return

    podcasts
      .saveEpisodeProgress(podcast.id, podcast.duration)
      .then(() => {
        logger.info('Complete progress sent:', podcast.duration)
      })
      .catch((error) => {
        logger.error('Error sending complete progress', error)
      })
  }, [isPodcast, podcast])

  const trackReplayGain = useMemo<ReplayGainParams>(() => {
    const preAmp = replayGainPreAmp
    const defaultGain = replayGainDefaultGain

    if (!song || !song.replayGain) {
      return { gain: defaultGain, peak: 1, preAmp }
    }

    if (replayGainType === 'album') {
      let { albumGain = defaultGain, albumPeak = 1 } = song.replayGain

      if (albumGain === 0) {
        albumGain = defaultGain
      }

      return { gain: albumGain, peak: albumPeak, preAmp }
    }

    let { trackGain = defaultGain, trackPeak = 1 } = song.replayGain

    if (trackGain === 0) {
      trackGain = defaultGain
    }
    return { gain: trackGain, peak: trackPeak, preAmp }
  }, [song, replayGainDefaultGain, replayGainPreAmp, replayGainType])

  // Обычный плеер для полноразмерного окна — плавающая закруглённая панель как у Яндекса
  // Подсветка панели динамически: средний цвет обложки → иначе цвет жанра
  const { currentSongColor } = useSongColor()
  const { streakInPlayerBar } = useDopamineSettings()
  const genreColor = song?.genre ? getGenreColor(song.genre) : null
  const tintColor = currentSongColor || genreColor || null
  const barColor = tintColor || '#10b981'
  // Стрик — только для музыки: у подкаста и радио дней подряд не считается,
  // чип там был бы пустышкой.
  const showStreak = streakInPlayerBar && isSong
  return (
    <>
      {remotePlayback.remote && (
        <div
          className="fixed bottom-[100px] left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 fade-in"
          role="status"
        >
          <div className="flex items-center gap-3 rounded-full glass-player border border-border/40 px-4 py-2 shadow-2xl">
            <Smartphone className="size-4 shrink-0 opacity-70" />
            <div className="text-sm leading-tight">
              <div className="font-medium">
                {remotePlayback.remote.track.artist_name} —{' '}
                {remotePlayback.remote.track.title}
              </div>
              <div className="text-xs opacity-60">
                Слушали на {remotePlayback.remote.device ?? 'другом устройстве'}
                {remotePlayback.remote.ageSec != null
                  ? ` · ${formatAge(remotePlayback.remote.ageSec)} назад`
                  : ''}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => void remotePlayback.takeOver()}
              disabled={remotePlayback.busy}
            >
              {remotePlayback.busy ? 'Переносим…' : 'Продолжить'}
            </Button>
            <button
              type="button"
              aria-label="Скрыть"
              className="opacity-50 hover:opacity-100 transition-opacity"
              onClick={remotePlayback.dismiss}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      <footer
      className="fixed bottom-3 left-3 right-3 z-40 glass-player border border-border/40 rounded-2xl shadow-2xl h-[88px] flex items-center overflow-hidden"
      style={
        tintColor
          ? {
              boxShadow: `0 8px 40px ${tintColor}33, 0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 ${tintColor}44`,
              borderColor: `${tintColor}55`,
            }
          : undefined
      }
    >
      <TopEdgeProgress audioRef={getAudioRef()} barColor={barColor} />
      {/* Динамическая вуаль под жанр/обложку — панель выделяется, текст читаем */}
      {tintColor && (
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            background: `linear-gradient(135deg, ${tintColor}66 0%, transparent 55%, ${tintColor}33 100%)`,
          }}
        />
      )}
      <div className="relative w-full h-full grid grid-cols-player gap-2 px-4 pt-[5px]">
        {/* Track Info */}
        <div className="flex items-center gap-2 w-full min-w-0">
          {isSong && <MemoTrackInfo song={song} />}
          {isRadio && <MemoRadioInfo radio={radio} />}
          {isPodcast && <MemoPodcastInfo podcast={podcast} />}
          {/* Бейдж качества жил в нижнем баре — переехал сюда, чтобы не потерять */}
          {isSong && song && (
            <div className="shrink-0 hidden xl:block">
              <QualityBadge song={song} />
            </div>
          )}
          {/* Стрик дней подряд. Раньше считался, но жил только на /ml/stats,
              то есть пользователь его никогда не видел. Spotify держит его
              в плеер-баре с 2023 — это самый дешёвый якорь удержания. */}
          {showStreak && (
            <div className="shrink-0 hidden lg:block">
              <StreakWidget variant="chip" />
            </div>
          )}
        </div>
        {/* Main Controls */}
        <div className="col-span-2 flex flex-col justify-center items-center px-2 gap-1 min-w-0">
          <MemoPlayerControls
            song={song}
            radio={radio}
            podcast={podcast}
            audioRef={getAudioRef()}
          />

          {/* Нижнего бара больше нет: время живёт в верхней полосе по ховеру.
              Компонент оставлен скрытым ради сайд-эффектов:
              скробблинг + сохранение прогресса подкастов. */}
          <div className="hidden" aria-hidden>
            {(isSong || isPodcast) && (
              <MemoPlayerProgress audioRef={getAudioRef()} />
            )}
          </div>
        </div>
        {/* Right Controls and Volume */}
        <div className="flex items-center w-full justify-end gap-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-0.5">
            {isSong && (
              <>
                <MemoPlayerLyricsButton disabled={!song} className="hidden lg:inline-flex" />
                <MemoPlayerQueueButton disabled={!song} className="hidden md:inline-flex" />
                {/* Кнопка "Поделиться" */}
                <button
                  onClick={handleShare}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  title="Поделиться треком"
                >
                  <Share2 className="w-4 h-4 text-white/70 hover:text-white" />
                </button>
              </>
            )}

            {isPodcast && <MemoPodcastPlaybackRate />}
            {(isRadio || isPodcast) && (
              <MemoPlayerClearQueueButton disabled={!radio && !podcast} />
            )}

            <MemoPlayerVolume
              audioRef={getAudioRef()}
              disabled={!song && !radio && !podcast}
            />

            {isSong && <MemoPlayerExpandButton disabled={!song} />}
            {isSong && hasPiPSupport && <MemoMiniPlayerButton />}
          </div>
        </div>
      </div>

      {isSong && song && (
        <MemoAudioPlayer
          replayGain={trackReplayGain}
          src={(song as any).isLocal && (song as any).url 
            ? (song as any).url 
            : song.isAudiobook && song.url 
              ? song.url 
              : getSongStreamUrl(song.id)}
          autoPlay={isPlaying}
          audioRef={audioRef}
          loop={loopState === LoopState.One}
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadedMetadata={setupDuration}
          onTimeUpdate={setupProgress}
          onEnded={handleSongEnded}
          onLoadStart={setupInitialVolume}
          data-testid="player-song-audio"
        />
      )}

      {isRadio && radio && (
        <MemoAudioPlayer
          src={radio.streamUrl}
          autoPlay={isPlaying}
          audioRef={radioRef}
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadStart={setupInitialVolume}
          data-testid="player-radio-audio"
        />
      )}

      {isPodcast && podcast && (
        <MemoAudioPlayer
          src={getProxyURL(podcast.audio_url)}
          autoPlay={isPlaying}
          audioRef={podcastRef}
          preload="auto"
          onPlay={() => setPlayingState(true)}
          onPause={() => setPlayingState(false)}
          onLoadedMetadata={setupDuration}
          onTimeUpdate={setupProgress}
          onEnded={() => {
            sendFinishProgress()
            handleSongEnded()
          }}
          onLoadStart={setupInitialVolume}
          data-testid="player-podcast-audio"
        />
      )}
    </footer>
    </>
  )
}

/** «5 мин назад» / «2 ч назад» — для баннера возврата с другого устройства. */
function formatAge(sec: number): string {
  const min = Math.floor(sec / 60)
  if (min < 1) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} дн назад`
}
