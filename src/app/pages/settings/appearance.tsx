import { useHomepageSettings, useHomepageSettingsActions } from '@/store/homepage.store'
import { Settings, Sparkles, Monitor } from 'lucide-react'
import { toast } from 'react-toastify'

export default function AppearanceSettings() {
  const settings = useHomepageSettings()
  const { setNewDesignEnabled } = useHomepageSettingsActions()

  const handleNewDesignToggle = (enabled: boolean) => {
    setNewDesignEnabled(enabled)
    toast.success(
      enabled 
        ? '🎨 Новый дизайн включён! Перезагрузите страницу для применения.' 
        : '🎨 Классический дизайн включён!',
      { autoClose: 3000 }
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Внешний вид</h1>
      </div>

      {/* 🆕 Переключатель нового дизайна */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Новый дизайн домашней страницы</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Современный минималистичный интерфейс с улучшенной навигацией
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Включить новый дизайн</p>
              <p className="text-xs text-muted-foreground">
                {settings.newDesignEnabled ? 'Активен' : 'Классический дизайн'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.newDesignEnabled}
              onChange={(e) => handleNewDesignToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {settings.newDesignEnabled && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-sm">
            <p className="font-medium text-primary mb-1">✨ Что нового:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Улучшенная Hero секция для "Моя Волна"</li>
              <li>• Быстрый доступ к "Для вас" и "Тренды"</li>
              <li>• AI-сеты с фильтрами</li>
              <li>• Блок открытий и радио артистов</li>
              <li>• Премьеры и жанровые плейлисты</li>
            </ul>
          </div>
        )}
      </div>

      {/* Настройки секций главной страницы */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Секции главной страницы</h2>
        <p className="text-sm text-muted-foreground">
          Настройте какие секции отображаются на главной странице
        </p>
        <p className="text-xs text-muted-foreground">
          → Перейти к настройке секций
        </p>
      </div>
    </div>
  )
}
