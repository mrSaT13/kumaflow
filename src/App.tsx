import { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { isDesktop } from 'react-device-detect'
import { RouterProvider } from 'react-router-dom'
import { Linux } from '@/app/components/controls/linux'
import { SettingsDialog } from '@/app/components/settings/dialog'
import { SplashScreen } from '@/app/components/splash-screen'
import { FloatingPlayer } from '@/app/components/floating-player'
import { PWAInstallPrompt } from '@/app/components/pwa'
import { useMLPlaylistNotifications } from '@/app/hooks/use-ml-playlist-notifications'
import { useBackgroundAudioAnalysis } from '@/app/hooks/use-background-audio-analysis'
import { useAutoCacheTracks } from '@/app/hooks/use-auto-cache-tracks'
import { AIPatternMonitor } from '@/service/ai-playlist-patterns'
import { createAIPlaylist } from '@/service/ai-playlist-agent'
import { useMLStore } from '@/store/ml.store'
import { useExternalApiStore } from '@/store/external-api.store'
import { LangObserver } from '@/app/observers/lang-observer'
import { MediaSessionObserver } from '@/app/observers/media-session-observer'
import { ThemeObserver } from '@/app/observers/theme-observer'
import { ToastContainer } from '@/app/observers/toast-container'
import { UpdateObserver } from '@/app/observers/update-observer'
import { Mobile } from '@/app/pages/mobile'
import { router } from '@/routes/router'
import { isDesktop as isElectron, isLinux } from '@/utils/desktop'
import { useListenBrainzStore } from '@/store/listenbrainz.store'
import { usePlaybackActions } from '@/store/playback.store'
import { useAppStore } from '@/store/app.store'
import { dualUrlBackgroundService } from '@/service/dual-url-background-service'
import { mlPlaylistAutoUpdate } from '@/service/ml-playlist-auto-update'
import { getFavoriteArtists } from '@/service/subsonic-api'
import { checkAndGenerateHolidayPlaylists } from '@/service/holiday-playlist-generator'  // 🆕
import { startBrainFlushLoop } from '@/service/brain-events'  // 1.6.2: Brain flush
import { startBrainAutoSyncLoop } from '@/service/brain-autosync'  // Автосинк вкусов (вкл по умолчанию)
import { formatResumeTime, getWaveDeviceId, getWaveDeviceName, wavePublish, waveResume } from '@/service/brain-wave'  // 1.6.4: живая очередь + resume
import { subsonic } from '@/service/subsonic'
import type { ISong } from '@/types/responses/song'
import { isBrainActive } from '@/store/brain.store'
import { usePlayerStore } from '@/store/player.store'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const { setFloatingPlayerEnabled } = usePlaybackActions()
  const autoCacheStarred = useAppStore().pages.autoCacheStarred
  const { profile } = useMLStore()
  const { settings } = useExternalApiStore()

  // Инициализация внешних API (Last.fm и др.) при старте
  const initializeServices = useExternalApiStore(state => state.initializeServices)
  const initializeListenBrainz = useListenBrainzStore(state => state.initialize)
  const { initializeFromFavorites } = useMLStore()

  // Запуск AI Pattern Monitor
  useEffect(() => {
    if (!settings.llmEnabled) {
      console.log('[App] AI Pattern Monitor disabled (LLM not enabled)')
      return
    }

    console.log('[App] AI Pattern Monitor config:', {
      url: settings.llmLmStudioUrl,
      model: settings.llmModel,
      hasApiKey: !!settings.llmApiKey,
      profileGenres: Object.keys(profile.preferredGenres || {}).length,
      profileArtists: Object.keys(profile.preferredArtists || {}).length,
    })

    const monitor = new AIPatternMonitor(profile, {
      url: settings.llmLmStudioUrl,
      model: settings.llmModel || 'qwen/qwen3-4b-2507',
      apiKey: settings.llmApiKey,
    })

    console.log('[App] Starting AI Pattern Monitor...')
    monitor.start()

    return () => {
      console.log('[App] Stopping AI Pattern Monitor...')
      monitor.stop()
    }
  }, [settings.llmEnabled, settings.llmLmStudioUrl, settings.llmModel, settings.llmApiKey, profile])

  useEffect(() => {
    console.log('[App] Initializing external API services...')
    initializeServices()
    initializeListenBrainz()

    // Запуск фонового мониторинга Dual URL
    console.log('[App] Starting Dual URL background service...')
    dualUrlBackgroundService.start()

    // Запуск автообновления ML плейлистов
    console.log('[App] Starting ML playlist auto-update service...')
    mlPlaylistAutoUpdate.start()

    // 🆕 Проверка и генерация праздничных плейлистов
    console.log('[App] Checking holiday playlists...')
    checkAndGenerateHolidayPlaylists()

    // ВАЖНО: Автосинхронизация лайкнутых артистов из Navidrome
    console.log('[App] Syncing favorite artists from Navidrome...')
    syncFavoriteArtists()

    // 1.6.2: фоновый флаш событий мозга (30с)
    startBrainFlushLoop()

    // Автосинк вкусов в мозг (первый прогон ~90с, дальше каждые 30 мин).
    // Работает только если мозг включен и настроен; тумблер — в настройках мозга.
    startBrainAutoSyncLoop()

    // 1.6.4: живая очередь мозгу — позиция/длительность/пауза/имя устройства.
    // Смена очереди/трека (throttle 5с внутри) + force-отправка на паузу/плей
    // + heartbeat ~15с пока играет. Best-effort, мозг не трогаем.
    const publishWaveSnapshot = (force = false) => {
      if (!isBrainActive()) return
      try {
        const st = usePlayerStore.getState()
        const audio = st.playerState.audioPlayerRef as HTMLAudioElement | null
        const posFromAudio =
          audio && Number.isFinite(audio.currentTime) ? Math.floor(audio.currentTime) : NaN
        const posFromStore = Math.floor(st.playerProgress.progress ?? NaN)
        const positionSec = Number.isFinite(posFromAudio)
          ? posFromAudio
          : Number.isFinite(posFromStore)
            ? posFromStore
            : 0
        const durFromStore = Math.floor(st.playerState.currentDuration ?? NaN)
        const durFromAudio =
          audio && Number.isFinite(audio.duration) ? Math.floor(audio.duration) : NaN
        const durationSec =
          Number.isFinite(durFromStore) && durFromStore > 0
            ? durFromStore
            : Number.isFinite(durFromAudio)
              ? durFromAudio
              : 0
        wavePublish(
          st.songlist.currentList.map((t) => t.id).filter(Boolean),
          st.songlist.currentSong?.id ?? null,
          {
            positionSec,
            durationSec,
            paused: !st.playerState.isPlaying,
            deviceName: getWaveDeviceName(),
            force,
          },
        )
      } catch { /* best-effort */ }
    }
    const unsubBrainQueue = usePlayerStore.subscribe(
      (s) =>
        `${s.songlist.currentList.map((t) => t.id).join(',')}|${s.songlist.currentSong?.id ?? ''}`,
      () => {
        publishWaveSnapshot(false)
      },
    )
    // Пауза/плей — сразу, мимо троттлинга
    const unsubBrainPlaying = usePlayerStore.subscribe(
      (s) => s.playerState.isPlaying,
      () => {
        publishWaveSnapshot(true)
      },
    )
    // Heartbeat ~15с, только пока играет
    const brainHeartbeat = setInterval(() => {
      try {
        if (!isBrainActive()) return
        if (!usePlayerStore.getState().playerState.isPlaying) return
        publishWaveSnapshot(true)
      } catch { /* best-effort */ }
    }, 15000)

    // 1.6.4: продолжить с телефона — тост при старте.
    // getSong(external_id) → очередь из resume.queue → play → seek.
    const seekWaveResume = (positionSec: number) => {
      const pos = Math.max(0, Math.floor(positionSec || 0))
      if (pos <= 0) return
      try {
        usePlayerStore.getState().actions.setProgress(pos)
      } catch { /* best-effort */ }
      let attempts = 0
      const timer = setInterval(() => {
        attempts += 1
        try {
          const audio = usePlayerStore.getState().playerState.audioPlayerRef as HTMLAudioElement | null
          if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
            try {
              audio.currentTime = Math.min(pos, Math.max(0, Math.floor(audio.duration) - 1))
            } catch { /* best-effort */ }
            try {
              usePlayerStore.getState().actions.setProgress(pos)
            } catch { /* best-effort */ }
          }
        } catch { /* best-effort */ }
        if (attempts >= 12) clearInterval(timer)
      }, 500)
    }
    const checkWaveResume = async () => {
      if (!isBrainActive()) return
      try {
        const resume = await waveResume()
        if (!resume) return
        const targetId = (resume.external_id || resume.track_id || '').trim()
        if (!targetId) return
        const pos = Math.floor(resume.position_sec ?? 0)
        if (pos < 5) return // нечего продолжать
        // Свой слот: сверяем по стабильному device-UUID; имя — только фолбек
        // для старых слотов мозга (имена у десктопов могут совпадать).
        if (resume.device && resume.device === getWaveDeviceId()) return // сами играли
        if (!resume.device && resume.device_name && resume.device_name === getWaveDeviceName()) return // сами играли (legacy)
        const local = usePlayerStore.getState()
        const localId = local.songlist.currentSong?.id
        if (localId && (localId === targetId || localId === resume.track_id)) return
        const continueFromPhone = async () => {
          try {
            const song = await subsonic.songs.getSong(targetId).catch(() => null)
            if (!song) {
              toast.error('Трек с телефона не найден в библиотеке')
              return
            }
            const restIds = (resume.queue ?? [])
              .filter((qid) => qid && qid !== targetId && qid !== resume.track_id)
              .slice(0, 30)
            const rest = (
              await Promise.all(restIds.map((qid) => subsonic.songs.getSong(qid).catch(() => null)))
            ).filter((s): s is ISong => !!s)
            usePlayerStore.getState().actions.setSongList([song as ISong, ...rest], 0)
            seekWaveResume(pos)
            toast.success('Продолжили с телефона', { autoClose: 2000 })
          } catch {
            toast.error('Не получилось продолжить с телефона')
          }
        }
        toast.info(`Продолжить с телефона — ${formatResumeTime(pos)}`, {
          autoClose: 20000,
          onClick: () => {
            void continueFromPhone()
          },
        })
      } catch { /* best-effort */ }
    }
    // Пауза 4с: даём очереди восстановиться из IDB, чтобы не предлагать тот же трек.
    const resumeTimer = setTimeout(() => {
      void checkWaveResume()
    }, 4000)

    return () => {
      unsubBrainQueue()
      unsubBrainPlaying()
      clearInterval(brainHeartbeat)
      clearTimeout(resumeTimer)
    }
  }, [initializeServices, initializeListenBrainz])

  // Функция синхронизации лайкнутых артистов
  async function syncFavoriteArtists() {
    try {
      const favoriteArtists = await getFavoriteArtists()
      console.log(`[App] ✅ Got ${favoriteArtists.length} favorite artists from Navidrome`)
      
      if (favoriteArtists.length > 0) {
        initializeFromFavorites(favoriteArtists)
        console.log(`[App] ✅ Synced ${favoriteArtists.length} artists to ML profile`)
      }
    } catch (error) {
      console.error('[App] Failed to sync favorite artists:', error)
    }
  }

  // ML Playlist notifications and auto-update
  useMLPlaylistNotifications()

  // Background audio analysis (BPM, Energy, etc.)
  useBackgroundAudioAnalysis()

  // Auto-cache starred tracks
  useAutoCacheTracks({ enabled: autoCacheStarred, maxTracks: 100 })

  // Обработчик завершения splash screen
  const handleSplashComplete = () => {
    setIsLoading(false)
  }

  // Показываем splash screen при загрузке
  if (isLoading) {
    return <SplashScreen onComplete={handleSplashComplete} />
  }

  if (!isDesktop && window.innerHeight > window.innerWidth) return <Mobile /> // Support tablets but not phones

  return (
    <>
      {isElectron() && <UpdateObserver />}
      <MediaSessionObserver />
      <LangObserver />
      <ThemeObserver />
      <SettingsDialog />
      <RouterProvider router={router} />
      <ToastContainer />
      <FloatingPlayer />
      {!isElectron() && <PWAInstallPrompt />}
      {isLinux && <Linux />}
    </>
  )
}

export default App
