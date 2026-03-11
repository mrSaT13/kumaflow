import { BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import { IpcChannels } from '../../preload/types'

const { autoUpdater } = electronUpdater

let updateWindow: BrowserWindow | null = null

export function setUpdaterWindow(window: BrowserWindow | null) {
  updateWindow = window
}

export function initAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.forceDevUpdateConfig = false

  // IPC Handlers
  ipcMain.handle(IpcChannels.CheckForUpdates, async () => {
    try {
      // Таймаут 10 секунд
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: проверка обновлений')), 10000)
      })
      
      const updatePromise = autoUpdater.checkForUpdates()
      
      return await Promise.race([updatePromise, timeoutPromise])
    } catch (e: any) {
      console.error('Failed to check for updates:', e.message)
      return { error: e.message }
    }
  })

  ipcMain.on(IpcChannels.DownloadUpdate, () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.on(IpcChannels.QuitAndInstall, () => {
    autoUpdater.quitAndInstall()
  })

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
    updateWindow?.webContents.send(IpcChannels.UpdateDownloaded, info)
  })
}
