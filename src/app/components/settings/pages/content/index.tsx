import { AutoDJContent } from './auto-dj'
import { ImagesContent } from './images'
import { MLPlaylistsContent } from './ml-playlists'
import { PodcastContent } from './podcast'
import { SettingsExportImport } from './export-import'
import { HolidayPlaylistsSettings } from '@/app/components/settings/holiday-playlists'
import { RemoteControlSettings } from '@/app/components/settings/remote-control'
import { LLMSettings } from '@/app/components/settings/llm-settings'

export function Content() {
  return (
    <div className="w-full min-w-0 space-y-4 pb-2">
      <MLPlaylistsContent />
      <AutoDJContent />
      <HolidayPlaylistsSettings />
      <RemoteControlSettings />
      <LLMSettings />
      <PodcastContent />
      <ImagesContent />
      <SettingsExportImport />
    </div>
  )
}
