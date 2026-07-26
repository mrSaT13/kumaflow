import { useEffect } from 'react'
import { openSettings } from '@/lib/settings-navigation'

export function SettingsTrayListener() {
  useEffect(() => {
    const handleOpenSettingsFromTray = () => {
      openSettings()
    }

    window.addEventListener('open-settings-from-tray', handleOpenSettingsFromTray)
    return () => {
      window.removeEventListener('open-settings-from-tray', handleOpenSettingsFromTray)
    }
  }, [])

  return null
}
