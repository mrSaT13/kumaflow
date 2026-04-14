/**
 * Хук для загрузки обложек локальных треков
 * Использует Blob URL вместо base64 для экономии памяти
 */

import { useEffect, useState } from 'react'

export function useLocalCoverArt(filePath: string | undefined) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filePath) {
      setCoverUrl(null)
      return
    }

    let blobUrl: string | null = null
    let cancelled = false

    async function loadCover() {
      setLoading(true)

      try {
        const isElectron = typeof window !== 'undefined' && !!(window as any).api

        if (!isElectron) {
          console.warn('[LocalCoverArt] Not running in Electron')
          setLoading(false)
          return
        }

        // Получаем обложку как base64 от Electron
        const result = await window.api.getLocalCoverBlob(filePath)

        if (cancelled) return

        if (result?.data && result?.format) {
          // Создаём Blob из base64
          const byteCharacters = atob(result.data)
          const byteNumbers = new Array(byteCharacters.length)

          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
          }

          const byteArray = new Uint8Array(byteNumbers)
          const blob = new Blob([byteArray], { type: result.format })

          // Создаём Blob URL
          blobUrl = URL.createObjectURL(blob)
          setCoverUrl(blobUrl)
        } else {
          setCoverUrl(null)
        }
      } catch (error) {
        console.error('[LocalCoverArt] Error loading cover:', error)
        if (!cancelled) {
          setCoverUrl(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadCover()

    return () => {
      cancelled = true
      // Освобождаем Blob URL при размонтировании
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [filePath])

  return { coverUrl, loading }
}
