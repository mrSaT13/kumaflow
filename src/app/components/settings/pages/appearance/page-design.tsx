/**
 * Page Design Settings - Настройки дизайна страниц (артист, альбом, трек)
 */

import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { usePageDesignSettings, usePageDesignSettingsActions } from '@/store/page-design.store'

export function PageDesignSettings() {
  const { t } = useTranslation()
  const settings = usePageDesignSettings()
  const {
    setNewArtistDesignEnabled,
    setNewAlbumDesignEnabled,
    setNewTrackDesignEnabled,
  } = usePageDesignSettingsActions()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новый дизайн страниц</CardTitle>
        <CardDescription>
          Включите новый дизайн для отдельных страниц
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Новый дизайн страницы артиста */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex-1">
            <Label className="text-sm font-medium">Страница артиста</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Круглая картинка, сворачиваемые секции, популярные альбомы
            </p>
          </div>
          <Switch
            checked={settings.newArtistDesignEnabled}
            onCheckedChange={setNewArtistDesignEnabled}
          />
        </div>

        {/* Новый дизайн страницы альбома */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex-1">
            <Label className="text-sm font-medium">Страница альбома</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Обновлённый дизайн страницы альбома
            </p>
          </div>
          <Switch
            checked={settings.newAlbumDesignEnabled}
            onCheckedChange={setNewAlbumDesignEnabled}
          />
        </div>

        {/* Новый дизайн страницы трека */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex-1">
            <Label className="text-sm font-medium">Страница трека</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Обновлённый дизайн страницы трека
            </p>
          </div>
          <Switch
            checked={settings.newTrackDesignEnabled}
            onCheckedChange={setNewTrackDesignEnabled}
          />
        </div>

        <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-xs text-blue-500">
            💡 Совет: Вы можете включать новый дизайн для отдельных страниц постепенно
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
