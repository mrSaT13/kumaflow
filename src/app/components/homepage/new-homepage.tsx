/**
 * NEW HOMEPAGE - Главная страница в стиле Яндекс.Музыки
 * 
 * Структура:
 * 1. Hero Section "Моя Волна" ✅
 * 2. Quick Access (Для вас + Тренды) ✅
 * 3. Favorites & History (Избранное + История) ✅
 * 4. Genre Exploration (Исследуйте жанр) ✅
 * 5. AI Sets (AI-генерация) ⏳
 * 6. Discovery (Больше открытий) ⏳
 * 7. Artist Radio (В стиле) ⏳
 * 8. Premieres (Премьера) ⏳
 * 9. Curated Playlists (Настроили для вас) ⏳
 */

import HeroMyWave from './hero-my-wave'
import QuickAccess from './quick-access'
import FavoritesHistory from './favorites-history'
import AISets from './ai-sets'
import GenreExploration from './genre-exploration'
import Discovery from './discovery'
import ArtistRadio from './artist-radio'
import Premieres from './premieres'
import CuratedPlaylists from './curated-playlists'
// import { GlobalChartsCard } from './global-charts-card'

export default function NewHomepage() {
  return (
    <div className="new-homepage">
      {/* 1. Hero Section - Моя Волна */}
      <HeroMyWave />

      {/* 2. Quick Access - Для вас + Тренды */}
      <QuickAccess />

      {/* 3. Global Charts - Last.fm топ треков */}
      <section className="px-8">
        <GlobalChartsCard />
      </section>

      {/* 4. Favorites & History - Избранное + История */}
      <FavoritesHistory />

      {/* 4. AI Sets - AI-генерация */}
      <AISets />

      {/* 5. Discovery - Больше открытий */}
      <Discovery />

      {/* 6. Artist Radio - В стиле */}
      <ArtistRadio />

      {/* 7. Genre Exploration - Исследуйте жанр */}
      <GenreExploration />

      {/* 8. Premieres - Премьера */}
      <Premieres />

      {/* 9. Curated Playlists - Настроили для вас */}
      <CuratedPlaylists />

      {/* Стили для всей страницы */}
      <style global>{`
        .new-homepage {
          background: #F5F5F5;
          min-height: 100vh;
          padding-bottom: 100px; /* Место для Player Bar */
        }

        /* Общие стили для секций */
        .new-homepage section {
          margin-bottom: 40px;
        }

        /* Scrollbar styling */
        .new-homepage ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .new-homepage ::-webkit-scrollbar-track {
          background: #f0f0f0;
          border-radius: 4px;
        }

        .new-homepage ::-webkit-scrollbar-thumb {
          background: #c0c0c0;
          border-radius: 4px;
        }

        .new-homepage ::-webkit-scrollbar-thumb:hover {
          background: #a0a0a0;
        }
      `}</style>
    </div>
  )
}
