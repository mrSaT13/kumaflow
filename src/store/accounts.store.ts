/**
 * Store для управления мультиаккаунтностью
 * 
 * Хранит:
 * - Список всех аккаунтов
 * - Текущий активный аккаунт
 * - Методы переключения и управления
 * 
 * ВАЖНО: Этот store НЕ хранит данные аккаунтов (ML, рейтинги, настройки).
 * Он только управляет переключением. Данные хранятся в отдельных stores
 * с префиксами accountId.
 */

import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

/**
 * Тип сервера
 */
export type ServerType = 'navidrome' | 'subsonic' | 'jellyfin' | 'lms'

/**
 * Модель аккаунта
 */
export interface Account {
  // Уникальный идентификатор (генерируется при создании)
  id: string

  // Отображаемое имя (заполняется пользователем или автоматически)
  name: string

  // Данные сервера
  serverUrl: string
  username: string
  password?: string  // Зашифрованный пароль (TODO: шифрование)
  serverType: ServerType

  // Версия сервера (заполняется при подключении)
  serverVersion?: string

  // Аватарка аккаунта (base64)
  avatarData?: string

  // 🔔 РЕЗЕРВНЫЕ URL (Dual URL)
  primaryUrl: string         // Приоритетный (основной) URL
  backupUrl?: string         // Резервный (дополнительный) URL
  isBackupEnabled: boolean   // Включено ли авто-переключение
  isPrimaryAvailable: boolean  // Доступен ли основной URL (мониторинг)
  lastHealthCheck?: number   // Timestamp последней проверки

  // Ключи для изолированного хранения данных
  // Формируются как: `${keyPrefix}_${accountId}`
  storageKeys: {
    mlProfile: string      // 'ml_profile_${id}'
    ratings: string        // 'ratings_${id}'
    settings: string       // 'settings_${id}'
    avatar: string         // 'avatar_${id}'
    playlists: string      // 'playlists_${id}'
    subscriptions: string  // 'subscriptions_${id}'
  }

  // Метаданные
  createdAt: number        // Timestamp создания
  lastUsedAt: number       // Timestamp последнего использования
  isActive: boolean        // Активен ли сейчас
}

/**
 * Данные для создания нового аккаунта
 */
export interface CreateAccountData {
  name?: string            // Опционально, генерируется автоматически
  serverUrl: string
  username: string
  password?: string        // Опционально
  avatarData?: string      // Опционально, base64
  serverType?: ServerType  // Опционально, определяется автоматически
}

/**
 * Store состояние
 */
interface AccountsStore {
  // Список всех аккаунтов
  accounts: Account[]
  
  // ID текущего активного аккаунта (null если не выбран)
  currentAccountId: string | null
  
  // Actions: Управление аккаунтами
  addAccount: (data: CreateAccountData) => Account
  removeAccount: (accountId: string) => void
  switchAccount: (accountId: string) => void
  updateAccount: (accountId: string, data: Partial<Account>) => void
  updateLastUsed: (accountId: string) => void
  
  // Actions: Получение данных
  getCurrentAccount: () => Account | null
  getAccount: (accountId: string) => Account | null
  getAccounts: () => Account[]
  
  // Actions: Проверки
  hasAccounts: () => boolean
  isSingleAccountMode: () => boolean
}

/**
 * Генерация уникального ID
 */
function generateAccountId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Создание ключей хранилища для аккаунта
 */
function createStorageKeys(accountId: string): Account['storageKeys'] {
  return {
    mlProfile: `ml_profile_${accountId}`,
    ratings: `ratings_${accountId}`,
    settings: `settings_${accountId}`,
    avatar: `avatar_${accountId}`,
    playlists: `playlists_${accountId}`,
    subscriptions: `subscriptions_${accountId}`,
  }
}

/* // TODO: Jellyfin/MusicAssistant server detection
export async function detectServerType(url: string): Promise<ServerType> {
  // ... commented out
  return 'navidrome'
}
*/

/**
 * Значения по умолчанию
 */
const defaultState: AccountsStore = {
  accounts: [],
  currentAccountId: null,
  
  addAccount: () => {
    console.warn('[Accounts] addAccount called before initialization')
    return null as any
  },
  
  removeAccount: () => {
    console.warn('[Accounts] removeAccount called before initialization')
  },
  
  switchAccount: () => {
    console.warn('[Accounts] switchAccount called before initialization')
  },
  
  updateAccount: () => {
    console.warn('[Accounts] updateAccount called before initialization')
  },
  
  updateLastUsed: () => {
    console.warn('[Accounts] updateLastUsed called before initialization')
  },
  
  getCurrentAccount: () => null,
  getAccount: () => null,
  getAccounts: () => [],
  hasAccounts: () => false,
  isSingleAccountMode: () => true,
}

/**
 * Создание store
 */
