import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { useExternalApi } from '@/store/external-api.store'
import { toast } from 'react-toastify'
import { Image, Music, Radio, Star, Globe, Disc, Award } from 'lucide-react'

interface CoverPriority {
  id: string
  name: string
  icon: React.ReactNode
  description: string
}

const COVER_SOURCES: CoverPriority[] = [
  {
    id: 'navidrome',
    name: 'Navidrome',
    icon: <Disc className="w-5 h-5" />,
    description: 'Локальная библиотека (оригинальные обложки)',
  },
  {
    id: 'fanart',
    name: 'Fanart.tv',
    icon: <Image className="w-5 h-5" />,
    description: 'HD изображения от сообщества',
  },
  {
    id: 'discogs',
    name: 'Discogs',
    icon: <Award className="w-5 h-5" />,
    description: 'Обложки из базы Discogs',
  },
  {
    id: 'appleMusic',
    name: 'Apple Music',
    icon: <Music className="w-5 h-5" />,
    description: 'Официальные обложки Apple',
  },
  {
    id: 'yandex',
    name: 'Yandex Music',
    icon: <Radio className="w-5 h-5" />,
    description: 'Обложки из Яндекс Музыки',
  },
  {
    id: 'lastfm',
    name: 'Last.fm',
    icon: <Globe className="w-5 h-5" />,
    description: 'Изображения из Last.fm',
  },
]

export function CoverArtPriorityCard() {
  const { settings, setFanartEnabled, setAppleMusicEnabled } = useExternalApi()
  const [priority, setPriority] = useState<string[]>(() => {
    const saved = localStorage.getItem('coverArtPriority')
    return saved ? JSON.parse(saved) : ['navidrome', 'fanart', 'discogs', 'appleMusic', 'yandex', 'lastfm']
  })

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newPriority = [...priority]
    const temp = newPriority[index]
    newPriority[index] = newPriority[index - 1]
    newPriority[index - 1] = temp
    setPriority(newPriority)
    localStorage.setItem('coverArtPriority', JSON.stringify(newPriority))
    toast('✅ Приоритет обложек сохранён', { type: 'success' })
  }

  const handleMoveDown = (index: number) => {
    if (index === priority.length - 1) return
    const newPriority = [...priority]
    const temp = newPriority[index]
    newPriority[index] = newPriority[index + 1]
    newPriority[index + 1] = temp
    setPriority(newPriority)
    localStorage.setItem('coverArtPriority', JSON.stringify(newPriority))
    toast('✅ Приоритет обложек сохранён', { type: 'success' })
  }

  const handleReset = () => {
    const defaultPriority = ['navidrome', 'fanart', 'discogs', 'appleMusic', 'yandex', 'lastfm']
    setPriority(defaultPriority)
    localStorage.setItem('coverArtPriority', JSON.stringify(defaultPriority))
    toast('✅ Приоритет обложек сброшен', { type: 'info' })
  }

  const getSourceById = (id: string) => COVER_SOURCES.find(s => s.id === id)

  return (
    <Card className="bg-gradient-to-br from-blue-900/50 to-indigo-900/50 border-blue-500/30">
      <CardHeader>
        <CardTitle className="text-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            Приоритет источников обложек
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            Сбросить
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Настройте порядок источников для загрузки обложек артистов и альбомов.
          Первый в списке имеет наивысший приоритет.
        </p>

        <div className="space-y-2">
          {priority.map((sourceId, index) => {
            const source = getSourceById(sourceId)
            if (!source) return null

            const isEnabled =
              (sourceId === 'fanart' && settings.fanartEnabled) ||
              (sourceId === 'appleMusic' && settings.appleMusicEnabled) ||
              sourceId === 'navidrome'

            return (
              <div
                key={sourceId}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  isEnabled ? 'bg-card/50 border-border' : 'bg-muted/30 border-muted opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="text-muted-foreground font-mono text-sm w-6 text-center">
                    {index + 1}
                  </div>
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {source.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      {source.name}
                      {!isEnabled && sourceId !== 'navidrome' && (
                        <Badge variant="secondary" className="text-xs">
                          Выключено
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {source.description}
                    </div>
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="h-8 w-8"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === priority.length - 1}
                    className="h-8 w-8"
                  >
                    ↓
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>💡 <strong>Совет:</strong> Navidrome как приоритет #1 показывает оригинальные обложки из вашей библиотеки.</p>
          <p>🎨 <strong>Fanart.tv</strong> предоставляет HD изображения от сообщества.</p>
        </div>
      </CardContent>
    </Card>
  )
}
