import { memo, useState } from 'react'
import { X } from 'lucide-react'
import { Drawer, DrawerContent, DrawerTitle } from '@/app/components/ui/drawer'
import { Button } from '@/app/components/ui/button'
import { useAppWindow } from '@/app/hooks/use-app-window'
import { usePlayerFullscreen } from '@/store/player.store'
import { FullscreenBackdrop } from './backdrop'
import { FullscreenDragHandler } from './drag-handler'
import { ContextPanel, CoverColumn, FullscreenPanel } from './now-playing'
import { FullscreenProgress } from './progress'

const MemoFullscreenBackdrop = memo(FullscreenBackdrop)

export function FullscreenMode() {
  const { handleDrawerAnimationEnd } = useAppWindow()
  const { isFullscreen, setIsFullscreen } = usePlayerFullscreen()
  // Очередь и текст — панели по кнопкам (оверлей на обложке / шапка панели),
  // а не верхние табы. На узких экранах — выезжающая панель справа.
  const [panel, setPanel] = useState<FullscreenPanel>('context')

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
        className="h-screen w-screen rounded-t-none border-none select-none cursor-default mt-0"
        showHandle={false}
        aria-describedby={undefined}
      >
        <MemoFullscreenBackdrop />
        <FullscreenDragHandler />
        <div className="absolute inset-0 flex flex-col px-4 sm:px-8 2xl:px-12 pt-6 2xl:pt-8 w-full h-full bg-black/0 z-10">
          {/* Верхняя строка: только свернуть */}
          <div className="flex justify-end shrink-0 pb-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(false)}
              title="Свернуть"
              className="w-9 h-9 rounded-full text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-all"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2} />
            </Button>
          </div>

          {/* Центр: обложка (центрируется в свободной зоне) + панель у правого края как у ЯМузыки */}
          <div className="flex flex-1 min-h-0 items-stretch">
            <div className="flex-1 min-w-0 flex justify-center">
              <CoverColumn panel={panel} setPanel={setPanel} />
            </div>
            {/* Широкий экран: панель схлопывается с анимацией, обложка плавно центрируется */}
            <div
              className={`hidden lg:flex shrink-0 flex-col min-h-0 py-2 overflow-hidden transition-all duration-300 ease-out mr-3 2xl:mr-6 ${
                panel !== 'hidden' ? 'w-[360px] 2xl:w-[400px] opacity-100' : 'w-0 opacity-0'
              }`}
            >
              <div className="w-[360px] 2xl:w-[400px] h-full min-h-0 flex flex-col">
                <ContextPanel panel={panel === 'hidden' ? 'context' : panel} setPanel={setPanel} />
              </div>
            </div>
          </div>

          {/* Низ: только slim-прогресс (твой настраиваемый тип живёт).
              Транспорт — на обложке, остальное — в шторке «•••» */}
          <div className="shrink-0 px-0 sm:px-4 pb-3 pt-1">
            <FullscreenProgress />
          </div>
        </div>

        {/* Узкие экраны: панель — на весь экран поверх (как шит в мобайле),
            колонка не сплющивается */}
        {panel !== 'hidden' && (
          <div className="lg:hidden absolute inset-0 z-20 bg-background/55 backdrop-blur-2xl p-4 pt-10 flex flex-col min-h-0">
            <ContextPanel panel={panel} setPanel={setPanel} onClose={() => setPanel('hidden')} />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
