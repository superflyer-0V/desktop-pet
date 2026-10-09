// 验证淡出过渡中间态：关闭开始后 opacity 应在 0~1 之间（动画播放中）
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const PORT = 9666
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
    await sleep(700)
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 })
    await sleep(650) // 600ms 自动关闭已触发，过渡进行到 ~50ms
    const mid = await ev('(()=>{const b=document.getElementById("chatbar");const s=getComputedStyle(b);return{vis:b.classList.contains("visible"),op:s.opacity}})()')
    console.log('MID_FADE (vis=true, 0<op<1):', JSON.stringify(mid))
    await sleep(400)
    const end = await ev('(()=>{const b=document.getElementById("chatbar");const s=getComputedStyle(b);return{vis:b.classList.contains("visible"),op:s.opacity}})()')
    console.log('END_FADE (vis=false, op=0):', JSON.stringify(end))
  } finally {
    app.kill()
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
