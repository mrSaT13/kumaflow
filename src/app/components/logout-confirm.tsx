import { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog'
import { ROUTES } from '@/routes/routesList'
import { useAppActions, useAppStore } from '@/store/app.store'
import { usePlayerActions } from '@/store/player.store'

interface AlertDialogProps {
  openDialog: boolean
  setOpenDialog: (value: boolean) => void
}

export function LogoutConfirmDialog({
  openDialog,
  setOpenDialog,
}: AlertDialogProps) {
  const { removeConfig } = useAppActions()
  const setLogoutDialogState = useAppStore(
    (state) => state.actions.setLogoutDialogState,
  )
  const navigate = useNavigate()
  const { clearPlayerState, resetConfig } = usePlayerActions()
  const { t } = useTranslation()

  function handleRemoveConfig(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault()

    // 💾 Принудительно сохраняем ВСЕ данные перед выходом
    try {
      // Zustand persist пишет в localStorage синхронно,
      // но для надёжности даём 200мс на завершение записи
      const stores = ['ml_profile', 'ratings', 'settings', 'accounts-persistence',
                     'homepage-settings', 'page-design-settings', 'theme-store',
                     'ml-playlists', 'ml-playlists-state', 'generated-playlists',
                     'app-persistence', 'auth-persistence', 'shared-accounts'];

      for (const key of stores) {
        const data = localStorage.getItem(key)
        if (data) {
          console.log('[Logout] ✓ Сохранён:', key, '(' + Math.round(data.length / 1024) + ' KB)')
        }
      }
    } catch (err) {
      console.error('[Logout] Error checking stores:', err)
    }

    removeConfig()
    clearPlayerState()
    resetConfig()
    setLogoutDialogState(false)
    navigate(ROUTES.SERVER_CONFIG, { replace: true })
  }

  return (
    <AlertDialog open={openDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('logout.dialog.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('logout.dialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpenDialog(!openDialog)}>
            {t('logout.dialog.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleRemoveConfig}>
            {t('logout.dialog.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
