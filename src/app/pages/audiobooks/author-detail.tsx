/**
 * Страница автора аудиокниг
 * Отображает все книги автора
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAudiobookshelfApi, type Audiobook } from '@/service/audiobookshelf-api'
import { useAudiobookshelf } from '@/store/audiobookshelf.store'
import { toast } from 'react-toastify'
import { ArrowLeft, BookOpen, User } from 'lucide-react'
import styles from './author-detail.module.css'

export default function AudiobookAuthor() {
  const { authorId, authorName } = useParams<{ authorId: string; authorName: string }>()
  const navigate = useNavigate()
  const { config } = useAudiobookshelf()
  const api = getAudiobookshelfApi()

  const [books, setBooks] = useState<Audiobook[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [authorDisplayName, setAuthorDisplayName] = useState(authorName || 'Автор')

  // Загрузка книг автора
  useEffect(() => {
    if (!config.enabled || !config.isConnected) {
      toast.info('📚 Сначала настройте Audiobookshelf')
      navigate('/settings#audiobookshelf')
      return
    }

    loadAuthorBooks()
  }, [authorId, config.enabled, config.isConnected])

  const loadAuthorBooks = async () => {
    if (!authorId) return

    setIsLoading(true)
    try {
      // Получаем список всех книг и фильтруем по автору
      const libraries = await api.getLibraries()
      if (libraries.length === 0) {
        toast.error('Библиотеки не найдены')
        setIsLoading(false)
        return
      }

      // Получаем книги из первой библиотеки
      const allBooks = await api.getAudiobooks(libraries[0].id)
      
      // Фильтруем по автору (сравниваем по имени)
      const authorBooks = allBooks.filter(book => 
        book.author.toLowerCase().includes(authorDisplayName.toLowerCase())
      )

      setBooks(authorBooks)
      setAuthorDisplayName(authorBooks[0]?.author || authorDisplayName)
      
      if (authorBooks.length === 0) {
        toast.warning('Книги этого автора не найдены')
      }
    } catch (error) {
      console.error('[AudiobookAuthor] Error:', error)
      toast.error('Ошибка загрузки книг автора')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlayBook = async (book: Audiobook) => {
    try {
      const session = await api.getPlaybackSession(book.id)
      if (!session) {
        toast.error('Не удалось получить сессию')
        return
      }

      // Очищаем очередь и запускаем книгу
      const { clearPlayerState, setSongList, setIsPlaying } = await import('@/store/player.store')
      clearPlayerState()
      
      const bookAsTrack = {
        id: book.id,
        title: book.title,
        artist: book.author,
        url: session.mediaPlaybackUrl,
        isAudiobook: true,
        coverArtUrl: book.coverUrl,
      }

      setSongList([bookAsTrack], 0)
      setIsPlaying(true)
      toast.success(`▶️ ${book.title}`)
    } catch (error) {
      console.error('[AudiobookAuthor] Play error:', error)
      toast.error('Ошибка воспроизведения')
    }
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка книг автора...</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Навигация */}
      <button className={styles.backButton} onClick={() => navigate('/audiobooks')}>
        <ArrowLeft className="w-5 h-5" />
        Назад к библиотеке
      </button>

      <div className={styles.content}>
        {/* Заголовок автора */}
        <div className={styles.authorHeader}>
          <div className={styles.authorIcon}>
            <User className="w-16 h-16" />
          </div>
          <h1 className={styles.authorName}>{authorDisplayName}</h1>
          <p className={styles.bookCount}>📚 {books.length} {getBookCountText(books.length)}</p>
        </div>

        {/* Список книг */}
        {books.length === 0 ? (
          <div className={styles.empty}>
            <BookOpen className="w-24 h-24" />
            <p>Книги этого автора не найдены</p>
          </div>
        ) : (
          <div className={styles.bookGrid}>
            {books.map(book => (
              <div key={book.id} className={styles.bookCard}>
                <div className={styles.coverWrapper}>
                  {book.coverUrl ? (
                    <img src={book.coverUrl} alt={book.title} className={styles.cover} />
                  ) : (
                    <div className={styles.coverPlaceholder}>
                      <BookOpen className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <div className={styles.bookInfo}>
                  <h3 className={styles.bookTitle}>{book.title}</h3>
                  {book.series && (
                    <p className={styles.series}>
                      {book.series.name} {book.series.sequence && `#${book.series.sequence}`}
                    </p>
                  )}
                  <button 
                    className={styles.playButton}
                    onClick={() => handlePlayBook(book)}
                  >
                    ▶️ Слушать
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getBookCountText(count: number): string {
  if (count === 1) return 'книга'
  if (count >= 2 && count <= 4) return 'книги'
  return 'книг'
}
