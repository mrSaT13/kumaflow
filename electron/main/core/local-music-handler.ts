/**
 * Обработчики IPC для локальной музыки
 *
 * Функционал:
 * - Выбор папки через диалог
 * - Сканирование папки
 * - Получение метаданных аудиофайлов
 */

import { ipcMain, dialog } from 'electron'
import { mainWindow } from '../window'
import { app } from 'electron'
import { promises as fs } from 'fs'
import { join, basename, extname, normalize } from 'path'

// Поддержка метаданных через music-metadata
let mm: any = null

async function getMusicMetadata() {
  if (!mm) {
    mm = await import('music-metadata')
  }
  return mm
}

export function setupLocalMusicHandlers() {
  console.log('[LocalMusic] Setting up IPC handlers...')

  /**
   * Диалог выбора папки
   */
  ipcMain.handle('select-folder-dialog', async () => {
    console.log('[LocalMusic] Opening folder dialog...')
    
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.error('[LocalMusic] Main window not available')
      return null
    }

    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Выберите папку с музыкой',
        defaultPath: app.getPath('music'),
      })

      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        console.log('[LocalMusic] Folder selected:', selectedPath)
        return selectedPath
      }

      console.log('[LocalMusic] Folder selection canceled')
      return null
    } catch (error) {
      console.error('[LocalMusic] Dialog error:', error)
      return null
    }
  })

  /**
   * Сканирование папки на наличие аудиофайлов
   */
  ipcMain.handle('scan-local-folder', async (_, folderPath: string) => {
    console.log('[LocalMusic] Scanning folder:', folderPath)

    if (!folderPath) {
      return { tracks: [], errors: ['No folder path provided'] }
    }

    try {
      // Проверяем существование папки
      await fs.access(folderPath)
      
      // Рекурсивное сканирование
      const audioFiles = await scanDirectory(folderPath)
      console.log('[LocalMusic] Found', audioFiles.length, 'audio files')
      console.log('[LocalMusic] Files:', audioFiles.slice(0, 10)) // Показываем первые 10

      return {
        tracks: audioFiles,
        errors: [],
      }
    } catch (error: any) {
      console.error('[LocalMusic] Scan error:', error.message)
      return {
        tracks: [],
        errors: [error.message],
      }
    }
  })

  /**
   * Получение метаданных аудиофайла
   * Возвращает только текстовые метаданные - без обложек!
   */
  ipcMain.handle('get-audio-metadata', async (_, filePath: string) => {
    console.log('[LocalMusic] Getting metadata for:', filePath)

    if (!filePath) {
      return null
    }

    try {
      const metadataLib = await getMusicMetadata()
      const metadata = await metadataLib.parseFile(filePath)

      // Проверяем наличие обложки (но не загружаем её!)
      const hasCover = metadata.common.picture && metadata.common.picture.length > 0

      return {
        title: metadata.common.title || basename(filePath, extname(filePath)),
        artist: metadata.common.artist || 'Неизвестный исполнитель',
        album: metadata.common.album,
        albumArtist: metadata.common.albumartist,
        genre: metadata.common.genre?.[0],
        year: metadata.common.year,
        trackNumber: metadata.common.track.no,
        duration: metadata.format.duration,
        bitrate: metadata.format.bitrate,
        sampleRate: metadata.format.sampleRate,
        fileSize: (await fs.stat(filePath)).size,
        hasCover,
        // coverPath больше не возвращаем - это вызывало утечку памяти
      }
    } catch (error: any) {
      console.error('[LocalMusic] Metadata error:', error.message)

      // Возвращаем базовую информацию из имени файла
      const fileName = basename(filePath, extname(filePath))
      return {
        title: fileName,
        artist: 'Неизвестный исполнитель',
        duration: 0,
        hasCover: false,
      }
    }
  })

  /**
   * Стриминг локального аудиофайла
   * Возвращает специальный URL для воспроизведения через протокол kumaflow-local
   */
  ipcMain.handle('stream-local-file', async (_, filePath: string) => {
    console.log('[LocalMusic] Streaming file:', filePath)

    if (!filePath) {
      return null
    }

    try {
      // Проверяем существование файла
      await fs.access(filePath)

      // Используем наш кастомный протокол для корректной работы с кириллицей
      // Кодируем путь в URI format
      const encodedPath = encodeURIComponent(filePath)
      const fileUrl = `kumaflow-local://${encodedPath}`
      console.log('[LocalMusic] Returning file URL:', fileUrl)

      return fileUrl
    } catch (error: any) {
      console.error('[LocalMusic] Stream error:', error.message)
      return null
    }
  })

  /**
   * Получить обложку как Blob URL (вместо base64 для экономии памяти)
   */
  ipcMain.handle('get-local-cover-blob', async (_, filePath: string) => {
    console.log('[LocalMusic] Getting cover blob for:', filePath)

    if (!filePath) {
      return null
    }

    try {
      const metadataLib = await getMusicMetadata()
      const metadata = await metadataLib.parseFile(filePath)

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const picture = metadata.common.picture[0]
        // Возвращаем буфер как есть, фронтенд создаст Blob URL
        return {
          data: picture.data.toString('base64'),
          format: picture.format,
        }
      }

      return null
    } catch (error) {
      console.error('[LocalMusic] Cover blob error:', error)
      return null
    }
  })

  console.log('[LocalMusic] IPC handlers setup complete')
}

/**
 * Рекурсивное сканирование директории
 */
async function scanDirectory(dir: string, audioFiles: string[] = []): Promise<string[]> {
  // Поддерживаемые форматы (добавляем больше форматов)
  const supportedFormats = ['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.wma', '.aac', '.opus', '.aiff', '.ape', '.mka']
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    console.log('[LocalMusic] Scanning directory:', dir, 'Entries:', entries.length)

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        // Пропускаем системные папки
        if (entry.name.startsWith('.') || entry.name === '$RECYCLE.BIN') {
          continue
        }
        // Рекурсивно сканируем подпапки
        await scanDirectory(fullPath, audioFiles)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        console.log('[LocalMusic] Checking file:', entry.name, 'Extension:', ext)
        if (supportedFormats.includes(ext)) {
          console.log('[LocalMusic] Audio file found:', fullPath)
          audioFiles.push(fullPath)
        }
      }
    }
  } catch (error: any) {
    console.warn('[LocalMusic] Error scanning directory:', dir, error.message)
  }

  console.log('[LocalMusic] Total audio files in', dir, ':', audioFiles.length)
  return audioFiles
}
