/**
 * Genre Exploration - Исследуйте жанр
 * Овальные карточки с градиентами и красивыми кнопками Play
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { getSongsByGenre } from '@/service/subsonic-api'
import { toast } from 'react-toastify'
import { Play, Loader2, Disc } from 'lucide-react'

// Градиенты для жанров
const GENRE_GRADIENTS: Record<string, string> = {
  'Rock': 'from-red-600 via-red-500 to-orange-500',
  'Metal': 'from-gray-900 via-gray-800 to-black',
  'Pop': 'from-pink-500 via-purple-500 to-indigo-500',
  'Hip-Hop': 'from-yellow-600 via-orange-600 to-red-700',
  'Electronic': 'from-blue-600 via-purple-600 to-pink-600',
  'Jazz': 'from-amber-700 via-amber-600 to-orange-700',
  'Classical': 'from-indigo-900 via-purple-900 to-indigo-800',
  'R&B': 'from-purple-800 via-purple-700 to-pink-800',
  'Latin': 'from-red-600 via-orange-500 to-yellow-500',
  'Indie': 'from-teal-500 via-emerald-500 to-green-600',
  'Folk': 'from-green-700 via-emerald-600 to-teal-700',
}

interface GenrePlaylist {
  id: string
  name: string
  gradient: string
  trackCount?: number
}

export default function GenreExploration() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  // Популярные жанры для исследования
  const genrePlaylists: GenrePlaylist[] = [
    { id: 'rock', name: 'Рок хиты', gradient: GENRE_GRADIENTS['Rock'] },
    { id: 'pop', name: 'Поп хиты', gradient: GENRE_GRADIENTS['Pop'] },
    { id: 'hip-hop', name: 'Хип-хоп', gradient: GENRE_GRADIENTS['Hip-Hop'] },
    { id: 'electronic', name: 'Электроника', gradient: GENRE_GRADIENTS['Electronic'] },
    { id: 'jazz', name: 'Джаз', gradient: GENRE_GRADIENTS['Jazz'] },
    { id: 'metal', name: 'Метал', gradient: GENRE_GRADIENTS['Metal'] },
    { id: 'indie', name: 'Инди', gradient: GENRE_GRADIENTS['Indie'] },
    { id: 'rnb', name: 'R&B', gradient: GENRE_GRADIENTS['R&B'] },
  ]

  const handlePlayGenre = async (genreName: string, gradient: string) => {
    if (isLoading) return
    
    setIsLoading(genreName)
    
    try {
      const songs = await getSongsByGenre(genreName, 50)
      
      if (songs.length === 0) {
        toast.error(`Нет треков в жанре "${genreName}"`)
        setIsLoading(null)
        return
      }

      setSongList(
        songs,
        0,
        false
      )

      toast.success(`▶️ Запущено: ${genreName} (${songs.length} треков)`, {
        autoClose: 2000,
      })
    } catch (error) {
      console.error('Ошибка запуска жанра:', error)
      toast.error(`Не удалось запустить жанр "${genreName}"`)
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="genre-exploration-section">
      <div className="section-header">
        <h2 className="section-title">Исследуйте жанр</h2>
        <button 
          className="see-all"
          onClick={() => navigate('/genres')}
        >
          Все жанры →
        </button>
      </div>
      
      <div className="genre-scroll">
        {genrePlaylists.map((playlist) => (
          <div
            key={playlist.id}
            className="genre-card"
            onClick={() => handlePlayGenre(playlist.name.split(' ')[0], playlist.gradient)}
          >
            <div className="genre-background">
              <div className={`absolute inset-0 bg-gradient-to-br ${playlist.gradient} opacity-90`} />
            </div>
            
            <div className="genre-content">
              <Disc className="w-8 h-8 text-white/80" />
              <h3 className="genre-name">{playlist.name}</h3>
              {isLoading === playlist.name ? (
                <div className="genre-loading">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <button className="genre-play-button">
                  <Play className="w-5 h-5 fill-white" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Стили */}
      <style>{`
        .genre-exploration-section {
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

        .genre-scroll {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding: 8px 0;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }

        .genre-scroll::-webkit-scrollbar {
          height: 8px;
        }

        .genre-scroll::-webkit-scrollbar-track {
          background: #f0f0f0;
          border-radius: 4px;
        }

        .genre-scroll::-webkit-scrollbar-thumb {
          background: #c0c0c0;
          border-radius: 4px;
        }

        .genre-card {
          flex: 0 0 200px;
          height: 120px;
          border-radius: 60px;
          overflow: hidden;
          position: relative;
          cursor: pointer;
          transition: transform 200ms ease;
        }

        .genre-card:hover {
          transform: scale(1.05);
        }

        .genre-background {
          position: absolute;
          inset: 0;
        }

        .genre-content {
          position: relative;
          z-index: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: white;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        }

        .genre-name {
          font-size: 16px;
          font-weight: 700;
          text-align: center;
        }

        .genre-play-button {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 200ms ease;
          backdrop-filter: blur(10px);
        }

        .genre-play-button:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.1);
        }

        .genre-loading {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 640px) {
          .genre-exploration-section {
            padding: 24px 16px;
          }

          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .genre-card {
            flex: 0 0 160px;
            height: 100px;
          }

          .genre-name {
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  )
}
