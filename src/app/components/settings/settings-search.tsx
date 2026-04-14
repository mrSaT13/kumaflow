import { useState, useMemo } from 'react'
import { Input } from '@/app/components/ui/input'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Search, ChevronRight } from 'lucide-react'

interface SettingItem {
  id: string
  title: string
  description: string
  category: string
  keywords: string[]
  sectionId?: string  // ID секции для скролла
}

interface SettingsSearchProps {
  onClose: () => void
}

export function SettingsSearch({ onClose }: SettingsSearchProps) {
  const [query, setQuery] = useState('')

  // Список всех настроек для поиска
  const settingsItems: SettingItem[] = useMemo(() => [
    // === ML Плейлисты ===
    {
      id: 'novelty-factor',
      title: 'Новизна рекомендаций',
      description: 'Коэффициент новизны для ML рекомендаций (0-50%)',
      category: 'ML Плейлисты',
      keywords: ['новизна', 'рекомендации', 'ml', 'бандиты', 'многорукие', 'проценты'],
      sectionId: 'ml-playlists',
    },
    {
      id: 'time-adaptivity',
      title: 'Адаптивность по времени суток',
      description: 'Утром энергичнее, вечером спокойнее',
      category: 'ML Плейлисты',
      keywords: ['время', 'адаптивность', 'утро', 'вечер', 'ml', 'ночь', 'день'],
      sectionId: 'ml-playlists',
    },
    {
      id: 'holiday-playlists',
      title: 'Праздничные плейлисты',
      description: 'Автоматическая генерация плейлистов к праздникам',
      category: 'ML Плейлисты',
      keywords: ['праздник', 'новый год', 'рождество', 'хэллоуин', 'ml', '8 марта', '23 февраля'],
      sectionId: 'ml-playlists',
    },
    {
      id: 'min-tracks',
      title: 'Минимум треков',
      description: 'Минимальное количество треков в ML плейлисте',
      category: 'ML Плейлисты',
      keywords: ['минимум', 'треки', 'ml', 'плейлист', 'количество'],
      sectionId: 'ml-playlists',
    },
    {
      id: 'max-tracks',
      title: 'Максимум треков',
      description: 'Максимальное количество треков в ML плейлисте',
      category: 'ML Плейлисты',
      keywords: ['максимум', 'треки', 'ml', 'плейлист', 'количество'],
      sectionId: 'ml-playlists',
    },
    {
      id: 'auto-update',
      title: 'Автообновление',
      description: 'Как часто обновлять ML плейлисты',
      category: 'ML Плейлисты',
      keywords: ['авто', 'обновление', 'ml', 'плейлист', 'часы', 'период'],
      sectionId: 'ml-playlists',
    },
    {
      id: 'remove-duplicates',
      title: 'Удалять дубликаты',
      description: 'Автоматически находить и удалять дубли плейлистов',
      category: 'ML Плейлисты',
      keywords: ['дубликаты', 'удалить', 'ml', 'плейлист', 'очистка'],
      sectionId: 'ml-playlists',
    },
    
    // === Анализ библиотеки ===
    {
      id: 'analysis-export',
      title: 'Экспорт анализа',
      description: 'Экспортировать проанализированные треки',
      category: 'Анализ библиотеки',
      keywords: ['экспорт', 'анализ', 'backup', 'ml', 'сохранить', 'файл'],
      sectionId: 'analysis',
    },
    {
      id: 'analysis-import',
      title: 'Импорт анализа',
      description: 'Импортировать проанализированные треки',
      category: 'Анализ библиотеки',
      keywords: ['импорт', 'анализ', 'restore', 'ml', 'загрузить', 'файл'],
      sectionId: 'analysis',
    },
    {
      id: 'library-analysis',
      title: 'Анализ библиотеки',
      description: 'Постепенный анализ всех треков по артистам',
      category: 'Анализ библиотеки',
      keywords: ['анализ', 'библиотека', 'сканирование', 'ml', 'треки', 'артисты'],
      sectionId: 'analysis',
    },
    
    // === Last.fm ===
    {
      id: 'lastfm-tags',
      title: 'Last.fm Теги',
      description: 'Импорт жанров и настроений из Last.fm',
      category: 'Last.fm',
      keywords: ['lastfm', 'теги', 'жанры', 'настроения', 'импорт', 'last.fm'],
      sectionId: 'lastfm',
    },
    
    // === Кэш ===
    {
      id: 'cache-auto-starred',
      title: 'Автосохранение лайкнутых',
      description: 'При включении лайкнутые треки автоматически сохраняются в кеш',
      category: 'Кэш',
      keywords: ['кэш', 'автосохранение', 'лайкнутые', 'треки', 'автоматически'],
      sectionId: 'cache',
    },
    {
      id: 'cache-max-tracks',
      title: 'Максимум треков в кэше',
      description: 'Сколько треков хранить в кэше',
      category: 'Кэш',
      keywords: ['кэш', 'максимум', 'треки', 'лимит', 'количество'],
      sectionId: 'cache',
    },
    {
      id: 'cache-max-artists',
      title: 'Максимум артистов в кэше',
      description: 'Сколько артистов хранить в кэше',
      category: 'Кэш',
      keywords: ['кэш', 'максимум', 'артисты', 'лимит', 'количество'],
      sectionId: 'cache',
    },
    {
      id: 'cache-size',
      title: 'Размер кэша',
      description: 'Максимальный размер кэша в мегабайтах',
      category: 'Кэш',
      keywords: ['кэш', 'размер', 'мегабайты', 'mb', 'лимит'],
      sectionId: 'cache',
    },
    {
      id: 'cache-ttl',
      title: 'Время жизни кэша',
      description: 'Как долго хранить кэш (в часах)',
      category: 'Кэш',
      keywords: ['кэш', 'время', 'жизнь', 'часы', 'ttl', 'хранение'],
      sectionId: 'cache',
    },
    {
      id: 'cache-clear',
      title: 'Очистить кэш',
      description: 'Удалить все кэшированные треки и артисты',
      category: 'Кэш',
      keywords: ['кэш', 'очистить', 'удалить', 'сброс', 'все'],
      sectionId: 'cache',
    },
    {
      id: 'cache-export',
      title: 'Экспорт кэша',
      description: 'Сохранить кэш в файл',
      category: 'Кэш',
      keywords: ['кэш', 'экспорт', 'сохранить', 'файл', 'backup'],
      sectionId: 'cache',
    },
  ], [])

  // Фильтрация настроек по запросу
  const filteredSettings = useMemo(() => {
    if (!query.trim()) return []

    const searchQuery = query.toLowerCase().trim()
    
    return settingsItems.filter(item => {
      const titleMatch = item.title.toLowerCase().includes(searchQuery)
      const descMatch = item.description.toLowerCase().includes(searchQuery)
      const categoryMatch = item.category.toLowerCase().includes(searchQuery)
      const keywordMatch = item.keywords.some(keyword =>
        keyword.toLowerCase().includes(searchQuery)
      )

      return titleMatch || descMatch || categoryMatch || keywordMatch
    })
  }, [query, settingsItems])

  // Группировка по категориям
  const groupedSettings = useMemo(() => {
    const groups: Record<string, SettingItem[]> = {}
    
    filteredSettings.forEach(item => {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category].push(item)
    })
    
    return groups
  }, [filteredSettings])

  const handleItemClick = (item: SettingItem) => {
    // Для разных секций - разные страницы
    const pageRoutes: Record<string, string> = {
      'ml-playlists': '/settings/ml-playlists',
      'analysis': '/settings/ml-playlists',  // Анализ в ML настройках
      'lastfm': '/settings/external-api',  // Last.fm во внешних API
      'cache': '/cache',  // Кэш на отдельной странице
    }

    if (!item.sectionId) return
    
    const route = pageRoutes[item.sectionId]

    if (route) {
      // Переход на страницу настроек
      window.location.hash = route

      // Если это не отдельная страница (не кэш), скроллим к секции
      if (item.sectionId !== 'cache') {
        setTimeout(() => {
          const element = document.getElementById(item.sectionId)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 200)
      }
    }

    // Закрываем поиск
    onClose()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Заголовок с поиском */}
      <div className="p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold flex-1">Поиск настроек</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск настроек..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
            autoFocus
          />
        </div>
      </div>

      {/* Результаты поиска со скроллом */}
      <ScrollArea className="flex-1 max-h-[calc(600px-140px)]">
        <div className="p-4 space-y-4">
          {query.trim() && filteredSettings.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p>Ничего не найдено</p>
              <p className="text-sm">Попробуйте другой запрос</p>
            </div>
          )}

          {!query.trim() && (
            <div className="text-center text-muted-foreground py-8">
              <p>Введите запрос для поиска</p>
            </div>
          )}

          {Object.entries(groupedSettings).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground sticky top-0 bg-background py-2">
                {category}
              </h3>
              <div className="space-y-1">
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  >
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
