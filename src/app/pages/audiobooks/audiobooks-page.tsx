import { useState, useEffect } from 'react'
import { useAudiobookshelf } from '@/store/audiobookshelf.store'
import { getAudiobookshelfApi } from '@/service/audiobookshelf-api'
import { toast } from 'react-toastify'
import { usePlayerActions } from '@/store/player.store'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/app/components/ui/button'
import { AlertCircle, Settings } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import styles from './audiobooks-page.module.css'

interface Audiobook {
  id: string
  libraryId: string
  title: string
  author: string
  narrator?: string
  description?: string
  coverUrl?: string
  duration: number  // секунды
  genres: string[]
  publishedYear?: string
  progress?: {
    currentTime: number
    percentage: number
    isFinished: boolean
    lastPlayedAt?: string
  }
  isPlaying?: boolean
}

// Форматирование длительности
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  if (hours > 0) {
    return `${hours}ч ${minutes}м`
  }
  return `${minutes}м`
}

export default function AudiobooksPage() {
  const { config } = useAudiobookshelf()
  const { setSongList, clearPlayerState } = usePlayerActions()
  const navigate = useNavigate()
  const [books, setBooks] = useState<Audiobook[]>([])
  const [libraries, setLibraries] = useState<Array<{ id: string; name: string }>>([])
  const [selectedLibrary, setSelectedLibrary] = useState<string>('')
  const [filter, setFilter] = useState<'all' | 'reading' | 'finished'>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [playingBookId, setPlayingBookId] = useState<string | null>(null)

  const api = getAudiobookshelfApi()

  // Загрузка библиотек при монтировании
  useEffect(() => {
    if (config.enabled && config.isConnected) {
      loadLibraries()
    } else if (config.enabled && !config.isConnected) {
      // Если включено но не подключено - показываем ошибку подключения
      toast.error('Audiobookshelf не подключён. Проверьте настройки.')
    }
  }, [config.enabled, config.isConnected])

  // Загрузка книг при выборе библиотеки
  useEffect(() => {
    if (selectedLibrary) {
      loadBooks(selectedLibrary)
    }
  }, [selectedLibrary])

  const loadLibraries = async () => {
    setIsLoading(true)
    try {
      const libs = await api.getLibraries()
      const bookLibraries = libs.filter(lib => lib.mediaType === 'book')
      setLibraries(bookLibraries)
      
      if (bookLibraries.length > 0) {
        setSelectedLibrary(bookLibraries[0].id)
      }
    } catch (error) {
      console.error('[Audiobooks] Failed to load libraries:', error)
      toast.error('Ошибка загрузки библиотек')
    } finally {
      setIsLoading(false)
    }
  }

  const loadBooks = async (libraryId: string) => {
    setIsLoading(true)
    try {
      const audiobooks = await api.getAudiobooks(libraryId)
      setBooks(audiobooks)
    } catch (error) {
      console.error('[Audiobooks] Failed to load books:', error)
      toast.error('Ошибка загрузки книг')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlayBook = async (book: Audiobook, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      // Получаем URL для воспроизведения через сессию
      console.log('[Audiobooks] Getting stream URL for book:', book.id)
      const streamUrl = await api.getStreamUrl(book.id)
      console.log('[Audiobooks] Received stream URL:', streamUrl)

      if (streamUrl) {
        setPlayingBookId(book.id)
        toast.info(`📖 Запуск: ${book.title}`)

        // Очищаем очередь перед запуском книги
        clearPlayerState()

        // Создаём "трек" для плеера
        const bookAsTrack: any = {
          id: book.id,
          title: book.title,
          artist: book.author,
          album: book.series?.name || '',
          coverUrl: book.coverUrl,
          url: streamUrl,
          duration: book.duration,
          isAudiobook: true,
        }

        console.log('[Audiobooks] Book as track:', bookAsTrack)

        // Запускаем через глобальный плеер
        setSongList([bookAsTrack], 0)
      } else {
        toast.error('Не удалось получить URL для воспроизведения')
      }
    } catch (error) {
      console.error('[Audiobooks] Failed to play book:', error)
      toast.error('Ошибка воспроизведения')
    }
  }

  const handleBookClick = (book: Audiobook) => {
    // Переход на страницу книги с деталями
    navigate(`/audiobooks/${book.id}`)
  }

  const handleProgressUpdate = async (bookId: string, currentTime: number) => {
    try {
      await api.updateProgress(bookId, currentTime)
    } catch (error) {
      console.error('[Audiobooks] Failed to update progress:', error)
    }
  }

  const filteredBooks = books.filter(book => {
    const progress = book.progress?.percentage || 0
    const isFinished = book.progress?.isFinished || false
    const hasProgress = book.progress !== undefined && book.progress !== null

    // Фильтр "Читаю" - есть прогресс 0-100% и не завершено
    if (filter === 'reading') {
      return hasProgress && progress > 0 && progress < 100 && !isFinished
    }
    // Фильтр "Прочитано" - завершено или 100%
    if (filter === 'finished') {
      return isFinished || progress >= 100
    }
    // Фильтр "Все" - все книги
    return true
  })

  // Если не подключено
  if (!config.enabled || !config.isConnected) {
    return (
      <div className="w-full px-8 py-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">📚 Аудиокниги</h1>
          <p className="text-sm text-muted-foreground">
            Ваша библиотека аудиокниг из Audiobookshelf
          </p>
        </div>

        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-4 max-w-md">
            <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">Audiobookshelf не подключён</h2>
            <p className="text-sm text-muted-foreground">
              Настройте подключение к вашему серверу Audiobookshelf в настройках
            </p>
            <Button
              onClick={() => {
                // Открываем диалог настроек и переключаем на вкладку accounts
                const { setOpenDialog, setCurrentPage } = useAppStore.getState().settings
                setOpenDialog(true)
                setCurrentPage('accounts')
                // Прокрутка к секции Audiobookshelf
                setTimeout(() => {
                  const element = document.getElementById('audiobookshelf')
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    element.classList.add('animate-pulse')
                  }
                }, 500)
              }}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Открыть настройки
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-8 py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Аудиокниги</h1>
        <p className="text-sm text-muted-foreground">
          Ваша библиотека аудиокниг из Audiobookshelf
        </p>
      </div>

      {/* Если не подключено */}
      {!config.enabled || !config.isConnected ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-4 max-w-md">
            <AlertCircle className="w-16 h-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">Audiobookshelf не подключён</h2>
            <p className="text-sm text-muted-foreground">
              Настройте подключение к вашему серверу Audiobookshelf в настройках
            </p>
            <Button
              onClick={() => navigate('/settings/account#audiobookshelf')}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Открыть настройки
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Выбор библиотеки */}
          {libraries.length > 1 && (
            <div className="flex gap-2 items-center">
              <label className="text-sm font-medium">Библиотека:</label>
              <select
                value={selectedLibrary}
                onChange={(e) => setSelectedLibrary(e.target.value)}
                className="px-3 py-1.5 bg-background border rounded-md text-sm"
              >
                {libraries.map(lib => (
                  <option key={lib.id} value={lib.id}>
                    {lib.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Фильтры */}
          <div className="flex gap-2">
            <button
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              onClick={() => setFilter('all')}
            >
              Все
            </button>
            <button
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'reading'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              onClick={() => setFilter('reading')}
            >
              Читаю
            </button>
            <button
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'finished'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              onClick={() => setFilter('finished')}
            >
              Прочитано
            </button>
          </div>

          {/* Статус загрузки */}
          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin text-2xl">⏳</div>
              <p className="text-sm text-muted-foreground mt-2">Загрузка книг...</p>
            </div>
          )}

          {/* Сетка книг */}
          {!isLoading && (
            <div className={styles.grid}>
              {filteredBooks.map((book) => {
                const progress = book.progress?.percentage || 0
                const isFinished = book.progress?.isFinished || false
                const currentTime = book.progress?.currentTime || 0
                const isPlaying = playingBookId === book.id

                return (
                  <div
                    key={book.id}
                    className={`${styles.card} ${isPlaying ? styles.playing : ''}`}
                    onClick={() => handleBookClick(book)}
                  >
                    <div className={styles.coverWrapper}>
                      <div className={styles.cover}>
                        {book.coverUrl ? (
                          <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-6xl">📖</span>
                        )}
                      </div>

                      {isPlaying && (
                        <div className={styles.playingIndicator}>
                          <div className={styles.equalizer}>
                            <span />
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                      )}

                      {progress > 0 && (
                        <div className={styles.progressOverlay}>
                          <div
                            className={styles.progressBar}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className={styles.info}>
                      <h3 className={styles.title}>{book.title}</h3>
                      <p className={styles.author}>{book.author}</p>
                      {book.narrator && (
                        <p className={styles.narrator}>🎙️ {book.narrator}</p>
                      )}
                      <div className={styles.meta}>
                        <span className={styles.duration}>
                          {formatDuration(book.duration)}
                        </span>
                        {progress > 0 && (
                          <span className={styles.progress}>
                            {Math.round(progress)}%
                          </span>
                        )}
                        {isFinished && (
                          <span className="text-green-600">✓</span>
                        )}
                      </div>
                    </div>

                    <button
                      className={styles.playButton}
                      onClick={(e) => handlePlayBook(book, e)}
                    >
                      {isPlaying ? '⏸️' : '▶️'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Пустое состояние */}
          {!isLoading && filteredBooks.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📖</div>
              <div className="text-lg font-bold">Нет книг</div>
              <div className="text-sm text-muted-foreground mt-2">
                {filter === 'all'
                  ? 'В вашей библиотеке пока нет книг'
                  : filter === 'reading'
                  ? 'У вас нет книг в процессе чтения'
                  : 'Вы пока не завершили ни одной книги'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
