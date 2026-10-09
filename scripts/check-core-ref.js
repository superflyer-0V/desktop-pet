const fs = require('fs')
const path = require('path')
const base = path.join(__dirname, '..', 'node_modules', 'pixi-live2d-display')
const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'))
console.log('pixi-live2d-display version:', pkg.version)
console.log('pkg.json:', JSON.stringify(pkg.exports || pkg.main || pkg.module || '', null, 0))

// 找到 cubism4 入口
const candidates = [
  path.join(base, 'cubism4.js'),
  path.join(base, 'cubism4.mjs'),
  path.join(base, 'dist', 'cubism4.js'),
  path.join(base, 'dist', 'cubism4.mjs'),
]
for (const c of candidates) {
  if (fs.existsSync(c)) {
    const s = fs.readFileSync(c, 'utf8')
    console.log('entry:', path.basename(c), 'len:', s.length)
    console.log('core refs:', (s.match(/live2dcubismcore/g) || []).length)
    const i = s.indexOf('live2dcubismcore')
    if (i >= 0) console.log('context:', s.slice(Math.max(0, i - 120), i + 160))
  }
}
