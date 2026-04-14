import { useTranslation } from 'react-i18next'
import { ImagesContent } from './images'
import { PodcastContent } from './podcast'
import { MLPlaylistsContent } from './ml-playlists'
import { AutoDJContent } from './auto-dj'
import { SettingsExportImport } from './export-import'

export function Content() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <MLPlaylistsContent />
      <AutoDJContent />

      <PodcastContent />
      <ImagesContent />
      <SettingsExportImport />
    </div>
  )
}
