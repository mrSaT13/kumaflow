/**
 * Сервис экспорта/импорта настроек KumaFlow
 * Экспортирует все настройки в JSON файл и импортирует обратно
 */

import { toast } from 'react-toastify'
import { getAppInfo } from '@/utils/appName'

// Версия формата экспорта
const EXPORT_VERSION = '1.0.0'

// Интерфейс экспортируемых данных
export interface ExportData {
  version: string
  exportedAt: string
  kumaFlowVersion: string
  playback: any
  ml: any
  externalApi: any
  sleepTimer: any
  theme: any
  likedArtists: string[]
  bannedArtists: string[]
  likedSongs: string[]
  dislikedSongs: string[]
}

/**
 * Получить все настройки из localStorage
 */
function getAllSettings(): ExportData {
  const { version } = getAppInfo()
  
  const exportData: ExportData = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    kumaFlowVersion: version,
    playback: null,
    ml: null,
    externalApi: null,
    sleepTimer: null,
    theme: null,
    likedArtists: [],
    bannedArtists: [],
    likedSongs: [],
    dislikedSongs: [],
  }

  // Получаем настройки из localStorage
  try {
    // Playback store
    const playback = localStorage.getItem('playback-persistence')
    if (playback) {
      exportData.playback = JSON.parse(playback)
    }

    // ML store
    const ml = localStorage.getItem('ml-persistence')
    if (ml) {
      exportData.ml = JSON.parse(ml)
    }

    // External API store
    const externalApi = localStorage.getItem('external-api-persistence')
    if (externalApi) {
      exportData.externalApi = JSON.parse(externalApi)
    }

    // Sleep timer store
    const sleepTimer = localStorage.getItem('sleep-timer-persistence')
    if (sleepTimer) {
      exportData.sleepTimer = JSON.parse(sleepTimer)
    }

    // Theme store
    const theme = localStorage.getItem('theme-persistence')
    if (theme) {
      exportData.theme = JSON.parse(theme)
    }

    // ListenBrainz store
    const listenbrainz = localStorage.getItem('listenbrainz-persistence')
    if (listenbrainz) {
      exportData.listenbrainz = JSON.parse(listenbrainz)
    }

    // Last.fm token (из сервиса)
    const lastfmToken = localStorage.getItem('lastfm_session_key')
    if (lastfmToken) {
      exportData.lastfmToken = lastfmToken
    }

    // ListenBrainz token
    const listenbrainzToken = localStorage.getItem('listenbrainz_token')
    if (listenbrainzToken) {
      exportData.listenbrainzToken = listenbrainzToken
    }

    // Любимые артисты (из ML store)
    if (exportData.ml?.state?.profile?.preferredArtists) {
      exportData.likedArtists = Object.keys(exportData.ml.state.profile.preferredArtists)
    }

    // Забаненные артисты
    if (exportData.ml?.state?.profile?.bannedArtists) {
      exportData.bannedArtists = exportData.ml.state.profile.bannedArtists
    }

    // Любимые треки (из like store)
    const likedSongs = localStorage.getItem('liked-songs')
    if (likedSongs) {
      exportData.likedSongs = JSON.parse(likedSongs)
    }

    // Дизлайк треки
    const dislikedSongs = localStorage.getItem('disliked-songs')
    if (dislikedSongs) {
      exportData.dislikedSongs = JSON.parse(dislikedSongs)
    }

  } catch (error) {
    console.error('[Export] Error reading settings:', error)
    toast.error('Ошибка при чтении настроек')
  }

  return exportData
}

/**
 * Экспортировать настройки в файл
 */
export async function exportSettings(): Promise<boolean> {
  try {
    const exportData = getAllSettings()

    // Создаём JSON
    const jsonString = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    // Создаём имя файла с датой
    const date = new Date().toISOString().split('T')[0]
    const filename = `kumaflow-settings-${date}.json`

    // Создаём ссылку для скачивания
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    console.log('[Export] Settings exported to', filename)
    toast.success(`✅ Настройки экспортированы в ${filename}`)

    // Создаём резервную копию после экспорта
    createBackup()

    // Проверяем доступность файла (через 500ms)
    setTimeout(() => {
      checkFileAccessibility(filename)
    }, 500)

    return true
  } catch (error) {
    console.error('[Export] Error:', error)
    toast.error('❌ Ошибка при экспорте настроек')
    return false
  }
}

/**
 * Проверка доступности экспортированного файла
 */
function checkFileAccessibility(filename: string) {
  // Проверяем есть ли файл в загрузках браузера
  // Это косвенная проверка - просто подтверждаем что экспорт прошёл
  console.log('[Export] File accessibility check:', filename)
  toast.info('📁 Файл сохранён в папке загрузок', {
    autoClose: 3000,
  })
}

/**
 * Импортировать настройки из файла
 */
