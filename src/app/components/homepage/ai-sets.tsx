/**
 * AI Sets - AI-генерация плейлистов
 * Табы: топ | по жанру | под настроение | под занятие
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { generateActivityMix, generateMoodMix } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { Sparkles } from 'lucide-react'

type AIFilter = 'top' | 'genre' | 'mood' | 'activity'

interface AIPlaylist {
  id: string
  title: string
  description: string
  gradient: string
  tags: string[]
  type: 'mood' | 'activity'
}

export default function AISets() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const { profile, ratings } = useML()
  const [activeFilter, setActiveFilter] = useState<AIFilter>('top')
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const aiPlaylists: AIPlaylist[] = [
    {
      id: 'bigbeat',
      title: 'Биг-бит',
      description: 'Энергичный бит для активности',
      gradient: 'from-cyan-400 to-blue-500',
      tags: ['электроника', 'энергия'],
      type: 'activity',
    },
    {
      id: 'workout',
      title: 'Тренируюсь',
      description: 'Мощные треки для спорта',
      gradient: 'from-purple-400 to-pink-500',
      tags: ['спорт', 'мотивация'],
      type: 'activity',
    },
    {
      id: 'energetic',
      title: 'Энергичное',
      description: 'Заряд бодрости на весь день',
      gradient: 'from-orange-400 to-red-500',
      tags: ['поп', 'рок'],
      type: 'mood',
    },
    {
      id: 'wakeup',
      title: 'Просыпаюсь',
      description: 'Мягкое пробуждение',
      gradient: 'from-yellow-400 to-orange-500',
      tags: ['утро', 'спокойствие'],
      type: 'activity',
    },
    {
      id: 'focus',
      title: 'Фокус',
      description: 'Для работы и учёбы',
      gradient: 'from-slate-400 to-gray-600',
      tags: ['работа', 'концентрация'],
      type: 'activity',
    },
    {
      id: 'chill',
      title: 'Расслабление',
      description: 'Для отдыха и релакса',
      gradient: 'from-green-400 to-teal-500',
      tags: ['отдых', 'спокойствие'],
      type: 'mood',
    },
  ]

  const handlePlayAIPlaylist = async (playlist: AIPlaylist) => {
    if (isLoading) return
    
    setIsLoading(playlist.id)
    
    try {
      let songs
      if (playlist.type === 'activity') {
        const result = await generateActivityMix(
          playlist.id,
          profile.likedSongIds || [],
          ratings,
          profile.preferredGenres,
          25
        )
        songs = result.songs
      } else {
        const result = await generateMoodMix(
          profile.likedSongIds || [],
          ratings,
          profile.preferredGenres,
          playlist.id,
          25
        )
        songs = result.songs
      }

      if (songs.length > 0) {
        setSongList(
          songs,
          0,
          false
        )

        toast.success(`▶️ ${playlist.title}: плейлист готов!`, {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('Ошибка генерации AI плейлиста:', error)
      toast.error(`Не удалось сгенерировать "${playlist.title}"`)
    } finally {
      setIsLoading(null)
    }
  }

  // Фильтрация по активному табу
  const filteredPlaylists = aiPlaylists.filter(playlist => {
    if (activeFilter === 'top') return true
    if (activeFilter === 'mood') return playlist.type === 'mood'
    if (activeFilter === 'activity') return playlist.type === 'activity'
    if (activeFilter === 'genre') return true // TODO: жанровые плейлисты
    return true
  })

  return (
    <div className="ai-sets-section">
      <div className="section-header">
        <h2 className="section-title">🤖 Свели в AI-сет</h2>
        <p className="section-subtitle">Персональные плейлисты на основе ваших вкусов</p>
      </div>

      {/* Табы фильтров */}
      <div className="filter-tabs">
        <button
          className={`tab ${activeFilter === 'top' ? 'active' : ''}`}
          onClick={() => setActiveFilter('top')}
        >
          топ
        </button>
        <button
          className={`tab ${activeFilter === 'genre' ? 'active' : ''}`}
          onClick={() => setActiveFilter('genre')}
        >
          по жанру
        </button>
        <button
          className={`tab ${activeFilter === 'mood' ? 'active' : ''}`}
          onClick={() => setActiveFilter('mood')}
        >
          под настроение
        </button>
        <button
          className={`tab ${activeFilter === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveFilter('activity')}
        >
          под занятие
        </button>
      </div>

      {/* Сетка AI-плейлистов */}
      <div className="ai-playlists-grid">
        {filteredPlaylists.map((playlist) => (
          <div
            key={playlist.id}
            className="ai-playlist-card"
            onClick={() => handlePlayAIPlaylist(playlist)}
          >
            <div className="card-background">
              <div className={`absolute inset-0 bg-gradient-to-br ${playlist.gradient} opacity-90`} />
            </div>
            
            <div className="card-content">
              <Sparkles className="w-6 h-6 text-white/80" />
              <h3 className="card-title">{playlist.title}</h3>
              <p className="card-description">{playlist.description}</p>
              <div className="card-tags">
                {playlist.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
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
        .ai-sets-section {
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

        .filter-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
          overflow-x: auto;
        }

        .tab {
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          background: #f0f0f0;
          color: #666;
          border: none;
          cursor: pointer;
          transition: all 200ms ease;
          white-space: nowrap;
        }

        .tab:hover {
          background: #e0e0e0;
        }

        .tab.active {
          background: #000;
          color: white;
        }

        .ai-playlists-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .ai-playlist-card {
          height: 200px;
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          cursor: pointer;
          transition: transform 200ms ease;
        }

        .ai-playlist-card:hover {
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
          margin: 8px 0;
        }

        .card-description {
          font-size: 13px;
          opacity: 0.9;
          margin-bottom: 12px;
          flex: 1;
        }

        .card-tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }

        .tag {
          font-size: 11px;
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          backdrop-filter: blur(10px);
        }

        .card-play {
          font-size: 24px;
          align-self: flex-end;
          animation: pulse 2s infinite;
        }

        .card-loading {
          font-size: 14px;
          opacity: 0.9;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 640px) {
          .ai-sets-section {
            padding: 24px 16px;
          }

          .ai-playlists-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
