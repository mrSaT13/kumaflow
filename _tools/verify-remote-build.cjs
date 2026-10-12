// Проверка: доехали ли правки remote-страницы в собранный out/.
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const built = fs.readFileSync(path.join(root, 'out', 'renderer', 'remote.html'), 'utf8')
const src = fs.readFileSync(path.join(root, 'public', 'remote.html'), 'utf8')

const marks = {
  'desktop grid (min-width:900px)': 'min-width:900px',
  'like outline rule': '#likeBtn svg { fill:none',
  'queue cover img.qc': 'img.qc',
  'queue autoscroll': 'scrollQueueToActive',
  'PIN in cover url': 'pin=',
  'cover error badge': 'coverErr',
  'shuffle sends target state': "send('shuffle', { enabled",
}
for (const [k, v] of Object.entries(marks)) {
  console.log((built.includes(v) ? 'OK   ' : 'НЕТ   ') + k)
}
console.log('identical to public/remote.html:', built === src)

// Обложки в payload очереди живут в бандле рендерера.
let found = null
for (const f of fs.readdirSync(path.join(root, 'out', 'renderer', 'assets'))) {
  const s = fs.readFileSync(path.join(root, 'out', 'renderer', 'assets', f), 'utf8')
  if (s.includes('remote-queue-response') && s.includes('size=120')) { found = f; break }
}
console.log((found ? 'OK    ' : 'НЕТ   ') + 'обложки в очереди отдаются' + (found ? ' (' + found + ')' : ''))