import merge from 'lodash/merge'
import omit from 'lodash/omit'
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { createWithEqualityFn } from 'zustand/traditional'
import { pingServer } from '@/api/pingServer'
import { queryServerInfo } from '@/api/queryServerInfo'
import { AuthType, IAppContext, IServerConfig } from '@/types/serverConfig'
import { isDesktop } from '@/utils/desktop'
import { discordRpc } from '@/utils/discordRpc'
import { logger } from '@/utils/logger'
import {
  genEncodedPassword,
  genPassword,
  genPasswordToken,
  genUser,
  getAuthType,
  hasValidConfig,
} from '@/utils/salt'
import { useAccountsStore } from '@/store/accounts.store'

const {
  SERVER_URL,
  HIDE_SERVER,
  HIDE_RADIOS_SECTION,
  HIDE_AUDIOBOOKS_SECTION,
  HIDE_PLAYLISTS_SECTION,
  SERVER_TYPE,
  IMAGE_CACHE_ENABLED,
} = window

/**
 * Получить данные сервера из текущего аккаунта или глобальных настроек
 */
function getServerConfigFromAccount() {
  try {
    const currentAccount = useAccountsStore.getState().getCurrentAccount()
    
    if (currentAccount) {
      console.log('[AppStore] Using account config:', currentAccount.username)
      return {
        url: currentAccount.serverUrl,
        username: currentAccount.username,
        password: currentAccount.password || '',
        serverType: currentAccount.serverType,
      }
    }
  } catch (error) {
    // Игнорируем ошибки
  }
  
  // Возвращаем глобальные настройки (старое поведение)
  return {
    url: SERVER_URL ?? '',
    username: genUser(),
    password: '',
    serverType: SERVER_TYPE ?? 'subsonic',
  }
}

/**
 * Обновить данные сервера в store
 */
function updateServerConfig(set: any, get: any, serverConfig: ReturnType<typeof getServerConfigFromAccount>) {
  console.log('[AppStore] Updating server config:', serverConfig.username)
  
  // Обновляем через set с merge
  set((state: any) => {
    state.data.url = serverConfig.url
    state.data.username = serverConfig.username
    if (serverConfig.password) {
      state.data.password = serverConfig.password
    }
    state.data.serverType = serverConfig.serverType
    state.data.isServerConfigured = !!serverConfig.url
  }, false)  // false = не мерджить с persist
  
  // Принудительно сохраняем в localStorage
  const state = get()
  localStorage.setItem('app_store', JSON.stringify({
    state: {
      data: state.data,
      accounts: state.accounts,
      podcasts: state.podcasts,
      pages: state.pages,
    }
  }))
  
  console.log('[AppStore] Config saved to localStorage')
}

/**
 * Подписка на переключение аккаунтов для обновления app.store
 */
let unsubscribeAccounts: (() => void) | null = null

function setupAccountSubscription(set: any, get: any) {
  // Очищаем предыдущую подписку
  if (unsubscribeAccounts) {
    unsubscribeAccounts()
  }
  
  // Ждём загрузки accounts store из localStorage
  setTimeout(() => {
    console.log('[AppStore] Checking for account...')
    
    // Обновляем конфигурацию при первой загрузке
    const currentAccount = useAccountsStore.getState().getCurrentAccount()
    if (currentAccount) {
      console.log('[AppStore] Found account:', currentAccount.username)
      updateServerConfig(set, get, {
        url: currentAccount.serverUrl,
        username: currentAccount.username,
        password: currentAccount.password || '',
        serverType: currentAccount.serverType,
      })
    } else {
      console.log('[AppStore] No account found, using defaults')
    }
    
    // Подписываемся на изменения текущего аккаунта
    unsubscribeAccounts = useAccountsStore.subscribe(
      (state) => state.currentAccountId,
      (currentAccountId, prevAccountId) => {
        console.log('[AppStore] Account change detected:', { current: currentAccountId, prev: prevAccountId })
        
        // Пропускаем если аккаунт не изменился
        if (currentAccountId === prevAccountId) return
        
        if (currentAccountId) {
          const account = useAccountsStore.getState().getAccount(currentAccountId)
          if (account) {
            console.log('[AppStore] Switching to account:', account.username)
            updateServerConfig(set, get, {
              url: account.serverUrl,
              username: account.username,
              password: account.password || '',
              serverType: account.serverType,
            })
          }
        }
      }
    )
  }, 500)  // Увеличил задержку до 500ms
}

