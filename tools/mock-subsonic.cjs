/**
 * Заглушка Subsonic API для локального прогона плеера.
 *
 * Плееру нужен живой Navidrome/Subsonic, а его здесь нет. Этот сервер отдаёт
 * валидные ответы Subsonic v1.16 + настоящий аудиопоток (WAV-тон), чтобы
 * можно было проверить в браузере то, что иначе не проверяется: создание
 * MediaElementSource, громкость, кроссфейд, отсутствие InvalidStateError.
 *
 * Запуск:  node tools/mock-subsonic.cjs [port]
 * Затем в плеере указать сервер http://localhost:4533 (логин/пароль любые).
 */

const http = require('node:http')
const zlib = require('node:zlib')

const PORT = Number(process.argv[2] || 4533)

// Длина реального аудио. Должна совпадать с duration в метаданных треков,
// иначе плеер считает трек четырёхминутным, а файл кончается через пару
// секунд и следующий трек начинается сам.
const WAV_SECONDS = 30

const ARTISTS = [
  'Kuma Test', 'Neon Drift', 'Bass Harbour', 'Slow Signal', 'Ирина Волна',
  'Glass Arcade', 'Mono Lake', 'Paper Radio', 'Turbo Sparrow', 'Night Ledger',
]
const GENRES = [
  'Electronic', 'Rock', 'Jazz', 'Ambient', 'Hip-Hop', 'House',
  'Techno', 'Indie', 'Classical', 'Trip-Hop', 'Disco', 'Lo-fi',
]

// Детерминированный псевдослучайный — чтобы прогоны были сравнимы.
function rnd(seed) {
  let x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function makeSongs(count = 60) {
  const songs = []
  for (let i = 0; i < count; i++) {
    const artist = ARTISTS[i % ARTISTS.length]
    const genre = GENRES[i % GENRES.length]
    const dur = WAV_SECONDS
    songs.push({
      id: `tr-${i}`,
      parent: `al-${i % 12}`,
      isDir: false,
      title: `Track ${String(i + 1).padStart(2, '0')} — ${genre}`,
      album: `Album ${(i % 12) + 1}`,
      artist,
      track: (i % 12) + 1,
      year: 2014 + (i % 10),
      genre,
      coverArt: `al-${i % 12}`,
      size: dur * 16000,
      contentType: 'audio/x-wav',
      suffix: 'wav',
      duration: dur,
      bitRate: 128,
      path: `mock/${artist}/${i}.wav`,
      playCount: Math.floor(rnd(i + 7) * 40),
      discNumber: 1,
      created: '2024-01-15T10:00:00',
      albumId: `al-${i % 12}`,
      artistId: `ar-${ARTISTS.indexOf(artist)}`,
      type: 'music',
      isVideo: false,
      bpm: 60 + Math.floor(rnd(i + 3) * 120),
      starred: i % 7 === 0 ? '2024-05-01T10:00:00' : undefined,
      comment: '',
      sortName: `Track ${String(i + 1).padStart(2, '0')}`,
      mediaType: 'song',
      musicBrainzId: '',
      genres: [{ name: genre }],
      replayGain: { trackGain: -7.5, trackPeak: 1, albumGain: -7.5, albumPeak: 1 },
      // Признаки, которые читает локальный ML и оркестратор.
      energy: Math.round(rnd(i + 11) * 100) / 100,
      danceability: Math.round(rnd(i + 13) * 100) / 100,
      valence: Math.round(rnd(i + 17) * 100) / 100,
      acousticness: Math.round(rnd(i + 19) * 100) / 100,
      moods: [['energetic', 'chill', 'happy', 'calm'][i % 4]],
    })
  }
  return songs
}

const SONGS = makeSongs()

function makeAlbums() {
  const map = new Map()
  for (const s of SONGS) {
    if (!map.has(s.albumId)) {
      map.set(s.albumId, {
        id: s.albumId,
        name: s.album,
        artist: s.artist,
        artistId: s.artistId,
        coverArt: s.albumId,
        songCount: 0,
        duration: 0,
        year: s.year,
        created: '2024-01-15T10:00:00',
        playCount: Math.floor(rnd(s.albumId.length) * 100),
      })
    }
    const a = map.get(s.albumId)
    a.songCount++
    a.duration += s.duration
  }
  return [...map.values()]
}

const ALBUMS = makeAlbums()

const ARTIST_OBJECTS = ARTISTS.map((name, i) => ({
  id: `ar-${i}`,
  name,
  albumCount: ALBUMS.filter((a) => a.artistId === `ar-${i}`).length,
  coverArt: `ar-${i}`,
  artistImageUrl: null,
}))

/* ------------------------------- аудио ------------------------------- */

// Короткий WAV-тон. Достаточно, чтобы audio-элемент реально играл и чтобы
// цепочка MediaElementSource -> GainNode -> AnalyserNode -> destination
// была живой, а не молчала из-за taint/CORS.
function makeWav(seconds = WAV_SECONDS, sampleRate = 22050) {
  const n = seconds * sampleRate
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    // Медленная синусоида с лёгким тремоло — слышно, что играет музыка.
    const env = 0.25 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t))
    const s = Math.sin(2 * Math.PI * 220 * t) * env
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const WAV = makeWav()

