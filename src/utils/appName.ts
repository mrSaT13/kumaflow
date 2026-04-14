import { repository, version } from '@/../package.json'

export const appName = 'KumaFlow'

export const appDescription = 'Форк Aonsoku с расширенными ML-рекомендациями и кастомизацией'

export const appFeatures = [
  '🤖 ML рекомендации с обучением на лайках',
  '🎵 Vibe Similarity — похожие треки по аудио-признакам',
  '🎼 Оркестратор плейлистов с плавными переходами',
  '🎨 50+ тем оформления (Dark/Light)',
  '📊 Кастомизация прогресс-бара (тип, цвет, форма)',
  '🔔 Подписка на артистов и уведомления о новинках',
  '🌐 Last.fm интеграция (скробблинг, топ-чарты)',
  '🎤 Fanart.tv — логотипы и баннеры артистов',
  '📚 Wikipedia — биографии артистов',
  '🍎 Apple Music и Discogs — обложки артистов',
  '📚 Интеграция Audiobookshelf',
  '⏳ Splash screen с анимацией загрузки',
  '🎭 Activity Mix — 10 миксов для активностей',
  '💭 Mood Mix — 9 миксов по настроению',
  '🌅 Time of Day Mix — миксы по времени суток',
  '🚫 Ban-лист артистов (дизлайк)',
  '❄️ Геймифицированный холодный старт',
  '🎬 Artist Collage — коллажи из обложек альбомов',
  // Новые функции v1.5.3
  '🔀 Dual URL — резервный сервер с авто-переключением',
  '🏠 Кастомизация секций главной страницы (Drag-and-Drop)',
  '📱 Улучшенный сайдбар с рабочим скроллом',
  '🎴 Увеличенные карточки радио артистов',
  '🌐 Мировые чарты вместо Global Charts',
]

export function getAppInfo() {
  return {
    name: appName,
    version,
    description: appDescription,
    features: appFeatures,
    url: 'https://github.com/mrSaT13/kumaflow', // KumaFlow GitHub
    originalUrl: 'https://github.com/victoralvesf/aonsoku', // Original Aonsoku
    releaseUrl: 'https://github.com/mrSaT13/kumaflow/releases/latest',
  }
}

export const lrclibClient = `${appName} v${version} (${repository.url})`
