// CDP 验证新拖拽逻辑：
//   内部行程内（模型还没到窗口边缘）：窗口位置不变，模型在窗口内跟手
//   贴边后：剩余位移移动窗口
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const PORT = 9334
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
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json/list`)
      const page = list.find((t) => t.type === 'page' && t.url.includes('pet://app'))
      if (page) return page
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('no pet page target')
}

function cdp(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id === id) {
        ws.removeEventListener('message', onMsg)
        if (m.error) reject(new Error(JSON.stringify(m.error)))
        else resolve(m.result)
      }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params: params || {} }))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const app = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore' })
  try {
    const target = await waitTarget()
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

    const evalJs = async (expr) => {
      const r = await cdp(ws, Math.floor(Math.random() * 1e6), 'Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true,
      })
      return r?.result?.value
    }

    await sleep(9000) // 等模型加载

    // 当前状态：窗口位置 + 气泡位置（气泡跟随模型，可反映模型位置）
    const state = async () =>
      await evalJs(`(() => {
        const b = document.getElementById('bubble')
        const r = b.getBoundingClientRect()
        return { winX: screenX, winY: screenY, bubbleCX: r.left + r.width / 2, bubbleTop: r.top, w: innerWidth, h: innerHeight }
      })()`)

    const s0 = await state()
    console.log('S0:', JSON.stringify(s0))

    // 在模型身体上按下（bubble 中心 x，bubble 下方 280px 处，约模型身体中部）
    const px = Math.round(s0.bubbleCX)
    const py = Math.round(s0.bubbleTop + 280)
    console.log('PRESS_AT:', px, py)

    const ev = (method, params) => cdp(ws, Math.floor(Math.random() * 1e6), 'Input.dispatchMouseEvent', params)
    await ev('mousePressed', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(80)

    // 向右拖 150px，分 5 步，每步后记录窗口位置和气泡位置
    const step = 30
    const N = 5
    for (let i = 1; i <= N; i++) {
      const tx = px + step * i
      await ev('mouseMoved', { type: 'mouseMoved', x: tx, y: py, button: 'left', buttons: 1 })
      await sleep(120)
      const s = await state()
      console.log(`STEP${i}:`, JSON.stringify(s), 'bubbleDX=', Math.round(s.bubbleCX - s0.bubbleCX), 'winDX=', s.winX - s0.winX)
    }

    await ev('mouseReleased', { type: 'mouseReleased', x: px + step * N, y: py, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(200)
    const sEnd = await state()
    console.log('S_END:', JSON.stringify(sEnd), 'bubbleDX=', Math.round(sEnd.bubbleCX - s0.bubbleCX), 'winDX=', sEnd.winX - s0.winX)

    ws.close()
  } catch (e) {
    console.error('DIAG_FAIL:', e.message)
  } finally {
    app.kill()
  }
})()
