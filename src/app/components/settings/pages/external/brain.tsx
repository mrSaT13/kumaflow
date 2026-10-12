/**
 * KumaFlow 1.6.2 — Настройки Мозга (Brain)
 * Тумблер + URL + Bearer-токен. По умолчанию ВЫКЛ.
 */

import { useEffect, useState } from 'react'
import { useBrainStore } from '@/store/brain.store'
import { brainGet } from '@/service/brain-client'
import { buildTasteSyncPayload, ensureBrainUserId, resolveNavidromeUsername, syncFromMobile } from '@/service/brain-sync'
import {
  brainDeviceId,
  brainDeviceLabel,
  brainDeviceRename,
  brainDevices,
  type BrainDevice,
} from '@/service/brain-wave'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Badge } from '@/app/components/ui/badge'
import { toast } from 'react-toastify'

export function BrainSettings() {
  const { enabled, baseUrl, token, userId, lastSyncAt, lastPublishAt, lastPublishOk, lastPublishError, autoSync, setEnabled, setBaseUrl, setToken, setAutoSync } = useBrainStore()
  const [urlInput, setUrlInput] = useState(baseUrl)
  const [tokenInput, setTokenInput] = useState(token)
  const [checking, setChecking] = useState(false)
  const [deviceLabel, setDeviceLabel] = useState('')
  const [savingDevice, setSavingDevice] = useState(false)
  const [devices, setDevices] = useState<BrainDevice[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)

  // Имя устройства подтягиваем с сервера (там своё имя), показываем в поле
  const loadDevices = async () => {
    setLoadingDevices(true)
    try {
      const list = await brainDevices()
      setDevices(list)
      const me = list.find((d) => d.device_id === brainDeviceId())
      if (me?.display_name) setDeviceLabel(me.display_name)
    } finally {
      setLoadingDevices(false)
    }
  }

  useEffect(() => {
    if (enabled) void loadDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId])

  const handleRenameDevice = async () => {
    setSavingDevice(true)
    try {
      const ok = await brainDeviceRename(deviceLabel)
      if (ok) {
        toast('Имя устройства сохранено в мозге', { type: 'success' })
        void loadDevices()
      } else {
        toast('Мозг не принял имя (проверь токен)', { type: 'error' })
      }
    } finally {
      setSavingDevice(false)
    }
  }

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

        {/* Это устройство: слот в мозге + своё имя (видно в «Продолжить с …») */}
        <div className="space-y-2 border-t pt-4">
          <Label>Это устройство</Label>
          <div className="flex gap-2">
            <Input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder={brainDeviceLabel()}
              disabled={!enabled}
            />
            <Button variant="outline" onClick={handleRenameDevice} disabled={!enabled || savingDevice}>
              {savingDevice ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            id слота: <code className="font-mono">{brainDeviceId()}</code> · телефон и этот ПК больше не затирают друг друга
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label className="text-xs text-muted-foreground">Устройства мозга (для «Продолжить с …»)</Label>
            <Button variant="ghost" size="sm" onClick={loadDevices} disabled={!enabled || loadingDevices}>
              {loadingDevices ? 'Обновляем…' : 'Обновить'}
            </Button>
          </div>
          {devices.length === 0 ? (
            <p className="text-xs text-muted-foreground">— пусто: мозг не видит ни одного живого плеера</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {devices.map((d) => (
                <li key={d.device_id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{d.display_name}</span>
                    {d.device_id === brainDeviceId() && <Badge variant="secondary">этот ПК</Badge>}
                    {d.now_playing?.title && (
                      <span className="text-muted-foreground truncate">
                        {d.now_playing.artist_name ? `${d.now_playing.artist_name} — ` : ''}
                        {d.now_playing.title}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {d.age_sec != null ? `${Math.floor(d.age_sec / 60)} мин назад` : 'молчит'} · {d.queue_len} треков
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
