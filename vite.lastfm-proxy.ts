import type { Connect, Plugin } from 'vite'

const LASTFM_TARGET = 'https://ws.audioscrobbler.com/2.0/'

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function lastfmProxyPlugin(): Plugin {
  return {
    name: 'lastfm-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        if (!rawUrl.startsWith('/lastfm-api')) {
          next()
          return
        }

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }

        try {
          const incoming = new URL(rawUrl, 'http://localhost')
          const target = new URL(LASTFM_TARGET)
          incoming.searchParams.forEach((value, key) => {
            target.searchParams.set(key, value)
          })

          const body =
            req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : undefined

          const response = await fetch(target.toString(), {
            method: req.method ?? 'GET',
            headers: {
              'Content-Type':
                (req.headers['content-type'] as string) ||
                'application/x-www-form-urlencoded',
              'User-Agent': 'KumaFlow/1.0',
            },
            body,
          })

          const text = await response.text()
          res.statusCode = response.status
          res.setHeader(
            'Content-Type',
            response.headers.get('content-type') || 'application/json; charset=utf-8',
          )
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(text)
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              error: 'Last.fm proxy failed',
              message: error instanceof Error ? error.message : String(error),
            }),
          )
        }
      })
    },
  }
}
