import { del, get, set } from 'idb-keyval'

export const idbStorage = {
  getItem: <T>(name: string, callback: (value: T | null) => void): void => {
    get<T>(name)
      .then((value) => {
        callback(value ?? null)
      })
      .catch(() => {
        callback(null)
      })
  },
  setItem: (name: string, value: unknown, callback?: () => void): void => {
    set(name, value)
      .then(() => callback?.())
      .catch(() => callback?.())
  },
  removeItem: (name: string, callback?: () => void): void => {
    del(name)
      .then(() => callback?.())
      .catch(() => callback?.())
  },
  // Promise-вариант для awaited чтений (rehydrate очереди, before-quit flush).
  // Возвращает null при отсутствии ключа или ошибке — как колбэк-версия.
  getItemAsync: async <T>(name: string): Promise<T | null> => {
    try {
      const value = await get<T>(name)
      return value ?? null
    } catch {
      return null
    }
  },
}
