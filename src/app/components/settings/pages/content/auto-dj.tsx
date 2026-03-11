import { useTranslation } from 'react-i18next'
import { useAutoDJSettings, useAutoDJActions } from '@/store/auto-dj.store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Slider } from '@/app/components/ui/slider'
import { Badge } from '@/app/components/ui/badge'

export function AutoDJContent() {
  const { t } = useTranslation()
  const settings = useAutoDJSettings()
  const { setItemCount, setTiming, toggleEnabled } = useAutoDJActions()

  return (
    <Card>
      <CardHeader>
        <CardTitle>🤖 Auto DJ</CardTitle>
        <CardDescription>
          Автоматически добавлять похожие треки в очередь воспроизведения
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Включить/Выключить */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Включить Auto DJ</Label>
            <p className="text-sm text-muted-foreground">
              Автоматически добавлять похожие треки когда очередь заканчивается
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={toggleEnabled}
          />
        </div>

        {/* Количество треков */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Количество треков: {settings.itemCount}</Label>
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

        {/* Когда срабатывать */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Срабатывает когда осталось: {settings.timing} трек(а)</Label>
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

        {/* Информация */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h4 className="font-medium text-blue-600 mb-2">
            ℹ️ Как это работает
          </h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Когда очередь заканчивается, Auto DJ анализирует текущий трек</li>
            <li>• Находит похожие треки на основе жанра и артиста</li>
            <li>• Автоматически добавляет их в очередь</li>
            <li>• Непрерывное воспроизведение без пауз!</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
