/**
 * Настройки локальной музыки
 */

import { FolderPlus, Trash2, Scan, Music2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Switch } from '@/app/components/ui/switch'
import { useLocalMusicStore } from '@/store/local-music.store'
import { toast } from 'react-toastify'

export function LocalMusicSettings() {
  const { folders, tracks, isScanning, scanProgress, addFolder, removeFolder, startScan, scanSettings, updateScanSettings } = useLocalMusicStore()
  const [newFolderPath, setNewFolderPath] = useState('')

  const handleAddFolder = async () => {
    if (!newFolderPath.trim()) {
      toast.error('Введите путь к папке')
      return
    }

    try {
      await addFolder(newFolderPath.trim())
      toast.success('Папка добавлена')
      setNewFolderPath('')
    } catch (error) {
      toast.error('Ошибка добавления папки')
    }
  }

  const handleSelectFolder = async () => {
    // Для Electron нужно использовать dialog
    const isElectron = typeof window !== 'undefined' && !!(window as any).api
    
    if (isElectron) {
      const api = (window as any).api
      const selectedPath = await api.selectFolderDialog()
      
      if (selectedPath) {
        setNewFolderPath(selectedPath)
        toast.success('Папка выбрана')
      }
    } else {
      toast.error('Выбор папок доступен только в Electron версии')
    }
  }

  const handleScanAll = async () => {
    await startScan()
    toast.success('Сканирование запущено')
  }

  return (
    <div className="space-y-6">
      {/* Статистика */}
      <Card id="local-music">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music2 className="w-5 h-5" />
            Локальная музыка
          </CardTitle>
          <CardDescription>
            Управление локальными папками с музыкой
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Папок</div>
              <div className="text-2xl font-bold">{folders.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Треков</div>
              <div className="text-2xl font-bold">{tracks.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Добавление папки */}
      <Card>
        <CardHeader>
          <CardTitle>Добавить папку</CardTitle>
          <CardDescription>
            Добавьте папку с музыкой для сканирования
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Путь к папке (например, C:\Music)"
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
            />
            <Button onClick={handleSelectFolder} variant="outline">
              Выбрать
            </Button>
          </div>
          <Button onClick={handleAddFolder} className="w-full">
            <FolderPlus className="w-4 h-4 mr-2" />
            Добавить папку
          </Button>
        </CardContent>
      </Card>

      {/* Список папок */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Папки с музыкой</CardTitle>
            <Button onClick={handleScanAll} disabled={isScanning || folders.length === 0}>
              <Scan className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
              {isScanning ? 'Сканирование...' : 'Сканировать все'}
            </Button>
          </div>
          {isScanning && (
            <CardDescription>
              Прогресс: {scanProgress}%
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {folders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Нет добавленных папок</p>
            </div>
          ) : (
            <div className="space-y-4">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{folder.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {folder.path}
                    </div>
                    {folder.lastScannedAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Отсканировано: {new Date(folder.lastScannedAt).toLocaleString()}
                        {folder.trackCount !== undefined && ` (${folder.trackCount} треков)`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFolder(folder.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Настройки сканирования */}
      <Card>
        <CardHeader>
          <CardTitle>Настройки сканирования</CardTitle>
          <CardDescription>
            Настройте параметры сканирования папок
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Автосканирование</div>
              <div className="text-sm text-muted-foreground">
                Автоматически сканировать папки каждые {scanSettings.scanInterval} мин
              </div>
            </div>
            <Switch
              checked={scanSettings.autoScan}
              onCheckedChange={(checked) => updateScanSettings({ autoScan: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Следить за изменениями</div>
              <div className="text-sm text-muted-foreground">
                Автоматически обновлять при изменении файлов
              </div>
            </div>
            <Switch
              checked={scanSettings.watchForChanges}
              onCheckedChange={(checked) => updateScanSettings({ watchForChanges: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Включая подпапки</div>
              <div className="text-sm text-muted-foreground">
                Сканировать подпапки рекурсивно
              </div>
            </div>
            <Switch
              checked={scanSettings.includeSubfolders}
              onCheckedChange={(checked) => updateScanSettings({ includeSubfolders: checked })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
