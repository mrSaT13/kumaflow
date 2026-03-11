/**
 * UserAvatar - Аватар пользователя в хедере
 * 
 * Отображает:
 * - Загруженный аватар (круг)
 * - Или стандартную иконку пользователя
 * - Клик → меню с информацией об аккаунте и настройками
 */

import { CircleUserRound, Info, Keyboard, LogOut, Settings, Users, Plus, Loader2, Upload, X } from 'lucide-react'
import React, { useState } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { AboutDialog } from '@/app/components/about/dialog'
import { ShortcutsDialog } from '@/app/components/shortcuts/dialog'
import { useAvatar, useAvatarActions } from '@/store/avatar.store'
import { useAppData, useAppStore } from '@/store/app.store'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { useAccounts, useAccountsActions, useCurrentAccount } from '@/store/accounts.store'
import { useAppSettings } from '@/store/app.store'
import { isMacOS } from '@/utils/desktop'

interface UserAvatarProps {
  size?: number
  className?: string
}

export function UserAvatar({ size = 32, className }: UserAvatarProps) {
  const settings = useAvatar()
  const { username, url, lockUser } = useAppData()
  const setLogoutDialogState = useAppStore(
    (state) => state.actions.setLogoutDialogState,
  )
  const { setCurrentPage, setOpenDialog } = useAppSettings()
  const [open, setOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [addAccountOpen, setAddAccountOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  
  // Форма добавления аккаунта
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountUrl, setNewAccountUrl] = useState('')
  const [newAccountUsername, setNewAccountUsername] = useState('')
  const [newAccountPassword, setNewAccountPassword] = useState('')
  const [newAccountAvatar, setNewAccountAvatar] = useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  const currentImage = settings.avatarData
  const accounts = useAccounts()
  const currentAccount = useCurrentAccount()
  const { addAccount, switchAccount } = useAccountsActions()
  const avatarActions = useAvatarActions()
  
  const alignPosition = isMacOS ? 'end' : 'center'
  
  // Обработка загрузки аватарки
  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение (PNG, JPG, GIF)')
      return
    }
    
    if (file.size > 5 * 1024 * 1024) {
      alert('Размер файла не должен превышать 5MB')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (e) => {
      setNewAccountAvatar(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }
  
  // Обработка добавления аккаунта
  const handleAddAccount = async () => {
    if (!newAccountUrl || !newAccountUsername || !newAccountPassword) return
    
    setIsAdding(true)
    
    try {
      const account = addAccount({
        name: newAccountName || `${newAccountUsername}@${newAccountUrl}`,
        serverUrl: newAccountUrl,
        username: newAccountUsername,
        password: newAccountPassword,
        avatarData: newAccountAvatar || undefined,
      })
      
      // Переключаемся на новый аккаунт
      if (account) {
        console.log('[UserAvatar] Switching to new account:', account.id)
        switchAccount(account.id)
      }
      
      // Закрываем диалог и очищаем форму
      setAddAccountOpen(false)
      setNewAccountName('')
      setNewAccountUrl('')
      setNewAccountUsername('')
      setNewAccountPassword('')
      setNewAccountAvatar(null)
    } catch (error) {
      console.error('[UserAvatar] Failed to add account:', error)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Fragment>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      
      {/* Диалог добавления аккаунта */}
      <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Добавить аккаунт</DialogTitle>
            <DialogDescription>
              Добавьте новый сервер для переключения между аккаунтами
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Аватарка */}
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20 flex items-center justify-center"
                style={{
                  background: newAccountAvatar ? `url(${newAccountAvatar}) center / cover` : undefined
                }}
              >
                {!newAccountAvatar && (
                  <CircleUserRound className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {newAccountAvatar ? 'Заменить' : 'Загрузить'}
                </Button>
                {newAccountAvatar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewAccountAvatar(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="account-name">Название (опционально)</Label>
              <Input
                id="account-name"
                placeholder="Домашний сервер"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-url">URL сервера</Label>
              <Input
                id="account-url"
                placeholder="https://navidrome.local"
                value={newAccountUrl}
                onChange={(e) => setNewAccountUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-username">Имя пользователя</Label>
              <Input
                id="account-username"
                placeholder="admin"
                value={newAccountUsername}
                onChange={(e) => setNewAccountUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account-password">Пароль</Label>
              <Input
                id="account-password"
                type="password"
                placeholder="••••••••"
                value={newAccountPassword}
                onChange={(e) => setNewAccountPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddAccountOpen(false)}
              disabled={isAdding}
            >
              Отмена
            </Button>
            <Button
              onClick={handleAddAccount}
              disabled={isAdding || !newAccountUrl || !newAccountUsername || !newAccountPassword}
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Добавление...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Добавить
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Аккаунт"
            className={cn(
              'rounded-full overflow-hidden flex items-center justify-center',
              'border-2 border-primary/20',
              'hover:border-primary transition-colors',
              'cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-primary/50',
              'z-50',
              className
            )}
            style={{ 
              width: `${size}px`, 
              height: `${size}px`,
              background: currentImage ? `url(${currentImage})` : undefined,
              backgroundPosition: currentImage ? `${settings.cropX}% ${settings.cropY}%` : 'center',
              backgroundSize: currentImage ? `${settings.scale * 100}%` : 'cover',
            }}
          >
            {!currentImage && (
              <CircleUserRound className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={alignPosition} className="min-w-64 z-50" sideOffset={8}>
          {/* Информация об аккаунте */}
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-2">
              <div
                className="rounded-full overflow-hidden flex-shrink-0"
                style={{ 
                  width: `${size}px`, 
                  height: `${size}px`,
                  background: currentImage ? `url(${currentImage})` : undefined,
                  backgroundPosition: currentImage ? `${settings.cropX}% ${settings.cropY}%` : 'center',
                  backgroundSize: currentImage ? `${settings.scale * 100}%` : 'cover',
                }}
              >
                {!currentImage && (
                  <CircleUserRound className="w-full h-full text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{username}</p>
                <p className="text-xs leading-none text-muted-foreground truncate max-w-[200px]">
                  {url}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {/* Переключение аккаунта */}
          {accounts.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Аккаунты ({accounts.length})
              </DropdownMenuLabel>
              {accounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  onClick={() => switchAccount(account.id)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    {/* Аватарка аккаунта */}
                    <div
                      className="w-6 h-6 rounded-full overflow-hidden border border-primary/20 flex items-center justify-center"
                      style={{
                        background: account.avatarData ? `url(${account.avatarData}) center / cover` : undefined
                      }}
                    >
                      {!account.avatarData && (
                        <CircleUserRound className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <span className="truncate">{account.name || account.username}</span>
                  </div>
                  {account.isActive && (
                    <span className="text-xs text-green-500">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          
          {/* Добавить аккаунт - всегда показываем! */}
          <DropdownMenuItem onClick={() => { setAddAccountOpen(true); setOpen(false); }}>
            <Plus className="mr-2 h-4 w-4" />
            <span>Добавить аккаунт</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          
          {/* Настройки аккаунта */}
          <DropdownMenuItem onClick={() => { 
            setCurrentPage('account')
            setOpenDialog(true)
            setOpen(false)
          }}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Настройки аккаунта</span>
          </DropdownMenuItem>
          
          {/* Горячие клавиши */}
          <DropdownMenuItem onClick={() => { setShortcutsOpen(true); setOpen(false); }}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Горячие клавиши</span>
          </DropdownMenuItem>
          
          {/* О программе */}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { setAboutOpen(true); setOpen(false); }}>
            <Info className="mr-2 h-4 w-4" />
            <span>О программе</span>
          </DropdownMenuItem>
          
          {/* Выход */}
          {!lockUser && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setLogoutDialogState(true); setOpen(false); }}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Выйти</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Fragment>
  )
}
