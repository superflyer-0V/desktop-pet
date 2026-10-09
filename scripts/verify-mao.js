// 验证 Mao 模型加载：启动目录版 exe，通过 CDP 捕获渲染进程 console 日志
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const PORT = 9444
const EXE = path.join(__dirname, '..', 'release', 'win-unpacked', 'DesktopPet.exe')

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => {
        try { resolve(JSON.parse(d)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

async function waitTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json/list`)
      const page = list.find((t) => t.type === 'page' && t.url.includes('pet://app'))
      if (page) return page
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('no pet page target')
}

;(async () => {
  const app = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore' })
  try {
    const target = await waitTarget()
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

    const logs = []
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
        logs.push(text)
      }
    })
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }))

    // 等待模型加载完成（最长 30 秒）
    let ok = false
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (logs.some((l) => l.includes('[pet] model ready'))) { ok = true; break }
    }

    console.log('MODEL_READY:', ok)
    console.log('ALL_LOGS:', JSON.stringify(logs.slice(0, 30)))
  } finally {
    app.kill()
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
