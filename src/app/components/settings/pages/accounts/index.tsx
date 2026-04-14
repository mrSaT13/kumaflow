import { DiscordRpc } from './discord-rpc'
import { ExternalApiContent } from '../content/external-api'
import { AudiobookshelfContent } from '../content/audiobookshelf'
import { DiscogsSettings } from './discogs'
import { AppleMusicSettings } from './apple-music'
import { YandexMusicSettings } from './yandex-music'
import { SharedListensSettings } from './shared-listens-settings'

export function Accounts() {
  return (
    <div className="space-y-6">
      {/* Discord RPC */}
      <DiscordRpc />

      {/* Last.fm & Fanart.tv */}
      <ExternalApiContent />

      {/* 🌍 Shared Listens - Что слушают другие */}
      <SharedListensSettings />

      {/* Discogs */}
      <DiscogsSettings />

      {/* Apple Music */}
      <AppleMusicSettings />

      {/* Yandex Music */}
      <YandexMusicSettings />

      {/* Audiobookshelf */}
      <AudiobookshelfContent />
    </div>
  )
}
