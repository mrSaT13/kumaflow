/**
 * Тестовый стенд для remote-страницы (не трогает установленный плеер).
 * Порт 4334: отдаёт новую public/remote.html, проксирует /getCoverArt на 4333
 * и перенаправляет WebSocket /remote-ws на 4333 — страница видит живой плеер.
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const { WebSocketServer, WebSocket } = require('ws')

const UP = { host: '127.0.0.1', port: 4333 }
const PAGE = path.resolve(__dirname, '..', 'public', 'remote.html')

const server = http.createServer((req, res) => {
  const url = req.url || '/'
  if (url === '/' || url.startsWith('/?') || url.startsWith('/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' })
    res.end(fs.readFileSync(PAGE))
    return
  }
  // Всё остальное (обложки, манифест, иконки) — на живой сервер плеера.
  const p = http.request({ ...UP, path: url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers)
    r.pipe(res)
  })
  p.on('error', (e) => { res.writeHead(502); res.end(String(e)) })
  req.pipe(p)
})

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (client) => {
    // Upstream поднимаем ПОСЛЕ handshake: сервер шлёт state-update сразу при
    // коннекте, и без буфера это сообщение уходило в пустоту.
    const up = new WebSocket(`ws://${UP.host}:${UP.port}${req.url}`, { headers: req.headers })
    const pending = []
    up.on('open', () => console.log('[relay] upstream open ->', req.url))
    up.on('error', (e) => console.log('[relay] upstream error:', e.message))
    const flush = () => {
      if (pending.length && client.readyState === 1) {
        const batch = pending.splice(0, pending.length)
        console.log('[relay] flush', batch.length, 'msgs to client')
        // Именно строкой: ws отдаёт Buffer как бинарный фрейм, браузер получает
        // Blob, и JSON.parse(e.data) падает в проглоченном catch на странице.
        for (const b of batch) client.send(b.toString())
      }
    }
    // ws может выстрелить 'open' до того, как мы успели подписаться,
    // поэтому очередь разгребаем по готовности сокета, а не по событию.
    const pump = setInterval(() => { flush(); if (client.readyState === 3) clearInterval(pump) }, 20)
    up.on('message', (d) => {
      const m = JSON.parse(d.toString())
      console.log('[relay] upstream msg', m.event)
      // Всегда в очередь: если слать сразу, кадр уходит в сокет, который ещё не
      // завершил свой собственный handshake, и молча теряется (readyState уже 1,
      // но write ещё не гарантирован).
      pending.push(d)
    })
    up.on('close', () => client.close())
    up.on('error', () => client.close())
    client.on('message', (d) => {
      console.log('[relay] client msg', d.toString().slice(0, 60), 'upReady', up.readyState)
      if (up.readyState === 1) up.send(d)
    })
    client.on('close', () => { clearInterval(pump); up.close() })
    client.on('error', () => { clearInterval(pump); up.close() })
  })
})

server.listen(4334, '127.0.0.1', () => console.log('test remote on http://127.0.0.1:4334'))