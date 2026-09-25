import { useEffect } from 'react'
import { Location, Outlet, useLocation } from 'react-router-dom'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { scrollPageToTop } from '@/utils/scrollPageToTop'

export function MainRoutes() {
  const { pathname } = useLocation() as Location

  useEffect(() => {
    if (pathname) scrollPageToTop()
  }, [pathname])

  return (
    <main className="flex h-full">
      <ScrollArea
        id="main-scroll-area"
        className="w-full bg-background-foreground"
      >
        {/* Отступ снизу под плавающий закруглённый плеер (88px + зазоры) */}
        <div className="pb-[112px]">
          <Outlet />
        </div>
      </ScrollArea>
    </main>
  )
}
