import type { SettingsOptions } from '@/app/components/settings/options'
import { useAppSettings } from '@/store/app.store'
import { Accounts } from './accounts'
import { Account } from './account'
import { Appearance } from './appearance'
import { Audio } from './audio'
import { CacheSettings } from './content/cache'
import { Content } from './content'
import { ExternalApiContent } from './content/external-api'
import { Desktop } from './desktop'
import { Language } from './language'
import { LocalMusicSettings } from './content/local-music'
import { Privacy } from './privacy'

const pages: Record<SettingsOptions, JSX.Element> = {
  appearance: <Appearance />,
  audio: <Audio />,
  language: <Language />,
  'external-api': <ExternalApiContent />,
  content: <Content />,
  'local-music': <LocalMusicSettings />,
  cache: <CacheSettings />,
  accounts: <Accounts />,
  account: <Account />,
  desktop: <Desktop />,
  privacy: <Privacy />,
}

export function Pages({ page }: { page?: SettingsOptions }) {
  const { currentPage: storePage } = useAppSettings()
  const currentPage = page ?? storePage

  if (currentPage === 'accounts') {
    return (
      <div className="w-full min-w-0">
        {pages[currentPage]}
      </div>
    )
  }

  return (
    <div className="w-full min-w-0">
      {pages[currentPage]}
    </div>
  )
}
