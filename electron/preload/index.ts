import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
import { IKumaFlowAPI, IpcChannels, PlayerStateListenerActions } from './types'

// Custom APIs for renderer
const api: IKumaFlowAPI = {
  enterFullScreen: () => ipcRenderer.send(IpcChannels.ToggleFullscreen, true),
  exitFullScreen: () => ipcRenderer.send(IpcChannels.ToggleFullscreen, false),
  isFullScreen: () => ipcRenderer.invoke(IpcChannels.IsFullScreen),
  fullscreenStatusListener: (func) => {
    ipcRenderer.on(IpcChannels.FullscreenStatus, (_, status: boolean) =>
      func(status),
    )
  },
  removeFullscreenStatusListener: () => {
    ipcRenderer.removeAllListeners(IpcChannels.FullscreenStatus)
  },
  isMaximized: () => ipcRenderer.invoke(IpcChannels.IsMaximized),
  maximizedStatusListener: (func) => {
    ipcRenderer.on(IpcChannels.MaximizedStatus, (_, status: boolean) =>
      func(status),
    )
  },
  removeMaximizedStatusListener: () => {
    ipcRenderer.removeAllListeners(IpcChannels.MaximizedStatus)
  },
  toggleMaximize: (isMaximized) =>
    ipcRenderer.send(IpcChannels.ToggleMaximize, isMaximized),
  toggleMinimize: () => ipcRenderer.send(IpcChannels.ToggleMinimize),
  closeWindow: () => ipcRenderer.send(IpcChannels.CloseWindow),
  setTitleBarOverlayColors: (color) =>
    ipcRenderer.send(IpcChannels.ThemeChanged, color),
  setNativeTheme: (isDark) =>
    ipcRenderer.send(IpcChannels.UpdateNativeTheme, isDark),
  downloadFile: (payload) =>
    ipcRenderer.send(IpcChannels.HandleDownloads, payload),
  downloadCompletedListener: (func) => {
    ipcRenderer.once(IpcChannels.DownloadCompleted, (_, fileId: string) =>
      func(fileId),
    )
  },
  downloadFailedListener: (func) => {
    ipcRenderer.once(IpcChannels.DownloadFailed, (_, fileId: string) =>
      func(fileId),
    )
  },
  updatePlayerState: (payload) => {
    ipcRenderer.send(IpcChannels.UpdatePlayerState, payload)
  },
  playerStateListener: (func) => {
    ipcRenderer.on(
      IpcChannels.PlayerStateListener,
      (_, state: PlayerStateListenerActions) => func(state),
    )
  },
  setDiscordRpcActivity: (payload) => {
    ipcRenderer.send(IpcChannels.SetDiscordRpcActivity, payload)
  },
  clearDiscordRpcActivity: () => {
    ipcRenderer.send(IpcChannels.ClearDiscordRpcActivity)
  },
  saveAppSettings: (payload) => {
    ipcRenderer.send(IpcChannels.SaveAppSettings, payload)
  },
  checkForUpdates: () => ipcRenderer.invoke(IpcChannels.CheckForUpdates),
  downloadUpdate: () => ipcRenderer.send(IpcChannels.DownloadUpdate),
  quitAndInstall: () => ipcRenderer.send(IpcChannels.QuitAndInstall),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateAvailable, (_, info) => callback(info))
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateNotAvailable, () => callback())
  },
  onUpdateError: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateError, (_, error) => callback(error))
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on(IpcChannels.DownloadProgress, (_, progress) =>
      callback(progress),
    )
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on(IpcChannels.UpdateDownloaded, (_, info) => callback(info))
  },
  // Audiobookshelf Proxy
  audiobookshelfRequest: (url, method, body, apiKey) =>
    ipcRenderer.invoke(IpcChannels.AudiobookshelfRequest, { url, method, body, apiKey }),
  // External fetch proxy (for CORS)
  fetchExternal: (url) => ipcRenderer.invoke('fetch-external', { url }),
  // Tray menu events
  onOpenSearch: (callback) => {
    ipcRenderer.on('open-search', () => callback())
    return () => ipcRenderer.removeAllListeners('open-search')
  },
  onGenerateMyWave: (callback) => {
    ipcRenderer.on('generate-my-wave', () => callback())
    return () => ipcRenderer.removeAllListeners('generate-my-wave')
  },
  onGenerateTrends: (callback) => {
    ipcRenderer.on('generate-trends', () => callback())
    return () => ipcRenderer.removeAllListeners('generate-trends')
  },
  onShuffleAll: (callback) => {
    ipcRenderer.on('shuffle-all', () => callback())
    return () => ipcRenderer.removeAllListeners('shuffle-all')
  },
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', () => callback())
    return () => ipcRenderer.removeAllListeners('open-settings')
  },
  onOpenAbout: (callback) => {
    ipcRenderer.on('open-about', () => callback())
    return () => ipcRenderer.removeAllListeners('open-about')
  },
  onSetSleepTimer: (callback) => {
    const listener = (_, minutes: number) => callback(minutes)
    ipcRenderer.on('set-sleep-timer', listener)
    return () => ipcRenderer.removeListener('set-sleep-timer', listener)
  },
  onGenerateArtistRadio: (callback) => {
    ipcRenderer.on('generate-artist-radio', () => callback())
    return () => ipcRenderer.removeAllListeners('generate-artist-radio')
  },
  // Yandex Music
  yandexMusicAuth: (login, password) => {
    return ipcRenderer.invoke('yandex-music:auth', { login, password })
  },
  yandexMusicApi: (payload) => {
    return ipcRenderer.invoke('yandex-music:api', payload)
  },
  // Last.fm Scrobble (через Electron для обхода CORS)
  lastFmScrobble: (url, method, body) => {
    return ipcRenderer.invoke('lastfm-scrobble', { url, method, body })
  },
  // Local Music
  selectFolderDialog: () => {
    return ipcRenderer.invoke('select-folder-dialog')
  },
  scanLocalFolder: (folderPath: string) => {
    return ipcRenderer.invoke('scan-local-folder', folderPath)
  },
  getAudioMetadata: (filePath: string) => {
    return ipcRenderer.invoke('get-audio-metadata', filePath)
  },
  getLocalCoverArt: (filePath: string) => {
    return ipcRenderer.invoke('get-local-cover-art', filePath)
  },
  streamLocalFile: (filePath: string) => {
    return ipcRenderer.invoke('stream-local-file', filePath)
  },
  getLocalCoverBlob: (filePath: string) => {
    return ipcRenderer.invoke('get-local-cover-blob', filePath)
  },
  // Remote Control IPC
  remoteControl: {
    start: () => ipcRenderer.invoke('remote-control:start'),
    stop: () => ipcRenderer.invoke('remote-control:stop'),
    getStatus: () => ipcRenderer.invoke('remote-control:get-status'),
    getUrl: () => ipcRenderer.invoke('remote-control:get-url'),
    getAllIps: () => ipcRenderer.invoke('remote-control:get-all-ips'),
    setIp: (ip: string) => ipcRenderer.invoke('remote-control:set-ip', ip),
    setPort: (port: number) => ipcRenderer.invoke('remote-control:set-port', port),
    getPort: () => ipcRenderer.invoke('remote-control:get-port'),
    setSubsonicUrl: (url: string, username: string, password: string, authType: 'token' | 'password') =>
      ipcRenderer.invoke('remote-control:set-subsonic-url', url, username, password, authType),
    getConnectedClients: () => ipcRenderer.invoke('remote-control:get-connected-clients'),
    hasSavedCredentials: () => ipcRenderer.invoke('remote-control:hasSavedCredentials'),
    loadSettings: () => ipcRenderer.invoke('remote-control:loadSettings'),
  },
  // DLNA IPC
  dlna: {
    start: (port?: number) => ipcRenderer.invoke('dlna:start', port),
    stop: () => ipcRenderer.invoke('dlna:stop'),
    scan: () => ipcRenderer.invoke('dlna:scan'),
    cast: (device: any, trackId: string) => ipcRenderer.invoke('dlna:cast', device, trackId),
    getCurrentDevice: () => ipcRenderer.invoke('dlna:getCurrentDevice'),
  },
  // IPC listeners
  on: (channel: string, callback: any) => {
    ipcRenderer.on(channel, callback)
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
  send: (channel: string, ...args: any[]) => {
    ipcRenderer.send(channel, ...args)
  },
  // Remote Control command listener
  onRemoteCommand: (callback: any) => {
    ipcRenderer.on('remote-control-command', callback)
  },
  removeRemoteCommandListener: () => {
    ipcRenderer.removeAllListeners('remote-control-command')
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', {
      send: (channel: string, ...args: any[]) => {
        ipcRenderer.send(channel, ...args)
      },
      on: (channel: string, callback: any) => {
        ipcRenderer.on(channel, callback)
      },
      removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel)
      },
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
  // @ts-expect-error (define in dts)
  window.electronAPI = {
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args)
    },
    on: (channel: string, callback: any) => {
      ipcRenderer.on(channel, callback)
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel)
    },
  }
}
