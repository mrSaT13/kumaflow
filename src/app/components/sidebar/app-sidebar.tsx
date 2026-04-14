import CommandMenu from '@/app/components/command/command-menu'
import {
  MainSidebar,
  MainSidebarContent,
  MainSidebarHeader,
  MainSidebarRail,
} from '@/app/components/ui/main-sidebar'
import { MiniSidebarSearch } from './mini-search'
import { SidebarMiniSeparator } from './mini-separator'
import { MobileCloseButton } from './mobile-close-button'
import { NavLibrary } from './nav-library'
import { NavMain } from './nav-main'
import { NavPlaylists } from './nav-playlists'

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof MainSidebar>) {
  return (
    <MainSidebar collapsible="icon" {...props}>
      <MobileCloseButton />
      <MainSidebarHeader>
        <CommandMenu />
      </MainSidebarHeader>
      <MiniSidebarSearch />
      <NavMain />
      <SidebarMiniSeparator />
      <MainSidebarContent className="flex-1 overflow-y-auto">
        <NavLibrary />
      </MainSidebarContent>
      <NavPlaylists />
      <MainSidebarRail />
    </MainSidebar>
  )
}
