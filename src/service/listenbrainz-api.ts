import axios from 'axios'
import { toast } from 'react-toastify'

const LISTENBRAINZ_API = 'https://api.listenbrainz.org/1'
const LISTENBRAINZ_OAUTH_URL = 'https://listenbrainz.org/profile/login/'

export interface ListenBrainzListen {
  artist_name: string
  track_name: string
  release_name?: string
  listened_at?: number
  duration?: number
  musicbrainz_id?: string
}

export interface ListenBrainzProfile {
  user_name: string
  listen_count: number
  latest_import?: string
  subscribed_to?: string[]
}

class ListenBrainzService {
  private token: string | null = null
  private userName: string | null = null
  private initialized = false

  // Инициализация при загрузке
  init() {
    if (this.initialized) return
    
    const storedToken = localStorage.getItem('listenbrainz_token')
    const storedUserName = localStorage.getItem('listenbrainz_username')
    
    if (storedToken) {
      this.token = storedToken
      this.userName = storedUserName
      console.log('[ListenBrainz] Initialized with stored token')
    }
    
    this.initialized = true
  }

  // Получение URL для OAuth авторизации
  getAuthUrl(): string {
    return LISTENBRAINZ_OAUTH_URL
  }

  // Установка токена (после ручной вставки)
  setToken(token: string, userName?: string) {
    this.token = token
    if (userName) {
      this.userName = userName
      localStorage.setItem('listenbrainz_username', userName)
    }
    localStorage.setItem('listenbrainz_token', token)
    console.log('[ListenBrainz] Token set successfully')
  }

  // Удаление токена
  clearToken() {
    this.token = null
    this.userName = null
    localStorage.removeItem('listenbrainz_token')
    localStorage.removeItem('listenbrainz_username')
    console.log('[ListenBrainz] Token cleared')
  }

  // Проверка токена
  async validateToken(): Promise<boolean> {
    if (!this.token) return false

    try {
      const response = await axios.get(
        `${LISTENBRAINZ_API}/validate-token`,
        {
          headers: {
            'Authorization': `Token ${this.token}`,
          },
        }
      )
      return response.data.code === 200
    } catch (error) {
      console.error('[ListenBrainz] Token validation failed:', error)
      return false
    }
  }

  // Получение профиля пользователя
  async getProfile(): Promise<ListenBrainzProfile | null> {
    if (!this.token || !this.userName) return null

    try {
      const response = await axios.get(
        `${LISTENBRAINZ_API}/user/${this.userName}/status`,
        {
          headers: {
            'Authorization': `Token ${this.token}`,
          },
        }
      )
      return response.data
    } catch (error) {
      console.error('[ListenBrainz] Failed to get profile:', error)
      return null
    }
  }

  // Отправка прослушивания (Scrobble)
  async submitListen(listen: ListenBrainzListen): Promise<boolean> {
    if (!this.token) {
      console.warn('[ListenBrainz] No token, skipping scrobble')
      return false
    }

    try {
      await axios.post(
        `${LISTENBRAINZ_API}/submit-listens`,
        {
          listen_type: 'single',
          payload: [
            {
              listened_at: listen.listened_at || Math.floor(Date.now() / 1000),
              track_metadata: {
                artist_name: listen.artist_name,
                track_name: listen.track_name,
                release_name: listen.release_name,
                musicbrainz_id: listen.musicbrainz_id,
              },
            },
          ],
        },
        {
          headers: {
            'Authorization': `Token ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      console.log('[ListenBrainz] Scrobbled:', listen.track_name)
      return true
    } catch (error: any) {
      console.error('[ListenBrainz] Scrobble failed:', error.response?.data || error.message)
      return false
    }
  }

  // Обновление текущего трека (Now Playing)
  async updateNowPlaying(listen: Omit<ListenBrainzListen, 'listened_at'>): Promise<boolean> {
    if (!this.token) {
      console.warn('[ListenBrainz] No token, skipping now playing')
      return false
    }

    try {
      await axios.post(
        `${LISTENBRAINZ_API}/update-now-playing`,
        {
          payload: [
            {
              track_metadata: {
                artist_name: listen.artist_name,
                track_name: listen.track_name,
                release_name: listen.release_name,
                musicbrainz_id: listen.musicbrainz_id,
              },
            },
          ],
        },
        {
          headers: {
            'Authorization': `Token ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      console.log('[ListenBrainz] Now Playing:', listen.track_name)
      return true
    } catch (error: any) {
      console.error('[ListenBrainz] Now Playing failed:', error.response?.data || error.message)
      return false
    }
  }

  // Пакетная отправка прослушиваний
  async submitListens(listens: ListenBrainzListen[]): Promise<boolean> {
    if (!this.token || listens.length === 0) return false

    try {
      await axios.post(
        `${LISTENBRAINZ_API}/submit-listens`,
        {
          listen_type: 'import',
          payload: listens.map((listen) => ({
            listened_at: listen.listened_at || Math.floor(Date.now() / 1000),
            track_metadata: {
              artist_name: listen.artist_name,
              track_name: listen.track_name,
              release_name: listen.release_name,
              musicbrainz_id: listen.musicbrainz_id,
            },
          })),
        },
        {
          headers: {
            'Authorization': `Token ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      console.log(`[ListenBrainz] Scrobbled ${listens.length} tracks`)
      return true
    } catch (error: any) {
      console.error('[ListenBrainz] Batch scrobble failed:', error.response?.data || error.message)
      return false
    }
  }

  // Получение токена из URL (после OAuth редиректа)
  getTokenFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('listenbrainz_token')
    return token
  }

  // Геттеры
  getToken(): string | null {
    return this.token
  }

  getUserName(): string | null {
    return this.userName
  }

  isEnabled(): boolean {
    return this.token !== null
  }
}

export const listenBrainzApi = new ListenBrainzService()
