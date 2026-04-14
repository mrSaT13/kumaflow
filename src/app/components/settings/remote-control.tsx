import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Switch } from '@/app/components/ui/switch'
import { Badge } from '@/app/components/ui/badge'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Separator } from '@/app/components/ui/separator'
import { toast } from 'react-toastify'
import { Wifi, Copy, Check, Smartphone, Plus, Globe, Settings2, Monitor, Lock } from 'lucide-react'
import { useAppStore } from '@/store/app.store'

interface RemoteStatus {
  enabled: boolean
  port: number
  clientCount: number
  clients: { ip: string; userAgent: string; connectedAt: number }[]
}

interface NetworkIp {
  ip: string
  iface: string
}

export function RemoteControlSettings() {
  const [port, setPort] = useState(4333)
  const [customPort, setCustomPort] = useState('4333')
  const [status, setStatus] = useState<RemoteStatus | null>(null)
  const [connectionUrl, setConnectionUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [subsonicPassword, setSubsonicPassword] = useState('')
  const [hasSavedPassword, setHasSavedPassword] = useState(false)
  const [availableIps, setAvailableIps] = useState<NetworkIp[]>([])
  const [selectedIp, setSelectedIp] = useState<string>('')
  const [manualIp, setManualIp] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)

  // Берём enabled из app.store вместо локального useState!
  const appStore = useAppStore()
  const enabled = appStore.remoteControl?.enabled || false
  const setRemoteEnabled = appStore.actions.setRemoteEnabled
  const setRemotePort = appStore.actions.setRemotePort

  // Синхронизируем локальное состояние при загрузке
  useEffect(() => {
    setPort(appStore.remoteControl?.port || 4333)
    setCustomPort(String(appStore.remoteControl?.port || 4333))
  }, [appStore.remoteControl?.port])

  useEffect(() => {
    loadStatus()

    // Обновляем список клиентов каждые 3 секунды
    const interval = setInterval(async () => {
      try {
        const clients = await window.api.remoteControl.getConnectedClients()
        if (clients && clients.length > 0) {
          setStatus(prev => prev ? { ...prev, clients } : null)
        }
      } catch (err) {
        // Ignore errors during polling
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      // Проверяем есть ли сохранённый пароль
      try {
        const hasCreds = await window.api.remoteControl.hasSavedCredentials()
        setHasSavedPassword(hasCreds)
      } catch {
        // API ещё не доступен
      }

      const portResult = await window.api.remoteControl.getPort()
      const urlResult = await window.api.remoteControl.getUrl()

      setPort(portResult || 4333)
      setCustomPort(String(portResult || 4333))
      setConnectionUrl(urlResult)

      // Пробуем получить все IP (может быть недоступно без перезапуска Electron)
      try {
        const ipsResult = await window.api.remoteControl.getAllIps()
        setAvailableIps(ipsResult || [])
        if (ipsResult && ipsResult.length > 0) {
          setSelectedIp(ipsResult[0].ip)
        }
      } catch (ipError) {
        console.warn('[Remote] getAllIps not available (требуется перезапуск Electron):', ipError)
        // Fallback: используем localhost
        setAvailableIps([])
        setSelectedIp('localhost')
      }

      // Устанавливаем Subsonic URL при загрузке
      const appState = useAppStore.getState().data
      let passwordToUse = subsonicPassword || appState?.password
      let authTypeToUse = subsonicPassword ? 'password' : (appState?.authType || 'password')

      // Если пароль выглядит как MD5 хэш (32 hex символа) — используем token auth
      if (passwordToUse && passwordToUse.length === 32 && /^[0-9a-f]+$/i.test(passwordToUse)) {
        authTypeToUse = 'token'
      }

      if (appState?.url && appState?.username && passwordToUse) {
        try {
          await window.api.remoteControl.setSubsonicUrl(
            appState.url,
            appState.username,
            passwordToUse,
            authTypeToUse
          )
          console.log('[Remote] Subsonic URL set on load with auth:', authTypeToUse)
        } catch (urlError) {
          console.warn('[Remote] setSubsonicUrl not available on load:', urlError)
        }
      } else {
        console.log('[Remote] No credentials on load')
      }
    } catch (error) {
      console.error('[Remote] Failed to load:', error)
    }
  }

  const handleIpChange = async (ip: string) => {
    setSelectedIp(ip)
    try {
      if (window.api.remoteControl.setIp) {
        await window.api.remoteControl.setIp(ip)
        // Обновляем URL из main process
        try {
          const url = await window.api.remoteControl.getUrl()
          setConnectionUrl(url)
        } catch {
          setConnectionUrl(`http://${ip}:${port}`)
        }
        toast.info(`IP изменён на ${ip}`, { autoClose: 2000 })
      }
    } catch (error) {
      console.error('[Remote] Failed to set IP:', error)
    }
  }

  const handleManualIpSubmit = async () => {
    if (!manualIp.trim()) return
    const ip = manualIp.trim()
    await handleIpChange(ip)
    setShowManualInput(false)
    setManualIp('')
    toast.success(`Установлен IP: ${ip}`, { autoClose: 2000 })
  }

  const handleToggle = async (checked: boolean) => {
    try {
      if (checked) {
        const portNum = parseInt(customPort) || 4333
        await window.api.remoteControl.setPort(portNum)

        // Устанавливаем IP (если доступно)
        const ipToUse = selectedIp || manualIp
        if (ipToUse && window.api.remoteControl.setIp) {
          await window.api.remoteControl.setIp(ipToUse)
        }

        // Subsonic credentials — используем РУЧНОЙ пароль или из аккаунта
        const appState = useAppStore.getState().data
        // Приоритет: 1) Ручной пароль 2) Пароль из аккаунта (saved credentials на сервере)
        const passwordToUse = subsonicPassword || appState?.password

        console.log('[Remote] Subsonic credentials:', {
          manualPasswordProvided: !!subsonicPassword,
          manualPasswordLength: subsonicPassword?.length || 0,
          appPasswordLength: appState?.password?.length || 0,
          hasSavedPassword,
          authType: appState?.authType,
        })

        if (!passwordToUse && !hasSavedPassword) {
          console.warn('[Remote] No password provided')
          toast.warn('⚠️ Введите пароль Subsonic в поле выше!', { autoClose: 5000 })
          return // Не включаем без пароля!
        }

        if (appState?.url && appState?.username) {
          try {
            // Если введён ручной пароль — используем password auth
            // Если из аккаунта и это token auth — пробуем token
            // Если сохранённый пароль — используем его authType
            const authTypeToUse = subsonicPassword ? 'password' : (appState?.authType || 'password')

            await window.api.remoteControl.setSubsonicUrl(
              appState.url,
              appState.username,
              passwordToUse,
              authTypeToUse
            )
            console.log('[Remote] Subsonic URL set with auth type:', authTypeToUse)
          } catch (urlError) {
            console.warn('[Remote] setSubsonicUrl error:', urlError)
          }
        } else {
          console.warn('[Remote] Missing server URL or username')
          toast.warn('⚠️ Не настроен сервер! Проверь настройки аккаунта.', { autoClose: 5000 })
          return
        }

        const result = await window.api.remoteControl.start()
        setStatus(result)

        // Получаем актуальный URL от main process
        try {
          const url = await window.api.remoteControl.getUrl()
          setConnectionUrl(url)
          console.log('[Remote] Connection URL after start:', url)
        } catch {
          const fallbackUrl = `http://${ipToUse || 'localhost'}:${portNum}`
          setConnectionUrl(fallbackUrl)
          console.warn('[Remote] Failed to get URL from main, using fallback:', fallbackUrl)
        }

        // ✅ ВАЖНО: Сохраняем enabled в app.store!
        setRemoteEnabled(true)

        toast.success(
          hasSavedPassword && !subsonicPassword
            ? `Remote Control включён (🔒 сохранённый пароль)`
            : `Remote Control включён`,
          { autoClose: 3000 }
        )
      } else {
        const result = await window.api.remoteControl.stop()
        setStatus(result)

        // ✅ Выключаем в app.store!
        setRemoteEnabled(false)

        toast.info('Remote Control выключен', { autoClose: 3000 })
      }
    } catch (error) {
      console.error('[Remote] Toggle error:', error)
      toast.error('Ошибка переключения', { autoClose: 3000 })
    }
  }

  const handlePortChange = async () => {
    try {
      const portNum = parseInt(customPort) || 4333
      const success = await window.api.remoteControl.setPort(portNum)
      if (success) {
        setPort(portNum)
        setRemotePort(portNum)
        toast.success(`Порт установлен: ${portNum}`, { autoClose: 2000 })
      } else {
        toast.error('Нельзя изменить порт пока сервер запущен', { autoClose: 3000 })
      }
    } catch (error) {
      console.error('[Remote] Port change error:', error)
      toast.error('Ошибка установки порта', { autoClose: 3000 })
    }
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(connectionUrl)
    setCopied(true)
    toast.success('URL скопирован!', { autoClose: 2000 })
    setTimeout(() => setCopied(false), 2000)
  }

  const getInterfaceLabel = (iface: string) => {
    const labels: Record<string, string> = {
      'Ethernet': '🔌 Ethernet',
      'Wi-Fi': '📶 Wi-Fi',
      'WLAN': '📶 Wi-Fi',
      'en0': '📶 Wi-Fi',
      'en1': '🔌 Ethernet',
      'eth0': '🔌 Ethernet',
      'wlan0': '📶 Wi-Fi',
    }
    return labels[iface] || `🌐 ${iface}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📱 Remote Control
        </CardTitle>
        <CardDescription>
          Управление плеером с телефона через WiFi
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Выбор IP адреса */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Адрес устройства</Label>
          </div>

          {availableIps.length > 0 ? (
            <Select value={selectedIp} onValueChange={handleIpChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите IP адрес..." />
              </SelectTrigger>
              <SelectContent>
                {availableIps.map(({ ip, iface }) => (
                  <SelectItem key={ip} value={ip}>
                    <div className="flex items-center gap-2">
                      <span>{getInterfaceLabel(iface)}</span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{ip}</code>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">Не найдены сетевые интерфейсы</p>
          )}

          {/* Ручной ввод IP */}
          {showManualInput ? (
            <div className="flex gap-2">
              <Input
                value={manualIp}
                onChange={(e) => setManualIp(e.target.value)}
                placeholder="Введите IP вручную..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleManualIpSubmit()}
              />
              <Button size="sm" onClick={handleManualIpSubmit}>OK</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowManualInput(false)}>✕</Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowManualInput(true)}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ввести IP вручную
            </Button>
          )}
        </div>

        <Separator />

        {/* Настройка порта */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Порт сервера</Label>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              value={customPort}
              onChange={(e) => setCustomPort(e.target.value)}
              className="w-24"
              disabled={enabled}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handlePortChange}
              disabled={enabled}
            >
              Применить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            По умолчанию: 4333. Изменение только когда сервер выключен.
          </p>
        </div>

        <Separator />

        {/* Пароль для Subsonic */}
        <div className="space-y-2">
          <Label htmlFor="subsonic-password" className="flex items-center gap-2">
            🔑 Пароль Subsonic
            {hasSavedPassword && !subsonicPassword && (
              <Badge variant="outline" className="text-xs">
                <Lock className="w-3 h-3 mr-1" />
                Сохранён
              </Badge>
            )}
          </Label>
          <Input
            id="subsonic-password"
            type="password"
            value={subsonicPassword}
            onChange={(e) => setSubsonicPassword(e.target.value)}
            placeholder={hasSavedPassword ? "Введён ранее (оставь пустым чтобы использовать сохранённый)" : "Введите пароль от сервера Navidrome"}
            disabled={enabled}
          />
          <p className="text-xs text-muted-foreground">
            {hasSavedPassword
              ? "🔒 Пароль зашифрован и сохранён. Введи новый чтобы заменить."
              : "Нужен для загрузки обложек. Пароль шифруется и сохраняется."}
          </p>
        </div>

        <Separator />

        {/* Включить/Выключить */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="font-medium flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Включить Remote Control
            </div>
            <div className="text-sm text-muted-foreground">
              Разрешить управление с мобильных устройств
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {/* Статус и QR */}
        {enabled && status && (
          <>
            <Separator />

            {/* Статус и подключённые клиенты */}
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {status.clientCount} подключено
                </div>
                <div className="text-xs text-muted-foreground">
                  Порт: {status.port}
                </div>
              </div>
              <Badge variant={status.clientCount > 0 ? 'default' : 'secondary'}>
                {status.clientCount > 0 ? 'Активно' : 'Ожидание'}
              </Badge>
            </div>

            {/* Список подключённых устройств */}
            {status.clients && status.clients.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">📱 Подключённые устройства:</div>
                <div className="space-y-1">
                  {status.clients.map((client: any, i: number) => {
                    const connectedTime = new Date(client.connectedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                    const deviceName = client.userAgent?.includes('Chrome') ? '🌐 Chrome' :
                                      client.userAgent?.includes('Safari') ? '🧭 Safari' :
                                      client.userAgent?.includes('Firefox') ? '🦊 Firefox' :
                                      client.userAgent?.includes('Mobile') || client.userAgent?.includes('Android') || client.userAgent?.includes('iPhone') ? '📱 Мобильный' :
                                      '💻 Компьютер'
                    return (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
                        <div className="flex items-center gap-2">
                          <span>{deviceName}</span>
                          <span className="text-muted-foreground">{client.ip?.replace('::ffff:', '')}</span>
                        </div>
                        <span className="text-muted-foreground">{connectedTime}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* URL для подключения */}
            <div className="space-y-2">
              <div className="text-sm font-medium">URL для подключения:</div>
              <div className="flex gap-2">
                <div className="flex-1 p-2.5 bg-background rounded border text-sm font-mono break-all">
                  {connectionUrl}
                </div>
                <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* QR код */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Или отсканируйте QR-код:</div>
              <div className="flex items-center justify-center p-4 bg-white rounded-lg border">
                {connectionUrl ? (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(connectionUrl)}`}
                    alt="QR Code"
                    className="w-[200px] h-[200px]"
                    onError={(e) => {
                      // Fallback: показываем ссылку если API недоступен
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent) {
                        parent.innerHTML = `<p class="text-xs text-center text-muted-foreground">QR: ${connectionUrl}</p>`
                      }
                    }}
                  />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center text-muted-foreground">
                    Загрузка...
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Откройте камеру телефона и наведите на QR-код
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