export const useAppStore = createWithEqualityFn<IAppContext>()(
  subscribeWithSelector(
    persist(
      devtools(
        immer((set, get) => ({
          data: {
            isServerConfigured: hasValidConfig,
            osType: '',
            url: SERVER_URL ?? '',
            username: genUser(),
            password: genPassword(),
            authType: getAuthType(),
            protocolVersion: '1.16.0',
            serverType: SERVER_TYPE ?? 'subsonic',
            logoutDialogState: false,
            hideServer: HIDE_SERVER ?? false,
            lockUser: hasValidConfig,
            songCount: null,
          },
          remoteControl: {
            enabled: false,
            port: 4333,
          },
          accounts: {
            discord: {
              rpcEnabled: false,
              setRpcEnabled: (value) => {
                set((state) => {
                  state.accounts.discord.rpcEnabled = value
                })
              },
            },
          },
          podcasts: {
            active: false,
            setActive: (value) => {
              set((state) => {
                state.podcasts.active = value
              })
            },
            serviceUrl: '',
            setServiceUrl: (value) => {
              set((state) => {
                state.podcasts.serviceUrl = value
              })
            },
            useDefaultUser: true,
            setUseDefaultUser: (value) => {
              set((state) => {
                state.podcasts.useDefaultUser = value
              })
            },
            customUser: '',
            setCustomUser: (value) => {
              set((state) => {
                state.podcasts.customUser = value
              })
            },
            customUrl: '',
            setCustomUrl: (value) => {
              set((state) => {
                state.podcasts.customUrl = value
              })
            },
            collapsibleState: false,
            setCollapsibleState: (value) => {
              set((state) => {
                state.podcasts.collapsibleState = value
              })
            },
          },
          pages: {
            showInfoPanel: true,
            toggleShowInfoPanel: () => {
              const { showInfoPanel } = get().pages

              set((state) => {
                state.pages.showInfoPanel = !showInfoPanel
              })
            },
            hideRadiosSection: HIDE_RADIOS_SECTION ?? false,
            setHideRadiosSection: (value) => {
              set((state) => {
                state.pages.hideRadiosSection = value
              })
            },
            hideAudiobooksSection: HIDE_AUDIOBOOKS_SECTION ?? false,
            setHideAudiobooksSection: (value) => {
              set((state) => {
                state.pages.hideAudiobooksSection = value
              })
            },
            hideLocalSection: false,
            setHideLocalSection: (value) => {
              set((state) => {
                state.pages.hideLocalSection = value
              })
            },
            hidePlaylistsSection: HIDE_PLAYLISTS_SECTION ?? false,
            setHidePlaylistsSection: (value) => {
              set((state) => {
                state.pages.hidePlaylistsSection = value
              })
            },
            hideArtistsSection: false,
            setHideArtistsSection: (value) => {
              set((state) => {
                state.pages.hideArtistsSection = value
              })
            },
            hideTracksSection: false,
            setHideTracksSection: (value) => {
              set((state) => {
                state.pages.hideTracksSection = value
              })
            },
            hideAlbumsSection: false,
            setHideAlbumsSection: (value) => {
              set((state) => {
                state.pages.hideAlbumsSection = value
              })
            },
            hideFavoritesSection: false,
            setHideFavoritesSection: (value) => {
              set((state) => {
                state.pages.hideFavoritesSection = value
              })
            },
            hideGenresSection: false,
            setHideGenresSection: (value) => {
              set((state) => {
                state.pages.hideGenresSection = value
              })
            },
            hidePodcastsSection: false,
            setHidePodcastsSection: (value) => {
              set((state) => {
                state.pages.hidePodcastsSection = value
              })
            },
            sidebarSectionOrder: [
              'artists',
              'songs',
              'albums',
              'favorites',
              'playlists',
              'podcasts',
              'radios',
              'genres',
              'audiobooks',
              'local',
              'cache',
            ] as string[],
            setSidebarSectionOrder: (order: string[]) => {
              set((state) => {
                state.pages.sidebarSectionOrder = order
              })
            },
            artistsPageViewType: 'table',
            setArtistsPageViewType: (type) => {
              set((state) => {
                state.pages.artistsPageViewType = type
              })
            },
            imagesCacheLayerEnabled: IMAGE_CACHE_ENABLED ?? false,
            setImagesCacheLayerEnabled: (value) => {
              set((state) => {
                state.pages.imagesCacheLayerEnabled = value
              })
            },
            showCachePage: true,
            setShowCachePage: (value) => {
              set((state) => {
                state.pages.showCachePage = value
              })
            },
            autoCacheStarred: true,
            setAutoCacheStarred: (value) => {
              set((state) => {
                state.pages.autoCacheStarred = value
              })
            },
          },
          desktop: {
            data: {
              minimizeToTray: false,
            },
            actions: {
              setMinimizeToTray: (value) => {
                set((state) => {
                  state.desktop.data.minimizeToTray = value
                })
              },
            },
          },
          command: {
            open: false,
            setOpen: (value) => {
              set((state) => {
                state.command.open = value
              })
            },
          },
          update: {
            openDialog: false,
            setOpenDialog: (value) => {
              set((state) => {
                state.update.openDialog = value
              })
            },
            remindOnNextBoot: false,
            setRemindOnNextBoot: (value) => {
              set((state) => {
                state.update.remindOnNextBoot = value
              })
            },
          },
          settings: {
            openDialog: false,
            setOpenDialog: (value) => {
              set((state) => {
                state.settings.openDialog = value
              })
            },
            currentPage: 'appearance',
            setCurrentPage: (page) => {
              set((state) => {
                state.settings.currentPage = page
              })
            },
          },
          actions: {
            setOsType: (value) => {
              set((state) => {
                state.data.osType = value
              })
            },
            setUrl: (value) => {
              set((state) => {
                state.data.url = value
              })
            },
            setUsername: (value) => {
              set((state) => {
                state.data.username = value
              })
            },
            setPassword: (value) => {
              set((state) => {
                state.data.password = value
              })
            },
            setRemoteEnabled: (value: boolean) => {
              set((state) => {
                state.remoteControl.enabled = value
              })
              console.log('[AppStore] Remote Control enabled:', value)
            },
            setRemotePort: (value: number) => {
              set((state) => {
                state.remoteControl.port = value
              })
              console.log('[AppStore] Remote Control port:', value)
            },
            saveConfig: async ({ url, username, password }: IServerConfig) => {
              // Получаем текущий аккаунт
              const currentAccount = useAccountsStore.getState().getCurrentAccount()

              // try both token and password methods
              for (const authType of [AuthType.TOKEN, AuthType.PASSWORD]) {
                const token =
                  authType === AuthType.TOKEN
                    ? genPasswordToken(password)
                    : genEncodedPassword(password)

                const canConnect = await pingServer(
                  url,
                  username,
                  token,
                  authType,
                )

                const serverInfo = await queryServerInfo(url)

                if (canConnect) {
                  set((state) => {
                    state.data.url = url
                    state.data.username = username
                    state.data.password = token
                    state.data.authType = authType
                    state.data.protocolVersion = serverInfo.protocolVersion
                    state.data.serverType = serverInfo.serverType
                    state.data.isServerConfigured = true
                    state.data.extensionsSupported =
                      serverInfo.extensionsSupported
                  })
                  
                  // Если есть аккаунт - обновляем его данные
                  if (currentAccount) {
                    useAccountsStore.getState().updateAccount(currentAccount.id, {
                      serverUrl: url,
                      username: username,
                      serverVersion: serverInfo.protocolVersion,
                    })
                  }
                  
                  return true
                }
              }
              set((state) => {
                state.data.isServerConfigured = false
              })
              return false
            },
            removeConfig: () => {
              set((state) => {
                state.data.isServerConfigured = false
                state.data.osType = ''
                state.data.url = ''
                state.data.username = ''
                state.data.password = ''
                state.data.authType = AuthType.TOKEN
                state.data.protocolVersion = '1.16.0'
                state.data.serverType = 'subsonic'
                state.data.songCount = null
                state.data.extensionsSupported = {}
                state.pages.showInfoPanel = true
                state.pages.hideRadiosSection = HIDE_RADIOS_SECTION ?? false
                state.pages.artistsPageViewType = 'table'
                state.podcasts.active = false
                state.podcasts.serviceUrl = ''
                state.podcasts.useDefaultUser = true
                state.podcasts.customUser = ''
                state.podcasts.customUrl = ''
              })
            },
            setLogoutDialogState: (value) => {
              set((state) => {
                state.data.logoutDialogState = value
              })
            },
          }
        })),
        {
          name: 'app_store',
        },
      ),
    {
      name: 'app_store',
      version: 1,
        merge: (persistedState, currentState) => {
          try {
            const persisted = persistedState as Partial<IAppContext> | undefined

            let hideRadiosSection = false
            let enableImageCache = false

            if (persisted && persisted.pages) {
              hideRadiosSection = persisted.pages.hideRadiosSection ?? false
              enableImageCache =
                persisted.pages.imagesCacheLayerEnabled ?? false
            }
            if (HIDE_RADIOS_SECTION !== undefined) {
              hideRadiosSection = HIDE_RADIOS_SECTION
            }
            if (IMAGE_CACHE_ENABLED !== undefined) {
              enableImageCache = IMAGE_CACHE_ENABLED
            }

            if (hasValidConfig) {
              const newState = {
                data: {
                  isServerConfigured: true,
                  url: SERVER_URL as string,
                  username: genUser(),
                  password: genPassword(),
                  authType: getAuthType(),
                  hideServer: HIDE_SERVER ?? false,
                  serverType: SERVER_TYPE ?? 'subsonic',
                  lockUser: true,
                },
                pages: {
                  hideRadiosSection,
                  imagesCacheLayerEnabled: enableImageCache,
                },
              }

              if (persistedState) {
                return merge(currentState, persistedState, newState)
              }

              return merge(currentState, newState)
            }

            const withoutLockUser = {
              data: {
                lockUser: false,
              },
              pages: {
                hideRadiosSection,
                imagesCacheLayerEnabled: enableImageCache,
              },
            }

            if (persistedState) {
              return merge(currentState, persistedState, withoutLockUser)
            }

            return merge(currentState, withoutLockUser)
          } catch (error) {
            logger.error('[AppStore] [merge] - Unable to merge states', error)

            return currentState
          }
        },
        partialize: (state) => {
          const appStore = omit(
            state,
            'data.logoutDialogState',
            'data.hideServer',
            'command.open',
            'update',
            'settings',
          )

          return appStore
        },
      },
    ),
  ),
  shallow,
)

