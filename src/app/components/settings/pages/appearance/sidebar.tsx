/**
 * Настройки сайдбара - кастомизация бокового меню
 * Перенесено из Content в Appearance
 */

import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import {
  Content,
  ContentItem,
  ContentItemForm,
  ContentItemTitle,
  ContentSeparator,
  Header,
  HeaderDescription,
  HeaderTitle,
  Root,
} from '@/app/components/settings/section'
import { Switch } from '@/app/components/ui/switch'
import { useAppPages } from '@/store/app.store'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

// Компонент сортируемого элемента
interface SortableSectionItemProps {
  id: string
  title: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function SortableSectionItem({ id, title, checked, onCheckedChange }: SortableSectionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 p-3 mb-2 bg-muted/50 rounded-lg border',
        isDragging && 'border-primary shadow-md'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
        aria-label="Переместить"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <ContentItemTitle className="flex-1 text-sm">
        {title}
      </ContentItemTitle>
      <ContentItemForm>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      </ContentItemForm>
    </div>
  )
}

export function SidebarAppearanceSettings() {
  const { t } = useTranslation()
  const {
    hideRadiosSection,
    setHideRadiosSection,
    hideAudiobooksSection,
    setHideAudiobooksSection,
    hidePlaylistsSection,
    setHidePlaylistsSection,
    hideArtistsSection,
    setHideArtistsSection,
    hideTracksSection,
    setHideTracksSection,
    hideAlbumsSection,
    setHideAlbumsSection,
    hideFavoritesSection,
    setHideFavoritesSection,
    hideGenresSection,
    setHideGenresSection,
    hidePodcastsSection,
    setHidePodcastsSection,
    hideLocalSection,
    setHideLocalSection,
    showCachePage,
    setShowCachePage,
    sidebarSectionOrder,
    setSidebarSectionOrder,
  } = useAppPages()

  // Очищаем дубликаты в sidebarSectionOrder при загрузке
  useEffect(() => {
    const uniqueItems = Array.from(new Set(sidebarSectionOrder))
    if (uniqueItems.length !== sidebarSectionOrder.length) {
      console.log('[Sidebar] Cleaning up duplicate items in sidebarSectionOrder')
      setSidebarSectionOrder(uniqueItems)
    }
  }, [sidebarSectionOrder, setSidebarSectionOrder])

  // Сенсоры для drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Обработчик окончания перетаскивания
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = sidebarSectionOrder.indexOf(active.id as string)
      const newIndex = sidebarSectionOrder.indexOf(over.id as string)
      
      // Проверяем что индексы найдены
      if (oldIndex === -1 || newIndex === -1) {
        console.error('[Sidebar] Invalid indices:', { oldIndex, newIndex, activeId: active.id, overId: over.id })
        return
      }
      
      const newOrder = arrayMove(sidebarSectionOrder, oldIndex, newIndex)
      
      // Проверяем что нет дубликатов
      const uniqueItems = new Set(newOrder)
      if (uniqueItems.size !== newOrder.length) {
        console.error('[Sidebar] Duplicate items detected:', newOrder)
        // Удаляем дубликаты
        const deduplicatedOrder = Array.from(uniqueItems)
        setSidebarSectionOrder(deduplicatedOrder)
      } else {
        setSidebarSectionOrder(newOrder)
      }
    }
  }

  // Список разделов с их настройками
  const sections = [
    {
      id: 'artists',
      title: 'Показать раздел "Исполнители"',
      checked: !hideArtistsSection,
      onCheckedChange: (checked: boolean) => setHideArtistsSection(!checked),
    },
    {
      id: 'songs',
      title: 'Показать раздел "Треки"',
      checked: !hideTracksSection,
      onCheckedChange: (checked: boolean) => setHideTracksSection(!checked),
    },
    {
      id: 'albums',
      title: 'Показать раздел "Альбомы"',
      checked: !hideAlbumsSection,
      onCheckedChange: (checked: boolean) => setHideAlbumsSection(!checked),
    },
    {
      id: 'favorites',
      title: 'Показать раздел "Избранное"',
      checked: !hideFavoritesSection,
      onCheckedChange: (checked: boolean) => setHideFavoritesSection(!checked),
    },
    {
      id: 'playlists',
      title: 'Показать раздел "Плейлисты"',
      checked: !hidePlaylistsSection,
      onCheckedChange: (checked: boolean) => setHidePlaylistsSection(!checked),
    },
    {
      id: 'podcasts',
      title: 'Показать раздел "Подкасты"',
      checked: !hidePodcastsSection,
      onCheckedChange: (checked: boolean) => setHidePodcastsSection(!checked),
    },
    {
      id: 'radios',
      title: 'Показать раздел "Радио"',
      checked: !hideRadiosSection,
      onCheckedChange: (checked: boolean) => setHideRadiosSection(!checked),
    },
    {
      id: 'genres',
      title: 'Показать раздел "Жанры"',
      checked: !hideGenresSection,
      onCheckedChange: (checked: boolean) => setHideGenresSection(!checked),
    },
    {
      id: 'audiobooks',
      title: 'Показать раздел "Аудиокниги"',
      checked: !hideAudiobooksSection,
      onCheckedChange: (checked: boolean) => setHideAudiobooksSection(!checked),
    },
    {
      id: 'local',
      title: 'Показать раздел "Локальная библиотека"',
      checked: !hideLocalSection,
      onCheckedChange: (checked: boolean) => setHideLocalSection(!checked),
    },
  ]

  // Кеш - отдельная настройка (не часть сортируемого списка)
  const cacheSection = {
    id: 'cache',
    title: 'Показать страницу "Кеш"',
    checked: showCachePage,
    onCheckedChange: (checked: boolean) => setShowCachePage(checked),
  }

  // Сортируем разделы согласно пользовательскому порядку
  // Фильтруем только существующие разделы
  const sortedSections = sidebarSectionOrder
    .filter(id => id !== 'cache') // Исключаем кеш из сортировки
    .map((id) => sections.find((s) => s.id === id))
    .filter((s): s is typeof sections[0] => s !== undefined)

  return (
    <Root>
      <Header>
        <HeaderTitle>Сайдбар</HeaderTitle>
        <HeaderDescription>
          Настройте какие разделы отображать в боковом меню и измените их порядок перетаскиванием
        </HeaderDescription>
      </Header>
      <Content>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sidebarSectionOrder.filter(id => id !== 'cache')}
            strategy={verticalListSortingStrategy}
          >
            {sortedSections.map((section) => (
              <SortableSectionItem
                key={section.id}
                id={section.id}
                title={section.title}
                checked={section.checked}
                onCheckedChange={section.onCheckedChange}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Кеш - отдельная настройка вне сортировки */}
        <div className="mt-4 pt-4 border-t">
          <SortableSectionItem
            id={cacheSection.id}
            title={cacheSection.title}
            checked={cacheSection.checked}
            onCheckedChange={cacheSection.onCheckedChange}
          />
        </div>
      </Content>
    </Root>
  )
}
