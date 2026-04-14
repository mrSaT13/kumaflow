/**
 * UserAvatar - Аватар пользователя в хедере
 */

import { CircleUserRound, Info, Keyboard, LogOut, Settings, Upload, X, Loader2 } from 'lucide-react'
import React, { useState } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { AboutDialog } from '@/app/components/about/dialog'
import { ShortcutsDialog } from '@/app/components/shortcuts/dialog'
import { LogoutObserver } from '@/app/observers/logout-observer'
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
  const avatarActions = useAvatarActions()
  const [open, setOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [editAvatarOpen, setEditAvatarOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const [newAvatar, setNewAvatar] = useState<string | null>(settings.avatarData || null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  
  const alignPosition = isMacOS ? 'end' : 'center'
  
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
      setNewAvatar(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }
  
  const handleSaveAvatar = async () => {
    setIsSaving(true)
    
    try {
      if (newAvatar) {
        avatarActions.setAvatarData(newAvatar)
      } else {
        avatarActions.resetAvatar()
      }
      
      setEditAvatarOpen(false)
    } catch (error) {
      console.error('[UserAvatar] Failed to save avatar:', error)
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleOpenEditor = () => {
    setNewAvatar(settings.avatarData || null)
    setEditAvatarOpen(true)
  }

  return (
    <Fragment>
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      
      <Dialog open={editAvatarOpen} onOpenChange={setEditAvatarOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Аватар аккаунта</DialogTitle>
            <DialogDescription>
              Загрузите изображение профиля
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/20 flex items-center justify-center"
                style={{
                  background: newAvatar ? `url(${newAvatar}) center / cover` : undefined
                }}
              >
                {!newAvatar && (
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
                  {newAvatar ? 'Заменить' : 'Загрузить'}
                </Button>
                {newAvatar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setNewAvatar(null)}
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
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditAvatarOpen(false)}
              disabled={isSaving}
            >
              Отмена
            </Button>
            <Button
              onClick={handleSaveAvatar}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Сохранение...
                </>
              ) : (
                'Сохранить'
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
              background: settings.avatarData ? `url(${settings.avatarData}) center / cover` : undefined,
              backgroundPosition: `${settings.cropX}% ${settings.cropY}%`,
              backgroundSize: `${settings.scale * 100}%`,
            }}
          >
            {!settings.avatarData && (
              <CircleUserRound className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={alignPosition} className="min-w-64 z-50" sideOffset={8}>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{username}</p>
              <p className="text-xs leading-none text-muted-foreground truncate max-w-[200px]">
                {url}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={() => { handleOpenEditor(); setOpen(false); }}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Аватар</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => { setShortcutsOpen(true); setOpen(false); }}>
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Горячие клавиши</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { setAboutOpen(true); setOpen(false); }}>
            <Info className="mr-2 h-4 w-4" />
            <span>О программе</span>
          </DropdownMenuItem>
          
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

      {/* Диалог подтверждения выхода */}
      <LogoutObserver />
    </Fragment>
  )
}
