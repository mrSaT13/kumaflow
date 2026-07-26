import { useState, useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Linux } from '@/app/components/controls/linux'
import { SettingsDialog } from '@/app/components/settings/dialog'
import { SettingsTrayListener } from '@/app/components/settings/tray-listener'
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
import { AppSessionObserver } from '@/app/observers/app-session-observer'
import { LangObserver } from '@/app/observers/lang-observer'
import { MediaSessionObserver } from '@/app/observers/media-session-observer'
import { ThemeObserver } from '@/app/observers/theme-observer'
import { ToastContainer } from '@/app/observers/toast-container'
import { UpdateObserver } from '@/app/observers/update-observer'
import { router } from '@/routes/router'
import { isDesktop as isElectron, isLinux } from '@/utils/desktop'
import { useListenBrainzStore } from '@/store/listenbrainz.store'
import { usePlaybackActions } from '@/store/playback.store'
import { useAppStore } from '@/store/app.store'
import { dualUrlBackgroundService } from '@/service/dual-url-background-service'
import { mlPlaylistAutoUpdate } from '@/service/ml-playlist-auto-update'
import { getFavoriteArtists } from '@/service/subsonic-api'
import { checkAndGenerateHolidayPlaylists } from '@/service/holiday-playlist-generator'  // 🆕
import { ensureSessionStarted, isWarmSession } from '@/service/app-session'
import { isValidServerConnection } from '@/utils/server-config'

function runServerDependentStartup(syncFavoriteArtists: () => Promise<void>) {
  const data = useAppStore.getState().data

  if (!isValidServerConnection(data)) {
    console.log('[App] Server not configured, skipping Navidrome startup tasks')
    return
  }

  console.log('[App] Starting Dual URL background service...')
  dualUrlBackgroundService.start()

  console.log('[App] Starting ML playlist auto-update service...')
  mlPlaylistAutoUpdate.start()

  console.log('[App] Checking holiday playlists...')
  checkAndGenerateHolidayPlaylists()

  console.log('[App] Syncing favorite artists from Navidrome...')
  void syncFavoriteArtists()
}

function App() {
  const [isLoading, setIsLoading] = useState(() => !isWarmSession())
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
    ensureSessionStarted()

    console.log('[App] Initializing external API services...')
    initializeServices()
    initializeListenBrainz()

    const startServerTasks = () => runServerDependentStartup(syncFavoriteArtists)

    if (useAppStore.persist.hasHydrated()) {
      startServerTasks()
    } else {
      useAppStore.persist.onFinishHydration(startServerTasks)
    }

    const unsubscribe = useAppStore.subscribe(
      (state) =>
        isValidServerConnection(state.data)
          ? `${state.data.url}:${state.data.username}`
          : '',
      (connectionKey, prevKey) => {
        if (connectionKey && connectionKey !== prevKey) {
          startServerTasks()
        }
      },
    )

    return () => {
      unsubscribe()
    }
  }, [initializeServices, initializeListenBrainz])

  // Функция синхронизации лайкнутых артистов
  async function syncFavoriteArtists() {
    if (!isValidServerConnection(useAppStore.getState().data)) {
      return
    }

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

  return (
    <>
      {isElectron() && <UpdateObserver />}
      <AppSessionObserver />
      <MediaSessionObserver />
      <LangObserver />
      <ThemeObserver />
      <SettingsTrayListener />
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
