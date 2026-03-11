import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { getSongStreamUrl } from '@/api/httpClient'
import { getProxyURL } from '@/api/podcastClient'
import { MiniPlayerButton } from '@/app/components/mini-player/button'
import { RadioInfo } from '@/app/components/player/radio-info'
import { TrackInfo } from '@/app/components/player/track-info'
import { useAutoScrobble } from '@/app/hooks/use-auto-scrobble'
import { useAutoDJ } from '@/app/hooks/use-auto-dj'
import { podcasts } from '@/service/podcasts'
import { getAudiobookshelfApi } from '@/service/audiobookshelf-api'
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
          src={song.isAudiobook && song.url ? song.url : getSongStreamUrl(song.id)}
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
