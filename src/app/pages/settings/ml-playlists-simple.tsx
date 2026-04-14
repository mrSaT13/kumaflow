import { useState, useEffect } from 'react'
import { useML } from '@/store/ml.store'
import { useMLPlaylists } from '@/store/ml-playlists.store'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Slider } from '@/app/components/ui/slider'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Progress } from '@/app/components/ui/progress'
import { Badge } from '@/app/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { trackEvent } from '@/service/ml-event-tracker'
import { Sparkles, Loader2, BarChart3, RefreshCw, Zap } from 'lucide-react'
import type { MABStats } from '@/service/multi-armed-bandit'
import { LastFmTagsImport } from '@/app/components/settings/pages/content/lastfm-tags-import'
import {
  getAnalysisStats,
  startLibraryAnalysis,
  stopLibraryAnalysis,
  resetAnalysisProgress,
  type AnalysisState,
} from '@/service/library-analyzer'
import { getArtists } from '@/service/subsonic-api'
import { exportAnalysisData, importAnalysisData } from '@/service/analysis-export'
import { HolidayPlaylistsSettings } from '@/app/components/settings/holiday-playlists'
import { RemoteControlSettings } from '@/app/components/settings/remote-control'
import { LLMSettings } from '@/app/components/settings/llm-settings'

