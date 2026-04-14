import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Share2 } from 'lucide-react'
import { toast } from 'react-toastify'
import { getSongStreamUrl } from '@/api/httpClient'
import { getProxyURL } from '@/api/podcastClient'
import { MiniPlayerButton } from '@/app/components/mini-player/button'
import { RadioInfo } from '@/app/components/player/radio-info'
import { TrackInfo } from '@/app/components/player/track-info'
import { useAutoScrobble } from '@/app/hooks/use-auto-scrobble'
import { useAutoDJ } from '@/app/hooks/use-auto-dj'
import { podcasts } from '@/service/podcasts'
import { getAudiobookshelfApi } from '@/service/audiobookshelf-api'
import { useAppStore } from '@/store/app.store'
import {
  getVolume,
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerLoop,
  usePlayerMediaType,
  usePlayerRef,
  usePlayerSonglist,
  usePlayerStore,
  useReplayGainState,
} from '@/store/player.store'
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
import { PlayerVolume } from './volume'

const MemoTrackInfo = memo(TrackInfo)
const MemoRadioInfo = memo(RadioInfo)
const MemoPodcastInfo = memo(PodcastInfo)
const MemoPlayerControls = memo(PlayerControls)
const MemoPlayerProgress = memo(PlayerProgress)
const MemoPlayerQueueButton = memo(PlayerQueueButton)
const MemoPlayerClearQueueButton = memo(PlayerClearQueueButton)
const MemoPlayerVolume = memo(PlayerVolume)
const MemoPodcastPlaybackRate = memo(PodcastPlaybackRate)
const MemoMiniPlayerButton = memo(MiniPlayerButton)
const MemoPlayerExpandButton = memo(PlayerExpandButton)
const MemoPlayerLyricsButton = memo(PlayerLyricsButton)
const MemoAudioPlayer = memo(AudioPlayer)

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
  const currentPlaybackRate = usePlayerStore().playerState.currentPlaybackRate
  const { replayGainType, replayGainPreAmp, replayGainDefaultGain } =
    useReplayGainState()

  // Auto scrobble hook
  useAutoScrobble()

  // Auto DJ hook - умное продление плейлиста
  useAutoDJ()

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

      const currentSong = usePlayerStore.getState().songlist.currentSong

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
        volume: Math.floor(audio.volume * 100) || 50,
        isShuffle: store.playerState.isShuffleActive,
        repeatMode: loopStateToMode(store.playerState.loopState),
        isLiked: currentSong?.userFavorite || false,
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

    const handleRemoteCommand = async (event: any, payload: any) => {
      console.log('[Player] Remote command:', payload)

      try {
        // Получаем ТЕКУЩИЙ трек из store (не из замыкания!)
        const store = (await import('@/store/player.store')).usePlayerStore.getState()
        const currentSong = store.songlist.currentSong
        const currentList = store.songlist.currentList || []
        const currentIndex = store.songlist.currentIndex || 0

        console.log('[Player] Remote command - currentSong:', currentSong?.title, currentSong?.id)

        switch (payload.action) {
          case 'play': {
            store.actions.play()
            break
          }
          case 'pause': {
            store.actions.pause()
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
            if (payload.value !== undefined && getAudioRef().current) {
              getAudioRef().current.currentTime = payload.value
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
                const updatedCurrentSong = updatedStore.songlist.currentSong
                const newLikedStatus = updatedCurrentSong?.userFavorite || false
                console.log('[Player] ❤️ New liked status:', newLikedStatus)

                // Обновляем ML ratings
                const { useMLStore } = await import('@/store/ml.store')
                const mlStore = useMLStore.getState()
                await mlStore.actions.rateSong(currentSong.id, !currentlyLiked, {
                  songInfo: {
                    id: currentSong.id,
                    title: currentSong.title,
                    artist: currentSong.artist,
                    album: currentSong.album,
                    genre: (currentSong as any).genre,
                  }
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
                      volume: Math.floor(audio.volume * 100) || 50,
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
            const currentSong = store.songlist.currentSong

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
                await mlStore.actions.rateSong(currentSong.id, false, {
                  songInfo: {
                    id: currentSong.id,
                    title: currentSong.title,
                    artist: currentSong.artist,
                    album: currentSong.album,
                    genre: (currentSong as any).genre,
                  }
                })
                console.log('[Player] 👎 ML ratings updated')

                // Отправляем обновлённое состояние в Remote
                if (electronAPI && typeof electronAPI.send === 'function') {
                  const audio = getAudioRef().current
                  if (audio) {
                    const updatedStore = usePlayerStore.getState()
                    const updatedSong = updatedStore.songlist.currentSong
                    const state = {
                      isPlaying: !audio.paused,
                      title: updatedSong.title || 'Нет трека',
                      artist: updatedSong.artist || '',
                      album: updatedSong.album || '',
                      coverArt: updatedSong.coverArt ? `/getCoverArt?id=${encodeURIComponent(updatedSong.coverArt)}&size=300` : '',
                      duration: Math.floor(audio.duration) || 0,
                      progress: Math.floor(audio.currentTime) || 0,
                      volume: Math.floor(audio.volume * 100) || 50,
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
            const currentIndex = store.songlist.currentIndex || 0

            const queue = currentList.slice(0, 50).map((song: any, i: number) => ({
              id: song?.id || '',
              title: song?.title || 'Unknown',
              artist: song?.artist || '',
              album: song?.album || '',
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

    audio.volume = getVolume() / 100
  }, [getAudioRef])

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

  // Обычный плеер для полноразмерного окна
  return (
    <footer className="border-t h-[--player-height] w-full flex items-center fixed bottom-0 left-0 right-0 z-40 bg-background">
      <div className="w-full h-full grid grid-cols-player gap-2 px-4">
        {/* Track Info */}
        <div className="flex items-center gap-2 w-full min-w-0">
          {isSong && <MemoTrackInfo song={song} />}
          {isRadio && <MemoRadioInfo radio={radio} />}
          {isPodcast && <MemoPodcastInfo podcast={podcast} />}
        </div>
        {/* Main Controls */}
        <div className="col-span-2 flex flex-col justify-center items-center px-2 gap-1 min-w-0">
          <MemoPlayerControls
            song={song}
            radio={radio}
            podcast={podcast}
            audioRef={getAudioRef()}
          />

          {(isSong || isPodcast) && (
            <MemoPlayerProgress audioRef={getAudioRef()} />
          )}
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
  )
}
