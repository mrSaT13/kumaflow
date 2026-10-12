/**
 * Настройки «вау-слоя»: пульс, стрик, блики, праздничный фон.
 *
 * Три пульса вынесены в отдельные тумблеры, потому что у них разный
 * «цена»: пульс полосы почти бесплатен, пульс обложки трогает transform
 * крупного элемента, а блик на кнопке меняет filter на каждом кадре.
 * Пользователь должен решать сам, плюс есть общий мастер-тумблер.
 */

import { Flame, Sparkles, Wand2, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Label } from '@/app/components/ui/label'
import { Slider } from '@/app/components/ui/slider'
import { Switch } from '@/app/components/ui/switch'
import {
  useDopamineActions,
  useDopamineSettings,
} from '@/store/dopamine.store'

export function DopamineSettingsCard() {
  const settings = useDopamineSettings()
  const actions = useDopamineActions()

  // Пульс не может быть включён, пока выключен мастер: показываем
  // дочерние тумблеры приглушёнными, но не прячем — иначе непонятно,
  // где их искать.
  const pulseOn = settings.enabled

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          Эффекты
        </CardTitle>
        <CardDescription>
          Интерфейс реагирует на музыку. Всё можно выключить — включая
          мастер-тумблером.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ===== Мастер ===== */}
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-gradient-to-br from-purple-500/25 to-pink-500/20">
              <Wand2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="font-medium">Эффекты включены</p>
              <p className="text-xs text-muted-foreground">
                Реакция интерфейса на музыку, стрик, блики
              </p>
            </div>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={actions.setEnabled}
            data-testid="dopamine-master-switch"
          />
        </div>

        {/* ===== Пульс ===== */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                Пульс в такт музыке
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Что именно реагирует на звук
              </p>
            </div>
            <Switch
              checked={settings.pulseProgressBar && settings.pulseCover && settings.pulsePlayButton}
              onCheckedChange={actions.setAllPulse}
              disabled={!pulseOn}
              data-testid="dopamine-pulse-all-switch"
            />
          </div>

          <div className={pulseOn ? 'space-y-3 pl-6' : 'space-y-3 pl-6 opacity-50'}>
            <PulseRow
              label="Свечение прогресс-бара"
              hint="Полоса подсвечивается на низких частотах"
              checked={settings.pulseProgressBar}
              onChange={actions.setPulseProgressBar}
              disabled={!pulseOn}
              testId="dopamine-pulse-progressbar"
            />
            <PulseRow
              label="Масштаб обложки"
              hint="Обложка в «Сейчас играет» слегка дышит"
              checked={settings.pulseCover}
              onChange={actions.setPulseCover}
              disabled={!pulseOn}
              testId="dopamine-pulse-cover"
            />
            <PulseRow
              label="Яркость блика на кнопке"
              hint="Кнопка Play в «Сейчас играет» подсвечивается"
              checked={settings.pulsePlayButton}
              onChange={actions.setPulsePlayButton}
              disabled={!pulseOn}
              testId="dopamine-pulse-playbutton"
            />

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label>Сила реакции: {Math.round(settings.pulseIntensity * 100)}%</Label>
              </div>
              <Slider
                value={[settings.pulseIntensity]}
                min={0}
                max={1}
                step={0.05}
                disabled={!pulseOn}
                tooltipValue={`${Math.round(settings.pulseIntensity * 100)}%`}
                onValueChange={([value]) => actions.setPulseIntensity(value)}
              />
              <p className="text-xs text-muted-foreground">
                30% — едва заметно, 100% — заметно «кидает». Выше 80% рекомендуется
                не ставить: интерфейс начинает отвлекать от музыки.
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-border/60" />

        {/* ===== Стрик ===== */}
        <div className="space-y-3">
          <Label className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-500" />
            Стрик дней подряд
          </Label>
          <div className="space-y-3 pl-6">
            <PulseRow
              label="В плеер-баре"
              hint="Число дней подряд рядом с треком"
              checked={settings.streakInPlayerBar}
              onChange={actions.setStreakInPlayerBar}
              testId="dopamine-streak-playerbar"
            />
            <PulseRow
              label="На главной странице"
              hint="Блок в герое «Моя волна»"
              checked={settings.streakOnHome}
              onChange={actions.setStreakOnHome}
              testId="dopamine-streak-home"
            />
          </div>
        </div>

        <div className="h-px bg-border/60" />

        {/* ===== Оформление карточек ===== */}
        <div className="space-y-3">
          <PulseRow
            label="Блик на карточках"
            hint="Проезжает по карточке плейлиста при наведении"
            checked={settings.cardShine}
            onChange={actions.setCardShine}
            testId="dopamine-card-shine"
          />
          <PulseRow
            label="Праздничный фон"
            hint="Цветные пятна за карточками праздничных плейлистов"
            checked={settings.holidayBackdrop}
            onChange={actions.setHolidayBackdrop}
            testId="dopamine-holiday-backdrop"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function PulseRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  testId?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  )
}
