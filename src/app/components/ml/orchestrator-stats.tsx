import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { useML } from '@/store/ml.store'

// Ключи для localStorage
const ORCHESTRATOR_COUNT_KEY = 'orchestrator_playlists_count'
const ORCHESTRATOR_LAST_DATE_KEY = 'orchestrator_last_date'

export function OrchestratorStats() {
  const { profile } = useML()
  const [stats, setStats] = useState({
    playlistsToday: 0,
    totalPlaylists: 0,
    mlTrainingScore: 0,
  })

  useEffect(() => {
    // Считаем ML score из профиля
    const genreScore = Object.values(profile.preferredGenres).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
    const artistScore = Object.values(profile.preferredArtists).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
    const mlScore = Math.round(genreScore + artistScore)
    
    // Загружаем статистику оркестратора
    const count = parseInt(localStorage.getItem(ORCHESTRATOR_COUNT_KEY) || '0')
    const lastDate = localStorage.getItem(ORCHESTRATOR_LAST_DATE_KEY) || ''
    
    const today = new Date().toISOString().split('T')[0]
    const playlistsToday = lastDate === today ? count : 0
    
    setStats({
      playlistsToday,
      totalPlaylists: count,
      mlTrainingScore: mlScore,
    })
  }, [profile])

  // Функция для обновления статистики (вызывать из generateActivityMix/generateMoodMix)
  useEffect(() => {
    const handlePlaylistGenerated = () => {
      const today = new Date().toISOString().split('T')[0]
      const { count, lastDate } = getStats()
      
      const newCount = lastDate === today ? count : 0
      const newTotal = count + 1
      
      localStorage.setItem(ORCHESTRATOR_COUNT_KEY, newTotal.toString())
      localStorage.setItem(ORCHESTRATOR_LAST_DATE_KEY, today)
      
      setStats(prev => ({
        ...prev,
        playlistsToday: newCount + 1,
        totalPlaylists: newTotal,
      }))
    }

    window.addEventListener('playlist_generated', handlePlaylistGenerated)
    return () => window.removeEventListener('playlist_generated', handlePlaylistGenerated)
  }, [])

  function getStats() {
    const count = parseInt(localStorage.getItem(ORCHESTRATOR_COUNT_KEY) || '0')
    const lastDate = localStorage.getItem(ORCHESTRATOR_LAST_DATE_KEY) || ''
    return { count, lastDate }
  }

  function getTrainingLevel(score: number): { label: string; color: string } {
    if (score < 50) return { label: 'Новичок', color: 'bg-gray-500' }
    if (score < 200) return { label: 'Любитель', color: 'bg-blue-500' }
    if (score < 500) return { label: 'Продвинутый', color: 'bg-green-500' }
    if (score < 1000) return { label: 'Эксперт', color: 'bg-purple-500' }
    return { label: 'ML Мастер', color: 'bg-yellow-500' }
  }

  const training = getTrainingLevel(stats.mlTrainingScore)

  return (
    <Card className="bg-gradient-to-br from-cyan-900/50 to-blue-900/50 border-cyan-500/30">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <span className="text-2xl">🎵</span>
          Статистика оркестратора
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Сегодня</div>
            <div className="text-2xl font-bold">{stats.playlistsToday}</div>
            <Badge variant="secondary">плейлистов</Badge>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Всего</div>
            <div className="text-2xl font-bold">{stats.totalPlaylists}</div>
            <Badge variant="secondary">плейлистов</Badge>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Обученность ML</div>
            <Badge className={training.color}>{training.label}</Badge>
          </div>
          <div className="text-2xl font-bold">{stats.mlTrainingScore} очков</div>
          <div className="text-xs text-muted-foreground">
            {profile.likedSongs.length} лайков, {Object.keys(profile.preferredGenres).length} жанров, {Object.keys(profile.preferredArtists).length} артистов
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
