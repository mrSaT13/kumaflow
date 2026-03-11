import { platform } from '@electron-toolkit/utils'
import { app, Menu, NativeImage, nativeImage, Tray } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { productName } from '../../package.json'
import { getMacOsMediaIcon } from './core/macMedia'
import {
  getDisplaysMaxScaleFactor,
  getVariantForScaleFactor,
  NativeIconVariants,
} from './core/nativeIcons'
import { sendPlayerEvents } from './core/playerEvents'
import { playerState } from './core/playerState'
import { resourcesPath } from './core/taskbar'
import { mainWindow } from './window'

const traySpacer = Array.from({ length: 30 }).join(' ')

export let tray: Tray | null = null

function getTrayIconPath(size: number): string {
  let dirName = 'other'
  const fileName = `icon-${size}x${size}.png`

  if (platform.isMacOS) dirName = 'mac'

  return join(resourcesPath, 'assets', 'tray', dirName, fileName)
}

function getTrayIcon(): NativeImage {
  let image: NativeImage

  if (platform.isLinux) {
    // Linux: Static tray icons
    // Use a single tray icon for Linux, as it does not support scale factors.
    // We choose the best icon based on the highest display scale factor.
    const scaleFactor = getDisplaysMaxScaleFactor()
    const variant = getVariantForScaleFactor(scaleFactor)
    const iconPath = getTrayIconPath(variant.size)
    const buffer = readFileSync(iconPath)

    image = nativeImage.createFromBuffer(buffer, {
      scaleFactor: 1.0,
      width: variant.size,
      height: variant.size,
    })
  } else {
    // Windows/macOS: Responsive tray icons
    image = nativeImage.createEmpty()

    for (const variant of NativeIconVariants) {
      const iconPath = getTrayIconPath(variant.size)
      const buffer = readFileSync(iconPath)
      image.addRepresentation({
        buffer,
        width: variant.size,
        height: variant.size,
        scaleFactor: variant.scaleFactor,
      })
    }

    // Set image as a Template Image for macOS.
    if (platform.isMacOS) image.setTemplateImage(true)
  }

  return image
}

export function createTray() {
  const trayIcon = getTrayIcon()
  tray = new Tray(trayIcon)

  if (!platform.isMacOS) {
    tray.setToolTip(productName)
  }

  updateTray()

  tray.on('click', () => {
    tray?.popUpContextMenu()
  })
}

export function updateTray(title?: string) {
  if (!mainWindow || !tray) return

  const trayIcon = getTrayIcon()

  const isVisible = mainWindow.isVisible()
  const trayTooltip = title ?? mainWindow.title

  const { isPlaying, hasPrevious, hasNext, hasSonglist } = playerState.value()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: productName + traySpacer,
      ...(trayTooltip !== productName ? { sublabel: trayTooltip } : {}),
      ...(platform.isMacOS ? { icon: trayIcon } : {}),
      type: 'normal',
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: 'Предыдущий',
      type: 'normal',
      enabled: hasPrevious,
      ...(platform.isMacOS
        ? {
            icon: getMacOsMediaIcon('previous'),
            accelerator: 'Cmd+Left',
          }
        : {}),
      click: () => {
        sendPlayerEvents('skipBackwards')
      },
    },
    {
      label: isPlaying ? 'Пауза' : 'Воспроизвести',
      type: 'normal',
      enabled: hasSonglist,
      ...(platform.isMacOS
        ? {
            icon: getMacOsMediaIcon(isPlaying ? 'pause' : 'play'),
            accelerator: 'Space',
          }
        : {}),
      click: () => {
        sendPlayerEvents('togglePlayPause')
      },
    },
    {
      label: 'Следующий',
      type: 'normal',
      enabled: hasNext,
      ...(platform.isMacOS
        ? {
            icon: getMacOsMediaIcon('next'),
            accelerator: 'Cmd+Right',
          }
        : {}),
      click: () => {
        sendPlayerEvents('skipForward')
      },
    },
    {
      type: 'separator',
    },
    {
      label: isVisible ? 'Скрыть' : 'Показать',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return

        if (isVisible) {
          mainWindow.hide()
        } else {
          mainWindow.show()
        }

        updateTray()
      },
    },
    {
      label: 'Таймер сна',
      enabled: hasSonglist,
      submenu: Menu.buildFromTemplate([
        {
          label: '5 минут',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            mainWindow.webContents.send('set-sleep-timer', 5)
          },
        },
        {
          label: '15 минут',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            mainWindow.webContents.send('set-sleep-timer', 15)
          },
        },
        {
          label: '30 минут',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            mainWindow.webContents.send('set-sleep-timer', 30)
          },
        },
        {
          label: 'Выключить',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            mainWindow.webContents.send('set-sleep-timer', 0)
          },
        },
      ]),
    },
    {
      label: 'Радио артиста',
      enabled: hasSonglist,
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send('generate-artist-radio')
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Настройки',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send('open-settings')
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Выход',
      click: () => {
        if (tray) tray.destroy()
        if (mainWindow) mainWindow.destroy()
        app.quit()
      },
    },
  ])

  if (!platform.isMacOS) {
    tray.setToolTip(trayTooltip)
  }
  tray.setContextMenu(contextMenu)
}
