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
import { Copy, Check, Smartphone, Plus, Globe, Settings2, Monitor, Lock, X } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import { useAccountsStore } from '@/store/accounts.store'

/** Реальные данные подключения: приоритет — текущий аккаунт, запас — app.store */
function getServerCredentials(manualPassword: string): { url?: string; username?: string; password?: string; authType: 'token' | 'password' } {
  const acct = useAccountsStore.getState().getCurrentAccount()
  const appState = useAppStore.getState().data
  const passwordToUse = manualPassword || acct?.password || appState?.password
  let authTypeToUse: 'token' | 'password' = manualPassword ? 'password' : (appState?.authType || 'password')
  // MD5-хэш (32 hex) — это token-авторизация
  if (passwordToUse && passwordToUse.length === 32 && /^[0-9a-f]+$/i.test(passwordToUse)) {
    authTypeToUse = 'token'
  }
  return {
    url: acct?.serverUrl || appState?.url,
    username: acct?.username || appState?.username,
    password: passwordToUse,
    authType: authTypeToUse,
  }
}

interface RemoteStatus {
  enabled: boolean
  port: number
  hasPin?: boolean
  clientCount: number
  clients: { ip: string; userAgent: string; connectedAt: number }[]
}

interface NetworkIp {
  ip: string
  iface: string
  internal?: boolean
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
  const [pin, setPin] = useState('')
  const [hasPin, setHasPin] = useState(false)
  const [, setAllUrls] = useState<{ ip: string; iface: string; url: string }[]>([])

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

      try {
        const pinSet = await (window.api.remoteControl as any).hasPin?.()
        setHasPin(!!pinSet)
      } catch { /* старый preload без PIN */ }

      // Сначала грузим сохранённые настройки, чтобы не сбрасывать выбор VPN-адреса
      let savedIp: string | undefined
      try {
        const saved = await window.api.remoteControl.loadSettings()
        savedIp = saved?.ip
        if (saved?.port) {
          setPort(saved.port)
          setCustomPort(String(saved.port))
        }
        if (typeof saved?.hasPin === 'boolean') setHasPin(saved.hasPin)
      } catch { /* ignore */ }

      const portResult = await window.api.remoteControl.getPort()
      const urlResult = await window.api.remoteControl.getUrl()

      setPort(portResult || 4333)
      setCustomPort(String(portResult || 4333))
      setConnectionUrl(urlResult)

      try {
        const urls = await (window.api.remoteControl as any).getAllUrls?.()
        if (urls) setAllUrls(urls)
      } catch { /* ignore */ }

      // Пробуем получить все IP (может быть недоступно без перезапуска Electron)
      let wantIp = ''
      try {
        const ipsResult = await window.api.remoteControl.getAllIps()
        setAvailableIps(ipsResult || [])
        if (ipsResult && ipsResult.length > 0) {
          // Не затираем сохранённый VPN-адрес первым в списке
          const want = savedIp && ipsResult.some((x: NetworkIp) => x.ip === savedIp)
            ? savedIp
            : (ipsResult.find((x: NetworkIp) => !x.internal)?.ip || ipsResult[0].ip)
          wantIp = want
          setSelectedIp(want)
          // Если URL ещё пустой/с localhost — пересоберём под выбранный IP
          if (!urlResult || urlResult.includes('localhost') || urlResult.includes('127.0.0.1')) {
            try {
              if (savedIp && (window.api.remoteControl as any).setIp) {
                await (window.api.remoteControl as any).setIp(savedIp)
                const u2 = await window.api.remoteControl.getUrl()
                setConnectionUrl(u2)
              }
            } catch { /* ignore */ }
          }
        }
      } catch (ipError) {
        console.warn('[Remote] getAllIps not available (требуется перезапуск Electron):', ipError)
        // Fallback: используем localhost
        setAvailableIps([])
        setSelectedIp('localhost')
      }

      // Синхронизируем статус с реальным сервером:
      // - запущен → показываем QR/URL сразу (а не только после тумблера);
      // - тумблер включён, а сервер стоит (перезапуск плеера) → поднимаем тихо.
      try {
        const st = await window.api.remoteControl.getStatus()
        if (st?.enabled) {
          setStatus(st)
        } else if (useAppStore.getState().remoteControl?.enabled) {
          console.log('[Remote] Сервер остановлен, а тумблер включён — автозапуск...')
          const ok = await prepareAndStart(true, wantIp || savedIp)
          if (!ok) {
            // Поднять не вышло (нет пароля/сервера) — честно гасим тумблер
            setRemoteEnabled(false)
            toast.warn('Remote Control не запустился: проверь пароль и сервер', { autoClose: 5000 })
          }
        }
      } catch { /* ignore */ }

