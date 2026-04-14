/**
 * Curated Playlists - Настроили для вас
 * Персональные подборки каждый день
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { generateDailyMix, generateDiscoverWeekly } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { Calendar, Sparkles, Clock, Compass } from 'lucide-react'

interface CuratedPlaylist {
  id: string
  title: string
  subtitle: string
  description: string
  gradient: string
  icon: React.ComponentType<{ className?: string }>
  type: 'daily' | 'discover' | 'dejavu' | 'hidden'
}

export default function CuratedPlaylists() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const { profile, ratings } = useML()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const curatedPlaylists: CuratedPlaylist[] = [
    {
      id: 'personal_premieres',
      title: 'Премьера',
      subtitle: 'Новые треки от любимых артистов',
      description: 'Обновляется ежедневно',
      gradient: 'from-orange-400 to-red-500',
      icon: Sparkles,
      type: 'daily',
    },
    {
      id: 'hidden_gems',
      title: 'Тайник',
      subtitle: 'Скрытые жемчужины для вас',
      description: 'Треки которые вы могли пропустить',
      gradient: 'from-blue-400 to-indigo-500',
      icon: Compass,
      type: 'discover',
    },
    {
      id: 'dejavu',
      title: 'Дежавю',
      subtitle: 'Треки, которые вы давно не слушали',
      description: 'Вспомним старое',
      gradient: 'from-purple-400 to-pink-500',
      icon: Clock,
      type: 'dejavu',
    },
    {
      id: 'daily_mix',
      title: 'Плейлист дня',
      subtitle: 'Обновляется каждые 24 часа',
      description: 'Ваш персональный микс',
      gradient: 'from-green-400 to-emerald-500',
      icon: Calendar,
      type: 'daily',
    },
  ]

  const handlePlayCurated = async (playlist: CuratedPlaylist) => {
    if (isLoading) return
    
    setIsLoading(playlist.id)
    
    try {
      let result
      if (playlist.type === 'daily') {
        result = await generateDailyMix(
          profile.likedSongIds || [],
          profile.preferredGenres,
          profile.preferredArtists || {},
          profile.ratings || {},
          25
        )
      } else if (playlist.type === 'discover') {
        result = await generateDiscoverWeekly(
          profile.likedSongIds || [],
          profile.preferredGenres,
          25
        )
      } else {
        // Другие типы плейлистов - заглушка
        toast.info('Этот плейлист в разработке', {
          autoClose: 2000,
        })
        setIsLoading(null)
        return
      }

      if (result.playlist.songs.length > 0) {
        setSongList(
          result.playlist.songs,
          0,
          false
        )

        toast.success(`▶️ ${playlist.title}: плейлист готов!`, {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('Ошибка генерации плейлиста:', error)
      toast.error(`Не удалось сгенерировать "${playlist.title}"`)
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="curated-section">
      <div className="section-header">
        <h2 className="section-title">⚡ Настроили для вас</h2>
        <p className="section-subtitle">Персональные подборки каждый день</p>
      </div>

      <div className="curated-grid">
        {curatedPlaylists.map((playlist) => (
          <div
            key={playlist.id}
            className="curated-card"
            onClick={() => handlePlayCurated(playlist)}
          >
            <div className="card-background">
              <div className={`absolute inset-0 bg-gradient-to-br ${playlist.gradient} opacity-90`} />
            </div>
            
            <div className="card-content">
              <playlist.icon className="w-8 h-8 text-white/80" />
              <h3 className="card-title">{playlist.title}</h3>
              <p className="card-subtitle">{playlist.subtitle}</p>
              <p className="card-description">{playlist.description}</p>
              {isLoading === playlist.id ? (
                <span className="card-loading">Генерация...</span>
              ) : (
                <span className="card-play">▶️</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Стили */}
      <style>{`
        .curated-section {
          padding: 40px 24px;
          max-width: 1280px;
          margin: 0 auto;
        }

        .section-header {
          margin-bottom: 20px;
        }

        .section-title {
          font-size: 24px;
          font-weight: 700;
          color: #000;
          margin-bottom: 4px;
        }

        .section-subtitle {
          font-size: 14px;
          color: #666;
        }

        .curated-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .curated-card {
          height: 220px;
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          cursor: pointer;
          transition: transform 200ms ease;
        }

        .curated-card:hover {
          transform: scale(1.03);
        }

        .card-background {
          position: absolute;
          inset: 0;
        }

        .card-content {
          position: relative;
          z-index: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 16px;
          color: white;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        }

        .card-title {
          font-size: 20px;
          font-weight: 700;
          margin: 8px 0 4px;
        }

        .card-subtitle {
          font-size: 13px;
          opacity: 0.95;
          margin-bottom: 4px;
        }

        .card-description {
          font-size: 12px;
          opacity: 0.85;
          flex: 1;
        }

        .card-play {
          font-size: 24px;
          align-self: flex-end;
          animation: pulse 2s infinite;
        }

        .card-loading {
          font-size: 14px;
          opacity: 0.9;
          align-self: flex-end;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 640px) {
          .curated-section {
            padding: 24px 16px;
          }

          .curated-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
