import { memo } from 'react'
import { Drawer, DrawerContent, DrawerTitle } from '@/app/components/ui/drawer'
import { useAppWindow } from '@/app/hooks/use-app-window'
import { usePlayerFullscreen } from '@/store/player.store'
import { FullscreenBackdrop } from './backdrop'
import { FullscreenDragHandler } from './drag-handler'
import { FullscreenPlayer } from './player'
import { FullscreenTabs } from './tabs'

const MemoFullscreenBackdrop = memo(FullscreenBackdrop)

export function FullscreenMode() {
  const { handleDrawerAnimationEnd } = useAppWindow()
  const { isFullscreen, setIsFullscreen } = usePlayerFullscreen()

  return (
    <Drawer
      open={isFullscreen}
      onOpenChange={setIsFullscreen}
      fixed={true}
      handleOnly={true}
      disablePreventScroll={true}
      dismissible={true}
      modal={false}
    >
      <DrawerTitle className="sr-only">Big Player</DrawerTitle>
      <DrawerContent
        onAnimationEnd={handleDrawerAnimationEnd}
        className="fixed inset-0 z-[60] h-[100dvh] w-screen max-h-[100dvh] rounded-none border-none select-none cursor-default mt-0"
        overlayClassName="z-[60]"
        showHandle={false}
        aria-describedby={undefined}
      >
        <MemoFullscreenBackdrop />
        <FullscreenDragHandler />

        <div
          className="absolute inset-0 z-10 flex h-full w-full flex-col bg-black/0"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)',
          }}
        >
          {/* Контент: табы + обложка/очередь/текст */}
          <div className="min-h-0 flex-1 overflow-hidden px-4 md:px-8 2xl:px-16">
            <FullscreenTabs />
          </div>

          {/* Нижняя панель: прогресс и управление */}
          <div className="shrink-0 px-4 pb-2 pt-2 md:px-8 2xl:px-16">
            <FullscreenPlayer />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
