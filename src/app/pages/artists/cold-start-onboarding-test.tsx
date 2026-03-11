import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'

export default function ColdStartOnboarding() {
  const { t } = useTranslation()

  const handleComplete = () => {
    window.location.hash = '/library/artists'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-4">
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-lg border-white/20">
        <CardHeader className="text-center">
          <div className="text-6xl mb-4">🚧</div>
          <CardTitle className="text-2xl text-white">В разработке</CardTitle>
          <CardDescription className="text-white/70">
            Страница онбординга в процессе создания
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleComplete} className="w-full">
            Перейти к артистам
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