export const useAccountsStore = createWithEqualityFn<AccountsStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          ...defaultState,
          
          /**
           * Добавить новый аккаунт
           */
          addAccount: (data: CreateAccountData) => {
            const id = generateAccountId()
            const now = Date.now()
            
            // Определяем тип сервера (пока заглушка)
            const serverType = data.serverType || 'navidrome'
            
            // Генерируем имя если не указано
            const name = data.name || `${data.username}@${data.serverUrl}`
            
            const newAccount: Account = {
              id,
              name,
              serverUrl: data.serverUrl,
              username: data.username,
              password: data.password,
              serverType,
              avatarData: data.avatarData,
              storageKeys: createStorageKeys(id),
              createdAt: now,
              lastUsedAt: now,
              isActive: false,
            }
            
            set((state) => {
              state.accounts.push(newAccount)
              
              // Если это первый аккаунт - делаем активным
              if (state.accounts.length === 1) {
                state.currentAccountId = id
                state.accounts[0].isActive = true
              }
            })
            
            console.log('[Accounts] Account added:', {
              id,
              name,
              username: data.username,
              serverUrl: data.serverUrl,
              hasPassword: !!data.password,
              hasAvatar: !!data.avatarData,
              totalAccounts: get().accounts.length,
            })
            
            // Проверяем что аккаунт сохранился
            setTimeout(() => {
              const allAccounts = get().accounts
              console.log('[Accounts] All accounts after save:', allAccounts.map(a => ({ id: a.id, name: a.name, username: a.username })))
            }, 100)
            
            return newAccount
          },
          
          /**
           * Удалить аккаунт
           */
          removeAccount: (accountId: string) => {
            const account = get().getAccount(accountId)
            if (!account) {
              console.warn('[Accounts] Account not found:', accountId)
              return
            }
            
            set((state) => {
              // Удаляем аккаунт из списка
              state.accounts = state.accounts.filter(a => a.id !== accountId)
              
              // Если удалили текущий - сбрасываем
              if (state.currentAccountId === accountId) {
                state.currentAccountId = null
                // Делаем активным первый оставшийся
                if (state.accounts.length > 0) {
                  state.currentAccountId = state.accounts[0].id
                  state.accounts[0].isActive = true
                }
              }
            })
            
            console.log('[Accounts] Account removed:', accountId)
            
            // Очищаем данные аккаунта из localStorage
            clearAccountStorage(account.storageKeys)
          },
          
          /**
           * Переключиться на другой аккаунт
           */
          switchAccount: (accountId: string) => {
            const account = get().getAccount(accountId)
            if (!account) {
              console.error('[Accounts] Cannot switch - account not found:', accountId)
              return
            }

            set((state) => {
              // Снимаем активность с текущего
              const currentAccount = state.accounts.find(a => a.isActive)
              if (currentAccount) {
                currentAccount.isActive = false
              }

              // Находим аккаунт и делаем активным
              const targetAccount = state.accounts.find(a => a.id === accountId)
              if (targetAccount) {
                targetAccount.isActive = true
                targetAccount.lastUsedAt = Date.now()
              }

              state.currentAccountId = accountId
            })

            console.log('[Accounts] Switched to account:', {
              id: accountId,
              name: account.name,
              username: account.username,
            })
            
            // Перезагружаем приложение для применения нового контекста
            // Это нужно чтобы ВСЕ stores (ML, плейлисты, и т.д.) подгрузили данные для нового аккаунта
            console.log('[Accounts] Reloading application to apply new account context...')
            setTimeout(() => {
              window.location.reload()
            }, 300)
          },
          
          /**
           * Обновить данные аккаунта
           */
          updateAccount: (accountId: string, data: Partial<Account>) => {
            set((state) => {
              const account = state.accounts.find(a => a.id === accountId)
              if (account) {
                Object.assign(account, data)
              }
            })
            
            console.log('[Accounts] Account updated:', accountId, data)
          },
          
          /**
           * Обновить время последнего использования
           */
          updateLastUsed: (accountId: string) => {
            set((state) => {
              const account = state.accounts.find(a => a.id === accountId)
              if (account) {
                account.lastUsedAt = Date.now()
              }
            })
          },
          
          /**
           * Получить текущий аккаунт
           */
          getCurrentAccount: () => {
            const state = get()
            if (!state.currentAccountId) return null
            return state.accounts.find(a => a.id === state.currentAccountId) || null
          },
          
          /**
           * Получить аккаунт по ID
           */
          getAccount: (accountId: string) => {
            return get().accounts.find(a => a.id === accountId) || null
          },
          
          /**
           * Получить все аккаунты
           */
          getAccounts: () => {
            return get().accounts
          },
          
          /**
           * Есть ли аккаунты
           */
          hasAccounts: () => {
            return get().accounts.length > 0
          },
          
          /**
           * Режим одного аккаунта (старое поведение)
           */
          isSingleAccountMode: () => {
            return get().accounts.length === 0
          },
        })),
        {
          name: 'accounts_store',
        },
      ),
    ),
    {
      name: 'accounts-persistence',
      storage: {
        getItem: async (name) => {
          const item = localStorage.getItem(name)
          return item ? JSON.parse(item) : null
        },
        setItem: async (name, value) => {
          localStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: async (name) => {
          localStorage.removeItem(name)
        },
      },
      // Не сохраняем методы, только данные
      partialize: (state) => ({
        accounts: state.accounts,
        currentAccountId: state.currentAccountId,
      }),
    },
  ),
)

/**
 * Очистка данных аккаунта из localStorage
 */
function clearAccountStorage(keys: Account['storageKeys']) {
  console.log('[Accounts] Clearing storage for account:', keys)
  Object.values(keys).forEach(key => {
    localStorage.removeItem(key)
  })
}

/**
 * Хуки для удобного доступа
 */
export const useCurrentAccount = () => useAccountsStore((state) => state.getCurrentAccount())
export const useAccounts = () => useAccountsStore((state) => state.getAccounts())
export const useAccountsActions = () => useAccountsStore((state) => ({
  addAccount: state.addAccount,
  removeAccount: state.removeAccount,
  switchAccount: state.switchAccount,
  updateAccount: state.updateAccount,
}))
