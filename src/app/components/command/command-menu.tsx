import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { useTranslation } from 'react-i18next'
import { useDebouncedCallback } from 'use-debounce'
import { Keyboard } from '@/app/components/command/keyboard-key'
import { Button } from '@/app/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@/app/components/ui/command'
import { useMainSidebar } from '@/app/components/ui/main-sidebar'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { subsonic } from '@/service/subsonic'
import { useAppStore } from '@/store/app.store'
import { byteLength } from '@/utils/byteLength'
import { convertMinutesToMs } from '@/utils/convertSecondsToTime'
import { queryKeys } from '@/utils/queryKeys'
import { CommandAlbumResult } from './album-result'
import { CommandArtistResult } from './artist-result'
import { CommandGotoPage } from './goto-page'
import { CommandHome, CommandPages } from './home'
import { CommandPlaylists } from './playlists'
import { CommandServer } from './server-management'
import { CommandSongResult } from './song-result'
import { CommandThemes } from './themes'
import { getAudiobookshelfApi } from '@/service/audiobookshelf-api'

export type CommandItemProps = {
  runCommand: (command: () => unknown) => void
}

export default function CommandMenu() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { state: sidebarState } = useMainSidebar()
  const { open, setOpen } = useAppStore((state) => state.command)

  const [query, setQuery] = useState('')
  const [pages, setPages] = useState<CommandPages[]>(['HOME'])
  const [books, setBooks] = useState<any[]>([])  // Результаты поиска книг
  const [searchingBooks, setSearchingBooks] = useState(false)
  const api = getAudiobookshelfApi()  // Экземпляр API для использования в рендере

  const activePage = pages[pages.length - 1]
  const isHome = activePage === 'HOME'

  const enableQuery = Boolean(
    byteLength(query) >= 3 && activePage !== 'PLAYLISTS',
  )

  const { data: searchResult } = useQuery({
    queryKey: [queryKeys.search, query],
    queryFn: () =>
      subsonic.search.get({
        query,
        albumCount: 4,
        artistCount: 4,
        songCount: 4,
      }),
    enabled: enableQuery,
    staleTime: convertMinutesToMs(5),
  })

  const albums = searchResult?.album ?? []
  const artists = searchResult?.artist ?? []
  const songs = searchResult?.song ?? []

  const showAlbumGroup = Boolean(query && albums.length > 0)
  const showArtistGroup = Boolean(query && artists.length > 0)
  const showSongGroup = Boolean(query && songs.length > 0)
  const showBookGroup = Boolean(query && books.length > 0)

  // Поиск книг параллельно с обычным поиском
  useEffect(() => {
    if (!query || byteLength(query) < 3 || !open) {
      setBooks([])
      return
    }

    const searchBooks = async () => {
      setSearchingBooks(true)
      try {
        const foundBooks = await api.searchBooks(query, 10)
        setBooks(foundBooks || [])
        console.log('[CommandMenu] Found books:', foundBooks?.length || 0)
      } catch (error) {
        console.warn('[CommandMenu] Book search failed:', error)
        setBooks([])
      } finally {
        setSearchingBooks(false)
      }
    }

    const timeout = setTimeout(searchBooks, 600)  // Debounce 600ms
    return () => clearTimeout(timeout)
  }, [query, open])

  useHotkeys(['/', 'mod+f', 'mod+k'], () => setOpen(!open), {
    preventDefault: true,
  })

  const clear = useCallback(() => {
    setQuery('')
    setPages(['HOME'])
  }, [])

  const runCommand = useCallback(
    (command: () => unknown) => {
      setOpen(false)
      clear()
      command()
    },
    [clear, setOpen],
  )

  const debounced = useDebouncedCallback((value: string) => {
    setQuery(value)
  }, 500)

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === '/') {
      event.preventDefault()
    }
  }

  function handleSearchChange(value: string) {
    // Проверяем умный формат ссылок
    if (value.startsWith('@track:') || value.startsWith('@artist:') || value.startsWith('@album:')) {
      // Обрабатываем сразу без задержки
      handleSmartSearch(value)
      return
    }
    
    if (activePage === 'PLAYLISTS') {
      setQuery(value)
    } else {
      debounced(value)
    }
  }

  // Обработка умных ссылок
  async function handleSmartSearch(value: string) {
    console.log('[CommandMenu] Smart search:', value)
    
    if (value.startsWith('@track:')) {
      // Формат: @track:Artist - TrackName
      const trackInfo = value.replace('@track:', '')
      const parts = trackInfo.split(' - ')
      const artist = parts[0]?.trim()
      const track = parts[1]?.trim()

      if (artist && track) {
        console.log('[CommandMenu] Searching track:', artist, track)
        debounced(`${artist} ${track}`)
        setOpen(false)
        return
      }
    }
    
    if (value.startsWith('@artist:')) {
      // Формат: @artist:ArtistName - ищем ТОЛЬКО артистов
      const artistName = value.replace('@artist:', '').trim()
      console.log('[CommandMenu] Searching artist ONLY:', artistName)

      try {
        const { search3 } = await import('@/service/subsonic-api')
        // Ищем ТОЛЬКО артистов
        const results = await search3(artistName, {
          artistCount: 20,
          albumCount: 0,
          songCount: 0
        })

        console.log('[CommandMenu] Search results:', {
          artists: results.artists?.length || 0,
        })

        if (results.artists && results.artists.length > 0) {
          // Ищем точное совпадение
          const exactMatch = results.artists.find(a => a.name.toLowerCase() === artistName.toLowerCase())
          const artist = exactMatch || results.artists[0]

          console.log('[CommandMenu] Found artist:', artist.name, artist.id)
          // Открываем страницу артиста
          navigate(`/library/artists/${artist.id}`)
          setOpen(false)
          clear()
          return  // ✅ Важно - не продолжать выполнение!
        }
      } catch (error) {
        console.error('[CommandMenu] Artist search failed:', error)
      }

      // Fallback: обычный поиск если артист не найден
      console.log('[CommandMenu] Fallback to regular search')
      debounced(artistName)
      return
    }

    if (value.startsWith('@album:')) {
      // Формат: @album:AlbumName - ищем только по названию альбома
      const albumName = value.replace('@album:', '').trim()
      console.log('[CommandMenu] Searching album:', albumName)

      try {
        const { search3 } = await import('@/service/subsonic-api')
        const results = await search3(albumName, { artistCount: 0, albumCount: 20, songCount: 0 })

        if (results.albums && results.albums.length > 0) {
          // Ищем точное совпадение
          const exactMatch = results.albums.find(a => a.name.toLowerCase() === albumName.toLowerCase())
          const album = exactMatch || results.albums[0]

          console.log('[CommandMenu] Found album:', album.name, album.id)
          // Открываем страницу альбома
          navigate(`/albums/${album.id}`)
          setOpen(false)
          clear()
          return  // ✅ Важно - не продолжать выполнение!
        } else {
          console.warn('[CommandMenu] No albums found for:', albumName)
        }
      } catch (error) {
        console.error('[CommandMenu] Album search failed:', error)
      }

      // Fallback: обычный поиск если альбом не найден
      console.log('[CommandMenu] Fallback to regular search')
      debounced(albumName)
      return
    }

    if (value.startsWith('@book:')) {
      // Формат: @book:BookName - ищем аудиокниги
      const bookName = value.replace('@book:', '').trim()
      console.log('[CommandMenu] Searching audiobook:', bookName)

      try {
        const { getAudiobookshelfApi } = await import('@/service/audiobookshelf-api')
        const api = getAudiobookshelfApi()
        const books = await api.searchBooks(bookName, 20)

        console.log('[CommandMenu] Found books:', books.length)

        if (books.length > 0) {
          // Открываем страницу аудиокниг с результатами поиска
          // Сохраняем запрос в localStorage для страницы
          localStorage.setItem('audiobook-search-query', bookName)
          navigate('/audiobooks?search=' + encodeURIComponent(bookName))
          setOpen(false)
          return
        }
      } catch (error) {
        console.error('[CommandMenu] Book search failed:', error)
      }

      // Fallback: открываем страницу аудиокниг
      navigate('/audiobooks')
      setOpen(false)
      return
    }

    // Общий fallback: обычный поиск для всего остального
    debounced(value)
  }

  const removeLastPage = useCallback(() => {
    setPages((pages) => {
      const tempPages = [...pages]
      tempPages.splice(-1, 1)
      return tempPages
    })
  }, [])

  const inputPlaceholder = () => {
    if (activePage === 'PLAYLISTS') return t('options.playlist.search')

    return t('command.inputPlaceholder')
  }

  const showNotFoundMessage = Boolean(
    enableQuery && !showAlbumGroup && !showArtistGroup && !showSongGroup,
  )

  const sidebarOpen = sidebarState === 'expanded'

  return (
    <>
      {sidebarOpen && (
        <Button
          variant="outline"
          className="flex justify-start w-full px-2 gap-2 relative min-w-max active:scale-[98%] transition hover:bg-background-foreground/80"
          onClick={() => setOpen(true)}
        >
          <SearchIcon className="h-4 w-4 text-muted-foreground" />
          <span className="inline-flex text-muted-foreground text-sm">
            {t('sidebar.search')}
          </span>

          <div className="absolute right-2">
            <Keyboard text="/" />
          </div>
        </Button>
      )}
      <CommandDialog
        open={open}
        onOpenChange={(state) => {
          if (isHome) {
            setOpen(state)
            clear()
          } else {
            removeLastPage()
          }
        }}
      >
        <Command shouldFilter={activePage === 'PLAYLISTS'} id="main-command">
          <CommandInput
            data-testid="command-menu-input"
            placeholder={inputPlaceholder()}
            autoCorrect="false"
            autoCapitalize="false"
            spellCheck="false"
            onValueChange={(value) => handleSearchChange(value)}
            onKeyDown={handleInputKeyDown}
            onPaste={(e) => {
              // Обрабатываем вставку сразу
              const pastedText = e.clipboardData.getData('text')
              setTimeout(() => {
                handleSearchChange(pastedText)
              }, 100)
            }}
          />
          <ScrollArea className="max-h-[500px] 2xl:max-h-[700px]">
            <CommandList className="max-h-fit pr-1">
              <CommandEmpty>{t('command.noResults')}</CommandEmpty>

              {showNotFoundMessage && (
                <div className="flex justify-center items-center p-4 mt-2 mx-2 bg-accent/40 rounded border border-border">
                  <p className="text-sm">{t('command.noResults')}</p>
                </div>
              )}

              {showAlbumGroup && (
                <CommandAlbumResult
                  query={query}
                  albums={albums}
                  runCommand={runCommand}
                />
              )}

              {showSongGroup && (
                <CommandSongResult
                  query={query}
                  songs={songs}
                  runCommand={runCommand}
                />
              )}

              {/* Audiobooks секция */}
              {showBookGroup && books.length > 0 && (
                <div className="px-2 py-1.5">
                  <div className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                    📚 Аудиокниги
                  </div>
                  {books.slice(0, 5).map((book) => {
                    // book уже распарсен через parseAudiobook — id, title, author, coverUrl готовы
                    const bookId = book.id || 'unknown'
                    const title = book.title || 'Без названия'
                    const author = book.author || 'Неизвестный автор'
                    const coverUrl = book.coverUrl

                    return (
                      <button
                        key={bookId}
                        className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => {
                          console.log('[CommandMenu] Navigating to book:', bookId, title)
                          navigate(`/audiobooks/${bookId}`)
                          setOpen(false)
                        }}
                      >
                        {/* Обложка */}
                        <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-secondary">
                          {coverUrl ? (
                            <img 
                              src={coverUrl} 
                              alt={title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback если обложка не загрузилась
                                e.currentTarget.style.display = 'none'
                                const parent = e.currentTarget.parentElement
                                if (parent) {
                                  parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-lg">📖</div>'
                                }
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-lg">📖</div>
                          )}
                        </div>
                        {/* Информация */}
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-medium text-foreground truncate">
                            {title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {author}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {searchingBooks && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                  🔍 Поиск книг...
                </div>
              )}

              {showArtistGroup && (
                <CommandArtistResult
                  artists={artists}
                  runCommand={runCommand}
                />
              )}

              {isHome && (
                <CommandHome
                  pages={pages}
                  setPages={setPages}
                  runCommand={runCommand}
                />
              )}

              {activePage === 'GOTO' && (
                <CommandGotoPage runCommand={runCommand} />
              )}

              {activePage === 'THEME' && (
                <CommandThemes runCommand={runCommand} />
              )}

              {activePage === 'PLAYLISTS' && (
                <CommandPlaylists runCommand={runCommand} />
              )}

              {activePage === 'SERVER' && <CommandServer />}
            </CommandList>
          </ScrollArea>
          <div className="flex justify-end p-2 h-10 gap-1 border-t">
            <Keyboard text="ESC" className="text-sm" />
            <Keyboard text="↓" className="text-sm" />
            <Keyboard text="↑" className="text-sm" />
            <Keyboard text="↵" className="text-sm" />
          </div>
        </Command>
      </CommandDialog>
    </>
  )
}
