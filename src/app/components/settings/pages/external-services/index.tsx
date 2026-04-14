/**
 * Внешние сервисы — Last.fm, ListenBrainz, Discord, Fanart, Discogs, Apple, Yandex, Audiobookshelf
 */

import { ExternalApiContent } from '@/app/components/settings/pages/content/external-api'
import { ListenBrainzSettings } from '@/app/components/settings/pages/external/listenbrainz'
import { DiscogsSettings } from '@/app/components/settings/pages/accounts/discogs'
import { AppleMusicSettings } from '@/app/components/settings/pages/accounts/apple-music'
import { YandexMusicSettings } from '@/app/components/settings/pages/accounts/yandex-music'
import { AudiobookshelfContent } from '@/app/components/settings/pages/content/audiobookshelf'
import { Separator } from '@/app/components/ui/separator'

export function ExternalServices() {
  return (
    <div className="space-y-6">
      {/* Last.fm */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🎵 Last.fm</h3>
        <ExternalApiContent />
      </div>

      <Separator />

      {/* ListenBrainz */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🧠 ListenBrainz</h3>
        <ListenBrainzSettings />
      </div>

      <Separator />

      {/* Discord RPC */}
      <div>
        <h3 className="text-lg font-semibold mb-3">💬 Discord Rich Presence</h3>
        {/* Discord RPC встроен в ExternalAPISettings */}
      </div>

      <Separator />

      {/* Fanart.tv */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🎨 Fanart.tv</h3>
        {/* Fanart встроен в ExternalAPISettings */}
      </div>

      <Separator />

      {/* Discogs */}
      <div>
        <h3 className="text-lg font-semibold mb-3">💿 Discogs</h3>
        <DiscogsSettings />
      </div>

      <Separator />

      {/* Apple Music */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🍎 Apple Music</h3>
        <AppleMusicSettings />
      </div>

      <Separator />

      {/* Yandex Music */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🇷🇺 Yandex Music</h3>
        <YandexMusicSettings />
      </div>

      <Separator />

      {/* Audiobookshelf */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📚 Audiobookshelf</h3>
        <AudiobookshelfContent />
      </div>
    </div>
  )
}
