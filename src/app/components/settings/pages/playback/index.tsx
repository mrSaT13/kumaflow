/**
 * Воспроизведение — Replay Gain, обложки, Auto-DJ, локальная музыка, кэш
 */

import { ReplayGainConfig } from '@/app/components/settings/pages/audio/replay-gain'
import { CoverArtPriorityCard } from '@/app/components/settings/pages/content/cover-art-priority'
import { AutoDJContent } from '@/app/components/settings/pages/content/auto-dj'
import { LyricsSettings } from '@/app/components/settings/pages/audio/lyrics'
import { LocalMusicSettings } from '@/app/components/settings/pages/content/local-music'
import { CacheSettings } from '@/app/components/settings/pages/content/cache'
import { PodcastContent } from '@/app/components/settings/pages/content/podcast'
import { ImagesContent } from '@/app/components/settings/pages/content/images'
import { Separator } from '@/app/components/ui/separator'

export function Playback() {
  return (
    <div className="space-y-6">
      {/* Replay Gain */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🔊 Replay Gain</h3>
        <ReplayGainConfig />
      </div>

      <Separator />

      {/* Приоритет обложек */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🖼️ Приоритет обложек</h3>
        <CoverArtPriorityCard />
      </div>

      <Separator />

      {/* Кэш изображений */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🗂️ Кэш изображений</h3>
        <ImagesContent />
      </div>

      <Separator />

      {/* Текст песен */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📝 Текст песен</h3>
        <LyricsSettings />
      </div>

      <Separator />

      {/* Auto DJ */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🤖 Auto DJ</h3>
        <AutoDJContent />
      </div>

      <Separator />

      {/* Подкасты */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🎙️ Подкасты</h3>
        <PodcastContent />
      </div>

      <Separator />

      {/* Локальная музыка */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📁 Локальная музыка</h3>
        <LocalMusicSettings />
      </div>

      <Separator />

      {/* Кэш */}
      <div>
        <h3 className="text-lg font-semibold mb-3">💾 Кэш</h3>
        <CacheSettings />
      </div>
    </div>
  )
}
