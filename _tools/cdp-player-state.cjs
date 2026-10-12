// Читает состояние app_store прямо из запущенного плеера через CDP.
const { spawn } = require('child_process')
const path = require('path')

const EXE = 'A:\\kumaflow\\KumaFlow.exe'
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function killAll() {
  for (let i = 0; i < 20; i++) {
    const ps = await new Promise((res) => {
      const { execSync } = require('child_process')
      try {
        const out = execSync('tasklist /FI "IMAGENAME eq KumaFlow.exe" /NH', { encoding: 'latin1' })
        res(out.split('\n').filter((l) => l.includes('KumaFlow.exe')).length)
      } catch { res(0) }
    })
    if (ps === 0) return
    await new Promise((res) => {
      const { execSync } = require('child_process')
      try { execSync('taskkill /F /IM KumaFlow.exe', { stdio: 'ignore' }) } catch {}
      setTimeout(res, 1200)
    })
  }
}

async function main() {
  await killAll()
  console.log('плеер закрыт')
  spawn(EXE, [`--remote-debugging-port=${PORT}`], { cwd: 'A:\\kumaflow', detached: true, stdio: 'ignore' }).unref()
  console.log('запущен с CDP')

  let wsUrl = null
  for (let i = 0; i < 40; i++) {
    await sleep(1000)
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await r.json()
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'))
      if (page) { wsUrl = page.webSocketDebuggerUrl; break }
    } catch {}
  }
  if (!wsUrl) { console.log('CDP не поднялся'); process.exit(1) }
  console.log('цель найдена')

  const ws = new WebSocket(wsUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const waiting = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
  })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id
    waiting.set(mid, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)))
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

  await sleep(6000)
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k === 'app_store') {
          try {
            const s = JSON.parse(localStorage.getItem(k));
            const d = s.state || s;
            out.remoteControl = d.remoteControl;
            out.hasAccount = !!(d.url && d.username);
          } catch (e) { out.app_store = 'не JSON: ' + e.message }
        } else out.keys = (out.keys || []).concat(k);
      }
      out.hasAccountsStore = !!localStorage.getItem('accounts_store');
      return out;
    })()`,
    returnByValue: true,
  })
  console.log('--- localStorage плеера ---')
  console.log(JSON.stringify(r.result.value, null, 2))
  ws.close()
  process.exit(0)
}

main()