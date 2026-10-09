// 验证：双击打开输入框后不再出现 "AI 已连接" 提示气泡
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const PORT = 9888
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

;(async () => {
  const app = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore' })
  try {
    let target = null
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await getJson(`http://127.0.0.1:${PORT}/json/list`)
        target = list.find((x) => x.type === 'page' && x.url.includes('pet://app'))
      } catch {}
      if (!target) await new Promise((r) => setTimeout(r, 1000))
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

    let id = 0
    const cdp = (m, p) => new Promise((res, rej) => {
      const i = ++id
      const fn = (ev) => {
        const x = JSON.parse(ev.data)
        if (x.id === i) {
          ws.removeEventListener('message', fn)
          x.error ? rej(new Error(JSON.stringify(x.error))) : res(x.result)
        }
      }
      ws.addEventListener('message', fn)
      ws.send(JSON.stringify({ id: i, method: m, params: p || {} }))
    })
    const ev = async (e) => {
      const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
      return r && r.result && r.result.value
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    for (let i = 0; i < 20; i++) {
      if (await ev('!!window.__petReady')) break
      await sleep(1000)
    }
    await sleep(1500)

    const dc = async (x, y) => {
      for (const cc of [1, 2]) {
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: cc })
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: cc })
        await sleep(40)
      }
    }

    await dc(240, 520)
    await sleep(800)
    const r = await ev(`(() => {
      const b = document.getElementById('bubble')
      const c = document.getElementById('chatbar')
      return {
        chatOpen: c.classList.contains('visible'),
        bubbleText: b.textContent,
        bubbleVisible: b.classList.contains('visible'),
      }
    })()`)
    console.log('OPEN_CHAT:', JSON.stringify(r))
    console.log('TEST_DONE')
  } finally {
    app.kill()
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
