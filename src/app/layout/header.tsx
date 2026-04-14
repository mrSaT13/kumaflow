import { NavigationButtons } from '@/app/components/header/navigation-buttons'
import { HeaderSongInfo } from '@/app/components/header-song'
import { SettingsButton } from '@/app/components/settings/header-button'
import { UserAvatar } from '@/app/components/user-avatar-new'
import { MainSidebarTrigger } from '@/app/components/ui/main-sidebar'
import { useAppWindow } from '@/app/hooks/use-app-window'
import { isLinux, isMacOS, isWindows } from '@/utils/desktop'
import { RefreshCw } from 'lucide-react'  // 🆕 Кнопка перезагрузки
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/app/components/ui/tooltip'  // 🆕

export function Header() {
  const { isFullscreen } = useAppWindow()

  const handleReload = () => {
    window.location.reload()
  }

  return (
    <header className="w-full grid grid-cols-header h-header px-4 fixed top-0 right-0 left-0 z-20 bg-background border-b electron-drag">
      <div className="flex items-center">
        {isMacOS && !isFullscreen && <div className="w-[70px]" />}
        <NavigationButtons />
        <MainSidebarTrigger className="ml-2" />
      </div>
      <HeaderSongInfo />
      <div className="flex justify-end items-center gap-2">
        <UserAvatar size={32} className="pointer-events-auto" />
        
        {/* 🆕 Кнопка перезагрузки */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleReload}
                className="p-2 rounded-full hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="Перезагрузить приложение"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Перезагрузить приложение
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <SettingsButton />
        {isWindows && !isFullscreen && <div className="w-[122px]" />}
        {isLinux && !isFullscreen && <div className="w-[94px]" />}
      </div>
    </header>
  )
}
