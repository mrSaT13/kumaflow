import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

interface AuthState {
  isAuthenticated: boolean
  serverUrl: string | null
  username: string | null
}

interface AuthStore extends AuthState {
  setAuthenticated: (authenticated: boolean) => void
  setServer: (url: string, username: string) => void
  logout: () => void
}

const initialState: AuthState = {
  isAuthenticated: false,
  serverUrl: null,
  username: null,
}

export const useAuthStore = createWithEqualityFn<AuthStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          ...initialState,

          setAuthenticated: (authenticated) => {
            set((state) => {
              state.isAuthenticated = authenticated
            })
          },

          setServer: (url, username) => {
            set((state) => {
              state.serverUrl = url
              state.username = username
              state.isAuthenticated = true
            })
          },

          logout: () => {
            set({
              ...initialState,
            })
          },
        })),
        {
          name: 'auth_store',
        },
      ),
    ),
    {
      name: 'auth-persistence',
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
    },
  ),
)

export const useAuth = () => useAuthStore((state) => state)
