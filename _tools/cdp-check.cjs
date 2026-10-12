/**
 * Проверка remote-страницы через CDP Edge: рендер в реальном времени + снимок DOM.
 * Использование: node cdp-check.cjs <url> <outPng> <width> <height> [--click like|queue]
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const url = process.argv[2]
const out = process.argv[3]
const W = parseInt(process.argv[4] || '1440', 10)
const H = parseInt(process.argv[5] || '900', 10)
const action = process.argv[6] || ''
const PORT = 9222 + Math.floor(Math.random() * 400)
const prof = path.join(require('os').tmpdir(), 'edge-cdp-' + PORT)

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--mute-audio',
  '--user-data-dir=' + prof,
  '--window-size=' + W + ',' + H,
  '--remote-debugging-port=' + PORT,
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('CDP не поднялся')
}

function cdp(ws) {
  let id = 0
  const waiting = new Map()
  const events = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      events.push('EXCEPTION: ' + (d.exception?.description || d.text))
    } else if (m.method === 'Runtime.consoleAPICalled') {
      events.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
    } else if (m.method === 'Log.entryAdded') {
      events.push('LOG/' + m.params.entry.level + ': ' + m.params.entry.text)
    }
  })
  cdpEvents = events
  return (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id
    waiting.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)))
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
let cdpEvents = []

const evalJs = (cdpFn, expr) => cdpFn('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  .then((r) => (r.exceptionDetails ? { ERROR: r.exceptionDetails.text } : r.result.value))

async function main() {
  const wsUrl = await getWsUrl()
  const ws = new WebSocket(wsUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  const send = cdp(ws)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.navigate', { url })
  await sleep(10000)  // реальное время: WS + обложка (Navidrome 4-5 c) + очередь

  if (action === 'queue') {
    await evalJs(send, "document.getElementById('queueBtn').click()")
    await sleep(2500)
  }

  const probe = await evalJs(send, `(() => {
    const box = document.getElementById('coverBox');
    const img = box.querySelector('img.coverart');
    const q = document.getElementById('queueList');
    const cur = q.querySelector('.qrow.cur');
    const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
    return {
      status: document.getElementById('statusText').textContent,
      title: document.getElementById('trackTitle').textContent,
      coverLoaded: img ? img.naturalWidth : 0,
      coverSrc: img ? img.getAttribute('src') : null,
      coverErr: cs(document.getElementById('coverErr'), 'display'),
      placeholder: cs(document.getElementById('coverPh'), 'display'),
      bgBlurImgs: document.getElementById('bgBlur').children.length,
      likeClass: document.getElementById('likeBtn').className,
      likeFill: cs(document.querySelector('#likeBtn svg'), 'fill'),
      likeStroke: cs(document.querySelector('#likeBtn svg'), 'stroke'),
      queueRows: q.children.length,
      queueCovers: q.querySelectorAll('img.qc').length,
      queueActiveText: cur ? cur.querySelector('.qt').textContent : null,
      queueActiveIndex: cur ? cur.getAttribute('data-i') : null,
      queueScrollTop: q.scrollTop,
      queueScrollHeight: q.scrollHeight,
      queueClientHeight: q.clientHeight,
      activeVisible: cur ? (cur.offsetTop >= q.scrollTop && cur.offsetTop + cur.offsetHeight <= q.scrollTop + q.clientHeight) : null,
      sheetOpen: document.getElementById('sheet').classList.contains('show'),
      wsReady: (typeof ws !== 'undefined' && ws) ? ws.readyState : 'no-ws',
      wsUrl: (typeof ws !== 'undefined' && ws) ? ws.url : null,
      S: (typeof S !== 'undefined') ? S : 'no-S',
      vw: innerWidth, vh: innerHeight,
      gridCols: cs(document.querySelector('main'), 'gridTemplateColumns'),
      coverBox: box.getBoundingClientRect().toJSON(),
      bodyScrollW: document.body.scrollWidth,
      computedCoverUrl: (typeof coverUrl !== 'undefined') ? coverUrl(S.coverArt) : 'no-fn',
      pendingCover: (typeof pendingCover !== 'undefined') ? pendingCover : 'no-var',
      shownCover: (typeof shownCover !== 'undefined') ? shownCover : 'no-var',
      coverResources: performance.getEntriesByType('resource').filter(r => r.name.indexOf('getCoverArt') >= 0).map(r => ({ n: r.name.slice(-40), dur: Math.round(r.duration), size: r.transferSize }))
    };
  })()`)
  console.log(JSON.stringify(probe, null, 2))
  console.log('--- page events ---')
  console.log(cdpEvents.length ? cdpEvents.join('\n') : '(нет)')

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('screenshot:', out, fs.statSync(out).size, 'bytes')

  ws.close()
  proc.kill()
  process.exit(0)
}

main().catch((e) => { console.error('FAIL:', e.message); try { proc.kill() } catch {} ; process.exit(1) })