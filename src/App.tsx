import { useState, useEffect } from 'react'
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
import { useMLStore } from '@/store/ml.store'
import { useExternalApiStore } from '@/store/external-api.store'
import { AchievementObserver } from '@/app/observers/achievement-observer'
import { LangObserver } from '@/app/observers/lang-observer'
import { MediaSessionObserver } from '@/app/observers/media-session-observer'
import { ThemeObserver } from '@/app/observers/theme-observer'
import { ToastContainer } from '@/app/observers/toast-container'
import { UpdateObserver } from '@/app/observers/update-observer'
import { Mobile } from '@/app/pages/mobile'
import { router } from '@/routes/router'
import { isDesktop as isElectron, isLinux } from '@/utils/desktop'
import { useListenBrainzStore } from '@/store/listenbrainz.store'
import { useAppStore } from '@/store/app.store'
import { dualUrlBackgroundService } from '@/service/dual-url-background-service'
import { mlPlaylistAutoUpdate } from '@/service/ml-playlist-auto-update'
import { getFavoriteArtists } from '@/service/subsonic-api'
import { checkAndGenerateHolidayPlaylists } from '@/service/holiday-playlist-generator'  // 🆕
import { startBrainFlushLoop } from '@/service/brain-events'  // 1.6.2: Brain flush
import { startBrainBootstrapLoop } from '@/service/brain-bootstrap'  // 1.7.3: user_id мозга без настроек
import { startBrainAutoSyncLoop } from '@/service/brain-autosync'  // Автосинк вкусов (вкл по умолчанию)
import { wavePublish } from '@/service/brain-wave'  // 1.6.2: живая очередь мозгу
import { isBrainActive } from '@/store/brain.store'
import { usePlayerStore, selectCurrentSong } from '@/store/player.store'

function App() {
  const [isLoading, setIsLoading] = useState(true)
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

    // 1.7.3: поднять user_id мозга. Без него ВСЕ вызовы мозга выходили по
    // `if (!userId) return`, и синк с сервером жил только внутри открытых
    // настроек. Следит и за включением мозга, и за логином Navidrome.
    startBrainBootstrapLoop()

    // Автосинк вкусов в мозг (первый прогон ~20с, дальше каждые 30 мин).
    // Работает только если мозг включен и настроен; тумблер — в настройках мозга.
    startBrainAutoSyncLoop()

    // 1.6.2: живая очередь мозгу при ЛЮБОМ изменении очереди/текущего трека
    // (троттлинг 5с внутри wavePublish, best-effort).
    // Позицию в playback берём из audio-элемента: publish ЗАМЕНЯет слот
    // целиком, и вызов без position_sec затирал handoff — телефон/веб теряли
    // секунду, и «Продолжить с …» начинало с нуля.
    const unsubBrainQueue = usePlayerStore.subscribe(
      (s) =>
        `${s.songlist.currentList.map((t) => t.id).join(',')}|${selectCurrentSong(s)?.id ?? ''}`,
      () => {
        if (!isBrainActive()) return
        const st = usePlayerStore.getState()
        const audio = st.playerState.audioPlayerRef
        // Нет audio-элемента — не знаем позицию, лучше не публиковать вовсе
        // (player.tsx всё равно шлёт корректный publish с позицией).
        if (!audio) return
        wavePublish(
          st.songlist.currentList.map((t) => t.id).filter(Boolean),
          selectCurrentSong(st)?.id ?? null,
          {
            positionSec: Math.floor(audio.currentTime || 0),
            durationSec: Math.floor(audio.duration || 0) || undefined,
            paused: audio.paused,
          },
        )
      },
    )

    return () => unsubBrainQueue()
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
      <AchievementObserver />
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
