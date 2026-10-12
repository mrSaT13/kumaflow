// Проверка установленной сборки: правки должны лежать внутри app.asar.
const fs = require('fs')

const p = 'A:/kumaflow/resources/app.asar'
const b = fs.readFileSync(p)
// asar — это контейнер: заголовок JSON + сырые файлы. Ищем прямо в байтах,
// распаковывать не нужно: строки лежат как есть.
const s = b.toString('latin1')

const checks = {
  'desktop grid (min-width:900px)': 'min-width:900px',
  'like outline rule': '#likeBtn svg { fill:none',
  'queue autoscroll': 'scrollQueueToActive',
  'queue cover css': 'img.qc',
  'PIN in cover url': 'pin=',
  'shuffle target state': "send('shuffle', { enabled",
  'queue coverArt payload': 'size=120',
}
for (const [k, v] of Object.entries(checks)) {
  console.log((s.includes(v) ? 'OK    ' : 'НЕТ   ') + k)
}
console.log('asar size: ' + (b.length / 1024 / 1024).toFixed(1) + ' MB (node_modules внутри быть не должно)')