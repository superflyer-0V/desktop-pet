// 验证自绘右键菜单：样式居中、打开、点击动作、空白关闭
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const PORT = 9777
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

    // 1. 右键点击人物中心 → 菜单打开
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 240, y: 520 })
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 240, y: 520, button: 'right', buttons: 2 })
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 240, y: 520, button: 'right', buttons: 0 })
    await sleep(400)
    const opened = await ev(`(() => {
      const m = document.getElementById('ctx-menu')
      const first = m.querySelector('[data-act="toggle-visible"]')
      const cs = getComputedStyle(first)
      return {
        open: m.classList.contains('open'),
        visibleText: first.textContent,
        pinText: m.querySelector('[data-act="toggle-pin"]').textContent,
        center: cs.textAlign === 'center' && cs.justifyContent === 'center' && cs.display === 'flex',
        menuLeft: Math.round(m.getBoundingClientRect().left),
      }
    })()`)
    console.log('MENU_OPEN:', JSON.stringify(opened))

    // 2. 点击"置顶显示" → 菜单关闭，且置顶状态切换
    await ev(`document.querySelector('[data-act="toggle-pin"]').click()`)
    await sleep(400)
    const afterPin = await ev(`(() => {
      const m = document.getElementById('ctx-menu')
      return { open: m.classList.contains('open') }
    })()`)
    console.log('AFTER_PIN_CLICK (open should be false):', JSON.stringify(afterPin))

    // 3. 再右键打开 → "置顶显示" 应变为 "取消置顶"
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 240, y: 520, button: 'right', buttons: 2 })
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 240, y: 520, button: 'right', buttons: 0 })
    await sleep(400)
    const reopened = await ev(`(() => {
      const m = document.getElementById('ctx-menu')
      const pin = m.querySelector('[data-act="toggle-pin"]').textContent
      return { open: m.classList.contains('open'), pinText: pin }
    })()`)
    console.log('REOPENED (pinText should be 取消置顶):', JSON.stringify(reopened))

    // 4. 左键点击空白处 → 菜单关闭
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 10, button: 'left', buttons: 1, clickCount: 1 })
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 10, y: 10, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(400)
    const closed = await ev(`document.getElementById('ctx-menu').classList.contains('open')`)
    console.log('AFTER_BLANK_CLICK (should be false):', closed)

    console.log('TEST_DONE')
  } finally {
    app.kill()
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })
