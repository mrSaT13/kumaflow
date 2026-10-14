import { useHomepageSettings, useHomepageSettingsActions, withWaveDefaults } from '@/store/homepage.store'
import { WAVE_MOODS_META } from '@/app/components/home/kuma-wave-background'
import { Settings, Sparkles, Monitor, Waves } from 'lucide-react'
import { toast } from 'react-toastify'

function WaveSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
    </label>
  )
}

export default function AppearanceSettings() {
  const settings = useHomepageSettings()
  const { setNewDesignEnabled, setWaveHeroLayout, setWaveHeroAlive, setWaveLines, setWaveEffect } = useHomepageSettingsActions()
  const waveHero = withWaveDefaults(settings.waveHero)

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

      {/* 🌊 Hero «Моя волна»: раскладка + живая анимация */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
            <Waves className="w-6 h-6 text-primary" />
          </div>

          <div className="flex-1">
            <h2 className="text-lg font-semibold">Hero «Моя волна»</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Центрированная раскладка как у Яндекса и живое пятно на цветах вашей темы
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-4">
          <div>
            <p className="font-medium">Раскладка как у Яндекса</p>
            <p className="text-xs text-muted-foreground">
              {waveHero.layout === 'yandex' ? 'По центру: ▶ Моя волна + Настроить + пилюли' : 'Наша раскладка: иконка слева + кнопки'}
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={waveHero.layout === 'yandex'}
              onChange={(e) => {
                setWaveHeroLayout(e.target.checked ? 'yandex' : 'kuma')
                toast.success(e.target.checked ? '🌊 Яндекс-раскладка включена' : '🌊 Наша раскладка включена', { autoClose: 2000 })
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-4">
          <div>
            <p className="font-medium">Живая анимация пятна</p>
            <p className="text-xs text-muted-foreground">
              {waveHero.alive ? 'Пятно дышит (только transform, пауза в фоне)' : 'Статичный градиент, ноль нагрузки'}
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={waveHero.alive}
              onChange={(e) => {
                setWaveHeroAlive(e.target.checked)
                toast.success(e.target.checked ? '🌊 Анимация включена' : '🌊 Анимация выключена', { autoClose: 2000 })
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-4">
          <div>
            <p className="font-medium">Лучи поверх капли</p>
            <p className="text-xs text-muted-foreground">
              {waveHero.lines ? 'Угли для огня, световой веер для остального' : 'Лучи скрыты, капля и эффекты остаются'}
            </p>
          </div>
          <WaveSwitch
            checked={waveHero.lines}
            onChange={(v) => {
              setWaveLines(v)
              toast.success(v ? '🌊 Лучи включены' : '🌊 Лучи выключены', { autoClose: 2000 })
            }}
          />
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <p className="font-medium">Эффекты жанров</p>
          <p className="text-xs text-muted-foreground">
            Для слабых ПК гасите по одному — остальное продолжит работать.
          </p>
          {WAVE_MOODS_META.map((m) => (
            <div key={m.key} className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.hint}</p>
              </div>
              <WaveSwitch checked={waveHero.effects[m.key]} onChange={(v) => setWaveEffect(m.key, v)} />
            </div>
          ))}
        </div>
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
