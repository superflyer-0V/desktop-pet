// 验证：输入框跟随人物 + 鼠标离开人物区域后自动关闭
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const PORT = 9555
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

    let msgId = 0
    function cdp(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++msgId
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
    const evalJs = async (expr) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      return r?.result?.value
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    // 等模型加载
    for (let i = 0; i < 20; i++) {
      const ready = await evalJs(`!!window.__petReady`)
      if (ready) break
      await sleep(1000)
    }
    await sleep(1500)

    // 人物中心（模型 bounds 中心）
    const c = await evalJs(`(() => { const el = document.getElementById('stage'); const r = el.getBoundingClientRect(); return { w: r.width, h: r.height } })()`)
    const cx = Math.round(c.w / 2)
    const cy = Math.round(c.h - 40)
    console.log('center:', cx, cy)

    async function doubleClick(x, y) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      await sleep(50)
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2 })
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 })
    }
    async function move(x, y) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    }

    // 1. 双击打开输入框
    await doubleClick(cx, cy)
    await sleep(700)
    const open1 = await evalJs(`(() => { const b = document.getElementById('chatbar'); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { visible: b.classList.contains('visible'), left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), transition: cs.transitionProperty } })()`)
    console.log('AFTER_DOUBLECLICK:', JSON.stringify(open1))

    // 2. 垂直绑定：先让输入框关闭，再按住人物向上拖，输入框定位应跟随模型上移
    await move(8, 8)
    await sleep(800)
    const dragFrom = { x: cx, y: cy }
    const dragTo = { x: cx, y: Math.round(cy - 180) }
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragFrom.x, y: dragFrom.y })
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragFrom.x, y: dragFrom.y, button: 'left', clickCount: 1 })
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragTo.x, y: dragTo.y, button: 'left', buttons: 1 })
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragTo.x, y: dragTo.y, button: 'left', clickCount: 1 })
    await sleep(400)
    const afterDrag = await evalJs(`(() => { const b = document.getElementById('chatbar'); const r = b.getBoundingClientRect(); return { visible: b.classList.contains('visible'), top: Math.round(r.top) } })()`)
    console.log('AFTER_DRAG_UP (top should be ~334 < 488):', JSON.stringify(afterDrag))

    // 3. 在模型新位置双击打开，输入框应在新位置（top 约 334）而非底部
    await doubleClick(dragTo.x, dragTo.y)
    await sleep(700)
    const reopen = await evalJs(`(() => { const b = document.getElementById('chatbar'); const r = b.getBoundingClientRect(); return { visible: b.classList.contains('visible'), top: Math.round(r.top), left: Math.round(r.left) } })()`)
    console.log('REOPEN_AFTER_DRAG (top should be ~334):', JSON.stringify(reopen))

    // 3. 鼠标移到远离人物的角落 → 应自动关闭，且关闭过程有过渡动画（visibility hidden 晚于 opacity 归零）
    await move(8, 8)
    await sleep(100)
    const fading = await evalJs(`(() => { const b = document.getElementById('chatbar'); const cs = getComputedStyle(b); return { visible: b.classList.contains('visible'), opacity: cs.opacity, vis: cs.visibility } })()`)
    await sleep(800)
    const closed = await evalJs(`(() => { const b = document.getElementById('chatbar'); const cs = getComputedStyle(b); return { visible: b.classList.contains('visible'), opacity: cs.opacity, vis: cs.visibility } })()`)
    console.log('FADING_MIDDLE:', JSON.stringify(fading))
    console.log('AFTER_LEAVE (should be hidden):', JSON.stringify(closed))

    // 4. 再打开，鼠标保持人物中心 → 应保持打开
    await doubleClick(cx, cy)
    await sleep(700)
    await move(cx, cy)
    await sleep(800)
    const stillOpen = await evalJs(`document.getElementById('chatbar').classList.contains('visible')`)
    console.log('STAY_ON_MODEL (should be true):', stillOpen)

    console.log('TEST_DONE')
  } finally {
    app.kill()
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
