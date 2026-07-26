import { useEffect, useRef } from 'react'
import { useIsMobile } from '@/app/hooks/use-mobile'
import { useMainSidebar } from '@/app/components/ui/main-sidebar'
import { useAppSettings } from '@/store/app.store'

export function SettingsSidebarBridge() {
  const isMobile = useIsMobile()
  const { openDialog, setOpenDialog, setMobileView } = useAppSettings()
  const { openMobile, setOpenMobile } = useMainSidebar()
  const prevOpenMobile = useRef(openMobile)

  useEffect(() => {
    if (!isMobile || !openDialog || openMobile) return
    setOpenMobile(true)
  }, [isMobile, openDialog, openMobile, setOpenMobile])

  useEffect(() => {
    const wasOpen = prevOpenMobile.current
    prevOpenMobile.current = openMobile

    if (!isMobile || !wasOpen || openMobile || !openDialog) return
    setOpenDialog(false)
    setMobileView('categories')
  }, [isMobile, openMobile, openDialog, setOpenDialog, setMobileView])

  return null
}