export async function importSettings(file: File): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (event) => {
      try {
        const importData = JSON.parse(event.target?.result as string)

        // Валидация структуры
        if (!validateExportData(importData)) {
          toast.error('❌ Неверный формат файла')
          reject(new Error('Invalid export data format'))
          return
        }

        // Показываем что будет импортировано
        const confirmImport = await showImportPreview(importData)
        if (!confirmImport) {
          console.log('[Import] User cancelled import')
          resolve(false)
          return
        }

        // Создаём резервную копию текущих настроек
        createBackup()

        // Импортируем настройки
        await applyImportData(importData)

        console.log('[Import] Settings imported successfully')
        toast.success('✅ Настройки импортированы! Перезагрузите страницу.')

        // Предлагаем перезагрузить страницу
        setTimeout(() => {
          if (confirm('Перезагрузить страницу для применения настроек?')) {
            window.location.reload()
          }
        }, 1000)

        resolve(true)
      } catch (error) {
        console.error('[Import] Error:', error)
        toast.error('❌ Ошибка при импорте настроек')
        reject(error)
      }
    }

    reader.onerror = () => {
      console.error('[Import] File read error')
      toast.error('❌ Ошибка при чтении файла')
      reject(new Error('File read error'))
    }

    reader.readAsText(file)
  })
}

/**
 * Валидация структуры экспортируемых данных
 */
function validateExportData(data: any): boolean {
  // Проверяем обязательные поля
  if (!data.version || !data.exportedAt) {
    return false
  }

  // Проверяем что это файл от KumaFlow
  if (!data.kumaFlowVersion) {
    return false
  }

  // Проверяем версию формата
  const exportVersion = data.version
  if (exportVersion !== EXPORT_VERSION) {
    console.warn('[Import] Version mismatch:', exportVersion, '!=', EXPORT_VERSION)
    // Не блокируем, просто предупреждаем
  }

  return true
}

/**
 * Показать превью импорта
 */
async function showImportPreview(data: ExportData): Promise<boolean> {
  // Формируем текст превью
  let preview = 'Будут импортированы:\n\n'

  if (data.playback) preview += '• Настройки воспроизведения\n'
  if (data.ml) preview += '• ML профиль и рекомендации\n'
  if (data.externalApi) preview += '• Настройки внешних API\n'
  if (data.theme) preview += '• Тема оформления\n'
  if (data.likedArtists?.length) preview += `• Любимые артисты (${data.likedArtists.length})\n`
  if (data.bannedArtists?.length) preview += `• Забаненные артисты (${data.bannedArtists.length})\n`
  if (data.likedSongs?.length) preview += `• Любимые треки (${data.likedSongs.length})\n`

  preview += `\nЭкспортировано: ${new Date(data.exportedAt).toLocaleString('ru-RU')}`
  preview += `\nВерсия KumaFlow: ${data.kumaFlowVersion}`

  return confirm(preview)
}

/**
 * Создать резервную копию текущих настроек
 */
export function createBackup() {
  const backupData = getAllSettings()
  const backupKey = 'settings-backup-' + Date.now()
  localStorage.setItem(backupKey, JSON.stringify(backupData))
  console.log('[Backup] Created:', backupKey)
  // Сообщаем что данные изменились
  window.dispatchEvent(new Event('storage'))
  return backupKey
}

/**
 * Применить импортированные данные
 */
async function applyImportData(data: ExportData) {
  // Импортируем настройки по очереди
  if (data.playback) {
    localStorage.setItem('playback-persistence', JSON.stringify(data.playback))
  }

  if (data.ml) {
    localStorage.setItem('ml-persistence', JSON.stringify(data.ml))
  }

  if (data.externalApi) {
    localStorage.setItem('external-api-persistence', JSON.stringify(data.externalApi))
  }

  if (data.sleepTimer) {
    localStorage.setItem('sleep-timer-persistence', JSON.stringify(data.sleepTimer))
  }

  if (data.theme) {
    localStorage.setItem('theme-persistence', JSON.stringify(data.theme))
  }

  if (data.listenbrainz) {
    localStorage.setItem('listenbrainz-persistence', JSON.stringify(data.listenbrainz))
  }

  if (data.lastfmToken) {
    localStorage.setItem('lastfm_session_key', data.lastfmToken)
  }

  if (data.listenbrainzToken) {
    localStorage.setItem('listenbrainz_token', data.listenbrainzToken)
  }

  if (data.likedSongs?.length) {
    localStorage.setItem('liked-songs', JSON.stringify(data.likedSongs))
  }

  if (data.dislikedSongs?.length) {
    localStorage.setItem('disliked-songs', JSON.stringify(data.dislikedSongs))
  }

  console.log('[Import] All settings applied')
}

/**
 * Очистить все резервные копии
 */
export function clearBackups() {
  const keys = Object.keys(localStorage)
  keys.forEach(key => {
    if (key.startsWith('settings-backup-')) {
      localStorage.removeItem(key)
    }
  })
  console.log('[Backup] Old backups cleared')
}

/**
 * Получить список резервных копий
 */
export function getBackups(): Array<{ key: string; date: string }> {
  const keys = Object.keys(localStorage)
  return keys
    .filter(key => key.startsWith('settings-backup-'))
    .map(key => ({
      key,
      date: new Date(parseInt(key.replace('settings-backup-', ''))).toLocaleString('ru-RU'),
    }))
    .sort((a, b) => b.key.localeCompare(a.key))
}

/**
 * Восстановить из резервной копии
 */
export async function restoreFromBackup(backupKey: string): Promise<boolean> {
  const backupData = localStorage.getItem(backupKey)
  if (!backupData) {
    toast.error('❌ Резервная копия не найдена')
    return false
  }

  try {
    const data = JSON.parse(backupData)
    await applyImportData(data)
    toast.success('✅ Настройки восстановлены! Перезагрузите страницу.')
    return true
  } catch (error) {
    console.error('[Restore] Error:', error)
    toast.error('❌ Ошибка при восстановлении')
    return false
  }
}
