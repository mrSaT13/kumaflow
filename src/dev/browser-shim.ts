/**
 * Заглушка Electron API для запуска рендерера в обычном браузере.
 *
 * Нужна только для разработки и тестов: `npm run dev` открывает плеер как
 * веб-страницу, но код рендерера при загрузке модулей дёргает window.api
 * (player.store вызывает updatePlayerState на верхнем уровне подписки), а
 * preload существует лишь в Electron. Без этой заглушки страница падала с
 * "Cannot read properties of undefined (reading 'updatePlayerState')" и
 * #root оставался пустым.
 *
 * В Electron ничего не делается — там bridge уже установлен preload'ом.
 * Все методы — заглушки; ничего не отправляется наружу.
 */

import type { IKumaFlowAPI } from '../../electron/preload/types'

const isElectron =
  typeof window !== 'undefined' &&
  (typeof window.electron !== 'undefined' ||
    typeof window.api !== 'undefined' ||
    typeof window.electronAPI !== 'undefined')

if (!isElectron && typeof window !== 'undefined') {
  const noop = () => undefined
  /** Подписка без единого слушателя: onX(cb) просто ничего не делает. */
  const subscribe = () => noop

  const api: IKumaFlowAPI = {
    // Окно
    enterFullScreen: noop,
    exitFullScreen: noop,
    isFullScreen: () => Promise.resolve(false),
    fullscreenStatusListener: subscribe,
    removeFullscreenStatusListener: noop,
    isMaximized: () => Promise.resolve(false),
    maximizedStatusListener: subscribe,
    removeMaximizedStatusListener: noop,
    toggleMaximize: noop,
    toggleMinimize: noop,
    closeWindow: noop,
    setTitleBarOverlayColors: noop,
    setNativeTheme: noop,

    // Загрузки
    downloadFile: noop,
    downloadCompletedListener: subscribe,
    downloadFailedListener: subscribe,

    // Плеер
    updatePlayerState: noop,
    playerStateListener: subscribe,

    // Discord
    setDiscordRpcActivity: noop,
    clearDiscordRpcActivity: noop,

    // Настройки / обновления
    saveAppSettings: noop,
    checkForUpdates: () => Promise.resolve(null),
    downloadUpdate: noop,
    quitAndInstall: noop,
    onUpdateAvailable: subscribe,
    onUpdateNotAvailable: subscribe,
    onUpdateError: subscribe,
    onDownloadProgress: subscribe,
    onUpdateDownloaded: subscribe,

    // Прокси
    audiobookshelfRequest: () => Promise.resolve({}),
    fetchExternal: () => Promise.resolve({}),
    lastFmScrobble: () => Promise.resolve(null),

    // Yandex Music
    yandexMusicAuth: () => Promise.resolve({ success: false }),
    yandexMusicApi: () => Promise.resolve({}),

    // Локальная библиотека
    selectFolderDialog: () => Promise.resolve(null),
    scanLocalFolder: () => Promise.resolve({ tracks: [], errors: [] }),
    getAudioMetadata: () => Promise.resolve(null),
    getLocalCoverArt: () => Promise.resolve(null),
    streamLocalFile: () => Promise.resolve(''),
    getLocalCoverBlob: () => Promise.resolve(null),

    // Команды главного меню/трейя
    onOpenSearch: subscribe,
    onGenerateMyWave: subscribe,
    onGenerateTrends: subscribe,
    onShuffleAll: subscribe,
    onOpenSettings: subscribe,
    onOpenAbout: subscribe,
    onSetSleepTimer: subscribe,
    onGenerateArtistRadio: subscribe,

    // Remote control / DLNA
    remoteControl: {
      start: () => Promise.resolve(false),
      stop: () => Promise.resolve(false),
      getStatus: () => Promise.resolve({ running: false }),
      getUrl: () => Promise.resolve(''),
      getAllIps: () => Promise.resolve([]),
      getAllUrls: () => Promise.resolve([]),
      setIp: () => Promise.resolve(false),
      setPort: () => Promise.resolve(false),
      getPort: () => Promise.resolve(0),
      setPin: () => Promise.resolve(false),
      hasPin: () => Promise.resolve(false),
      setSubsonicUrl: () => Promise.resolve(false),
      hasSavedCredentials: () => Promise.resolve(false),
      loadSettings: () => Promise.resolve({}),
    },
    dlna: {
      start: () => Promise.resolve(false),
      stop: () => Promise.resolve(),
      scan: () => Promise.resolve([]),
      cast: () => Promise.resolve(false),
      getCurrentDevice: () => null,
    },

    onRemoteCommand: subscribe,
    removeRemoteCommandListener: noop,
  }

  window.api = api

  // player.tsx пробует сначала window.electronAPI, потом window.api
  window.electronAPI = {
    on: subscribe,
    removeAllListeners: noop,
    send: noop,
  }

  // Некоторые ветки проверяют window.electron
  window.electron = window.electron ?? { ipcRenderer: { on: noop, send: noop, removeListener: noop } }

  console.info(
    '[browser-shim] window.api заглушен: плеер запущен вне Electron, ' +
      'нативные вызовы (окно, трей, автообновление, remote) не работают.',
  )
}

export {}