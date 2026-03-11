/**
 * Настройки прогресс-бара плеера
 * 
 * Позволяют кастомизировать:
 * - Тип прогресс-бара
 * - Форму маркера
 * - Цвет
 * - Высоту
 * - Анимации и эффекты
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Slider } from '@/app/components/ui/slider'
import { Input } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'
import { Switch } from '@/app/components/ui/switch'
import { usePlayerCustomization, usePlayerCustomizationActions } from '@/store/player-customization.store'
import { cn } from '@/lib/utils'
import { Palette, RotateCcw, Upload, Sparkles, Music, Zap, Star, Heart } from 'lucide-react'

// Пресеты иконок SVG
const ICON_PRESETS = [
  {
    name: 'Нота',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
  },
  {
    name: 'Сердце',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
  },
  {
    name: 'Звезда',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`
  },
  {
    name: 'Молния',
    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>`
  },
]

export function ProgressBarSettings() {
  const { t } = useTranslation()
  const settings = usePlayerCustomization()
  const actions = usePlayerCustomizationActions()
  
  const [customSvg, setCustomSvg] = useState('')
  const [previewValue, setPreviewValue] = useState(50)
  const [showPresets, setShowPresets] = useState(false)

  // Обработка загрузки SVG файла
  const handleSvgUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const svg = e.target?.result as string
      setCustomSvg(svg)
      actions.setCustomIconSvg(svg)
      actions.setProgressIcon('custom')
    }
    reader.readAsText(file)
  }

  // Применение пресета
  const applyPreset = (svg: string) => {
    setCustomSvg(svg)
    actions.setCustomIconSvg(svg)
    actions.setProgressIcon('custom')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          <CardTitle className="text-lg">Прогресс-бар</CardTitle>
        </div>
        <CardDescription>
          Настройте внешний вид прогресс-бара плеера
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Тип прогресс-бара */}
        <div className="space-y-2">
          <Label>Тип прогресс-бара</Label>
          <Select
            value={settings.progressType}
            onValueChange={(value) => actions.setProgressType(value as any)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slider">Slider (классический)</SelectItem>
              <SelectItem value="bar">Bar (линия)</SelectItem>
              <SelectItem value="waveform">Waveform (волна)</SelectItem>
            </SelectContent>
          </Select>
          {settings.progressType !== 'slider' && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
              ⚠️ Custom SVG и пресеты доступны только для типа "Slider"
            </p>
          )}
        </div>

        {/* Форма маркера */}
        <div className="space-y-2">
          <Label>Форма маркера</Label>
          <Select
            value={settings.progressType === 'slider' ? settings.progressIcon : 'circle'}
            onValueChange={(value) => {
              if (settings.progressType === 'slider') {
                actions.setProgressIcon(value as any)
              }
            }}
            disabled={settings.progressType !== 'slider'}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="circle">Круг</SelectItem>
              <SelectItem value="square">Квадрат</SelectItem>
              <SelectItem value="diamond">Ромб</SelectItem>
              <SelectItem value="custom" disabled={settings.progressType !== 'slider'}>
                ✨ Custom SVG {settings.progressType !== 'slider' && '(недоступно)'}
              </SelectItem>
            </SelectContent>
          </Select>
          {settings.progressType !== 'slider' && (
            <p className="text-xs text-muted-foreground">
              ℹ️ Для типов "Bar" и "Waveform" используется стандартный круглый маркер
            </p>
          )}
        </div>

        {/* Custom SVG с пресетами - ТОЛЬКО ДЛЯ SLIDER */}
        {settings.progressIcon === 'custom' && settings.progressType === 'slider' && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="m-0">Custom SVG иконка</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPresets(!showPresets)}
                className="gap-1"
              >
                <Sparkles className="h-3 w-3" />
                Пресеты
              </Button>
            </div>

            {/* Пресеты иконок */}
            {showPresets && (
              <div className="grid grid-cols-4 gap-2">
                {ICON_PRESETS.map((preset) => (
                  <Button
                    key={preset.name}
                    variant="outline"
                    className="h-12 flex flex-col items-center justify-center gap-1"
                    onClick={() => applyPreset(preset.svg)}
                  >
                    <div
                      className="w-6 h-6"
                      dangerouslySetInnerHTML={{ __html: preset.svg }}
                    />
                    <span className="text-xs">{preset.name}</span>
                  </Button>
                ))}
              </div>
            )}

            {/* Загрузка SVG */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="file"
                  accept=".svg"
                  onChange={handleSvgUpload}
                  className="flex-1"
                />
                <Button variant="outline" size="icon" asChild>
                  <label className="cursor-pointer">
                    <Upload className="h-4 w-4" />
                    <input type="file" className="hidden" accept=".svg" onChange={handleSvgUpload} />
                  </label>
                </Button>
              </div>
              {customSvg && (
                <div className="flex items-center gap-4 p-3 bg-background rounded-lg border">
                  <div className="text-xs text-muted-foreground">Предпросмотр:</div>
                  <div
                    className="w-10 h-10 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: customSvg }}
                  />
                  <div className="flex-1 text-xs text-green-600">✓ SVG загружена</div>
                </div>
              )}
            </div>

            {/* Подсказка */}
            <p className="text-xs text-muted-foreground">
              💡 Совет: SVG должен использовать <code className="bg-muted px-1 rounded">fill="currentColor"</code> для применения цвета
            </p>
          </div>
        )}

        {/* Цвет прогресс-бара */}
        <div className="space-y-2">
          <Label>Цвет прогресса</Label>
          <div className="flex gap-4 items-center">
            <Input
              type="color"
              value={settings.progressColor}
              onChange={(e) => actions.setProgressColor(e.target.value)}
              className="w-20 h-10 cursor-pointer"
            />
            <Input
              type="text"
              value={settings.progressColor}
              onChange={(e) => actions.setProgressColor(e.target.value)}
              className="flex-1 font-mono"
              placeholder="#10b981"
            />
          </div>
        </div>

        {/* Высота прогресс-бара */}
        <div className="space-y-2">
          <Label>
            Высота: {settings.progressHeight}px
          </Label>
          <Slider
            value={[settings.progressHeight]}
            onValueChange={([value]) => actions.setProgressHeight(value)}
            min={2}
            max={12}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>2px (тонкий)</span>
            <span>12px (толстый)</span>
          </div>
        </div>

        {/* Размер маркера для Custom SVG */}
        {settings.progressIcon === 'custom' && settings.progressType === 'slider' && (
          <div className="space-y-2">
            <Label>
              Размер маркера: {(settings.markerSize || 1.5).toFixed(1)}x
            </Label>
            <Slider
              value={[settings.markerSize || 1.5]}
              onValueChange={([value]) => actions.setMarkerSize(value)}
              min={0.5}
              max={3}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.5x (маленький)</span>
              <span>3.0x (большой)</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Регулирует размер SVG иконки относительно высоты прогресс-бара
            </p>
          </div>
        )}

        {/* ВАУ-НАСТРОЙКИ: Анимации и эффекты */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <Label className="m-0 text-purple-500 font-semibold">ВАУ-эффекты</Label>
          </div>

          {/* Анимация при наведении */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="space-y-0.5">
              <Label className="m-0">Анимация при наведении</Label>
              <p className="text-xs text-muted-foreground">
                Увеличивать и вращать маркер при наведении
              </p>
            </div>
            <Switch
              checked={settings.hoverAnimation}
              onCheckedChange={(e) => actions.setHoverAnimation(e)}
            />
          </div>

          {/* Свечение маркера */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="space-y-0.5">
              <Label className="m-0">✨ Свечение маркера</Label>
              <p className="text-xs text-muted-foreground">
                Добавить glow эффект вокруг маркера
              </p>
            </div>
            <Switch
              checked={settings.glowEffect || false}
              onCheckedChange={(e) => actions.setGlowEffect(e)}
            />
          </div>

          {/* Пульсация при воспроизведении */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="space-y-0.5">
              <Label className="m-0">💓 Пульсация</Label>
              <p className="text-xs text-muted-foreground">
                Маркер пульсирует во время воспроизведения
              </p>
            </div>
            <Switch
              checked={settings.pulseOnPlay || false}
              onCheckedChange={(e) => actions.setPulseOnPlay(e)}
            />
          </div>

          {/* Градиентный прогресс */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="space-y-0.5">
              <Label className="m-0">🌈 Градиентный прогресс</Label>
              <p className="text-xs text-muted-foreground">
                Градиент вместо сплошного цвета
              </p>
            </div>
            <Switch
              checked={settings.gradientProgress || false}
              onCheckedChange={(e) => actions.setGradientProgress(e)}
            />
          </div>

          {/* Настройка скорости анимации */}
          <div className="p-3 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              <Label className="m-0">Скорость анимации</Label>
            </div>
            <Slider
              value={[settings.animationSpeed || 1000]}
              onValueChange={([value]) => actions.setAnimationSpeed(value)}
              min={200}
              max={5000}
              step={100}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>200ms (быстро)</span>
              <span className="text-primary font-semibold">{settings.animationSpeed || 1000}ms</span>
              <span>5000ms (медленно)</span>
            </div>
          </div>

          {/* Количество слоёв свечения */}
          {settings.glowEffect && (
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <Label className="m-0">Количество слоёв свечения</Label>
              </div>
              <Slider
                value={[settings.glowLayers || 5]}
                onValueChange={([value]) => actions.setGlowLayers(value)}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 слой</span>
                <span className="text-primary font-semibold">{settings.glowLayers || 5} слоёв</span>
                <span>10 слоёв</span>
              </div>
            </div>
          )}

          {/* Тип анимации для Custom SVG */}
          {settings.progressIcon === 'custom' && settings.progressType === 'slider' && (
            <div className="p-3 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <Label className="m-0">Тип анимации SVG</Label>
              </div>
              <Select
                value={settings.animationType || 'none'}
                onValueChange={(value) => actions.setAnimationType(value as any)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без анимации</SelectItem>
                  <SelectItem value="rotate">🔄 Вращение</SelectItem>
                  <SelectItem value="scale">💓 Пульсация</SelectItem>
                  <SelectItem value="bounce">⬆️ Прыжок</SelectItem>
                  <SelectItem value="spin">🌪️ Быстрое вращение</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Вращение при наведении */}
          <div className="p-3 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-500" />
              <Label className="m-0">Вращение при наведении</Label>
            </div>
            <Slider
              value={[settings.hoverRotation || 15]}
              onValueChange={([value]) => actions.setHoverRotation(value)}
              min={0}
              max={360}
              step={15}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0°</span>
              <span className="text-primary font-semibold">{settings.hoverRotation || 15}°</span>
              <span>360°</span>
            </div>
          </div>
        </div>

        {/* Предпросмотр */}
        <div className="space-y-2 pt-4 border-t">
          <Label>Предпросмотр</Label>
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground min-w-10">0:00</span>
              <div className="flex-1">
                {/* Используем ProgressSlider для предпросмотра */}
                <div
                  className="relative h-3 flex w-full touch-none select-none items-center"
                  onMouseOver={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const x = e.clientX - rect.left
                    const percent = x / rect.width
                    setPreviewValue(Math.round(percent * 100))
                  }}
                >
                  <div className="relative h-1 w-full grow overflow-hidden rounded-full bg-secondary">
                    <div
                      className="absolute h-full bg-primary transition-all"
                      style={{
                        width: `${previewValue}%`,
                        backgroundColor: settings.progressColor,
                        height: `${settings.progressHeight}px`,
                        borderRadius: `${settings.progressHeight / 2}px`,
                      }}
                    />
                  </div>
                  {/* Маркер для предпросмотра */}
                  <div
                    className={cn(
                      'absolute block cursor-pointer select-none border-2 transition-all transform-gpu',
                      settings.hoverAnimation && 'hover:scale-125',
                      settings.progressIcon === 'square' && 'rounded-sm',
                      settings.progressIcon === 'diamond' && 'rotate-45',
                      settings.progressIcon === 'circle' && 'rounded-full',
                    )}
                    style={{
                      left: `calc(${previewValue}% - 6px)`,
                      width: `${Math.max(12, settings.progressHeight)}px`,
                      height: `${Math.max(12, settings.progressHeight)}px`,
                      backgroundColor: settings.progressColor,
                      borderColor: settings.progressColor,
                    }}
                  />
                </div>
              </div>
              <span className="text-xs text-muted-foreground min-w-10">3:45</span>
            </div>
          </div>
        </div>

        {/* Сброс к настройкам по умолчанию */}
        <Button
          variant="outline"
          size="sm"
          onClick={actions.resetToDefaults}
          className="w-full"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Сбросить к настройкам по умолчанию
        </Button>
      </CardContent>
    </Card>
  )
}
