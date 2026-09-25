import { is } from '@electron-toolkit/utils'
import { app, nativeImage, nativeTheme } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { mainWindow } from '../window'
import { sendPlayerEvents } from './playerEvents'
import { playerState } from './playerState'

function resolveResourcesPath(): string {
  if (is.dev) return join(app.getAppPath(), 'resources')
  // В проде extraResources могут лежать как resources/resources, так и плоско в resources/
  // (зависит от electron-builder) — берём ту папку, где реально есть assets
  const nested = join(process.resourcesPath, 'resources')
  try {
    if (existsSync(join(nested, 'assets'))) return nested
    if (existsSync(join(process.resourcesPath, 'assets'))) return process.resourcesPath
  } catch { /* ignore */ }
  return nested
}

export const resourcesPath = resolveResourcesPath()
const taskbarIconsPath = join(resourcesPath, 'taskbar')

const buttons = {
  previous: 'skip_previous.png',
  pause: 'pause.png',
  play: 'play.png',
  next: 'skip_next.png',
}

export function getTaskbarIcon(icon: keyof typeof buttons) {
  const themeFolder = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'

  const iconName = buttons[icon]
  const iconPath = join(taskbarIconsPath, themeFolder, iconName)

  return nativeImage.createFromPath(iconPath)
}

export function setTaskbarButtons() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!mainWindow.isVisible()) return

  const { isPlaying, hasPrevious, hasNext, hasSonglist } = playerState.value()

  mainWindow.setThumbarButtons([
    {
      icon: getTaskbarIcon('previous'),
      flags: hasPrevious ? undefined : ['disabled'],
      click() {
        sendPlayerEvents('skipBackwards')
      },
    },
    {
      icon: getTaskbarIcon(isPlaying ? 'pause' : 'play'),
      flags: hasSonglist ? undefined : ['disabled'],
      click() {
        sendPlayerEvents('togglePlayPause')
      },
    },
    {
      icon: getTaskbarIcon('next'),
      flags: hasNext ? undefined : ['disabled'],
      click() {
        sendPlayerEvents('skipForward')
      },
    },
  ])
}
