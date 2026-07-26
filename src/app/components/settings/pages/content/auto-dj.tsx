import { useAutoDJSettings, useAutoDJActions } from '@/store/auto-dj.store'
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from '@/app/components/settings/settings-layout'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Slider } from '@/app/components/ui/slider'
import { Badge } from '@/app/components/ui/badge'

export function AutoDJContent() {
  const settings = useAutoDJSettings()
  const { setItemCount, setTiming, toggleEnabled } = useAutoDJActions()

  return (
    <SettingsCard
      title="Auto DJ"
      description="Автоматически добавляет похожие треки в очередь воспроизведения"
    >
      <SettingsSection>
        <SettingsRow
          label="Включить Auto DJ"
          description="Добавляет похожие треки, когда очередь заканчивается"
          children={
            <Switch checked={settings.enabled} onCheckedChange={toggleEnabled} />
          }
        />
      </SettingsSection>

      <div className="space-y-5 pt-1">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Количество треков</Label>
            <Badge variant="secondary">{settings.itemCount}</Badge>
          </div>
          <Slider
            value={[settings.itemCount]}
            min={5}
            max={50}
            step={5}
            onValueChange={(val) => setItemCount(val[0])}
            disabled={!settings.enabled}
          />
          <p className="text-xs text-muted-foreground">
            Сколько треков добавлять при срабатывании Auto DJ
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Срабатывает когда осталось</Label>
            <Badge variant="secondary">{settings.timing}</Badge>
          </div>
          <Slider
            value={[settings.timing]}
            min={1}
            max={5}
            step={1}
            onValueChange={(val) => setTiming(val[0])}
            disabled={!settings.enabled}
          />
          <p className="text-xs text-muted-foreground">
            Количество треков в очереди до срабатывания Auto DJ
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
          Как это работает
        </p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          <li>• Анализирует текущий трек при окончании очереди</li>
          <li>• Находит похожие треки по жанру и артисту</li>
          <li>• Добавляет их в очередь без паузы</li>
        </ul>
      </div>
    </SettingsCard>
  )
}
