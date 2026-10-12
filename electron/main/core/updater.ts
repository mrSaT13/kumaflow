import { BrowserWindow, ipcMain, dialog, app } from 'electron'
import electronUpdater from 'electron-updater'
import { IpcChannels } from '../../preload/types'

const { autoUpdater } = electronUpdater

let updateWindow: BrowserWindow | null = null
let updateDownloaded = false
let updateChecking = false

export function setUpdaterWindow(window: BrowserWindow | null) {
  updateWindow = window
  console.log('[Updater] Window set:', window ? 'OK' : 'NULL')
}

export function initAutoUpdater() {
  // Регистрируем IPC handlers для CheckForUpdates ВСЕГДА
  // В dev mode возвращаем stub, в production - реальная проверка
  ipcMain.handle(IpcChannels.CheckForUpdates, async () => {
    const isDev = !app.isPackaged
    if (isDev) {
      console.log('[Updater] Check for updates called (dev mode stub)')
      return { isUpdateAvailable: false, devMode: true }
    }
    
    if (updateChecking) {
      console.log('[Updater] Already checking for updates')
      return { isUpdateAvailable: false, checking: true }
    }

    try {
      updateChecking = true
      // Таймаут 10 секунд
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: проверка обновлений')), 10000)
      })

      const updatePromise = autoUpdater.checkForUpdates()

      const result = await Promise.race([updatePromise, timeoutPromise])
      updateChecking = false
      return result
    } catch (e: any) {
      console.error('Failed to check for updates:', e.message)
      updateChecking = false
      return { error: e.message, isUpdateAvailable: false }
    }
  })

  // DownloadUpdate и QuitAndInstall handlers
  ipcMain.on(IpcChannels.DownloadUpdate, () => {
    const isDev = !app.isPackaged
    if (isDev) {
      console.log('[Updater] Download update called (dev mode stub)')
      return
    }
    console.log('[Updater] Download update requested')
    updateDownloaded = false
    autoUpdater.downloadUpdate()
  })

  ipcMain.on(IpcChannels.QuitAndInstall, () => {
    const isDev = !app.isPackaged
    if (isDev) {
      console.log('[Updater] Quit and install called (dev mode stub)')
      return
    }
    console.log('[Updater] Quit and install requested')
    autoUpdater.quitAndInstall()
  })

  // Отключаем автообновление для dev сборок
  const isDev = !app.isPackaged
  if (isDev) {
    console.log('[Updater] Disabled in development mode')
    return
  }
  
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.forceDevUpdateConfig = false

  console.log('[Updater] Initialized')

  // Updater Events
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...')
    updateWindow?.webContents.send(IpcChannels.CheckingForUpdate)
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version)
    updateWindow?.webContents.send(IpcChannels.UpdateAvailable, info)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] No updates available')
    updateWindow?.webContents.send(IpcChannels.UpdateNotAvailable)
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message)
    updateWindow?.webContents.send(IpcChannels.UpdateError, err.message)
  })

  autoUpdater.on('download-progress', (progressObj) => {
    console.log('[Updater] Download progress:', progressObj.percent, '%')
    updateWindow?.webContents.send(IpcChannels.DownloadProgress, progressObj)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version)
    updateDownloaded = true

    // Отправляем уведомление что обновление готово
    updateWindow?.webContents.send(IpcChannels.UpdateDownloaded, info)
    
    // Показываем диалог с предложением перезагрузиться
    dialog.showMessageBox({
      type: 'info',
      title: 'Обновление готово',
      message: `Обновление ${info.version} загружено и готово к установке.`,
      detail: 'Приложение будет перезапущено для установки обновления.',
      buttons: ['Перезагрузить сейчас', 'Позже'],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        console.log('[Updater] User chose to restart now')
        autoUpdater.quitAndInstall()
      } else {
        console.log('[Updater] User chose to restart later - will install on quit')
        // Обновление установится при следующем закрытии приложения
      }
    }).catch((err) => {
      console.error('[Updater] Dialog error:', err)
      // Принудительная установка
      setTimeout(() => {
        autoUpdater.quitAndInstall()
      }, 2000)
    })
  })
  
  // Установка обновления при закрытии приложения
  app.on('before-quit', () => {
    if (updateDownloaded) {
      console.log('[Updater] Installing update on quit')
      autoUpdater.quitAndInstall()
    }
  })
}

export function isUpdateDownloaded(): boolean {
  return updateDownloaded
}
