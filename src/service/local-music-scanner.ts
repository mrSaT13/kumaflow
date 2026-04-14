/**
 * Сервис сканирования локальных файлов
 *
 * Работает через Electron IPC для доступа к файловой системе
 */

import type { LocalTrack } from '@/store/local-music.store'

export interface ScanResult {
  tracks: LocalTrack[]
  errors: string[]
}

/**
 * Отсканировать папку и вернуть список треков
 */
export async function scanLocalFolder(
  folderPath: string,
  folderId: string,
): Promise<ScanResult> {
  const result: ScanResult = {
    tracks: [],
    errors: [],
  }

  try {
    const isElectron = typeof window !== 'undefined' && !!(window as any).api

    if (!isElectron) {
      console.warn('[Local Music Scanner] Not running in Electron')
      return result
    }

    const api = (window as any).api

    console.log('[Local Music Scanner] Scanning via IPC:', folderPath)

    // Сканируем папку через Electron API
    const scanResult = await api.scanLocalFolder(folderPath)
    
    console.log('[Local Music Scanner] Found files:', scanResult.tracks.length)

    // Парсим метаданные каждого файла
    for (const filePath of scanResult.tracks) {
      try {
        const metadata = await api.getAudioMetadata(filePath)

        // НЕ загружаем обложку сразу - это вызывает утечку памяти
        // Обложка будет загружена только когда понадобится для отображения
        const filename = basename(filePath)
        const extension = extname(filename).toLowerCase().slice(1)

        const track: LocalTrack = {
          id: `local_track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          path: filePath,
          filename,
          title: metadata?.title || filename.replace(/\.[^/.]+$/, ''),
          artist: metadata?.artist || 'Неизвестный исполнитель',
          album: metadata?.album,
          albumArtist: metadata?.albumArtist,
          genre: metadata?.genre,
          year: metadata?.year,
          trackNumber: metadata?.trackNumber,
          duration: metadata?.duration || 0,
          bitrate: metadata?.bitrate,
          sampleRate: metadata?.sampleRate,
          fileSize: metadata?.fileSize,
          format: extension,
          coverArtPath: metadata?.hasCover ? filePath : undefined,  // Храним только путь, не base64!
          folderId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        if (track.duration && track.duration > 0) {
          result.tracks.push(track)
        }
      } catch (error) {
        console.error('[Local Music Scanner] Failed to parse file:', filePath, error)
        result.errors.push(`Failed to parse: ${filePath}`)
      }
    }

    console.log('[Local Music Scanner] Parsed', result.tracks.length, 'tracks')
  } catch (error: any) {
    console.error('[Local Music Scanner] Scan error:', error.message)
    result.errors.push(`Scan error: ${error.message}`)
  }

  return result
}

// Вспомогательные функции
function basename(path: string): string {
  return path.split(/[\\/]/).pop() || ''
}

function extname(path: string): string {
  const filename = basename(path)
  const lastDot = filename.lastIndexOf('.')
  return lastDot >= 0 ? filename.substring(lastDot) : ''
}

/**
 * Распарсить метаданные аудиофайла
 */
async function parseAudioMetadata(
  file: { path: string; name: string },
  folderId: string,
): Promise<LocalTrack | null> {
  try {
    const api = (window as any).api

    // Получаем метаданные через Electron API
    const metadata = await api.getAudioMetadata(file.path)

    const filename = file.name.split(/[\\/]/).pop() || ''
    const extension = filename.split('.').pop()?.toLowerCase() || ''

    const track: LocalTrack = {
      id: `local_track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      path: file.path,
      filename,
      title: metadata.title || filename.replace(/\.[^/.]+$/, ''),
      artist: metadata.artist || 'Неизвестный исполнитель',
      album: metadata.album,
      albumArtist: metadata.albumArtist,
      genre: metadata.genre,
      year: metadata.year,
      trackNumber: metadata.trackNumber,
      duration: metadata.duration,
      bitrate: metadata.bitrate,
      sampleRate: metadata.sampleRate,
      fileSize: metadata.fileSize,
      format: extension,
      coverArtPath: metadata.hasCover ? file.path : undefined,
      folderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    return track
  } catch (error) {
    console.error('[Audio Metadata] Failed to parse:', file.path, error)
    return null
  }
}

/**
 * Получить обложку из локального файла
 */
export async function getLocalCoverArt(
  filePath: string,
): Promise<string | null> {
  try {
    const api = (window as any).api
    const coverArt = await api.getLocalCoverArt(filePath)
    return coverArt // base64 или путь к файлу
  } catch (error) {
    console.error('[Local Cover Art] Error:', error)
    return null
  }
}

/**
 * Воспроизвести локальный трек
 */
export function playLocalTrack(trackPath: string): string {
  // Возвращаем URL для воспроизведения
  const isElectron =
    typeof window !== 'undefined' && (window as any).__ELECTRON__

  if (isElectron) {
    // Для Electron создаём file:// URL
    return `file://${trackPath}`
  } else {
    // Для веба - пустой URL (не поддерживается)
    console.warn('[Local Music] Cannot play local files in browser mode')
    return ''
  }
}
