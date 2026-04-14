/**
 * Управление аккаунтами Shared Listens
 *
 * Добавление/удаление/тестирование аккаунтов Navidrome друзей
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import { Badge } from '@/app/components/ui/badge'
import { Trash2, Plus, TestTube2, Users, ShieldAlert } from 'lucide-react'
import {
  saveSharedAccounts,
  loadSharedAccounts,
  getCachedSharedListens,
  SharedAccount,
} from '@/service/shared-listens'
import CryptoJS from 'crypto-js'

export function SharedListensSettings() {
  const { t } = useTranslation()
  const [accounts, setAccounts] = useState<SharedAccount[]>([])
  const [newAccount, setNewAccount] = useState<Partial<SharedAccount>>({
    name: '',
    url: '',
    username: '',
    password: '',
  })
  const [testingId, setTestingId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Загрузка аккаунтов
  useEffect(() => {
    const saved = loadSharedAccounts()
    if (saved.length > 0) {
      setAccounts(saved)
    }
  }, [])

  // Сохранение аккаунтов
  const handleSave = () => {
    saveSharedAccounts(accounts)
    toast.success('✅ Аккаунты сохранены')
  }

  // Добавление аккаунта
  const handleAdd = () => {
    if (!newAccount.name || !newAccount.url || !newAccount.username) {
      toast.error('Заполните обязательные поля')
      return
    }

    const account: SharedAccount = {
      id: `acc_${Date.now()}`,
      name: newAccount.name,
      url: newAccount.url,
      username: newAccount.username,
      password: newAccount.password || '',
      enabled: true,
    }

    setAccounts([...accounts, account])
    setNewAccount({ name: '', url: '', username: '', password: '' })
    toast.success('✅ Аккаунт добавлен')
  }

  // Удаление аккаунта
  const handleDelete = (id: string) => {
    setAccounts(accounts.filter(a => a.id !== id))
    toast.info('🗑 Аккаунт удалён')
  }

  // Переключение enabled
  const handleToggle = (id: string, enabled: boolean) => {
    setAccounts(accounts.map(a =>
      a.id === id ? { ...a, enabled } : a
    ))
  }

  // Тест подключения
  const handleTest = async (account: SharedAccount) => {
    setTestingId(account.id)

    try {
      const salt = Date.now().toString()
      const token = CryptoJS.MD5(account.password + salt).toString()

      const params = new URLSearchParams({
        u: account.username,
        t: token,
        s: salt,
        v: '1.16.1',
        c: 'KumaFlow',
        f: 'json',
      })

      const response = await fetch(`${account.url}/rest/getStarred2?${params}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      const starred = data['subsonic-response']?.starred2?.song || []
      const uniqueArtists = new Set(starred.map((s: any) => s.artistId || s.artist)).size

      toast.success(`✅ ${account.name} подключён`)
      toast.info(`📊 Найдено: ${starred.length} треков, ${uniqueArtists} артистов`)
    } catch (error) {
      toast.error(`❌ ${account.name} ошибка: ${(error as Error).message}`)
    } finally {
      setTestingId(null)
    }
  }

  // Генерация плейлиста
  const handleGenerate = async () => {
    const enabledAccounts = accounts.filter(a => a.enabled)

    if (enabledAccounts.length === 0) {
      toast.error('Включите хотя бы один аккаунт')
      return
    }

    setIsGenerating(true)
    try {
      toast.info(`🎵 Генерация плейлиста из ${enabledAccounts.length} аккаунтов...`)

      const result = await getCachedSharedListens(enabledAccounts, 30, true)

      if (result.tracks.length === 0) {
        toast.warning('⚠️ Треки не найдены')
        return
      }

      window.dispatchEvent(new CustomEvent('shared-listens-ready', {
        detail: {
          songs: result.tracks.map(t => t.song),
          playlistId: result.playlistId,
        }
      }))

      toast.success(`✅ Сгенерировано: ${result.tracks.length} треков от ${result.accountsCount} аккаунтов`)

      if (result.playlistId) {
        setTimeout(() => {
          window.location.hash = `/library/playlists/saved/shared-listens/${result.playlistId}`
        }, 1000)
      }
    } catch (error) {
      console.error('[SharedListens] Generation error:', error)
      toast.error('Ошибка генерации')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          🌍 Что слушают другие
        </CardTitle>
        <CardDescription>
          Добавьте аккаунты друзей для генерации общего плейлиста
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ⚠️ Предупреждение безопасности */}
        <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
          <div className="flex gap-3">
            <ShieldAlert className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-yellow-500">⚠️ Внимание: безопасность</h4>
              <p className="text-xs text-yellow-500/90 mt-1">
                Добавляйте только аккаунты <strong>доверенных лиц</strong>. Вы передаёте логин и пароль от сервера —
                злоумышленник может получить доступ к вашей библиотеке. Никогда не добавляйте незнакомые аккаунты!
              </p>
            </div>
          </div>
        </div>

        {/* Список аккаунтов */}
        {accounts.length > 0 && (
          <div className="space-y-2">
            <Label>Аккаунты ({accounts.length}):</Label>
            {accounts.map(account => (
              <div
                key={account.id}
                className="flex items-center gap-3 p-3 bg-muted rounded-md"
              >
                <Switch
                  checked={account.enabled}
                  onCheckedChange={(e) => handleToggle(account.id, e)}
                />

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{account.name}</span>
                    {!account.enabled && (
                      <Badge variant="secondary">Отключён</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {account.url} • {account.username}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTest(account)}
                  disabled={testingId === account.id}
                >
                  {testingId === account.id ? '⏳' : <TestTube2 className="h-4 w-4" />}
                </Button>

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDelete(account.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Добавление нового */}
        <div className="space-y-3 pt-4 border-t">
          <Label>Добавить аккаунт:</Label>
          <div className="grid grid-cols-1 gap-2">
            <Input
              placeholder="Имя (например, друг Алекс)"
              value={newAccount.name || ''}
              onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
            />
            <Input
              placeholder="URL (https://navidrome.example.com)"
              value={newAccount.url || ''}
              onChange={(e) => setNewAccount({ ...newAccount, url: e.target.value })}
            />
            <Input
              placeholder="Логин"
              value={newAccount.username || ''}
              onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })}
            />
            <Input
              type="password"
              placeholder="Пароль"
              value={newAccount.password || ''}
              onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
            />
          </div>
          <Button onClick={handleAdd} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Добавить аккаунт
          </Button>
        </div>

        {/* Кнопки управления */}
        <div className="flex gap-2 flex-wrap pt-4 border-t">
          <Button onClick={handleSave} className="flex-1" variant="outline">
            💾 Сохранить аккаунты
          </Button>

          <Button
            onClick={handleGenerate}
            className="flex-1"
            disabled={accounts.filter(a => a.enabled).length === 0 || isGenerating}
          >
            {isGenerating ? '⏳ Генерация...' : '🎵 Сгенерировать плейлист'}
          </Button>
        </div>

        {/* Информация */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>📊 Анализирует лайкнутые треки всех аккаунтов</p>
          <p>🎭 50% основной жанр + 30% похожие + 20% другие</p>
          <p>🔀 Максимум 2 трека на артиста</p>
          <p>⏱️ Кэш на 30 минут</p>
        </div>
      </CardContent>
    </Card>
  )
}
