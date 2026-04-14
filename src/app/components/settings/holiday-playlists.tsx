import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Switch } from '@/app/components/ui/switch'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { toast } from 'react-toastify'
import { getAllHolidays, getUpcomingHolidays, type Holiday } from '@/service/holidays'
import { parseIcsFile, saveCustomHoliday, getCustomHolidays, deleteCustomHoliday, exportCustomHolidaysToJson } from '@/service/ics-parser'
import { Calendar, Plus, Upload, Download, Trash2 } from 'lucide-react'
import { AddHolidayModal } from './add-holiday-modal'

export function HolidayPlaylistsSettings() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [upcoming, setUpcoming] = useState<Holiday[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  useEffect(() => {
    loadHolidays()
  }, [])

  const loadHolidays = () => {
    // Загружаем дефолтные праздники
    const allHolidays = getAllHolidays()
    
    // Загружаем пользовательские
    const customHolidays = getCustomHolidays()
    
    // Объединяем
    setHolidays([...allHolidays, ...customHolidays])

    // Загружаем предстоящие праздники
    const upcomingHolidays = getUpcomingHolidays(7)
    setUpcoming(upcomingHolidays)
  }

  const handleToggleHoliday = (holidayId: string) => {
    setHolidays(prev =>
      prev.map(h =>
        h.id === holidayId ? { ...h, isEnabled: !h.isEnabled } : h
      )
    )
    toast.success('Настройки праздника обновлены', { autoClose: 2000 })
  }

  const handleImportCalendar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsedHolidays = parseIcsFile(text)
      
      if (parsedHolidays.length === 0) {
        toast.error('Не найдено событий в .ics файле', { autoClose: 3000 })
        return
      }
      
      // Сохраняем каждое событие
      parsedHolidays.forEach(h => saveCustomHoliday(h))
      
      toast.success(`📅 Импортировано ${parsedHolidays.length} праздников`, { autoClose: 3000 })
      loadHolidays()
    } catch (error) {
      console.error('[Holiday] Import error:', error)
      toast.error('Ошибка импорта .ics файла', { autoClose: 3000 })
    }
  }

  const handleAddHoliday = () => {
    console.log('[Holiday] Add button clicked')
    setIsAddModalOpen(true)
    console.log('[Holiday] isAddModalOpen set to true')
  }

  const handleDeleteHoliday = (holidayId: string) => {
    deleteCustomHoliday(holidayId)
    toast.info('🗑️ Праздник удалён', { autoClose: 2000 })
    loadHolidays()
  }

  const handleExportJson = () => {
    const json = exportCustomHolidaysToJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `holidays-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('📥 Экспорт в JSON завершён', { autoClose: 2000 })
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>🎄 Праздничные плейлисты</CardTitle>
        <CardDescription>
          Автоматическая генерация плейлистов к праздникам
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Предстоящие праздники */}
        {upcoming.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Скоро праздники:</h4>
            <div className="flex gap-2 flex-wrap">
              {upcoming.map(holiday => (
                <Badge key={holiday.id} variant="default" className="text-sm">
                  {holiday.icon} {holiday.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Импорт календаря */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <div className="font-medium">Импорт календаря</div>
            <div className="text-sm text-muted-foreground">
              Загрузить .ics файл с праздниками
            </div>
          </div>
          <label>
            <input
              type="file"
              accept=".ics"
              onChange={handleImportCalendar}
              className="hidden"
            />
            <Button variant="outline" size="sm" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Загрузить
              </span>
            </Button>
          </label>
        </div>

        {/* Список праздников */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Все праздники:</h4>
            <div className="flex gap-2">
              {/* Экспорт JSON */}
              <Button variant="outline" size="sm" onClick={handleExportJson}>
                <Download className="w-4 h-4 mr-1" />
                Экспорт
              </Button>
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {holidays.map(holiday => (
              <div
                key={holiday.id}
                className="flex items-center justify-between p-3 bg-muted rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-2xl">{holiday.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {holiday.name}
                      {/* Бейдж пользовательского праздника */}
                      {holiday.isCustom && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Свой
                        </Badge>
                      )}
                      {holiday.isImported && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Импорт
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {holiday.startDate} — {holiday.endDate}
                      {holiday.holidayType && (
                        <span className="ml-2">• Тип: {holiday.holidayType}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={holiday.isEnabled !== false}
                    onCheckedChange={() => handleToggleHoliday(holiday.id)}
                  />
                  {/* Удаление только для пользовательских */}
                  {holiday.isCustom && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteHoliday(holiday.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Добавить праздник */}
        <div className="pt-4 border-t">
          <Button
            onClick={handleAddHoliday}
            variant="outline"
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Добавить праздник
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* 🆕 Модальное окно добавления праздника */}
    <AddHolidayModal
      isOpen={isAddModalOpen}
      onClose={() => setIsAddModalOpen(false)}
      onAdded={loadHolidays}
    />
    </>
  )
}
