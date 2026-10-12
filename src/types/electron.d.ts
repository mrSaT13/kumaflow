import { ElectronAPI } from '@electron-toolkit/preload'
import { IKumaFlowAPI } from '../../electron/preload/types'

export {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IKumaFlowAPI
    /**
     * player.tsx пробует сначала это, потом api. Preload его выставляет
     * как минимальный { on, removeAllListeners, send }.
     */
    electronAPI?: {
      on: (channel: string, listener: (...args: unknown[]) => void) => void
      removeAllListeners: (channel: string) => void
      send: (channel: string, ...args: unknown[]) => void
    }
  }
}