export default function MLPlaylistsSettings() {
  const {
    settings,
    setMinTracks,
    setMaxTracks,
    setAutoUpdateHours,
    setRemoveDuplicates,
    setScanLibrary,
    setTimeAdaptivity,
    setDiscoveryEnabled,  // 🔒 Тумблер открытий
    setNoveltyFactor,
    setMabEnabled,  // 🎰 MAB тумблер
    setMabConfig,  // 🎰 MAB настройки
    resetMabStats,  // 🎰 Сброс MAB
    getMabStats,  // 🎰 Получить MAB статистику
    setShowLastUpdated,
    setLLMCoordinatorEnabled,
  } = useMLPlaylists()

  const { exportProfile, exportMLData, importProfile, resetProfile } = useML()

  const [isExporting, setIsExporting] = useState(false)
  const [analysisState, setAnalysisState] = useState<AnalysisState>(() => getAnalysisStats())
  const [isAnalyzing, setIsAnalyzing] = useState(() => getAnalysisStats().isScanning)
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [mabStats, setMabStats] = useState<MABStats | null>(null)
  const [showMabStats, setShowMabStats] = useState(false)

  // Обновляем состояние анализа каждую секунду если идёт сканирование
  useEffect(() => {
    if (isAnalyzing) {
      const interval = setInterval(() => {
        const stats = getAnalysisStats()
        setAnalysisState(stats)
        setIsAnalyzing(stats.isScanning)

        // Лог для отладки
        console.log(`[UI] Progress update: ${stats.processedArtists}/${stats.totalArtists} artists, ${stats.totalTracksAnalyzed} tracks`)
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [isAnalyzing])

  // Обновляем MAB статистику при монтировании
  useEffect(() => {
    if (showMabStats) {
      getMabStats().then(stats => {
        setMabStats(stats)
      }).catch(err => {
        console.warn('[MAB] Failed to get stats:', err)
      })
    }
  }, [showMabStats, getMabStats])

  const handleResetPreferences = () => {
    // Используем window.location.hash вместо useNavigate
    window.location.hash = '/artists/cold-start'
  }

  const handleExportProfile = () => {
    try {
      const data = exportProfile()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ml-profile-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      trackEvent('export_completed', { timestamp: new Date().toISOString() })
      toast('✅ Профиль экспортирован', {
        type: 'success',
      })
    } catch (error) {
      toast('❌ Ошибка экспорта', {
        type: 'error',
      })
    }
  }

  const handleExportMLData = async () => {
    setIsExporting(true)
    try {
      toast.info('Подготовка данных для экспорта...', { autoClose: 2000 })

      const data = await exportMLData()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kumaflow-ml-data-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // Считаем размер файла
      const fileSize = (new Blob([data]).size / 1024 / 1024).toFixed(2)

      trackEvent('ml_export_completed', {
        timestamp: new Date().toISOString(),
        fileSize,
      })
      toast(`ML-данные экспортированы (${fileSize} MB)`, {
        type: 'success',
        autoClose: 5000,
      })
    } catch (error) {
      console.error('ML Export error:', error)
      toast('Ошибка экспорта ML-данных', {
        type: 'error',
        autoClose: 5000,
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportProfile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result as string
        importProfile(data)

        trackEvent('import_completed', { timestamp: new Date().toISOString() })
        toast('Профиль импортирован', {
          type: 'success',
        })
      } catch (error) {
        toast('Ошибка импорта', {
          type: 'error',
        })
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const handleStartAnalysis = async () => {
    setIsAnalyzing(true)
    toast.info('Начат анализ библиотеки...', { autoClose: 3000 })
    
    try {
      await startLibraryAnalysis(
        (state) => {
          setAnalysisState(state)
          console.log(`[UI] Progress: ${state.processedArtists}/${state.totalArtists} artists`)
        },
        (state) => {
          setIsAnalyzing(false)
          toast.success(`Анализ завершен! Обработано ${state.totalTracksAnalyzed} треков`, {
            autoClose: 10000,
          })
          trackEvent('library_analysis_completed', {
            totalArtists: state.totalArtists,
            processedArtists: state.processedArtists,
            totalTracksAnalyzed: state.totalTracksAnalyzed,
          })
        }
      )
    } catch (error) {
      console.error('Library analysis error:', error)
      toast('Ошибка при анализе библиотеки', {
        type: 'error',
        autoClose: 5000,
      })
      setIsAnalyzing(false)
    }
  }

  const handleStopAnalysis = () => {
    stopLibraryAnalysis()
    setIsAnalyzing(false)
    toast.info('Анализ остановлен', { autoClose: 3000 })
  }

  const handleResetAnalysis = () => {
    resetAnalysisProgress()
    const stats = getAnalysisStats()
    setAnalysisState(stats)
    toast.info('Прогресс анализа сброшен', { autoClose: 3000 })
  }

  const handleExportAnalysis = async () => {
    try {
      toast.info('Подготовка экспорта анализа...', { autoClose: 2000 })
      
      const data = await exportAnalysisData()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kumaflow-analysis-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      const stats = getAnalysisStats()
      toast.success(`Экспортировано ${stats.totalTracksAnalyzed} треков`, { autoClose: 5000 })
    } catch (error) {
      console.error('Analysis export error:', error)
      toast('Ошибка экспорта анализа', { type: 'error', autoClose: 5000 })
    }
  }

  const handleImportAnalysis = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    try {
      toast.info('Импорт анализа...', { autoClose: 2000 })
      
      const text = await file.text()
      const result = await importAnalysisData(text)
      
      toast.success(`Импортировано ${result.imported} треков (пропущено ${result.skipped})`, { 
        autoClose: 5000 
      })
      
      // Обновляем состояние
      const stats = getAnalysisStats()
      setAnalysisState(stats)
    } catch (error) {
      console.error('Analysis import error:', error)
      toast('Ошибка импорта анализа', { type: 'error', autoClose: 5000 })
    }
  }

  const handleLoadLibraryStats = async () => {
    try {
      console.log('[ML Settings] Starting load library stats...')
      toast.info('Загрузка информации о библиотеке...', { autoClose: 2000 })
      
      // Получаем всех артистов через getLimitedArtists с большим лимитом
      console.log('[ML Settings] Calling getLimitedArtists(1000)...')
      const { getLimitedArtists } = await import('@/service/subsonic-api')
      const artists = await getLimitedArtists(1000)
      console.log('[ML Settings] getLimitedArtists returned:', artists.length, 'artists')
      
      if (artists.length === 0) {
        console.warn('[ML Settings] No artists found!')
        toast.warn('Библиотека пуста (0 артистов)', { autoClose: 5000 })
        return
      }
      
      // Создаём состояние с реальными данными
      const currentState = getAnalysisStats()
      console.log('[ML Settings] Current state:', currentState)
      
      const newState: AnalysisState = {
        ...currentState,
        totalArtists: artists.length,
        totalTracksAnalyzed: currentState.totalTracksAnalyzed,
      }
      
      console.log('[ML Settings] New state:', newState)
      setAnalysisState(newState)
      setLibraryLoaded(true)
      
      toast.success(`Загружено ${artists.length} артистов`, { autoClose: 3000 })
    } catch (error) {
      console.error('Failed to load library stats:', error)
      toast(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`, { 
        type: 'error', 
        autoClose: 10000 
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>✨ ML Плейлисты</CardTitle>
        <CardDescription>
          Настройки персональных плейлистов с рекомендациями
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ML Плейлисты настройки */}
        <div id="ml-playlists" className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Минимум треков: {settings.minTracks}</Label>
          </div>
          <Slider
            value={[settings.minTracks]}
            min={10}
            max={100}
            step={5}
            onValueChange={(val) => setMinTracks(val[0])}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Максимум треков: {settings.maxTracks}</Label>
          </div>
          <Slider
            value={[settings.maxTracks]}
            min={50}
            max={500}
            step={10}
            onValueChange={(val) => setMaxTracks(val[0])}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Автообновление: каждые {settings.autoUpdateHours} ч</Label>
          </div>
          <Slider
            value={[settings.autoUpdateHours]}
            min={1}
            max={168}
            step={1}
            onValueChange={(val) => setAutoUpdateHours(val[0])}
          />
          <p className="text-sm text-muted-foreground">
            От 1 часа до 7 дней
          </p>
        </div>

        {/* 🔒 ТУМБЛЕР ОТКРЫТИЙ — ВКЛ/ВЫКЛ */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">🔍 Включить музыкальные открытия</div>
            <div className="text-sm text-muted-foreground">
              {settings.discoveryEnabled
                ? 'Добавляем новую музыку: непроигранные треки любимых артистов и похожих исполнителей'
                : 'ТОЛЬКО проверенные предпочтения: любимые артисты и жанры, без открытий'}
            </div>
          </div>
          <Switch
            checked={settings.discoveryEnabled ?? false}
            onCheckedChange={(enabled) => {
              setDiscoveryEnabled(enabled)
              toast(enabled ? '🔍 Музыкальные открытия включены — добавляем новую музыку' : '🔒 Открытия выключены — только проверенные предпочтения', {
                type: 'info',
              })
              trackEvent('discovery_toggled', { enabled })
            }}
          />
        </div>

        {/* Слайдер новизны — только если discoveryEnabled */}
        {settings.discoveryEnabled && (
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>🆕 Процент новинок: {Math.round(settings.noveltyFactor * 100)}%</Label>
            </div>
            <Slider
              value={[settings.noveltyFactor * 100]}
              min={0}
              max={70}
              step={5}
              onValueChange={(val) => setNoveltyFactor(val[0] / 100)}
            />
            <p className="text-sm text-muted-foreground">
              {settings.noveltyFactor === 0 && 'Только проверенные предпочтения'}
              {settings.noveltyFactor > 0 && settings.noveltyFactor <= 0.2 && 'Больше любимого, немного нового'}
              {settings.noveltyFactor > 0.2 && settings.noveltyFactor <= 0.35 && 'Баланс между старым и новым'}
              {settings.noveltyFactor > 0.35 && settings.noveltyFactor <= 0.5 && 'Больше открытий и новой музыки'}
              {settings.noveltyFactor > 0.5 && 'Максимум новой музыки (до 70%)'}
            </p>
          </div>
        )}

        {/* Если discovery ВЫКЛ — показываем инфо */}
        {!settings.discoveryEnabled && (
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">
              🔒 <strong>Режим "Только проверенные"</strong> — плейлисты формируются ТОЛЬКО из ваших любимых артистов и жанров. 
              Никаких случайных открытий — только музыка, которая вам точно нравится.
            </p>
          </div>
        )}

        {/* 🎰 MULTI-ARMED BANDIT — УМНОЕ ИССЛЕДОВАНИЕ */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">🎰 Multi-Armed Bandit (умное исследование)</div>
            <div className="text-sm text-muted-foreground">
              {settings.mabEnabled
                ? 'Алгоритм как в Яндекс Музыке: балансирует между известным и новым при каждом выборе трека'
                : 'MAB выключен — используется только базовая логика генерации'}
            </div>
          </div>
          <Switch
            checked={settings.mabEnabled ?? true}
            onCheckedChange={(enabled) => {
              setMabEnabled(enabled)
              toast(enabled ? '🎰 MAB включён — умное исследование активно' : '🎰 MAB выключен', {
                type: 'info',
              })
              trackEvent('mab_toggled', { enabled })
            }}
          />
        </div>

        {/* ⚠️ ПРЕДУПРЕЖДЕНИЕ: Discovery ВЫКЛ + MAB ВКЛ */}
        {settings.mabEnabled && !settings.discoveryEnabled && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mt-2">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div className="text-sm">
                <div className="font-medium text-amber-700 dark:text-amber-400">Настройки конфликтуют</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <strong>«Музыкальные открытия» ВЫКЛ</strong> — генераторы плейлистов не добавляют новинки.
                  <br />
                  <strong>MAB ВКЛ</strong> — при воспроизведении MAB будет исследовать новое.
                  <br /><br />
                  <strong>Что происходит:</strong> плейлисты генерируются только из любимого, но при воспроизведении MAB может иногда подкидывать новое.
                  <br />
                  <strong>Рекомендация:</strong> либо включите «Музыкальные открытия», либо выключите MAB для полного контроля.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MAB Настройки — только если включен */}
        {settings.mabEnabled && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-lg">🎰 Настройки MAB</CardTitle>
              <CardDescription>Алгоритм исследования/эксплуатации</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Strategy Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Алгоритм</Label>
                  <span className="text-xs text-muted-foreground">Как MAB выбирает между старым и новым</span>
                </div>
                <Select
                  value={settings.mabConfig?.strategy || 'epsilon-greedy'}
                  onValueChange={async (value) => {
                    await setMabConfig({ strategy: value as any })
                    toast(`Алгоритм изменён на: ${value}`, { type: 'info' })
                    trackEvent('mab_strategy_changed', { strategy: value })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="epsilon-greedy">
                      <div className="space-y-1">
                        <div className="font-medium">🎲 Epsilon-Greedy</div>
                        <div className="text-xs text-muted-foreground">
                          С вероятностью ε исследует случайные треки, иначе выбирает лучшие. 
                          Простой, надёжный, 15% exploration по умолчанию.
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="thompson-sampling">
                      <div className="space-y-1">
                        <div className="font-medium">🎯 Thompson Sampling</div>
                        <div className="text-xs text-muted-foreground">
                          Байесовский подход: для каждого артиста держит распределение наград. 
                          Лучше учитывает контекст (время, день недели, настроение).
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="ucb">
                      <div className="space-y-1">
                        <div className="font-medium">📊 UCB (Upper Confidence Bound)</div>
                        <div className="text-xs text-muted-foreground">
                          UCB = avgReward + бонус за неопределённость. 
                          Математически оптимальный баланс: неисследованные артисты получают бонус.
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Epsilon Slider */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>🔍 Exploration Rate (Epsilon): {Math.round((settings.mabConfig?.epsilon || 0.15) * 100)}%</Label>
                  <span className="text-xs text-muted-foreground">Мин: {Math.round((settings.mabConfig?.minEpsilon || 0.05) * 100)}%</span>
                </div>
                <Slider
                  value={[(settings.mabConfig?.epsilon ?? 0.15) * 100]}
                  min={5}
                  max={50}
                  step={5}
                  onValueChange={async (val) => {
                    await setMabConfig({ epsilon: val[0] / 100 })
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {settings.mabConfig?.epsilon <= 0.1 && '🛡️ Меньше нового (10%), больше проверенного. Для тех кто любит стабильность.'}
                  {settings.mabConfig?.epsilon > 0.1 && settings.mabConfig?.epsilon <= 0.2 && '⚖️ Баланс (15%): 85% любимых артистов, 15% открытий. Рекомендуется.'}
                  {settings.mabConfig?.epsilon > 0.2 && '🔍 Больше открытий (25%+): чаще пробуем новое. Для тех кто хочет разнообразия.'}
                </p>
              </div>

              {/* Min Epsilon Slider */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>⬇️ Минимальный Epsilon: {Math.round((settings.mabConfig?.minEpsilon ?? 0.05) * 100)}%</Label>
                </div>
                <Slider
                  value={[(settings.mabConfig?.minEpsilon ?? 0.05) * 100]}
                  min={1}
                  max={20}
                  step={1}
                  onValueChange={async (val) => {
                    await setMabConfig({ minEpsilon: val[0] / 100 })
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  🔒 Даже когда MAB "научился" вашим вкусам — всегда исследуем минимум этот %.
                  Чтобы не застрять в одном артисте навечно.
                </p>
              </div>

              {/* Exploration Boost */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>🆕 Буст новых артистов: {settings.mabConfig?.explorationBoostNewArms ?? 5.0}</Label>
                </div>
                <Slider
                  value={[settings.mabConfig?.explorationBoostNewArms ?? 5.0]}
                  min={0}
                  max={15}
                  step={1}
                  onValueChange={async (val) => {
                    await setMabConfig({ explorationBoostNewArms: val[0] })
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  🎰 Насколько сильно MAB предпочитает артистов которых вы ещё не слышали (или слышали мало).
                  Выше = чаще открывает новое. 0 = без предпочтений.
                </p>
              </div>

              {/* Quick Presets */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <Label>⚡ Быстрые пресеты</Label>
                  <span className="text-xs text-muted-foreground">Одним кликом настроишь под себя</span>
                </div>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={async () => {
                      await setMabConfig({
                        epsilon: 0.10,
                        minEpsilon: 0.03,
                        explorationBoostNewArms: 3.0,
                        strategy: 'ucb',
                      })
                      toast('🛡️ Стабильность: меньше нового, больше любимого', { type: 'info' })
                    }}
                  >
                    <div className="text-left">
                      <div className="font-medium">🛡️ Стабильность</div>
                      <div className="text-xs text-muted-foreground">
                        10% exploration. Чаще играет проверенное. Для тех кто любит знакомое.
                      </div>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={async () => {
                      await setMabConfig({
                        epsilon: 0.15,
                        minEpsilon: 0.05,
                        explorationBoostNewArms: 5.0,
                        strategy: 'epsilon-greedy',
                      })
                      toast('⚖️ Баланс: 85% любимое, 15% открытия', { type: 'success' })
                    }}
                  >
                    <div className="text-left">
                      <div className="font-medium">⚖️ Баланс (рекомендуется)</div>
                      <div className="text-xs text-muted-foreground">
                        15% exploration. Как Яндекс Музыка. Баланс между старым и новым.
                      </div>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={async () => {
                      await setMabConfig({
                        epsilon: 0.25,
                        minEpsilon: 0.10,
                        explorationBoostNewArms: 10.0,
                        strategy: 'thompson-sampling',
                      })
                      toast('🔍 Исследователь: больше открытий!', { type: 'info' })
                    }}
                  >
                    <div className="text-left">
                      <div className="font-medium">🔍 Исследователь</div>
                      <div className="text-xs text-muted-foreground">
                        25% exploration. Чаще открывает новое. Для тех кто хочет разнообразия.
                      </div>
                    </div>
                  </Button>
                </div>
              </div>

              {/* MAB Stats Toggle */}
              <div className="pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowMabStats(!showMabStats)
                    if (!showMabStats) {
                      getMabStats().then(stats => {
                        setMabStats(stats)
                      }).catch(err => {
                        console.warn('[MAB] Failed to get stats:', err)
                      })
                    }
                  }}
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  {showMabStats ? 'Скрыть' : 'Показать'} статистику
                </Button>
              </div>

              {/* MAB Stats Display */}
              {showMabStats && mabStats && (
                <Card className="mt-2 bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground">Всего рук:</div>
                        <div className="font-bold text-lg">{mabStats.totalArms}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Лучшая рука:</div>
                        <div className="font-bold text-sm">{mabStats.bestArm || '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Exploration:</div>
                        <div className="font-bold text-lg">{(mabStats.explorationRate * 100).toFixed(1)}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Всего выборов:</div>
                        <div className="font-bold text-lg">{mabStats.totalPulls}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Средняя награда:</div>
                        <div className="font-bold text-lg">{mabStats.avgReward.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Стратегия:</div>
                        <div className="font-bold text-sm">{mabStats.strategy}</div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3"
                      onClick={async () => {
                        await resetMabStats()
                        const stats = await getMabStats()
                        setMabStats(stats)
                        toast('Статистика MAB сброшена', { type: 'info' })
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Сбросить статистику
                    </Button>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        )}

        {/* LLM Координатор для Моя волна */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">🤖 LLM Координатор для «Моя волна»</div>
            <div className="text-sm text-muted-foreground">
              LLM помогает подбирать треки перед генерацией
            </div>
          </div>
          <Switch
            checked={settings.llmCoordinatorEnabled ?? false}
            onCheckedChange={(enabled) => {
              setLLMCoordinatorEnabled(enabled)
              toast(enabled ? '🤖 LLM Координатор включён' : '🤖 LLM Координатор выключен', {
                type: 'info',
              })
            }}
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">Удалять дубликаты</div>
            <div className="text-sm text-muted-foreground">
              Автоматически находить и удалять дубли плейлистов
            </div>
          </div>
          <Switch
            checked={settings.removeDuplicates}
            onCheckedChange={setRemoveDuplicates}
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">Сканирование библиотеки</div>
            <div className="text-sm text-muted-foreground">
              Анализировать треки для ML рекомендаций
            </div>
          </div>
          <Switch
            checked={settings.scanLibrary}
            onCheckedChange={setScanLibrary}
          />
        </div>

        {/* Адаптивность по времени суток */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">Адаптивность по времени суток</div>
            <div className="text-sm text-muted-foreground">
              Утром энергичнее, вечером спокойнее
            </div>
          </div>
          <Switch
            checked={settings.timeAdaptivity}
            onCheckedChange={setTimeAdaptivity}
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">Показывать дату обновления</div>
            <div className="text-sm text-muted-foreground">
              Отображать дату и время на карточках плейлистов
            </div>
          </div>
          <Switch
            checked={settings.showLastUpdated}
            onCheckedChange={setShowLastUpdated}
          />
        </div>

        <div className="pt-4 border-t space-y-3">
          <Button
            onClick={handleResetPreferences}
            variant="outline"
            className="w-full"
          >
            Уточнить предпочтения
          </Button>

          <div className="flex gap-2">
            <Button
              onClick={handleExportProfile}
              variant="outline"
              className="flex-1"
              size="sm"
            >
              Экспорт профиля
            </Button>

            <label className="flex-1">
              <input
                type="file"
                accept=".json"
                onChange={handleImportProfile}
                className="hidden"
              />
              <Button
                asChild
                variant="outline"
                className="w-full"
                size="sm"
              >
                <span>Импорт</span>
              </Button>
            </label>
          </div>

          {/* Расширенный экспорт ML-данных */}
          <div className="pt-3 border-t">
            <div className="mb-3">
              <h4 className="font-medium text-sm mb-1">Расширенный экспорт данных</h4>
              <p className="text-xs text-muted-foreground">
                Выгрузить полный анализ: треки, история, статистика, временные паттерны
              </p>
            </div>
            <Button
              onClick={handleExportMLData}
              disabled={isExporting}
              variant="default"
              className="w-full"
              size="sm"
            >
              {isExporting ? 'Подготовка...' : 'Экспортировать ML-данные'}
            </Button>
          </div>
        </div>

        {/* Last.fm Теги */}
        <div id="lastfm" className="pt-4 border-t">
          <LastFmTagsImport />
        </div>

        {/* Анализ библиотеки */}
        <div id="analysis" className="pt-4 border-t">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Анализ библиотеки</CardTitle>
              <CardDescription>
                Постепенный анализ всех треков по артистам
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analysisState && analysisState.totalArtists > 0 ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Прогресс:</span>
                      <span>{analysisState.processedArtists} из {analysisState.totalArtists} артистов</span>
                    </div>
                    <Progress 
                      value={analysisState.totalArtists > 0 ? (analysisState.processedArtists / analysisState.totalArtists) * 100 : 0} 
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Обработано треков: {analysisState.totalTracksAnalyzed}</span>
                      <span>{analysisState.totalArtists > 0 ? Math.round((analysisState.processedArtists / analysisState.totalArtists) * 100) : 0}%</span>
                    </div>
                  </div>

                  {analysisState.lastArtistName && (
                    <div className="text-xs text-muted-foreground">
                      Последний артист: {analysisState.lastArtistName}
                    </div>
                  )}

                  {analysisState.lastScanDate && (
                    <div className="text-xs text-muted-foreground">
                      Последнее сканирование: {new Date(analysisState.lastScanDate).toLocaleString('ru-RU')}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {!isAnalyzing ? (
                      <Button
                        onClick={handleStartAnalysis}
                        disabled={analysisState.processedArtists >= analysisState.totalArtists && analysisState.totalArtists > 0}
                        className="flex-1"
                        size="sm"
                      >
                        {analysisState.processedArtists >= analysisState.totalArtists && analysisState.totalArtists > 0
                          ? 'Завершено'
                          : analysisState.processedArtists > 0
                            ? 'Продолжить'
                            : 'Начать анализ'
                        }
                      </Button>
                    ) : (
                      <Button
                        onClick={handleStopAnalysis}
                        variant="destructive"
                        className="flex-1"
                        size="sm"
                      >
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Остановить
                      </Button>
                    )}

                    <Button
                      onClick={handleResetAnalysis}
                      variant="outline"
                      size="sm"
                    >
                      Сброс
                    </Button>
                  </div>

                  {/* Экспорт/Импорт анализа */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      onClick={handleExportAnalysis}
                      variant="outline"
                      size="sm"
                      disabled={analysisState.totalTracksAnalyzed === 0}
                    >
                      Экспорт анализа
                    </Button>
                    <label>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleImportAnalysis}
                        className="hidden"
                      />
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                      >
                        <span>Импорт анализа</span>
                      </Button>
                    </label>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {libraryLoaded && analysisState.totalArtists === 0 
                      ? 'Библиотека пуста (0 артистов)'
                      : !libraryLoaded
                        ? 'Нажмите "Загрузить" для получения списка артистов'
                        : 'Загрузка...'
                    }
                  </p>
                  <div className="flex gap-2 justify-center">
                    {!libraryLoaded && (
                      <Button 
                        onClick={handleLoadLibraryStats}
                        variant="outline" 
                        size="sm"
                      >
                        Загрузить артистов
                      </Button>
                    )}
                    <Button 
                      onClick={handleStartAnalysis}
                      disabled={!libraryLoaded || analysisState.totalArtists === 0}
                      variant="default"
                      size="sm"
                    >
                      Начать анализ
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Праздничные плейлисты */}
        <div className="pt-4 border-t">
          <HolidayPlaylistsSettings />
        </div>

        {/* Remote Control */}
        <div className="pt-4 border-t">
          <RemoteControlSettings />
        </div>

        {/* LLM Интеграция */}
        <div className="pt-4 border-t">
          <LLMSettings />
        </div>
      </div>  {/* Закрываем id="ml-playlists" */}
      </CardContent>
    </Card>
  )
}
