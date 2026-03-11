import { useTranslation } from 'react-i18next'
import { ImagesContent } from './images'
import { PodcastContent } from './podcast'
import { SidebarContent } from './sidebar'
import { MLPlaylistsContent } from './ml-playlists'
import { PlaybackContent } from './playback'
import { AutoDJContent } from './auto-dj'
import { HomepageSettingsContent } from './homepage'
import { SettingsExportImport } from './export-import'

export function Content() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <MLPlaylistsContent />
      <AutoDJContent />

      {/* Воспроизведение */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">{t('settings.content.playback.title')}</h2>
        <p className="text-muted-foreground">
          {t('settings.content.playback.description')}
        </p>
      </div>
      <PlaybackContent />

      {/* Главная страница */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">{t('settings.content.homepage.title')}</h2>
        <p className="text-muted-foreground">
          {t('settings.content.homepage.description')}
        </p>
      </div>
      <HomepageSettingsContent />

      <SidebarContent />
      <PodcastContent />
      <ImagesContent />
      <SettingsExportImport />
    </div>
  )
}
