/**
 * Homepage Settings - Настройки главной страницы
 * Перенесено из Content в Appearance
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GripVertical, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Button } from '@/app/components/ui/button'
import {
  useHomepageSettings,
  useHomepageSettingsActions,
  type SectionType,
} from '@/store/homepage.store'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SortableSectionProps {
  id: SectionType
  title: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

function SortableSection({ id, title, enabled, onToggle }: SortableSectionProps) {
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
      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg mb-2"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Section Title */}
      <div className="flex-1">
        <Label className="text-sm font-medium">{title}</Label>
      </div>

      {/* Enable/Disable Switch */}
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  )
}

export function HomepageSettingsContent() {
  const { t } = useTranslation()
  const settings = useHomepageSettings()
  const { setSectionEnabled, setSectionOrder, resetToDefaults } = useHomepageSettingsActions()

  const [sections, setSections] = useState(settings.sections)

  // Синхронизируем local state с store
  useEffect(() => {
    setSections(settings.sections)
  }, [settings.sections])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id)
      const newIndex = sections.findIndex((s) => s.id === over.id)

      const newSections = arrayMove(sections, oldIndex, newIndex)
      setSections(newSections)
      
      // Передаём массив ID в новом порядке
      const newOrder = newSections.map((s) => s.id)
      console.log('[Homepage] New order:', newOrder)
      setSectionOrder(newOrder)
      
      // Проверяем что сохранилось
      setTimeout(() => {
        const stored = JSON.parse(localStorage.getItem('homepage-settings-persistence') || '{}')
        console.log('[Homepage] Stored sections:', stored.state?.settings?.sections)
      }, 100)
    }
  }

  const handleReset = () => {
    resetToDefaults()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Секции главной страницы</CardTitle>
            <CardDescription>
              Настройте какие секции отображать и в каком порядке
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Сбросить
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                id={section.id}
                title={section.title}  // Используем title из store
                enabled={section.enabled}
                onToggle={(enabled) => setSectionEnabled(section.id, enabled)}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-xs text-blue-500">
            💡 Совет: Перетаскивайте секции за иконку ⋮⋮ чтобы изменить порядок
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
