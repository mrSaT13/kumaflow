/**
 * KumaFlow 1.6.2 — Настройки Мозга (Brain)
 * Тумблер + URL + Bearer-токен. По умолчанию ВЫКЛ.
 */

import { useState } from 'react'
import { useBrainStore } from '@/store/brain.store'
import { brainGet } from '@/service/brain-client'
import { buildTasteSyncPayload, ensureBrainUserId, resolveNavidromeUsername, syncFromMobile } from '@/service/brain-sync'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { toast } from 'react-toastify'

export function BrainSettings() {
  const { enabled, baseUrl, token, userId, lastSyncAt, lastPublishAt, lastPublishOk, lastPublishError, autoSync, setEnabled, setBaseUrl, setToken, setAutoSync } = useBrainStore()
  const [urlInput, setUrlInput] = useState(baseUrl)
  const [tokenInput, setTokenInput] = useState(token)
  const [checking, setChecking] = useState(false)

  const handleSave = () => {
    setBaseUrl(urlInput.replace(/\/$/, ''))
    setToken(tokenInput.trim())
    toast('Мозг: URL и токен сохранены', { type: 'success' })
  }

  const handleCheck = async () => {
    setChecking(true)
    try {
      const h = await brainGet<{ status: string }>('/api/health')
      if (h && (h as { status?: string }).status === 'ok') toast('Мозг на связи', { type: 'success' })
      else toast('Мозг не отвечает', { type: 'error' })
    } finally {
      setChecking(false)
    }
  }

  const handleSync = async () => {
    try {
      // Логин Navidrome живёт в accounts.store (мультиаккаунты) → app.store → auth.store.
      // Фолбека-выдумки больше нет: без логина синхру не стартуем.
      const username = resolveNavidromeUsername()
      if (!username) {
        toast('Нет логина Navidrome — сначала подключи сервер', { type: 'error' })
        return
      }
      const uid = await ensureBrainUserId(username, username)
      if (!uid) {
        toast('Не удалось получить user_id мозга', { type: 'error' })
        return
      }
      const { ratings, profile } = buildTasteSyncPayload()
      const res = await syncFromMobile(ratings, profile, [])
      if (!res) {
        // null = сеть/401/403 (токен без скоупа sync или чужой user_id) либо мозг выкл.
        // Раньше это молча показывалось как «fav+0» — теперь честная ошибка.
        toast('Синк не дошёл до мозга: проверь Bearer-токен (нужен скоуп sync), user_id и консоль (F12)', { type: 'error' })
        return
      }
      if (res.ok === false) {
        toast(`Мозг отклонил синк: ${res.error ?? 'unknown'}`, { type: 'error' })
        return
      }
      toast(`Синхронизация: fav+${res.fav_added ?? 0}`, { type: 'success' })
    } catch {
      toast('Ошибка синхронизации', { type: 'error' })
    }
  }

  return (
    <Card className="w-full glass-card">
      <CardHeader>
        <CardTitle>Мозг «Моя волна»</CardTitle>
        <CardDescription>
          Внешний Brain (FastAPI :8000). Тумблер + URL + Bearer-токен (BRAIN_API_TOKEN). Выкл — всё локально.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Включено</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Автосинк вкусов (фон, каждые 30 мин)</Label>
          <Switch checked={autoSync !== false} onCheckedChange={setAutoSync} disabled={!enabled} />
        </div>
        <div className="space-y-2">
          <Label>URL мозга (http://192.168.1.10:8000)</Label>
          <Input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="http://192.168.1.10:8000" disabled={!enabled} />
        </div>
        <div className="space-y-2">
          <Label>Bearer-токен</Label>
          <Input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="hex из BRAIN_API_TOKEN" disabled={!enabled} />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!enabled}>Сохранить</Button>
          <Button variant="outline" onClick={handleCheck} disabled={!enabled || checking}>Проверить</Button>
          <Button variant="outline" onClick={handleSync} disabled={!enabled}>Синхронизировать сейчас</Button>
        </div>
        <div className="text-xs text-muted-foreground">
          user_id: {userId ?? '—'} · последняя синхра: {lastSyncAt ?? '—'}
        </div>
        <div className="text-xs text-muted-foreground">
          живая очередь: {lastPublishAt ? `${lastPublishOk ? '✅' : '❌'} ${lastPublishAt}` : '—'}
          {lastPublishError ? ` · ${lastPublishError}` : ''}
        </div>
      </CardContent>
    </Card>
  )
}
