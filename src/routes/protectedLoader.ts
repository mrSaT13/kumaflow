import { redirect } from 'react-router-dom'
import { ROUTES } from '@/routes/routesList'
import {
  invalidateAppSession,
  pingWithSessionCache,
} from '@/service/app-session'
import { subsonic } from '@/service/subsonic'
import { useAppStore } from '@/store/app.store'
import { isValidServerConnection } from '@/utils/server-config'

export async function protectedLoader() {
  const data = useAppStore.getState().data

  if (!isValidServerConnection(data)) {
    console.warn('[protectedLoader] Invalid server config, redirecting to login:', {
      url: data.url || '(empty)',
      username: data.username || '(empty)',
      hasPassword: !!data.password,
      isServerConfigured: data.isServerConfigured,
    })
    useAppStore.getState().actions.removeConfig()
    invalidateAppSession()
    return redirect(ROUTES.SERVER_CONFIG)
  }

  const isServerUp = await pingWithSessionCache(() => subsonic.ping.pingView())
  if (!isServerUp) {
    invalidateAppSession()
    return redirect(ROUTES.SERVER_CONFIG)
  }

  return null
}

export async function podcastsLoader() {
  const { active } = useAppStore.getState().podcasts

  if (!active) {
    return redirect(ROUTES.LIBRARY.HOME)
  }

  return null
}