// 1x1 прозрачный PNG — чтобы обложки не давали 404-шум в консоли.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/* ------------------------------ ответы ------------------------------ */

function ok(payload) {
  return {
    'subsonic-response': {
      status: 'ok',
      version: '1.16.1',
      type: 'kumaflow-mock',
      serverVersion: '1.0.0',
      openSubsonic: true,
      ...payload,
    },
  }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function handlers() {
  return {
    ping: () => ({}),
    getLicense: () => ({ license: { valid: true } }),
    getOpenSubsonicExtensions: () => ({}),
    getMusicFolders: () => ({ musicFolders: { musicFolder: [{ id: 1, name: 'Music' }] } }),
    getUser: () => ({
      user: {
        username: 'mock',
        email: 'mock@local',
        adminRole: true,
        settingsRole: true,
        downloadRole: true,
        uploadRole: false,
        playlistRole: true,
        coverArtRole: true,
        commentRole: false,
        podcastRole: false,
        streamRole: true,
       jukeboxRole: false,
        shareRole: false,
        videoConversionRole: false,
        folder: [0, 1, 2, 3, 4],
      },
    }),
    getScanStatus: () => ({ scanStatus: { scanning: false, count: SONGS.length } }),
    getGenres: () => ({
      genres: {
        genre: GENRES.map((value, i) => ({
          value,
          songCount: SONGS.filter((s) => s.genre === value).length,
          albumCount: 1,
        })),
      },
    }),
    getArtists: () => ({
      artists: {
        ignoredArticles: 'The El La Los Las Le Les',
        index: [
          {
            name: ARTISTS.slice(0, 5).map((n) => n[0]).join(''),
            artist: ARTIST_OBJECTS.slice(0, 5),
          },
          {
            name: ARTISTS.slice(5).map((n) => n[0]).join(''),
            artist: ARTIST_OBJECTS.slice(5),
          },
        ],
      },
    }),
    getArtist: () => ({
      artist: {
        ...(ARTIST_OBJECTS[0] || {}),
        album: ALBUMS.filter((a) => a.artistId === 'ar-0'),
      },
    }),
    getAlbum: () => ({
      album: {
        ...(ALBUMS[0] || {}),
        song: SONGS.filter((s) => s.albumId === (ALBUMS[0] || {}).id),
      },
    }),
    getAlbumList: () => ({ albumList2: { album: ALBUMS.slice(0, 50) } }),
    getAlbumList2: () => ({ albumList2: { album: ALBUMS.slice(0, 50) } }),
    getSong: (q) => ({
      song: SONGS.filter((s) => String(s.id) === String(q.get('id'))),
    }),
    getSongsByGenre: () => ({ songsByGenre: { song: SONGS.slice(0, 50) } }),
    getRandomSongs: (q) => {
      const size = Math.min(Number(q.get('size') || 50), 200)
      return { randomSongs: { song: SONGS.slice(0, size) } }
    },
    getTopSongs: () => ({ topSongs: { song: SONGS.slice(0, 20) } }),
    getStarred: () => ({
      starred: { song: SONGS.filter((s) => s.starred), album: [], artist: [] },
    }),
    getStarred2: () => ({
      starred2: { song: SONGS.filter((s) => s.starred), album: [], artist: [] },
    }),
    getIndexes: () => ({
      indexes: {
        lastModified: 1700000000000,
        ignoredArticles: 'The El La',
        index: chunk(ARTIST_OBJECTS, 10),
      },
    }),
    getPlaylists: () => ({
      playlists: {
        playlist: [
          {
            id: 'pl-1',
            name: 'Моя волна',
            comment: 'Тестовый плейлист',
            owner: 'mock',
            public: false,
            songCount: 20,
            duration: 3600,
            created: '2024-01-01T00:00:00',
            changed: '2024-01-02T00:00:00',
            song: SONGS.slice(0, 20),
          },
        ],
      },
    }),
    getPlaylist: () => ({
      playlist: {
        id: 'pl-1',
        name: 'Моя волна',
        owner: 'mock',
        songCount: 20,
        duration: 3600,
        song: SONGS.slice(0, 20),
      },
    }),
    createPlaylist: () => ({ playlist: { id: 'pl-new', name: 'new' } }),
    updatePlaylist: () => ({}),
    deletePlaylist: () => ({}),
    getPlayQueue: () => ({ playQueue: { current: 'tr-0', position: 0, username: 'mock', changed: '2024-01-01T00:00:00', changedBy: 'mock' } }),
    savePlayQueue: () => ({}),
    search3: (q) => ({
      searchResult3: {
        song: SONGS.slice(0, Number(q.get('songCount') || 20)),
      },
    }),
    search2: (q) => ({
      searchResult2: {
        song: SONGS.slice(0, Number(q.get('songCount') || 20)),
        artist: ARTIST_OBJECTS.slice(0, 10),
        album: ALBUMS.slice(0, 10),
      },
    }),
    scrobble: () => ({}),
    star: () => ({}),
    unstar: () => ({}),
    setRating: () => ({}),
    getRating: () => ({}),
    getLyrics: () => ({ lyricsList: { structuredLyrics: [] } }),
    getLyricsBySongId: () => ({ lyricsList: { structuredLyrics: [] } }),
    getCoverArt: () => ({ coverArt: { suff: 'png', mime: 'image/png' } }),
    bookmark: () => ({}),
    getBookmarks: () => ({ bookmarks: {} }),
    getInternetRadioStations: () => ({ internetRadioStations: { internetRadioStation: [] } }),
    getPodcasts: () => ({ podcasts: { channel: [] } }),
    getBookmarks2: () => ({}),
  }
}

const HANDLERS = handlers()

/* ------------------------------ сервер ------------------------------ */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  // Разрешаем всё: плеер ходит с другого origin (vite dev), а audio-элементу
  // нужен корректный CORS, иначе MediaElementSource отдаёт тишину.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Access-Control-Allow-Methods', '*')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (!url.pathname.startsWith('/rest/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('mock-subsonic: only /rest/* is served')
    return
  }

  const name = url.pathname.slice('/rest/'.length)
  const q = url.searchParams

  if (name === 'stream') {
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': WAV.length,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    })
    res.end(WAV)
    return
  }

  if (name === 'getCoverArt') {
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': PNG.length,
      'Cache-Control': 'no-store',
    })
    res.end(PNG)
    return
  }

  if (name === 'download') {
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': WAV.length,
      'Content-Disposition': 'attachment; filename="mock.wav"',
    })
    res.end(WAV)
    return
  }

  const handler = HANDLERS[name]
  if (!handler) {
    console.log(`[mock] ⚠  unknown endpoint: ${name}`)
    // Отвечаем валидным пустым телом, чтобы клиент не падал на 404,
    // но помечаем в лог — молча проглоченные эндпоинты опасны.
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(ok({})))
    return
  }

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(ok(handler(q))))
})

server.listen(PORT, () => {
  console.log(`[mock] Subsonic stub on http://localhost:${PORT}`)
  console.log(`[mock] songs=${SONGS.length} albums=${ALBUMS.length} artists=${ARTIST_OBJECTS.length}`)
  console.log(`[mock] stream: ${WAV.length} bytes of WAV, 8s`)
})