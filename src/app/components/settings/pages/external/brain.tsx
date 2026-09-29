/**
 * KumaFlow 1.6.2 — Настройки KumaFlow Brain
 * Тумблер + URL + Bearer-токен. По умолчанию ВЫКЛ.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Switch } from '@/app/components/ui/switch'
import { brainGet, brainRaw } from '@/service/brain-client'
import {
  buildTasteSyncPayload,
  ensureBrainUserId,
  resolveNavidromeUsername,
  syncFromMobile,
} from '@/service/brain-sync'
import { useBrainStore } from '@/store/brain.store'

export function BrainSettings() {
  const { t } = useTranslation()
  const {
    enabled,
    baseUrl,
    token,
    userId,
    lastSyncAt,
    lastPublishAt,
    lastPublishOk,
    lastPublishError,
    autoSync,
    setEnabled,
    setBaseUrl,
    setToken,
    setAutoSync,
  } = useBrainStore()
  const [urlInput, setUrlInput] = useState(baseUrl)
  const [tokenInput, setTokenInput] = useState(token)
  const [checking, setChecking] = useState(false)

  // Возраст последней публикации: старая ошибка (401 до фикса токена)
  // не должна выглядеть как текущая — publish идёт только при игре/очереди.
  const publishAge = (() => {
    if (!lastPublishAt) return null
    const ms = Date.now() - new Date(lastPublishAt).getTime()
    if (!Number.isFinite(ms) || ms < 0) return null
    const mins = Math.floor(ms / 60000)
    if (mins < 1) return 'только что'
    if (mins < 60) return `${mins} мин назад`
    return `${Math.floor(mins / 60)} ч назад`
  })()
  const publishStale =
    !!lastPublishAt &&
    !lastPublishOk &&
    Date.now() - new Date(lastPublishAt).getTime() > 10 * 60000

  const handleSave = () => {
    setBaseUrl(urlInput.replace(/\/$/, ''))
    // Защита от «Bearer xxx» в поле: плеер добавляет схему сам,
    // иначе заголовок станет «Bearer Bearer xxx» → 401 invalid brain token.
    setToken(tokenInput.trim().replace(/^bearer\s+/i, ''))
    toast(t('brain.toastSaved'), { type: 'success' })
  }

  const handleCheck = async () => {
    setChecking(true)
    try {
      // 1) связность: /health открыт всегда, токен не проверяет
      const h = await brainGet<{ status: string }>('/api/health')
      if (!h || (h as { status?: string }).status !== 'ok') {
        toast(t('brain.toastOffline'), { type: 'error' })
        return
      }
      // 2) токен: закрытый эндпоинт без параметров.
      // Раньше проверяли только /health — зелёный при битом токене.
      const probe = await brainRaw('/api/notifications/?limit=1', {
        method: 'GET',
      })
      if (!probe) {
        toast(t('brain.toastOffline'), { type: 'error' })
        return
      }
      if (probe.status >= 200 && probe.status < 300) {
        toast(
          t('brain.toastTokenOk', { defaultValue: 'Мозг онлайн, токен принят' }),
          { type: 'success' },
        )
      } else if (probe.status === 401 || probe.status === 403) {
        toast(
          t('brain.toastTokenBad', {
            defaultValue: `Токен отклонён (HTTP ${probe.status}): сверь Bearer-токен с сервером (Настройки → Токены или BRAIN_API_TOKEN), без слова Bearer`,
          }),
          { type: 'error' },
        )
      } else {
        toast(t('brain.toastOffline'), { type: 'error' })
      }
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
        toast(t('brain.toastNoLogin'), { type: 'error' })
        return
      }
      const uid = await ensureBrainUserId(username, username)
      if (!uid) {
        toast(t('brain.toastNoUserId'), { type: 'error' })
        return
      }
      const { ratings, profile } = buildTasteSyncPayload()
      const res = await syncFromMobile(ratings, profile, [])
      if (!res) {
        // null = сеть/401/403 (токен без скоупа sync или чужой user_id) либо мозг выкл.
        // Раньше это молча показывалось как «fav+0» — теперь честная ошибка.
        toast(t('brain.toastSyncBlocked'), { type: 'error' })
        return
      }
      if (res.ok === false) {
        toast(t('brain.toastSyncRejected', { error: res.error ?? 'unknown' }), {
          type: 'error',
        })
        return
      }
      toast(t('brain.toastSyncOk', { count: res.fav_added ?? 0 }), {
        type: 'success',
      })
    } catch {
      toast(t('brain.toastSyncError'), { type: 'error' })
    }
  }

  return (
    <Card className="w-full glass-card">
      <CardHeader>
        <CardTitle>{t('brain.settingsTitle')}</CardTitle>
        <CardDescription>{t('brain.settingsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>{t('brain.enabled')}</Label>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex items-center justify-between">
          <Label>{t('brain.autoSync')}</Label>
          <Switch
            checked={autoSync !== false}
            onCheckedChange={setAutoSync}
            disabled={!enabled}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('brain.urlLabel')}</Label>
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://192.168.1.10:8000"
            disabled={!enabled}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('brain.tokenLabel')}</Label>
          <Input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={t('brain.tokenPlaceholder')}
            disabled={!enabled}
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!enabled}>
            {t('brain.save')}
          </Button>
          <Button
            variant="outline"
            onClick={handleCheck}
            disabled={!enabled || checking}
          >
            {t('brain.check')}
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={!enabled}>
            {t('brain.syncNow')}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {t('brain.metaSync', {
            userId: userId ?? '—',
            lastSync: lastSyncAt ?? '—',
          })}
        </div>
        <div className="text-xs text-muted-foreground">
          {t('brain.metaQueue', {
            value: lastPublishAt
              ? `${lastPublishOk ? '✅' : '❌'} ${lastPublishAt}${publishAge ? ` (${publishAge})` : ''}`
              : '—',
          })}
          {lastPublishError ? ` · ${lastPublishError}` : ''}
          {publishStale ? (
            <span>
              {' '}
              {t('brain.metaQueueStale', {
                defaultValue: '— устарело, обновится при следующей публикации очереди',
              })}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
