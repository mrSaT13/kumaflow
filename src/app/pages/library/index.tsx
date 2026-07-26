import {
  ChevronRight,
  Disc,
  FolderOpen,
  Heart,
  Library,
  ListMusic,
  Mic2,
  Music2,
  Podcast,
  Radio,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface LibraryLink {
  label: string
  icon: typeof Library
  route: string
  accent?: string
}

interface LibrarySection {
  title: string
  items: LibraryLink[]
}

export default function LibraryPage() {
  const navigate = useNavigate()

  const sections: LibrarySection[] = [
    {
      title: 'Моя медиатека',
      items: [
        { label: 'Исполнители', icon: Mic2, route: '/library/artists' },
        { label: 'Треки', icon: Music2, route: '/library/songs' },
        { label: 'Альбомы', icon: Library, route: '/library/albums' },
        { label: 'Избранное', icon: Heart, route: '/library/favorites', accent: 'text-red-400' },
        { label: 'Плейлисты', icon: ListMusic, route: '/library/playlists' },
        { label: 'Жанры', icon: Disc, route: '/genres' },
      ],
    },
    {
      title: 'Коллекции',
      items: [
        { label: 'Радио', icon: Radio, route: '/library/radios' },
        { label: 'Подкасты', icon: Podcast, route: '/library/podcasts' },
        { label: 'Книги', icon: Library, route: '/audiobooks' },
        { label: 'Локальная музыка', icon: FolderOpen, route: '/library/local' },
      ],
    },
  ]

  return (
    <div className="w-full pb-6">
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-3xl font-bold text-foreground">Библиотека</h1>
      </div>

      <div className="space-y-6 px-4 pt-3">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h2>
            <div className="overflow-hidden rounded-2xl border bg-background-foreground">
              {section.items.map((item, index) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.route)}
                    className={[
                      'flex w-full items-center gap-3 px-4 py-4 transition-colors active:bg-accent/60',
                      index > 0 ? 'border-t' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <Icon
                      className={`size-5 shrink-0 ${item.accent ?? 'text-muted-foreground'}`}
                    />
                    <span className="flex-1 text-left text-base font-medium text-foreground">
                      {item.label}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
