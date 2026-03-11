import { ElectronAPI } from '@electron-toolkit/preload'
import { IKumaFlowAPI } from '../../electron/preload/types'

export {}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IKumaFlowAPI
  }
}
