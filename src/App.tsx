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
import { LangObserver } from '@/app/observers/lang-observer'
import { MediaSessionObserver } from '@/app/observers/media-session-observer'
import { ThemeObserver } from '@/app/observers/theme-observer'
import { ToastContainer } from '@/app/observers/toast-container'
import { UpdateObserver } from '@/app/observers/update-observer'
import { Mobile } from '@/app/pages/mobile'
import { router } from '@/routes/router'
import { isDesktop as isElectron, isLinux } from '@/utils/desktop'
import { useExternalApiStore } from '@/store/external-api.store'
import { useListenBrainzStore } from '@/store/listenbrainz.store'
import { usePlaybackActions } from '@/store/playback.store'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const { setFloatingPlayerEnabled } = usePlaybackActions()

  // Инициализация внешних API (Last.fm и др.) при старте
  const initializeServices = useExternalApiStore(state => state.initializeServices)
  const initializeListenBrainz = useListenBrainzStore(state => state.initialize)

  useEffect(() => {
    console.log('[App] Initializing external API services...')
    initializeServices()
    initializeListenBrainz()
  }, [initializeServices, initializeListenBrainz])

  // ML Playlist notifications and auto-update
  useMLPlaylistNotifications()

  // Background audio analysis (BPM, Energy, etc.)
  useBackgroundAudioAnalysis()

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
