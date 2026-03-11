/**
 * Theme Settings - Настройки тем
 * Выбор из 20+ тем
 */

import { useThemeStore, useAllThemes, useThemeActions } from '@/shared/themes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Moon, Sun, Monitor } from 'lucide-react'

export function ThemeSettings() {
  const { currentThemeId, setTheme } = useThemeStore()
  const allThemes = useAllThemes()
  
  const darkThemes = allThemes.filter(t => t.mode === 'dark')
  const lightThemes = allThemes.filter(t => t.mode === 'light')
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>🎨 Темы оформления</CardTitle>
        <CardDescription>
          Выберите тему из {allThemes.length} доступных вариантов
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dark темы */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Moon className="w-4 h-4" />
            Темные темы ({darkThemes.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {darkThemes.map((theme) => (
              <Button
                key={theme.id}
                variant={currentThemeId === theme.id ? 'default' : 'outline'}
                className={`h-auto py-3 flex flex-col items-start gap-1 ${
                  currentThemeId === theme.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setTheme(theme.id)}
              >
                <span className="font-medium text-sm">{theme.name}</span>
                {theme.description && (
                  <span className="text-xs text-muted-foreground text-left line-clamp-1">
                    {theme.description}
                  </span>
                )}
                {currentThemeId === theme.id && (
                  <Badge className="absolute top-2 right-2">✓</Badge>
                )}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Light темы */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sun className="w-4 h-4" />
            Светлые темы ({lightThemes.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {lightThemes.map((theme) => (
              <Button
                key={theme.id}
                variant={currentThemeId === theme.id ? 'default' : 'outline'}
                className={`h-auto py-3 flex flex-col items-start gap-1 ${
                  currentThemeId === theme.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setTheme(theme.id)}
              >
                <span className="font-medium text-sm">{theme.name}</span>
                {theme.description && (
                  <span className="text-xs text-muted-foreground text-left line-clamp-1">
                    {theme.description}
                  </span>
                )}
                {currentThemeId === theme.id && (
                  <Badge className="absolute top-2 right-2">✓</Badge>
                )}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Информация */}
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-start gap-3">
            <Monitor className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Текущая тема: <span className="text-primary">{useThemeStore.getState().currentTheme.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Темы применяются автоматически. Все изменения сохраняются в localStorage.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
