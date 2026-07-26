import { useTranslation } from 'react-i18next'
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from '@/app/components/settings/settings-layout'
import { Switch } from '@/app/components/ui/switch'
import { useAppImagesCacheLayer } from '@/store/app.store'

const { DISABLE_IMAGE_CACHE_TOGGLE } = window

export function ImagesContent() {
  const { t } = useTranslation()
  const { imagesCacheLayerEnabled, setImagesCacheLayerEnabled } =
    useAppImagesCacheLayer()

  return (
    <SettingsCard
      title={t('settings.content.images.group')}
      description={t('settings.content.images.description')}
    >
      <SettingsSection>
        <SettingsRow
          label={t('settings.content.images.cacheLayer.label')}
          description={t('settings.content.images.cacheLayer.info')}
          children={
            <Switch
              checked={imagesCacheLayerEnabled}
              onCheckedChange={setImagesCacheLayerEnabled}
              disabled={DISABLE_IMAGE_CACHE_TOGGLE}
            />
          }
        />
      </SettingsSection>
    </SettingsCard>
  )
}
