import { useEffect, useState } from 'react'

interface UpdateInfo {
  version: string
  releaseNotes?: string | any
}

interface UpdateResult {
  updateInfo?: UpdateInfo
}

interface DownloadProgress {
  percent: number
  bytesPerSecond: number
}

export function useElectronAPI() {
  const [api, setApi] = useState<any>(null)

  useEffect(() => {
    // Проверяем, запущено ли в Electron
    if ((window as any).api) {
      setApi((window as any).api)
    }
  }, [])

  if (!api) {
    return null
  }

  return {
    checkForUpdates: async (): Promise<UpdateResult | null> => {
      try {
        return await api.checkForUpdates()
      } catch (error) {
        console.error('Failed to check for updates:', error)
        return null
      }
    },

    downloadUpdate: () => {
      api.downloadUpdate()
    },

    quitAndInstall: () => {
      api.quitAndInstall()
    },

    onDownloadProgress: (callback: (progress: DownloadProgress) => void) => {
      api.onDownloadProgress(callback)
      return () => {
        // Cleanup listener if needed
      }
    },

    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
      api.onUpdateDownloaded(callback)
      return () => {
        // Cleanup listener if needed
      }
    },
  }
}
