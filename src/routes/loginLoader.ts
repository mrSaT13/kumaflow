import { redirect } from 'react-router-dom'
import { ROUTES } from '@/routes/routesList'
import { pingWithSessionCache } from '@/service/app-session'
import { subsonic } from '@/service/subsonic'
import { useAppStore } from '@/store/app.store'
import { isValidServerConnection } from '@/utils/server-config'

export async function loginLoader() {
  const data = useAppStore.getState().data

  if (isValidServerConnection(data)) {
    const isServerUp = await pingWithSessionCache(() => subsonic.ping.pingView())
    if (isServerUp) return redirect(ROUTES.LIBRARY.HOME)
  }

  return null
}
