// CDP 诊断：打开聊天框 + 长回复气泡，测量其在窗口内的实际位置，找出显示不完整的原因
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 9333
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

    // 等模型加载完
    await new Promise((r) => setTimeout(r, 4000))

    console.log('VIEWPORT:', JSON.stringify(await evalJs('({w: innerWidth, h: innerHeight, dpr: devicePixelRatio})')))

    // 打开聊天框并填入长文本
    console.log('CHATBAR_OPEN:', JSON.stringify(await evalJs(`(() => {
      const el = document.getElementById('chatbar')
      el.classList.add('visible')
      document.getElementById('chat-input').value = '这是一条用于测试的长输入内容，看看输入框会不会显示不全，一二三四五六七八九十'
      const r = el.getBoundingClientRect()
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height}
    })()`)))

    // 长回复气泡（模拟 showBubble 的 down 切换：内容高于头顶空间时向下展开）
    console.log('BUBBLE_LONG:', JSON.stringify(await evalJs(`(() => {
      const b = document.getElementById('bubble')
      b.classList.add('visible')
      b.classList.add('down')
      b.textContent = '这是一段很长的AI回复测试文本，'.repeat(40)
      const r = b.getBoundingClientRect()
      const s = {left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, scrollH: b.scrollHeight}
      return s
    })()`)))

    // 短回复（应保持向上展开，不遮挡脸部）
    console.log('BUBBLE_SHORT:', JSON.stringify(await evalJs(`(() => {
      const b = document.getElementById('bubble')
      b.classList.remove('down')
      b.textContent = '唔，别摸头啦…'
      const r = b.getBoundingClientRect()
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height}
    })()`)))

    // 截图
    const shot = await cdp(ws, Math.floor(Math.random() * 1e6), 'Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(__dirname, '..', 'chatbar-debug.png'), Buffer.from(shot.data, 'base64'))
    console.log('SCREENSHOT_SAVED')

    ws.close()
  } catch (e) {
    console.error('DIAG_FAIL:', e.message)
  } finally {
    app.kill()
  }
})()
