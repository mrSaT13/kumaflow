/**
 * Настройки аватара аккаунта
 * 
 * Функционал:
 * - Загрузка изображения
 * - Предпросмотр (круг)
 * - Настройка позиции (crop)
 * - Настройка масштаба
 * - Сброс
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Label } from '@/app/components/ui/label'
import { Slider } from '@/app/components/ui/slider'
import { Button } from '@/app/components/ui/button'
import { useAvatar, useAvatarActions } from '@/store/avatar.store'
import { Upload, RotateCcw, X, ZoomIn, Move } from 'lucide-react'

export function AvatarSettings() {
  const { t } = useTranslation()
  const settings = useAvatar()
  const actions = useAvatarActions()
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Обработка загрузки файла
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Проверка типа файла
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение (PNG, JPG, GIF)')
      return
    }

    // Проверка размера (макс 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Размер файла не должен превышать 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      actions.setAvatarData(dataUrl)
      setPreviewUrl(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  // Удаление аватара
  const handleRemoveAvatar = () => {
    actions.resetAvatar()
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Текущее изображение
  const currentImage = settings.avatarData || previewUrl

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          <CardTitle className="text-lg">Аватар аккаунта</CardTitle>
        </div>
        <CardDescription>
          Загрузите изображение профиля. Оно будет отображаться в хедере
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Предпросмотр */}
        <div className="flex items-center gap-6">
          {/* Текущий аватар */}
          <div className="relative">
            <div 
              className="rounded-full overflow-hidden border-2 border-primary/20"
              style={{ 
                width: `${settings.size}px`, 
                height: `${settings.size}px`,
                background: currentImage ? `url(${currentImage})` : '#333',
                backgroundPosition: `${settings.cropX}% ${settings.cropY}%`,
                backgroundSize: `${settings.scale * 100}%`,
              }}
            >
              {!currentImage && (
                <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground">
                  <Upload className="h-6 w-6" />
                </div>
              )}
            </div>
            
            {/* Кнопка удаления */}
            {currentImage && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={handleRemoveAvatar}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Информация */}
          <div className="flex-1">
            {!currentImage ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Аватар не загружен
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Загрузить изображение
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">✓ Аватар загружен</p>
                <p className="text-xs text-muted-foreground">
                  Настройте позицию и масштаб при необходимости
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Скрытый input для загрузки */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Настройки crop */}
        {currentImage && (
          <>
            {/* Позиция X */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Move className="h-4 w-4 text-muted-foreground" />
                <Label>Позиция по горизонтали</Label>
              </div>
              <Slider
                value={[settings.cropX]}
                onValueChange={([value]) => actions.setCropPosition(value, settings.cropY)}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>← Лево</span>
                <span>{settings.cropX}%</span>
                <span>Право →</span>
              </div>
            </div>

            {/* Позиция Y */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Move className="h-4 w-4 text-muted-foreground rotate-90" />
                <Label>Позиция по вертикали</Label>
              </div>
              <Slider
                value={[settings.cropY]}
                onValueChange={([value]) => actions.setCropPosition(settings.cropX, value)}
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>↑ Верх</span>
                <span>{settings.cropY}%</span>
                <span>Низ ↓</span>
              </div>
            </div>

            {/* Масштаб */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ZoomIn className="h-4 w-4 text-muted-foreground" />
                <Label>Масштаб</Label>
              </div>
              <Slider
                value={[settings.scale]}
                onValueChange={([value]) => actions.setScale(value)}
                min={0.5}
                max={3}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0.5x (меньше)</span>
                <span>{settings.scale.toFixed(1)}x</span>
                <span>3.0x (больше)</span>
              </div>
            </div>

            {/* Размер аватара */}
            <div className="space-y-2">
              <Label>Размер аватара: {settings.size}px</Label>
              <Slider
                value={[settings.size]}
                onValueChange={([value]) => actions.setSize(value)}
                min={24}
                max={64}
                step={4}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>24px</span>
                <span>64px</span>
              </div>
            </div>

            {/* Кнопка сброса */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveAvatar}
              className="w-full gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Удалить аватар
            </Button>
          </>
        )}

        {/* Подсказка */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            💡 <strong>Совет:</strong> Используйте квадратные изображения для лучшего результата. 
            Аватар автоматически обрезается под круг.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
