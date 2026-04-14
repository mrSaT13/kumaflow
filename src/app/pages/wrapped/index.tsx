import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWrapped } from '@/store/wrapped.store'
import { useAchievements } from '@/store/achievements.store'
import type { WrappedArtist, WrappedTrack, WrappedGenre } from '@/store/wrapped.store'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Badge } from '@/app/components/ui/badge'
import { Progress } from '@/app/components/ui/progress'
import { ArrowLeft, Music, Headphones, Clock, Calendar, Trophy } from 'lucide-react'

export default function WrappedPage() {
  const navigate = useNavigate()
  const { currentYear, setYear, getYearData, years } = useWrapped()
  const { achievements, getUnlockedCount } = useAchievements()
  const [yearData, setYearData] = useState<any>(null)

  useEffect(() => {
    const data = getYearData(currentYear)
    setYearData(data)
  }, [currentYear, getYearData])

  const handleYearChange = (year: number) => {
    setYear(year)
    const data = getYearData(year)
    setYearData(data)
  }

  const unlockedAchievements = achievements.filter(a => a.unlocked)

  if (!yearData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle className="text-2xl">🎵 KumaFlow Wrapped</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Добро пожаловать в ваши музыкальные итоги года!
            </p>
            <p className="text-sm text-muted-foreground">
              Данные будут доступны в конце года после накопления статистики прослушиваний.
            </p>
            <Button 
              onClick={() => navigate('/ml/stats')} 
              variant="outline" 
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              К статистике
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 text-white">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <Button onClick={() => navigate('/ml/stats')} variant="ghost" className="text-white hover:bg-white/20">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          
          <div className="flex items-center gap-4">
            <Button
              onClick={() => handleYearChange(currentYear - 1)}
              variant="outline"
              className="border-white/30 text-white hover:bg-white/20"
            >
              ←
            </Button>
            <span className="text-3xl font-bold">{yearData.year}</span>
            <Button
              onClick={() => handleYearChange(currentYear + 1)}
              variant="outline"
              className="border-white/30 text-white hover:bg-white/20"
              disabled={currentYear >= new Date().getFullYear()}
            >
              →
            </Button>
          </div>

          <div className="w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">
            Ваши итоги {yearData.year} года
          </h1>
          <p className="text-xl text-white/80">
            Ваша персональная музыкальная статистика
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white/10 border-white/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <Music className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
                <div className="text-3xl font-bold">{yearData.totalPlays}</div>
                <div className="text-sm text-white/60">Прослушиваний</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <Clock className="w-8 h-8 mx-auto mb-2 text-pink-400" />
                <div className="text-3xl font-bold">{yearData.totalHours}</div>
                <div className="text-sm text-white/60">Часов</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                <div className="text-3xl font-bold">{yearData.totalDays}</div>
                <div className="text-sm text-white/60">Дней</div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <Headphones className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                <div className="text-3xl font-bold">{yearData.topArtists.length}</div>
                <div className="text-sm text-white/60">Артистов</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Favorite Artist */}
        <Card className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-500/30 mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">🏆 Ваш любимый артист</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">{yearData.favoriteArtist?.name}</div>
              <div className="text-white/60">
                {yearData.favoriteArtist?.playCount} прослушиваний
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Artists */}
        <Card className="bg-white/10 border-white/20 mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">🎤 Топ артисты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {yearData.topArtists.map((artist: WrappedArtist, index: number) => (
                <div key={artist.id} className="flex items-center gap-4">
                  <Badge variant="secondary" className="w-8 h-8 p-0 flex items-center justify-center">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </Badge>
                  <div className="flex-1">
                    <div className="font-medium">{artist.name}</div>
                    <Progress value={(artist.playCount / yearData.topArtists[0].playCount) * 100} className="h-2 mt-2" />
                  </div>
                  <div className="text-sm text-white/60 w-20 text-right">
                    {artist.playCount}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Tracks */}
        <Card className="bg-white/10 border-white/20 mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">🎵 Топ треки</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {yearData.topTracks.map((track: any, index: number) => (
                <div key={track.id} className="flex items-center gap-4">
                  <Badge variant="secondary" className="w-8 h-8 p-0 flex items-center justify-center">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </Badge>
                  <div className="flex-1">
                    <div className="font-medium">{track.title}</div>
                    <div className="text-sm text-white/60">{track.artist}</div>
                  </div>
                  <div className="text-sm text-white/60 w-20 text-right">
                    {track.playCount}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Genres */}
        <Card className="bg-white/10 border-white/20 mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">🎭 Топ жанры</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {yearData.topGenres.map((genre: any, index: number) => (
                <div key={genre.name} className="flex items-center gap-4">
                  <Badge variant="secondary" className="w-8 h-8 p-0 flex items-center justify-center">
                    #{index + 1}
                  </Badge>
                  <div className="flex-1">
                    <div className="font-medium">{genre.name}</div>
                    <Progress value={(genre.playCount / yearData.topGenres[0].playCount) * 100} className="h-2 mt-2" />
                  </div>
                  <div className="text-sm text-white/60 w-20 text-right">
                    {genre.playCount}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Достижения года */}
        {unlockedAchievements.length > 0 && (
          <Card className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-500/30">
            <CardHeader>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-400" />
                🏆 Достижения года
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {unlockedAchievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="bg-white/10 rounded-lg p-4 text-center"
                  >
                    <div className="text-4xl mb-2">{achievement.icon}</div>
                    <div className="font-medium text-sm">{achievement.title}</div>
                    <div className="text-xs text-white/60 mt-1">{achievement.description}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
