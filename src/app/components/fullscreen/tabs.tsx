import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/tabs'
import { LyricsTab } from './lyrics'
import { FullscreenSongQueue } from './queue'
import { SongInfo } from './song-info'
import { FullscreenExplanation } from './explanation'

const MemoSongQueue = memo(FullscreenSongQueue)
const MemoSongInfo = memo(SongInfo)
const MemoLyricsTab = memo(LyricsTab)
const MemoExplanation = memo(FullscreenExplanation)

enum TabsEnum {
  Queue = 'queue',
  Playing = 'playing',
  Lyrics = 'lyrics',
}

type TabValue = TabsEnum

const getTransform = (currentTab: TabValue, tabValue: TabValue) => {
  const positions = {
    queue: {
      queue: '0',
      playing: '-120%',
      lyrics: '-240%',
    },
    playing: {
      queue: '120%',
      playing: '0',
      lyrics: '-120%',
    },
    lyrics: {
      queue: '240%',
      playing: '120%',
      lyrics: '0',
    },
  }

  const translation = positions[tabValue][currentTab]
  return `translate3d(${translation}, 0, 0)`
}

const tabStyles =
  'absolute inset-0 overflow-hidden transition-transform duration-300'

const triggerStyles =
  'w-full text-sm md:text-base data-[state=active]:bg-foreground data-[state=active]:text-secondary text-foreground drop-shadow-sm'

export function FullscreenTabs() {
  const [tab, setTab] = useState<TabValue>(TabsEnum.Playing)
  const { t } = useTranslation()

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as TabValue)}
      className="flex h-full min-h-0 w-full flex-col"
    >
      <TabsList className="mb-3 h-10 w-full shrink-0 bg-foreground/20 md:mb-4 md:h-11">
        <TabsTrigger value={TabsEnum.Queue} className={triggerStyles}>
          {t('fullscreen.queue')}
        </TabsTrigger>
        <TabsTrigger value={TabsEnum.Playing} className={triggerStyles}>
          {t('fullscreen.playing')}
        </TabsTrigger>
        <TabsTrigger value={TabsEnum.Lyrics} className={triggerStyles}>
          {t('fullscreen.lyrics')}
        </TabsTrigger>
      </TabsList>
      <div className="relative min-h-0 w-full flex-1">
        <TabsContent
          value={TabsEnum.Queue}
          className={tabStyles}
          style={{
            backfaceVisibility: 'hidden',
            transform: getTransform(tab, TabsEnum.Queue),
          }}
          forceMount={true}
        >
          <MemoSongQueue />
        </TabsContent>
        <TabsContent
          value={TabsEnum.Playing}
          className={tabStyles}
          style={{
            backfaceVisibility: 'hidden',
            transform: getTransform(tab, TabsEnum.Playing),
          }}
          forceMount={true}
        >
          <MemoSongInfo />
        </TabsContent>
        <TabsContent
          value={TabsEnum.Lyrics}
          className={tabStyles}
          style={{
            backfaceVisibility: 'hidden',
            transform: getTransform(tab, TabsEnum.Lyrics),
          }}
          forceMount={true}
        >
          <MemoLyricsTab />
        </TabsContent>
      </div>
    </Tabs>
  )
}
