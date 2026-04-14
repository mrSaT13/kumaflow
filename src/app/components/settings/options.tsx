import {
  CircleUserRound,
  Database,
  EarthLock,
  FileText,
  Globe,
  Headphones,
  LaptopIcon,
  Music2,
  Paintbrush,
} from 'lucide-react'
import { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/app/components/ui/sidebar'
import { useAppSettings } from '@/store/app.store'
import { isDesktop } from '@/utils/desktop'

export type SettingsOptions =
  | 'appearance'
  | 'language'
  | 'audio'
  | 'content'
  | 'local-music'
  | 'cache'
  | 'accounts'
  | 'account'
  | 'desktop'
  | 'privacy'

interface OptionsData {
  id: SettingsOptions
  icon: ComponentType
}

const accountsOption: OptionsData = { id: 'accounts', icon: CircleUserRound }
const accountOption: OptionsData = { id: 'account', icon: CircleUserRound }
const desktopOption: OptionsData = { id: 'desktop', icon: LaptopIcon }
const cacheOption: OptionsData = { id: 'cache', icon: Database }
const localMusicOption: OptionsData = { id: 'local-music', icon: Music2 }

const options: OptionsData[] = [
  { id: 'appearance', icon: Paintbrush },
  { id: 'language', icon: Globe },
  { id: 'audio', icon: Headphones },
  { id: 'content', icon: FileText },
  ...(isDesktop() ? [localMusicOption, cacheOption, accountsOption, accountOption, desktopOption] : []),
  { id: 'privacy', icon: EarthLock },
]

export function SettingsOptions() {
  const { t } = useTranslation()
  const { currentPage, setCurrentPage } = useAppSettings()

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {options.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                isActive={item.id === currentPage}
                onClick={() => setCurrentPage(item.id)}
              >
                <item.icon />
                <span>{t(`settings.options.${item.id}`)}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
