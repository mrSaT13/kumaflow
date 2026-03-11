/**
 * Artist Radio - В стиле
 * Красивые круглые карточки артистов с обложками и кнопкой Play
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { generateArtistRadio } from '@/service/ml-wave-service'
import { subsonic } from '@/service/subsonic'
import { toast } from 'react-toastify'
import { Play, Loader2 } from 'lucide-react'
import { useML } from '@/store/ml.store'
import type { IArtist } from '@/types/responses/artist'

interface ArtistWithImage extends IArtist {
  imageUrl?: string
}

export default function ArtistRadio() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const { profile } = useML()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [artists, setArtists] = useState<ArtistWithImage[]>([])

  // Загружаем информацию об артистах с картинками
  useEffect(() => {
    async function loadArtists() {
      console.log('[ArtistRadio] Starting to load artists...', profile.preferredArtists)
      
      const topArtistIds = Object.entries(profile.preferredArtists || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([id, _]) => id)

      console.log('[ArtistRadio] Top artist IDs:', topArtistIds)

      const loadedArtists: ArtistWithImage[] = []
      for (const artistId of topArtistIds) {
        try {
          const artist = await subsonic.artists.getOne(artistId)
          console.log('[ArtistRadio] Loaded artist:', artist?.name, 'coverArt:', artist?.coverArt)
          
          if (artist && artist.coverArt) {
            // Получаем данные авторизации
            let username = 'Antidote'  // ЗАГЛУШКА - УДАЛИТЬ ПОСЛЕ ТЕСТА!
            let token = 'giKMg7aDs22yq2A'  // ЗАГЛУШКА - УДАЛИТЬ ПОСЛЕ ТЕСТА!
            
            console.log('[ArtistRadio] Using hardcoded auth:', { username, token: '***' })
            
            // Формируем URL с правильными параметрами авторизации
            // Для артистов используем type=artist!
            const imageUrl = `/rest/getCoverArt?id=${artist.coverArt}&u=${username}&t=${token}&v=1.16.1&c=KumaFlow&type=artist`
            
            console.log(`[ArtistRadio] Artist ${artist.name}: url=${imageUrl}`)
            
            loadedArtists.push({
              ...artist,
              imageUrl,
            })
          } else {
            console.log('[ArtistRadio] No coverArt for artist:', artist?.name)
          }
        } catch (error) {
          console.error('Ошибка загрузки артиста:', error)
        }
      }
      console.log('[ArtistRadio] Loaded artists count:', loadedArtists.length)
      setArtists(loadedArtists)
    }
    loadArtists()
  }, [profile.preferredArtists])

  const handlePlayArtistRadio = async (artistId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    
    if (isLoading) return
    
    setIsLoading(artistId)
    
    try {
      const result = await generateArtistRadio(artistId, 25)
      
      if (result.songs.length > 0) {
        setSongList(
          result.songs,
          0,
          false
        )

        toast.success('▶️ Радио артиста запущено!', {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('Ошибка запуска радио:', error)
      toast.error('Не удалось запустить радио артиста')
    } finally {
      setIsLoading(null)
    }
  }

  const handleNavigateToArtist = (artistId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate(`/library/artists/${artistId}`)
  }

  if (artists.length === 0) {
    return (
      <div className="artist-radio-section">
        <div className="section-header">
          <h2 className="section-title">🎤 В стиле</h2>
          <p className="section-subtitle">Загрузка артистов...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="artist-radio-section">
      <div className="section-header">
        <h2 className="section-title">🎤 В стиле</h2>
        <p className="section-subtitle">Похожие исполнители и музыка</p>
        <button 
          className="see-all"
          onClick={() => navigate('/library/artists')}
        >
          Все артисты →
        </button>
      </div>
      
      {/* Горизонтальный скролл артистов */}
      <div className="artists-scroll">
        {artists.map((artist) => (
          <div
            key={artist.id}
            className="artist-chip"
            title={artist.name}
          >
            {/* Обложка артиста */}
            <div className="artist-cover-wrapper">
              <div className={`artist-placeholder ${artist.imageUrl ? 'loading' : ''}`}>
                <span className="placeholder-icon">🎤</span>
              </div>
              {artist.imageUrl && (
                <img
                  src={artist.imageUrl}
                  alt={artist.name}
                  className="artist-cover"
                  onLoad={() => {
                    console.log('[ArtistRadio] Image loaded:', artist.name)
                    const placeholder = document.querySelector('.artist-placeholder')
                    if (placeholder) placeholder.classList.add('hidden')
                  }}
                  onError={(e) => {
                    console.log('[ArtistRadio] Image error:', artist.name, artist.imageUrl)
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
              )}
              
              {/* Кнопка Play поверх обложки */}
              <button
                className="play-overlay"
                onClick={(e) => handlePlayArtistRadio(artist.id, e)}
                disabled={isLoading === artist.id}
              >
                {isLoading === artist.id ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Play className="w-6 h-6 fill-white" />
                )}
              </button>
            </div>
            
            {/* Имя артиста */}
            <div className="artist-info">
              <span className="artist-name" onClick={(e) => handleNavigateToArtist(artist.id, e)}>
                {artist.name}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Стили */}
      <style>{`
        .artist-radio-section {
          padding: 40px 24px;
          max-width: 1280px;
          margin: 0 auto;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
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
          margin-left: 12px;
        }

        .see-all {
          font-size: 14px;
          font-weight: 600;
          color: #666;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 200ms ease;
        }

        .see-all:hover {
          color: #000;
        }

        .artists-scroll {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding: 8px 0;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        .artists-scroll::-webkit-scrollbar {
          height: 8px;
        }

        .artists-scroll::-webkit-scrollbar-track {
          background: #f0f0f0;
          border-radius: 4px;
        }

        .artists-scroll::-webkit-scrollbar-thumb {
          background: #c0c0c0;
          border-radius: 4px;
        }

        .artist-chip {
          flex: 0 0 160px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: transform 200ms ease;
        }

        .artist-chip:hover {
          transform: scale(1.05);
        }

        .artist-cover-wrapper {
          position: relative;
          width: 140px;
          height: 140px;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .artist-cover {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .artist-placeholder {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 200ms ease;
        }

        .artist-placeholder.hidden {
          opacity: 0;
          pointer-events: none;
        }

        .artist-placeholder.loading {
          opacity: 1;
        }

        .placeholder-icon {
          font-size: 48px;
          opacity: 0.8;
        }

        .play-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 200ms ease;
          border: none;
          cursor: pointer;
          color: white;
        }

        .artist-cover-wrapper:hover .play-overlay {
          opacity: 1;
        }

        .play-overlay:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .artist-info {
          text-align: center;
        }

        .artist-name {
          font-size: 14px;
          font-weight: 600;
          color: #333;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 140px;
          display: block;
          transition: color 200ms ease;
        }

        .artist-name:hover {
          color: #667eea;
          text-decoration: underline;
        }

        @media (max-width: 640px) {
          .artist-radio-section {
            padding: 24px 16px;
          }

          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .section-subtitle {
            margin-left: 0;
          }

          .artist-chip {
            flex: 0 0 120px;
          }

          .artist-cover-wrapper {
            width: 100px;
            height: 100px;
          }

          .artist-name {
            font-size: 12px;
            max-width: 100px;
          }
        }
      `}</style>
    </div>
  )
}