      // Устанавливаем Subsonic URL при загрузке (реальные данные — из аккаунта!)
      const { url: srvUrl0, username: srvUser0, password: passwordToUse0, authType: authTypeToUse0 } = getServerCredentials(subsonicPassword)

      if (srvUrl0 && srvUser0 && passwordToUse0) {
        try {
          await window.api.remoteControl.setSubsonicUrl(srvUrl0, srvUser0, passwordToUse0, authTypeToUse0)
          console.log('[Remote] Subsonic URL set on load with auth:', authTypeToUse0)
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

  // Общая процедура запуска: порт + IP + Subsonic + start + обновление URL.
  // quiet=true — тихий режим для автозапуска при открытии настроек (без лишних тостов).
  const prepareAndStart = async (quiet: boolean, ipOverride?: string): Promise<boolean> => {
    const portNum = parseInt(customPort) || 4333
    try {
      await window.api.remoteControl.setPort(portNum)
    } catch { /* уже запущен — просто продолжаем */ }

    // Устанавливаем IP (если доступно)
    const ipToUse = ipOverride || selectedIp || manualIp
    if (ipToUse && window.api.remoteControl.setIp) {
      try {
        await window.api.remoteControl.setIp(ipToUse)
      } catch { /* ignore */ }
    }

    // Subsonic credentials — РУЧНОЙ пароль, пароль аккаунта или сохранённый ранее.
    // Реальный пароль живёт в accounts.store (в app.store — заглушка)!
    const { url: srvUrl, username: srvUser, password: passwordToUse, authType: credAuthType } = getServerCredentials(subsonicPassword)
    let savedCreds = hasSavedPassword
    try {
      savedCreds = await window.api.remoteControl.hasSavedCredentials()
      setHasSavedPassword(savedCreds)
    } catch { /* ignore */ }

    if (!passwordToUse && !savedCreds) {
      if (!quiet) toast.warn('Введите пароль Subsonic в поле выше!', { autoClose: 5000 })
      return false
    }

    if (srvUrl && srvUser && passwordToUse) {
      try {
        await window.api.remoteControl.setSubsonicUrl(srvUrl, srvUser, passwordToUse, credAuthType)
      } catch (urlError) {
        console.warn('[Remote] setSubsonicUrl error:', urlError)
      }
    } else if (!savedCreds) {
      if (!quiet) toast.warn('Не настроен сервер! Проверь настройки аккаунта.', { autoClose: 5000 })
      return false
    }
    // Если есть сохранённые credentials, а аккаунт не заполнен — сервер сам подхватит их из файла.

    try {
      const result = await window.api.remoteControl.start()
      setStatus(result)
      try {
        const url = await window.api.remoteControl.getUrl()
        setConnectionUrl(url)
        const urls = await (window.api.remoteControl as any).getAllUrls?.()
        if (urls) setAllUrls(urls)
      } catch { /* ignore */ }
      return true
    } catch (error) {
      console.error('[Remote] Start error:', error)
      return false
    }
  }

  const handleToggle = async (checked: boolean) => {
    try {
      if (checked) {
        const ok = await prepareAndStart(false)
        if (!ok) return // Не включаем без пароля/сервера!
        setRemoteEnabled(true)

        toast.success(
          hasSavedPassword && !subsonicPassword
            ? `Remote Control включён (сохранённый пароль)`
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

  const handlePinSave = async () => {
    try {
      const api = window.api.remoteControl as any
      if (!api.setPin) {
        toast.error('Обновите приложение: PIN поддерживается с 1.7.0', { autoClose: 3000 })
        return
      }
      const clean = pin.trim()
      if (clean && !/^\d{4,12}$/.test(clean)) {
        toast.error('PIN: 4–12 цифр', { autoClose: 3000 })
        return
      }
      const ok = await api.setPin(clean)
      if (ok) {
        setHasPin(!!clean)
        setPin('')
        try {
          const u = await window.api.remoteControl.getUrl()
          setConnectionUrl(u)
          const urls = await api.getAllUrls?.()
          if (urls) setAllUrls(urls)
        } catch { /* ignore */ }
        toast.success(clean ? 'PIN установлен' : 'PIN снят', { autoClose: 2500 })
      } else {
        toast.error('Не удалось сохранить PIN', { autoClose: 3000 })
      }
    } catch (error) {
      console.error('[Remote] PIN save error:', error)
      toast.error('Ошибка сохранения PIN', { autoClose: 3000 })
    }
  }

  const handlePinClear = async () => {
    try {
      const api = window.api.remoteControl as any
      if (!api.setPin) {
        toast.error('Обновите приложение: PIN поддерживается с 1.7.0', { autoClose: 3000 })
        return
      }
      const ok = await api.setPin('')
      if (ok) {
        setHasPin(false)
        setPin('')
        try {
          const u = await window.api.remoteControl.getUrl()
          setConnectionUrl(u)
          const urls = await api.getAllUrls?.()
          if (urls) setAllUrls(urls)
        } catch { /* ignore */ }
        toast.success('PIN снят', { autoClose: 2500 })
      }
    } catch (error) {
      console.error('[Remote] PIN clear error:', error)
      toast.error('Ошибка снятия PIN', { autoClose: 3000 })
    }
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(connectionUrl)
    setCopied(true)
    toast.success('URL скопирован!', { autoClose: 2000 })
    setTimeout(() => setCopied(false), 2000)
  }

  const getInterfaceLabel = (iface: string, ip?: string, internal?: boolean) => {
    if (internal || ip === '127.0.0.1') return `LAN loopback (${iface})`
    const low = iface.toLowerCase()
    if (/tailscale/.test(low)) return `Tailscale (${iface})`
    if (/wireguard|^wg|wg-/.test(low)) return `WireGuard (${iface})`
    if (/zerotier/.test(low)) return `ZeroTier (${iface})`
    if (/tun|tap|vpn|ppp/.test(low)) return `VPN (${iface})`
    const labels: Record<string, string> = {
      'Ethernet': 'Ethernet',
      'Wi-Fi': 'Wi-Fi',
      'WLAN': 'Wi-Fi',
      'en0': 'Wi-Fi',
      'en1': 'Ethernet',
      'eth0': 'Ethernet',
      'wlan0': 'Wi-Fi',
    }
    return labels[iface] || `${iface}`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" /> Remote Control
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
                {availableIps.map(({ ip, iface, internal }) => (
                  <SelectItem key={`${iface}-${ip}`} value={ip}>
                    <div className="flex items-center gap-2">
                      <span>{getInterfaceLabel(iface, ip, internal)}</span>
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{ip}</code>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">Не найдены сетевые интерфейсы</p>
          )}
          <p className="text-xs text-muted-foreground">
            Сервер слушает на всех интерфейсах (LAN + VPN). Здесь выбирается только адрес для QR/ссылки. Для VPN выберите адрес Tailscale/WireGuard из списка или введите вручную.
          </p>

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
              <Button variant="ghost" size="sm" onClick={() => setShowManualInput(false)}><X className="w-4 h-4" /></Button>
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
            Пароль Subsonic
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
              ? "Пароль зашифрован и сохранён. Введи новый чтобы заменить."
              : "Нужен для загрузки обложек. Пароль шифруется и сохраняется."}
          </p>
        </div>

        <Separator />

        {/* PIN-код для страницы управления */}
        <div className="space-y-2">
          <Label htmlFor="remote-pin" className="flex items-center gap-2">
            PIN-код страницы
            {hasPin && (
              <Badge variant="outline" className="text-xs">
                <Lock className="w-3 h-3 mr-1" />
                Установлен
              </Badge>
            )}
          </Label>
          <div className="flex gap-2">
            <Input
              id="remote-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder={hasPin ? "Установлен — введи новый чтобы заменить" : "4–12 цифр; пусто — без защиты"}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handlePinSave()}
            />
            <Button variant="outline" size="sm" onClick={handlePinSave}>
              Сохранить
            </Button>
            {hasPin && (
              <Button variant="ghost" size="sm" onClick={handlePinClear}>
                Снять
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Этот PIN нужно будет ввести на странице Remote, иначе она не откроется. QR и ссылка включают PIN автоматически.
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
                  {status.hasPin && ' • PIN'}
                </div>
              </div>
              <Badge variant={status.clientCount > 0 ? 'default' : 'secondary'}>
                {status.clientCount > 0 ? 'Активно' : 'Ожидание'}
              </Badge>
            </div>

            {/* Список подключённых устройств */}
            {status.clients && status.clients.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Подключённые устройства:</div>
                <div className="space-y-1">
                  {status.clients.map((client: any, i: number) => {
                    const connectedTime = new Date(client.connectedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                    const deviceName = client.userAgent?.includes('Chrome') ? 'Chrome' :
                                      client.userAgent?.includes('Safari') ? 'Safari' :
                                      client.userAgent?.includes('Firefox') ? 'Firefox' :
                                      client.userAgent?.includes('Mobile') || client.userAgent?.includes('Android') || client.userAgent?.includes('iPhone') ? 'Мобильный' :
                                      'Компьютер'
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
