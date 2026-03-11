/**
 * Компонент дискографии артиста из Discogs
 *
 * Показывает полную дискографию в виде сворачиваемой таблицы:
 * - Albums
 * - Singles
 * - EP
 * - Compilations
 * - Remixes
 */

import { useEffect, useState } from 'react'
import { discogsService, type DiscogsRelease } from '@/service/discogs-api'
import { useExternalApi } from '@/store/external-api.store'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { ExternalLink, ChevronDown, ChevronUp, Music2 } from 'lucide-react'

interface ArtistDiscographyProps {
  artistName: string
}

interface GroupedReleases {
  albums: DiscogsRelease[]
  singles: DiscogsRelease[]
  eps: DiscogsRelease[]
  compilations: DiscogsRelease[]
  remixes: DiscogsRelease[]
  other: DiscogsRelease[]
}

export function ArtistDiscography({ artistName }: ArtistDiscographyProps) {
  const { settings } = useExternalApi()
  const [loading, setLoading] = useState(true)
  const [releases, setReleases] = useState<DiscogsRelease[]>([])
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(true) // Свёрнуто по умолчанию
  const [forceUpdate, setForceUpdate] = useState(0) // Для принудительного обновления

  // Обновляем компонент при изменении настроек Discogs
  useEffect(() => {
    console.log('[ArtistDiscography] Settings changed:', {
      enabled: settings.discogsEnabled,
      hasKey: !!settings.discogsApiKey,
    })
    // Принудительное обновление при изменении настроек
    setForceUpdate(prev => prev + 1)
  }, [settings.discogsEnabled, settings.discogsApiKey, settings.discogsApiSecret])

  useEffect(() => {
    async function loadDiscography() {
      if (!settings.discogsEnabled || !discogsService.isInitialized()) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Ищем артиста
        const artists = await discogsService.searchArtist(artistName, 5)

        if (artists.length === 0) {
          setError('Артист не найден в Discogs')
          setLoading(false)
          return
        }

        // Получаем релизы
        const allReleases = await discogsService.getArtistReleases(artists[0].id.toString(), 100)

        // Сортируем по году (новые сначала)
        const sortedReleases = allReleases.sort((a, b) => b.year - a.year)

        setReleases(sortedReleases)
      } catch (err) {
        console.error('[ArtistDiscography] Error:', err)
        setError('Ошибка загрузки дискографии')
      } finally {
        setLoading(false)
      }
    }

    loadDiscography()
  }, [artistName, settings.discogsEnabled, settings.discogsApiKey, settings.discogsApiSecret, forceUpdate])

  // Группируем релизы по типам
  const grouped = releases.reduce<GroupedReleases>(
    (acc, release) => {
      // format может быть строкой или массивом
      const formatString = Array.isArray(release.format)
        ? release.format.join(' ').toLowerCase()
        : (release.format || '').toLowerCase()

      const format = formatString || ''

      if (format.includes('album') || release.styles?.includes('Album')) {
        acc.albums.push(release)
      } else if (format.includes('single')) {
        acc.singles.push(release)
      } else if (format.includes('ep') || format.includes('mini')) {
        acc.eps.push(release)
      } else if (format.includes('compilation') || format.includes('greatest hits')) {
        acc.compilations.push(release)
      } else if (format.includes('remix')) {
        acc.remixes.push(release)
      } else {
        acc.other.push(release)
      }

      return acc
    },
    { albums: [], singles: [], eps: [], compilations: [], remixes: [], other: [] }
  )

  if (!settings.discogsEnabled) {
    return null
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>💿 Дискография</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Загрузка...</div>
        </CardContent>
      </Card>
    )
  }

  if (error || releases.length === 0) {
    return null // Не показываем если нет данных
  }

  const totalReleases = releases.length
  const albumsCount = grouped.albums.length

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setCollapsed(!collapsed)}>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            💿 Дискография из Discogs
            <a
              href={`https://www.discogs.com/search/?q=${encodeURIComponent(artistName)}&type=artist`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {albumsCount} альбомов • {totalReleases} релизов
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation()
                setCollapsed(!collapsed)
              }}
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-6">
          {/* Albums */}
          {grouped.albums.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                Альбомы ({grouped.albums.length})
              </h3>
              <div className="space-y-1">
                {grouped.albums.slice(0, 12).map((release, index) => (
                  <ReleaseRow key={release.id} release={release} index={index} />
                ))}
              </div>
              {grouped.albums.length > 12 && (
                <Button
                  variant="link"
                  className="text-xs text-muted-foreground"
                  onClick={() => window.open(`https://www.discogs.com/artist/${grouped.albums[0].artists?.[0]?.id}/releases`, '_blank')}
                >
                  Показать ещё {grouped.albums.length - 12} альбомов
                </Button>
              )}
            </div>
          )}

          {/* Singles */}
          {grouped.singles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                Синглы ({grouped.singles.length})
              </h3>
              <div className="space-y-1">
                {grouped.singles.slice(0, 8).map((release) => (
                  <ReleaseRow key={release.id} release={release} />
                ))}
              </div>
            </div>
          )}

          {/* EPs */}
          {grouped.eps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                EP ({grouped.eps.length})
              </h3>
              <div className="space-y-1">
                {grouped.eps.slice(0, 8).map((release) => (
                  <ReleaseRow key={release.id} release={release} />
                ))}
              </div>
            </div>
          )}

          {/* Compilations */}
          {grouped.compilations.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground">
                Сборники ({grouped.compilations.length})
              </h3>
              <div className="space-y-1">
                {grouped.compilations.slice(0, 8).map((release) => (
                  <ReleaseRow key={release.id} release={release} />
                ))}
              </div>
            </div>
          )}

          {/* View All Button */}
          {releases.length > 32 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(`https://www.discogs.com/artist/search?q=${encodeURIComponent(artistName)}`, '_blank')}
            >
              Показать все {releases.length} релизов в Discogs
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}

function ReleaseRow({ release, index }: { release: DiscogsRelease; index?: number }) {
  return (
    <a
      href={`https://www.discogs.com/release/${release.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
    >
      {/* Обложка */}
      <div className="relative w-10 h-10 min-w-[40px] rounded overflow-hidden bg-muted">
        {release.thumb ? (
          <img
            src={release.thumb.replace('60x60', '100x100')}
            alt={release.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Информация */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{release.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{release.year}</span>
          {release.genres?.length > 0 && (
            <>
              <span>•</span>
              <span className="truncate">{release.genres[0]}</span>
            </>
          )}
          {release.styles && release.styles.length > 0 && (
            <>
              <span>•</span>
              <span className="truncate">{release.styles[0]}</span>
            </>
          )}
        </div>
      </div>

      {/* Тип релиза */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs shrink-0">
          {Array.isArray(release.format) ? release.format.join(', ') : release.format || 'Unknown'}
        </Badge>
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
    </a>
  )
}
