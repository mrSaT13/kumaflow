/**
 * Add Holiday Modal - Модальное окно добавления праздника
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Реализовано
 * - Авто-определение типа по триггер-словам
 * - Ручной выбор типа (выпадающий список)
 * - Настройка дат, иконки
 */

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { toast } from 'react-toastify'
import { detectHolidayTypeFromName, getHolidayTypes, saveCustomHoliday } from '@/service/ics-parser'
import { checkAndGenerateHolidayPlaylists } from '@/service/holiday-playlist-generator'  // 🆕
import type { Holiday } from '@/service/holidays'

interface AddHolidayModalProps {
  isOpen: boolean
  onClose: () => void
  onAdded: () => void
}

export function AddHolidayModal({ isOpen, onClose, onAdded }: AddHolidayModalProps) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedType, setSelectedType] = useState('custom')
  const [detectedType, setDetectedType] = useState<string | null>(null)

  // Отладка
  useEffect(() => {
    console.log('[AddHolidayModal] isOpen:', isOpen)
  }, [isOpen])

  // Авто-определение типа при вводе названия
  useEffect(() => {
    if (name.length > 2) {
      const detected = detectHolidayTypeFromName(name)
      setDetectedType(detected.type)
      setSelectedType(detected.type)
    } else {
      setDetectedType(null)
    }
  }, [name])

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Введите название праздника', { autoClose: 2000 })
      return
    }
    if (!startDate) {
      toast.error('Выберите дату начала', { autoClose: 2000 })
      return
    }

    // Получаем конфигурацию выбранного типа
    const holidayTypes = getHolidayTypes()
    const typeConfig = holidayTypes.find(t => t.type === selectedType) || holidayTypes.find(t => t.type === 'custom')!

    // 🆕 Конвертируем YYYY-MM-DD → MM-DD
    const startParts = startDate.split('-')
    const startDateMMDD = `${startParts[1]}-${startParts[2]}`
    
    let endDateMMDD = startDateMMDD
    if (endDate) {
      const endParts = endDate.split('-')
      endDateMMDD = `${endParts[1]}-${endParts[2]}`
    }

    // Создаём Holiday объект
    const holiday: Holiday = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: name.trim(),
      startDate: startDateMMDD,
      endDate: endDateMMDD,
      isFixed: true,
      genres: typeConfig.genres,
      mood: typeConfig.mood,
      energy: typeConfig.energy,
      valence: typeConfig.valence,
      icon: typeConfig.icon,
      isImported: false,
      isEnabled: true,
      isCustom: true,
      holidayType: selectedType,
    }

    // Сохраняем
    saveCustomHoliday(holiday)

    // 🆕 Сразу генерируем плейлист если праздник в ближайшие 7 дней
    toast.info(`⏳ Генерация плейлиста для ${holiday.icon} ${holiday.name}...`, { autoClose: 2000 })
    checkAndGenerateHolidayPlaylists().then(() => {
      toast.success(`🎉 Праздник добавлен и плейлист сгенерирован!`, { autoClose: 3000 })
    })
    
    // Сбрасываем форму
    setName('')
    setStartDate('')
    setEndDate('')
    setSelectedType('custom')
    setDetectedType(null)
    
    onAdded()
    onClose()
  }

  const holidayTypes = getHolidayTypes()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>🎄 Добавить праздник</DialogTitle>
          <DialogDescription>
            Введите название и дату — тип определится автоматически
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Название */}
          <div className="space-y-2">
            <Label>Название праздника</Label>
            <Input
              placeholder='Например: "День рождения Андрей"'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {/* Авто-определение типа */}
            {detectedType && (
              <div className="text-xs text-green-600 flex items-center gap-1">
                ✨ Авто-определено: {holidayTypes.find(t => t.type === detectedType)?.name}
              </div>
            )}
          </div>

          {/* Тип праздника */}
          <div className="space-y-2">
            <Label>Тип праздника</Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {holidayTypes.map(type => (
                  <SelectItem key={type.type} value={type.type}>
                    {type.icon} {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Даты */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Дата начала</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Дата окончания</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Необязательно"
              />
            </div>
          </div>

          {/* Кнопки */}
          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Отмена
            </Button>
            <Button onClick={handleSubmit} className="flex-1">
              Добавить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
