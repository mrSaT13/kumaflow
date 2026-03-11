import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAudiobookshelfApi, type Audiobook } from '@/service/audiobookshelf-api'
import { useAudiobookshelf } from '@/store/audiobookshelf.store'
import { usePlayerActions, usePlayerSonglist, usePlayerIsPlaying } from '@/store/player.store'
import { toast } from 'react-toastify'
import { ArrowLeft, Play, Pause, SkipForward, SkipBack, BookOpen } from 'lucide-react'
import styles from './audiobook-detail.module.css'

interface AudiobookDetail extends Audiobook {
  description?: string
  publishedYear?: string
  publisher?: string
  language?: string
  explicit?: boolean
  asin?: string
  isbn?: string
  tracks?: Array<{
    index: number
    title?: string
    duration: number
    filename: string
  }>
}

export default function AudiobookDetail() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const { config } = useAudiobookshelf()
  const { setSongList, clearPlayerState, setIsPlaying: setPlayerIsPlaying } = usePlayerActions()
  const { currentSong } = usePlayerSonglist()
  const playerIsPlaying = usePlayerIsPlaying()
  const api = getAudiobookshelfApi()

  const [book, setBook] = useState<AudiobookDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)

  // Проверяем играет ли эта книга сейчас в плеере
  useEffect(() => {
    if (currentSong?.isAudiobook && currentSong.id === bookId) {
      // Книга играет - синхронизируем с состоянием плеера
      setIsPlaying(playerIsPlaying)
      // Обновляем текущую главу из плеера
      if ((currentSong as any).audiobookData?.currentTrackIndex !== undefined) {
        setCurrentTrackIndex((currentSong as any).audiobookData.currentTrackIndex)
      }
    } else {
      // Книга не играет или другая книга
      setIsPlaying(false)
    }
  }, [currentSong, bookId, playerIsPlaying])

  // Загрузка деталей книги
  useEffect(() => {
    if (bookId) {
      // Если интеграция не включена - редирект на настройки
      if (!config.enabled) {
        toast.info('📚 Сначала настройте Audiobookshelf')
        navigate('/settings#audiobookshelf')
        return
      }
      
      // Если не подключено - показываем ошибку
      if (!config.isConnected) {
        return // Ошибка отобразится в UI
      }
      
      loadBookDetails(bookId)
    }
  }, [bookId, config.enabled, config.isConnected])

  const loadBookDetails = async (id: string) => {
    if (!bookId) return

    setIsLoading(true)
    try {
      const data = await api.getAudiobookDetails(id)
      console.log('[AudiobookDetail] Loaded book:', data)
      console.log('[AudiobookDetail] Book progress:', data?.progress)
      console.log('[AudiobookDetail] Book tracks:', data?.tracks?.length)
      
      if (data) {
        // Если прогресса нет в данных - загрузим отдельно
        let bookData = data as AudiobookDetail
        if (!bookData.progress) {
          try {
            const progress = await api.getProgress(id)
            console.log('[AudiobookDetail] Loaded progress separately:', progress)
            bookData = {
              ...bookData,
              progress: progress ? {
                currentTime: progress.currentTime,
                percentage: (progress.currentTime / progress.duration) * 100,
                isFinished: progress.isFinished,
              } : undefined,
            }
          } catch (progressError) {
            console.warn('[AudiobookDetail] Failed to load progress:', progressError)
          }
        }
        
        setBook(bookData)
      } else {
        toast.error('Книга не найдена')
        navigate('/audiobooks')
      }
    } catch (error) {
      console.error('[AudiobookDetail] Failed to load book:', error)
      toast.error('Ошибка загрузки книги')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlay = async () => {
    if (!book) return

    // Если книга уже играет - ставим на паузу через глобальный плеер
    if (isPlaying) {
      setPlayerIsPlaying(false)
      toast.info('⏸️ Пауза')
      return
    }

    try {
      setIsPlaying(true)
      toast.info(`📖 Запуск: ${book.title}`)

      // Получаем сессию воспроизведения для получения URL всех глав
      const session: any = await api.getPlaybackSession(book.id)
      console.log('[AudiobookDetail] Session:', session)

      if (!session) {
        toast.error('Не удалось получить сессию воспроизведения')
        setIsPlaying(false)
        return
      }

      // Очищаем очередь перед запуском книги
      clearPlayerState()

      // Определяем с какой главы начать
      let startTrackIndex = 0

      // Если есть прогресс и треки - находим текущую главу
      if (progress > 0 && book.tracks && book.tracks.length > 0) {
        let accumulatedTime = 0
        for (let i = 0; i < book.tracks.length; i++) {
          accumulatedTime += book.tracks[i].duration
          if (accumulatedTime > currentTime) {
            startTrackIndex = i
            break
          }
        }
      }

      // Создаём плейлист из ВСЕХ глав книги с РАЗНЫМИ URL
      const playlist = []
      if (session.audioTracks && session.audioTracks.length > 0) {
        // Используем audioTracks из сессии - у каждой главы свой URL
        for (let i = 0; i < session.audioTracks.length; i++) {
          const audioTrack = session.audioTracks[i]
          const trackUrl = `${api.getBaseUrl()}${audioTrack.contentUrl}?token=${api.getApiKey()}`
          
          playlist.push({
            id: `${book.id}-track-${i}`,
            title: `${book.title} - Глава ${i + 1}`,
            artist: book.author,
            album: book.series?.name || '',
            coverUrl: book.coverUrl,
            url: trackUrl,
            duration: audioTrack.duration,
            isAudiobook: true,
            audiobookData: {
              bookId: book.id,
              trackIndex: i,
              totalTracks: session.audioTracks.length,
            },
          })
        }
      } else {
        // Если audioTracks нет - создаём один трек
        const streamUrl = await api.getStreamUrl(book.id)
        playlist.push({
          id: book.id,
          title: book.title,
          artist: book.author,
          album: book.series?.name || '',
          coverUrl: book.coverUrl,
          url: streamUrl,
          duration: book.duration,
          isAudiobook: true,
          audiobookData: {
            bookId: book.id,
            trackIndex: 0,
            totalTracks: 1,
          },
        })
      }

      console.log('[AudiobookDetail] Playlist created:', playlist.length, 'tracks')
      console.log('[AudiobookDetail] Starting from track:', startTrackIndex)

      // Запускаем через глобальный плеер с нужной главы
      setSongList(playlist, startTrackIndex)
      
      toast.success(`📚 Добавлено глав: ${playlist.length}`, { type: 'success' })
    } catch (error) {
      console.error('[AudiobookDetail] Play failed:', error)
      toast.error('Ошибка воспроизведения')
      setIsPlaying(false)
    }
  }

  const handlePlayTrack = async (trackIndex: number) => {
    if (!book) return

    try {
      setCurrentTrackIndex(trackIndex)
      setIsPlaying(true)
      toast.info(`📖 Запуск главы ${trackIndex + 1}`)

      // Очищаем очередь перед запуском
      clearPlayerState()

      // Для воспроизведения конкретного трека
      const streamUrl = await api.getStreamUrl(book.id)

      // Создаём трек с текущей главой
      const bookAsTrack: any = {
        id: book.id,
        title: `${book.title} - Глава ${trackIndex + 1}`,
        artist: book.author,
        album: book.series?.name || '',
        coverUrl: book.coverUrl,
        url: streamUrl,
        duration: book.duration,
        isAudiobook: true,
        audiobookData: {
          bookId: book.id,
          tracks: book.tracks || [],
          currentTrackIndex: trackIndex,
        },
      }

      setSongList([bookAsTrack], 0)
    } catch (error) {
      console.error('[AudiobookDetail] Play track failed:', error)
      toast.error('Ошибка воспроизведения главы')
    }
  }

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}ч ${minutes}м ${secs}с`
    }
    return `${minutes}м ${secs}с`
  }

  // Если не подключено
  if (!config.enabled || !config.isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <BookOpen className={styles.errorIcon} />
          <h2>Audiobookshelf не подключён</h2>
          <p>Настройте подключение к вашему серверу Audiobookshelf в настройках</p>
          <button onClick={() => navigate('/settings#audiobookshelf')}>
            ⚙️ Открыть настройки
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className="animate-spin text-4xl">⏳</div>
          <p>Загрузка книги...</p>
        </div>
      </div>
    )
  }

  if (!book) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Книга не найдена</p>
          <button onClick={() => navigate('/audiobooks')}>
            ← Назад к библиотеке
          </button>
        </div>
      </div>
    )
  }

  const progress = book.progress?.percentage || 0
  const isFinished = book.progress?.isFinished || false
  const currentTime = book.progress?.currentTime || 0

  return (
    <div className={styles.container}>
      {/* Навигация */}
      <button className={styles.backButton} onClick={() => navigate('/audiobooks')}>
        <ArrowLeft className="w-5 h-5" />
        Назад к библиотеке
      </button>

      <div className={styles.content}>
        {/* Обложка и информация */}
        <div className={styles.header}>
          <div className={styles.coverWrapper}>
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} className={styles.cover} />
            ) : (
              <div className={styles.coverPlaceholder}>
                <BookOpen className="w-24 h-24" />
              </div>
            )}

            {progress > 0 && (
              <div className={styles.progressOverlay}>
                <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                <span className={styles.progressText}>{Math.round(progress)}%</span>
              </div>
            )}
          </div>

          <div className={styles.info}>
            <h1 className={styles.title}>{book.title}</h1>
            
            {book.series && (
              <p className={styles.series}>
                Серия: {book.series.name} {book.series.sequence && `#${book.series.sequence}`}
              </p>
            )}

            <p className={styles.author}>📝 {book.author}</p>
            
            {book.narrator && (
              <p className={styles.narrator}>🎙️ {book.narrator}</p>
            )}

            <div className={styles.meta}>
              <span>⏱️ {formatDuration(book.duration)}</span>
              {book.publishedYear && <span>📅 {book.publishedYear}</span>}
              {book.genres.length > 0 && (
                <span>🏷️ {book.genres.join(', ')}</span>
              )}
            </div>

            {isFinished && (
              <div className={styles.finishedBadge}>✓ Прочитано</div>
            )}

            {/* Прогресс чтения */}
            {progress > 0 && !isFinished && (
              <div className={styles.progressSection}>
                <div className={styles.progressHeader}>
                  <span className={styles.progressLabel}>Прогресс:</span>
                  <span className={styles.progressPercent}>{Math.round(progress)}%</span>
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
                <div className={styles.progressTime}>
                  <span>{formatDuration(currentTime)}</span>
                  <span> / </span>
                  <span>{formatDuration(book.duration)}</span>
                </div>
              </div>
            )}

            {/* Кнопка воспроизведения */}
            <div className={styles.playButtons}>
              <button
                className={styles.playButtonPrimary}
                onClick={handlePlay}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-6 h-6" />
                    {progress > 0 ? `Пауза (${Math.round(progress)}%)` : 'Пауза'}
                  </>
                ) : (
                  <>
                    <Play className="w-6 h-6" />
                    {progress > 0 ? `Продолжить (${Math.round(progress)}%)` : 'Слушать'}
                  </>
                )}
              </button>

              {progress > 0 && !isFinished && (
                <button
                  className={styles.playButtonSecondary}
                  onClick={() => {
                    // Найти текущую главу и запустить с неё
                    if (book.tracks && book.tracks.length > 0) {
                      let accumulatedTime = 0
                      for (let i = 0; i < book.tracks.length; i++) {
                        accumulatedTime += book.tracks[i].duration
                        if (accumulatedTime > currentTime) {
                          handlePlayTrack(i)
                          break
                        }
                      }
                    }
                  }}
                >
                  📖 С последней главы
                </button>
              )}
            </div>

            {progress > 0 && !isFinished && (
              <p className={styles.progressInfo}>
                Прогресс: {formatDuration(currentTime)} из {formatDuration(book.duration)}
              </p>
            )}
          </div>
        </div>

        {/* Описание */}
        {book.description && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>📖 Описание</h2>
            <p className={styles.description}>{book.description}</p>
          </div>
        )}

        {/* Треки/Главы */}
        {book.tracks && book.tracks.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>📚 Главы ({book.tracks.length})</h2>
            <div className={styles.trackList}>
              {book.tracks.map((track, index) => (
                <button
                  key={track.index}
                  className={`${styles.track} ${currentTrackIndex === index && isPlaying ? styles.playing : ''}`}
                  onClick={() => handlePlayTrack(index)}
                >
                  <div className={styles.trackNumber}>{index + 1}</div>
                  <div className={styles.trackInfo}>
                    <div className={styles.trackTitle}>
                      {track.title || `Глава ${index + 1}`}
                    </div>
                    <div className={styles.trackDuration}>
                      {formatDuration(track.duration)}
                    </div>
                  </div>
                  {currentTrackIndex === index && isPlaying && (
                    <div className={styles.playingIndicator}>
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
