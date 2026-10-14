import { MicVocal } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useQuery } from '@tanstack/react-query'
import { ImageLoader } from '@/app/components/image-loader'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { useGetArtist } from '@/app/hooks/use-artist'
import { ROUTES } from '@/routes/routesList'
import { search3 } from '@/service/subsonic-api'
import type { ResolvedArtist } from '@/utils/splitArtists'

interface ArtistVisual {
  cover: string | null
  resolvedId: string
  isLoading: boolean
}

/**
 * Обложка + канонический id артиста.
 * Приоритет:
 * 1. coverArt из записи трека (когда не было сплита),
 * 2. search3 по имени (точное совпадение) — чинит сплит "A/B", где id пуст
 *    или указывает на склейку, а не на конкретного артиста,
 * 3. страница артиста по id,
 * 4. плейсхолдер.
 */
function useArtistVisual(artist: ResolvedArtist): ArtistVisual {
  const name = (artist.name || '').trim()
  const directCover = artist.coverArt || null

  const { data: searched, isLoading: isSearching } = useQuery({
    queryKey: ['artists-modal-cover', name],
    queryFn: async () => {
      const res = await search3(name, { artistCount: 5, albumCount: 0, songCount: 0 })
      const list = res?.artists ?? []
      if (list.length === 0) return null
      const lower = name.toLowerCase()
      return list.find((a) => (a.name || '').toLowerCase() === lower) ?? list[0] ?? null
    },
    enabled: !directCover && name.length > 0,
    // Кэш для мгновенного показа + фоновая свежесть.
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const searchedCover =
    searched?.coverArt || (searched as { artistImageUrl?: string } | null)?.artistImageUrl || null
  const searchedId = searched?.id || ''

  // Страница по id — только как фолбэк, когда поиск ничего не дал.
  const needPageLookup = !directCover && !searchedCover && !isSearching && !!artist.id
  const { data: page } = useGetArtist(needPageLookup ? artist.id : '')
  const pageCover =
    (page as { coverArt?: string; artistImageUrl?: string } | null | undefined)?.coverArt ||
    (page as { coverArt?: string; artistImageUrl?: string } | null | undefined)?.artistImageUrl ||
    null

  const cover = directCover || searchedCover || pageCover || null
  const resolvedId = searchedId || artist.id || ''
  return { cover, resolvedId, isLoading: isSearching }
}

/** Кружок: обложка из записи → поиск по имени → фото со страницы артиста → иконка. */
function ArtistCircle({ artist, cover }: { artist: ResolvedArtist; cover: string | null }) {
  if (!cover) {
    return (
      <span className="w-[46px] h-[46px] rounded-full bg-muted flex items-center justify-center shrink-0">
        <MicVocal className="w-5 h-5 text-muted-foreground" />
      </span>
    )
  }
  return (
    <ImageLoader id={cover} type="artist" size={100}>
      {(src) =>
        src ? (
          <img
            src={src}
            alt={artist.name}
            loading="lazy"
            className="w-[46px] h-[46px] rounded-full object-cover shrink-0 bg-muted"
          />
        ) : (
          <span className="w-[46px] h-[46px] rounded-full bg-muted flex items-center justify-center shrink-0">
            <MicVocal className="w-5 h-5 text-muted-foreground" />
          </span>
        )
      }
    </ImageLoader>
  )
}

/** Строка артиста: резолвит id по имени заранее, чтобы тап был мгновенным. */
function ArtistRow({
  artist,
  disabled,
  onGoById,
  onGoByName,
}: {
  artist: ResolvedArtist
  disabled: boolean
  onGoById: (id: string) => void
  onGoByName: (name: string) => void
}) {
  const { cover, resolvedId } = useArtistVisual(artist)

  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (resolvedId) onGoById(resolvedId)
        else if (artist.id) onGoById(artist.id)
        else onGoByName(artist.name)
      }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-left disabled:opacity-60"
    >
      <ArtistCircle artist={artist} cover={cover} />
      <span className="text-[15px] font-medium truncate">
        {artist.name || 'Неизвестный исполнитель'}
      </span>
    </button>
  )
}

/**
 * Модалка «Исполнители» как в мобилке: кружок + имя на каждого,
 * внизу кнопка «Отмена». Без id — ищем артиста по имени.
 */
export function ArtistsModal({
  open,
  onOpenChange,
  artists,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  artists: ResolvedArtist[]
}) {
  const navigate = useNavigate()
  const [resolving, setResolving] = useState(false)

  const goById = (id: string) => {
    onOpenChange(false)
    navigate(ROUTES.ARTIST.PAGE(id))
  }

  const goByName = async (name: string) => {
    if (!name || resolving) return
    setResolving(true)
    try {
      const res = await search3(name, { artistCount: 5, albumCount: 0, songCount: 0 })
      const list = (res as { artists?: { id: string; name: string }[] } | null)?.artists ?? []
      const matched =
        list.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? list[0]
      if (matched) {
        onOpenChange(false)
        navigate(ROUTES.ARTIST.PAGE(matched.id))
      } else {
        toast.info(`Артист «${name}» не найден в библиотеке`, { autoClose: 2000 })
      }
    } catch {
      toast.error('Не удалось найти артиста', { autoClose: 2000 })
    } finally {
      setResolving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] p-0 overflow-hidden">
        <DialogHeader className="pt-5 pb-2 px-5 text-center">
          <DialogTitle className="text-center text-lg font-bold">
            Исполнители
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[45vh] overflow-y-auto px-2 pb-2">
          {artists.map((artist, i) => (
            <ArtistRow
              key={`${artist.id || artist.name}-${i}`}
              artist={artist}
              disabled={resolving}
              onGoById={goById}
              onGoByName={goByName}
            />
          ))}
        </div>
        <div className="p-4 pt-2">
          <Button
            variant="secondary"
            className="w-full rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Отмена
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
