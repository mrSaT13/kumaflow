/**
 * Discovery - Больше открытий
 * Filter tabs: топ | по языку | по жанру | под настроение
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { generateActivityMix } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { Compass } from 'lucide-react'

type DiscoveryFilter = 'top' | 'language' | 'genre' | 'mood'

interface DiscoveryCard {
  id: string
  title: string
  subtitle: string
  gradient: string
  filter: DiscoveryFilter
}

export default function Discovery() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const { profile, ratings } = useML()
  const [activeFilter, setActiveFilter] = useState<DiscoveryFilter>('top')
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const discoveryCards: DiscoveryCard[] = [
    {
      id: 'running',
      title: 'Бег',
      subtitle: 'Моя волна под занятие',
      gradient: 'from-purple-500 to-indigo-600',
      filter: 'mood',
    },
    {
      id: '2020s',
      title: '2020-е',
      subtitle: 'Моя волна по эпохе',
      gradient: 'from-pink-500 to-rose-600',
      filter: 'genre',
    },
    {
      id: 'workout',
      title: 'Тренируюсь',
      subtitle: 'Моя волна под занятие',
      gradient: 'from-blue-500 to-cyan-600',
      filter: 'mood',
    },
    {
      id: 'postgrunge',
      title: 'Постгранж',
      subtitle: 'Моя волна по жанру',
      gradient: 'from-orange-500 to-red-600',
      filter: 'genre',
    },
    {
      id: 'focus',
      title: 'Фокус',
      subtitle: 'Для работы и учёбы',
      gradient: 'from-slate-500 to-gray-600',
      filter: 'mood',
    },
    {
      id: 'chill',
      title: 'Чилл',
      subtitle: 'Расслабленные треки',
      gradient: 'from-green-500 to-teal-600',
      filter: 'mood',
    },
  ]

  const handlePlayDiscovery = async (card: DiscoveryCard) => {
    if (isLoading) return
    
    setIsLoading(card.id)
    
    try {
      let songs
      if (card.filter === 'mood') {
        const result = await generateActivityMix(
          card.id,
          profile.likedSongIds || [],
          ratings,
          profile.preferredGenres,
          25
        )
        songs = result.songs
      } else {
        // TODO: Жанр/эпоха - заглушка
        toast.info('Этот тип плейлиста в разработке', {
          autoClose: 2000,
        })
        setIsLoading(null)
        return
      }

      if (songs.length > 0) {
        setSongList(
          songs,
          0,
          false
        )

        toast.success(`▶️ ${card.title}: плейлист готов!`, {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('Ошибка генерации Discovery:', error)
      toast.error(`Не удалось сгенерировать "${card.title}"`)
    } finally {
      setIsLoading(null)
    }
  }

  // Фильтрация по активному табу
  const filteredCards = discoveryCards.filter(card => {
    if (activeFilter === 'top') return true
    return card.filter === activeFilter
  })

  return (
    <div className="discovery-section">
      <div className="section-header">
        <h2 className="section-title">🔍 Больше открытий</h2>
        <p className="section-subtitle">Новая музыка, которая вам понравится</p>
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
          className={`tab ${activeFilter === 'language' ? 'active' : ''}`}
          onClick={() => setActiveFilter('language')}
        >
          по языку
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
      </div>

      {/* Сетка карточек открытий */}
      <div className="discovery-grid">
        {filteredCards.map((card) => (
          <div
            key={card.id}
            className="discovery-card"
            onClick={() => handlePlayDiscovery(card)}
          >
            <div className="card-background">
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-90`} />
            </div>
            
            <div className="card-content">
              <Compass className="w-8 h-8 text-white/80" />
              <h3 className="card-title">{card.title}</h3>
              <p className="card-subtitle">{card.subtitle}</p>
              {isLoading === card.id ? (
                <span className="card-loading">Запуск...</span>
              ) : (
                <span className="card-play">▶️</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Стили */}
      <style>{`
        .discovery-section {
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

        .discovery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 16px;
        }

        .discovery-card {
          height: 180px;
          border-radius: 16px;
          overflow: hidden;
          position: relative;
          cursor: pointer;
          transition: transform 200ms ease;
        }

        .discovery-card:hover {
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

        .card-subtitle {
          font-size: 13px;
          opacity: 0.9;
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
          .discovery-section {
            padding: 24px 16px;
          }

          .discovery-grid {
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
