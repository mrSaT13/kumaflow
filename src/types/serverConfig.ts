import { SettingsOptions } from '@/app/components/settings/options'

export enum AuthType {
  PASSWORD,
  TOKEN,
}

export interface IServerConfig {
  url: string
  username: string
  password: string
  protocolVersion?: string
  serverType?: string
  extensionsSupported?: Record<string, number[]>
}

export type PageViewType = 'grid' | 'table'

/**
 * Флаги страниц и секций сайдбара. Значения живут в app.store (app.store.ts
 * раздел pages), интерфейс тут просто описывает форму.
 */
interface IAppPages {
  showInfoPanel: boolean
  toggleShowInfoPanel: () => void
  hideRadiosSection: boolean
  setHideRadiosSection: (value: boolean) => void
  hideAudiobooksSection: boolean
  setHideAudiobooksSection: (value: boolean) => void
  hideLocalSection: boolean
  setHideLocalSection: (value: boolean) => void
  hidePlaylistsSection: boolean
  setHidePlaylistsSection: (value: boolean) => void
  hideArtistsSection: boolean
  setHideArtistsSection: (value: boolean) => void
  hideTracksSection: boolean
  setHideTracksSection: (value: boolean) => void
  hideAlbumsSection: boolean
  setHideAlbumsSection: (value: boolean) => void
  hideFavoritesSection: boolean
  setHideFavoritesSection: (value: boolean) => void
  hideGenresSection: boolean
  setHideGenresSection: (value: boolean) => void
  hidePodcastsSection: boolean
  setHidePodcastsSection: (value: boolean) => void
  hideMlSection: boolean
  setHideMlSection: (value: boolean) => void
  sidebarSectionOrder: string[]
  setSidebarSectionOrder: (order: string[]) => void
  showCachePage: boolean
  setShowCachePage: (value: boolean) => void
  autoCacheStarred: boolean
  setAutoCacheStarred: (value: boolean) => void
  artistsPageViewType: PageViewType
  setArtistsPageViewType: (type: PageViewType) => void
  imagesCacheLayerEnabled: boolean
  setImagesCacheLayerEnabled: (value: boolean) => void
}

export interface IAppData extends IServerConfig {
  authType: AuthType | null
  isServerConfigured: boolean
  osType: string
  logoutDialogState: boolean
  hideServer: boolean
  lockUser: boolean
  songCount: number | null
  remoteControl?: {
    enabled: boolean
    port: number
  }
}

export interface IAppActions {
  setOsType: (value: string) => void
  setUrl: (value: string) => void
  setUsername: (value: string) => void
  setPassword: (value: string) => void
  setRemoteEnabled: (value: boolean) => void
  setRemotePort: (value: number) => void
  saveConfig: (data: IServerConfig) => Promise<boolean>
  removeConfig: () => void
  setLogoutDialogState: (value: boolean) => void
}

export interface IAppCommand {
  open: boolean
  setOpen: (value: boolean) => void
}

export interface IAppUpdate {
  openDialog: boolean
  setOpenDialog: (value: boolean) => void
  remindOnNextBoot: boolean
  setRemindOnNextBoot: (value: boolean) => void
}

interface IAppSettings {
  openDialog: boolean
  setOpenDialog: (value: boolean) => void
  currentPage: SettingsOptions
  setCurrentPage: (page: SettingsOptions) => void
}

interface IPodcasts {
  active: boolean
  setActive: (value: boolean) => void
  serviceUrl: string
  setServiceUrl: (value: string) => void
  useDefaultUser: boolean
  setUseDefaultUser: (value: boolean) => void
  customUser: string
  setCustomUser: (value: string) => void
  customUrl: string
  setCustomUrl: (value: string) => void
  collapsibleState: boolean
  setCollapsibleState: (value: boolean) => void
}

interface IAccounts {
  discord: {
    rpcEnabled: boolean
    setRpcEnabled: (value: boolean) => void
  }
}

// When changing the desktop data types
// You have to update the electron one.
// Located at -> electron > main > core > settings.ts
interface IDesktop {
  data: {
    minimizeToTray: boolean
    launchOnStartup: boolean
  }
  actions: {
    setMinimizeToTray: (value: boolean) => void
    setLaunchOnStartup: (value: boolean) => void
  }
}

export interface IAppContext {
  data: IAppData
  remoteControl: {
    enabled: boolean
    port: number
  }
  accounts: IAccounts
  podcasts: IPodcasts
  pages: IAppPages
  desktop: IDesktop
  command: IAppCommand
  actions: IAppActions
  update: IAppUpdate
  settings: IAppSettings
}
