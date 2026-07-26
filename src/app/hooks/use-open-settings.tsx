import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSettingsPagePath } from '@/lib/settings-navigation'
import type { SettingsOptions } from '@/app/components/settings/options'

export function useOpenSettings() {
  const navigate = useNavigate()

  return useCallback((page?: SettingsOptions) => {
    navigate(getSettingsPagePath(page))
  }, [navigate])
}
