/**
 * Premieres - Премьера
 * Красивые треки с обложками и кнопкой Play
 */

import { useState, useEffect } from 'react'
import { usePlayerActions } from '@/store/player.store'
import { getRandomSongs } from '@/service/subsonic-api'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { toast } from 'react-toastify'
import { Play, Loader2, Heart } from 'lucide-react'
import { useML } from '@/store/ml.store'
import type { ISong } from '@/types/responses/song'

interface PremiereTrack extends ISong {
  isLiked?: boolean
  coverUrl?: string
}

export default function Premieres() {
  const { setSongList } = usePlayerActions()
  const { profile } = useML()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [likedTracks, setLikedTracks] = useState<Set<string>>(new Set())
  const [premieres, setPremieres] = useState<PremiereTrack[]>([])

  // Загружаем реальные треки - недавно добавленные
  useEffect(() => {
    async function loadPremieres() {
      try {
        const songs = await getRandomSongs(20)
        // Берем треки которые еще не лайкнуты (новые для пользователя)
        const newSongs = songs.filter(s => !profile.likedSongIds?.includes(s.id))
        
        // Добавляем URL для обложек используя правильную функцию
        const premieresWithImages = newSongs.map(song => ({
          ...song,
          coverUrl: getSimpleCoverArtUrl(song.coverArt, 'song', '300'),
        }))
        
        console.log('[Premieres] Loaded tracks:', premieresWithImages.length)
        setPremieres(premieresWithImages.slice(0, 8))
      } catch (error) {
        console.error('Ошибка загрузки премьер:', error)
      }
    }
    loadPremieres()
  }, [profile.likedSongIds])

  const handlePlayPremiere = async (trackId: string) => {
    const track = premieres.find(t => t.id === trackId)
    if (!track) return
    
    setIsLoading(trackId)
    
    try {
      setSongList(
        premieres,
        premieres.findIndex(t => t.id === trackId),
        false
      )

      toast.success(`▶️ ${track.title}: запущено`, {
        autoClose: 2000,
      })
    } catch (error) {
      console.error('Ошибка воспроизведения:', error)
      toast.error('Не удалось воспроизвести трек')
    } finally {
      setIsLoading(null)
    }
  }

  const handleToggleLike = async (trackId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const newLiked = new Set(likedTracks)
    if (newLiked.has(trackId)) {
      newLiked.delete(trackId)
    } else {
      newLiked.add(trackId)
    }
    setLikedTracks(newLiked)
    toast.success('❤️ Добавлено в избранное', {
      autoClose: 1500,
    })
  }

  const handlePlayAll = async () => {
    if (premieres.length === 0) return
    
    setIsLoading('all')
    
    try {
      setSongList(
        premieres,
        0,
        false
      )

      toast.success(`▶️ Премьеры: ${premieres.length} треков`, {
        autoClose: 2000,
      })
    } catch (error) {
      console.error('Ошибка воспроизведения:', error)
      toast.error('Не удалось воспроизвести премьеры')
    } finally {
      setIsLoading(null)
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (premieres.length === 0) {
    return (
      <div className="premieres-section">
        <div className="section-header">
          <div className="header-left">
            <Play className="w-6 h-6 text-orange-500" />
            <h2 className="section-title">Премьера</h2>
          </div>
          <p className="section-subtitle">Загрузка новых треков...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="premieres-section">
      <div className="section-header">
        <div className="header-left">
          <Play className="w-6 h-6 text-orange-500" />
          <h2 className="section-title">Премьера</h2>
        </div>
        <p className="section-subtitle">Лучшие новые треки для вас ({premieres.length})</p>
        <button 
          className="play-all-button"
          onClick={handlePlayAll}
          disabled={isLoading === 'all'}
        >
          {isLoading === 'all' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              Сыграть все
            </>
          )}
        </button>
      </div>
      
      <div className="premieres-list">
        {premieres.map((track, index) => (
          <div
            key={track.id}
            className="premiere-track"
            onClick={() => handlePlayPremiere(track.id)}
          >
            <div className="track-index">
              {isLoading === track.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <button className="play-button">
                  <Play className="w-4 h-4 fill-current" />
                </button>
              )}
            </div>
            
            <div className="track-cover">
              {track.coverUrl ? (
                <img
                  src={track.coverUrl}
                  alt={track.title}
                  className="cover-image"
                  onError={(e) => {
                    console.log('[Premieres] Image error for track:', track.title, track.coverUrl)
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const placeholder = target.parentElement?.querySelector('.cover-placeholder')
                    if (placeholder) placeholder.classList.remove('hidden')
                  }}
                />
              ) : null}
              <div className={`cover-placeholder ${track.coverUrl ? '' : ''}`}>
                <span className="cover-icon">🎵</span>
              </div>
            </div>
            
            <div className="track-info">
              <h3 className="track-title">{track.title}</h3>
              <p className="track-artist">{track.artist}</p>
            </div>
            
            <div className="track-actions">
              <button
                className={`like-button ${likedTracks.has(track.id) ? 'liked' : ''}`}
                onClick={(e) => handleToggleLike(track.id, e)}
              >
                <Heart className={`w-4 h-4 ${likedTracks.has(track.id) ? 'fill-red-500 text-red-500' : ''}`} />
              </button>
              <span className="track-duration">
                {formatDuration(track.duration)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Стили */}
      <style>{`
        .premieres-section {
          padding: 40px 24px;
          max-width: 1280px;
          margin: 0 auto;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .section-title {
          font-size: 24px;
          font-weight: 700;
          color: #000;
        }

        .section-subtitle {
          font-size: 14px;
          color: #666;
          flex: 1;
        }

        .play-all-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: #000;
          color: white;
          border: none;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .play-all-button:hover {
          background: #222;
          transform: translateY(-2px);
        }

        .play-all-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .premieres-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .premiere-track {
          display: grid;
          grid-template-columns: 40px 60px 1fr 100px;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          border-radius: 12px;
          background: white;
          transition: all 200ms ease;
          cursor: pointer;
        }

        .premiere-track:hover {
          background: #f5f5f5;
          transform: translateX(4px);
        }

        .track-index {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: #666;
        }

        .play-button {
          background: none;
          border: none;
          cursor: pointer;
          color: #666;
          transition: color 200ms ease;
        }

        .premiere-track:hover .play-button {
          color: #000;
        }

        .track-cover {
          width: 60px;
          height: 60px;
          border-radius: 8px;
          overflow: hidden;
        }

        .cover-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cover-placeholder {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cover-placeholder.hidden {
          display: none;
        }

        .cover-icon {
          font-size: 24px;
        }

        .track-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .track-title {
          font-size: 14px;
          font-weight: 600;
          color: #000;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .track-artist {
          font-size: 13px;
          color: #666;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .track-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
        }

        .like-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #666;
          transition: all 200ms ease;
        }

        .like-button:hover {
          color: #ef4444;
          transform: scale(1.1);
        }

        .like-button.liked {
          color: #ef4444;
        }

        .track-duration {
          font-size: 13px;
          color: #666;
          font-variant-numeric: tabular-nums;
        }

        @media (max-width: 640px) {
          .premieres-section {
            padding: 24px 16px;
          }

          .premiere-track {
            grid-template-columns: 30px 50px 1fr 60px;
          }

          .track-cover {
            width: 50px;
            height: 50px;
          }

          .track-actions {
            gap: 8px;
          }

          .track-duration {
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  )
}