useAppStore.subscribe(
  (state) => state.accounts.discord.rpcEnabled,
  (currentState) => {
    if (currentState) {
      discordRpc.sendCurrentSong()
    } else {
      discordRpc.clear()
    }
  },
)

useAppStore.subscribe(
  (state) => state.desktop.data,
  (data) => {
    if (!isDesktop()) return

    window.api.saveAppSettings(data)
  },
  {
    equalityFn: shallow,
  },
)

export const useAppData = () => useAppStore((state) => state.data)
export const useAppAccounts = () => useAppStore((state) => state.accounts)
export const useAppPodcasts = () => useAppStore((state) => state.podcasts)
export const useAppPodcastCollapsibleState = () =>
  useAppStore((state) => ({
    collapsibleState: state.podcasts.collapsibleState,
    setCollapsibleState: state.podcasts.setCollapsibleState,
  }))
export const useAppPages = () => useAppStore((state) => state.pages)
export const useAppDesktopData = () =>
  useAppStore((state) => state.desktop.data)
export const useAppDesktopActions = () =>
  useAppStore((state) => state.desktop.actions)
export const useAppActions = () => useAppStore((state) => state.actions)
export const useAppUpdate = () => useAppStore((state) => state.update)
export const useAppSettings = () => useAppStore((state) => state.settings)
export const useAppArtistsViewType = () =>
  useAppStore((state) => {
    const { artistsPageViewType, setArtistsPageViewType } = state.pages

    const isTableView = artistsPageViewType === 'table'
    const isGridView = artistsPageViewType === 'grid'

    return {
      artistsPageViewType,
      setArtistsPageViewType,
      isTableView,
      isGridView,
    }
  })
export const useAppImagesCacheLayer = () =>
  useAppStore((state) => ({
    imagesCacheLayerEnabled: state.pages.imagesCacheLayerEnabled,
    setImagesCacheLayerEnabled: state.pages.setImagesCacheLayerEnabled,
  }))
