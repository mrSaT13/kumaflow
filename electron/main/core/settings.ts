import { app } from 'electron'
import { KumaFlowStore } from './store'

export interface ISettingPayload {
  minimizeToTray: boolean
  /** Запускать вместе с системой. Реализовано через setLoginItemSettings. */
  launchOnStartup: boolean
}

const settingsStore = new KumaFlowStore<ISettingPayload>({
  name: 'settings',
  defaults: {
    minimizeToTray: false,
    launchOnStartup: false,
  },
})

/**
 * Применяем автозапуск в главном процессе.
 *
 * Если поле не пришло (старый рендерер или частичное обновление), ничего
 * не делаем — иначе сохранение одного лишь minimizeToTray сбрасывало бы
 * выбор пользователя на дефолт.
 */
function applyLaunchOnStartup(enabled?: boolean): void {
  if (typeof enabled !== 'boolean') return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
  } catch (error) {
    console.log('Unable to set launch on startup.', error)
  }
}

export function saveAppSettings(payload: ISettingPayload) {
  try {
    settingsStore.set(payload)
    applyLaunchOnStartup(payload.launchOnStartup)
  } catch (error) {
    console.log('Unable to save app settings to store.', error)
  }
}

export function getAppSetting<T extends keyof ISettingPayload>(
  item: T,
): ISettingPayload[T] {
  return settingsStore.get(item)
}
