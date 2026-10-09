import { ShaderSystem } from '@pixi/core'
import { install } from '@pixi/unsafe-eval'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

// CSP 禁止 eval，Pixi v6 某些内部路径需要这个补丁
install({ ShaderSystem })
// 让模型跟随 Pixi 的 ticker 自动播放动画
Live2DModel.registerTicker(PIXI.Ticker)

// 换成你自己的模型时，把这个 URL 指向新的 model3.json 即可
const MODEL_URL = 'pet://app/models/mao_pro/mao_pro.model3.json'

let model = null
let grab = false
let dragging = false
let dragLast = { x: 0, y: 0 }
let dragPointer = null
let dragRaf = false
let clickStart = null
let basePos = null
let dragDelta = { x: 0, y: 0 }
let lastClickAt = 0
let chatOpen = false
let awaiting = false
let hideTimer = null
let twTimer = null
let bubbleTop = 0
let chatHideTimer = null
let lastX = -1
let lastY = -1

const bubble = document.getElementById('bubble')
const chatbar = document.getElementById('chatbar')
const chatInput = document.getElementById('chat-input')

async function main() {
  const app = new PIXI.Application({
    view: document.getElementById('stage'),
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resizeTo: window,
  })

  model = await Live2DModel.from(MODEL_URL)
  app.stage.addChild(model)

  model.anchor.set(0.5, 1)
  model.interactive = true

  await new Promise((resolve) => app.ticker.addOnce(resolve))
  const bounds = model.getBounds()
  const scale =
    bounds.width > 0 && bounds.height > 0
      ? Math.min(app.screen.width / bounds.width, app.screen.height / bounds.height) * 0.92
      : 0.4
  model.scale.set(scale)
  model.position.set(app.screen.width / 2, app.screen.height)
  console.log('[pet] model ready url=', MODEL_URL, 'bounds=', Math.round(bounds.width), 'x', Math.round(bounds.height), 'scale=', scale, 'window=', app.screen.width, 'x', app.screen.height)

  window.addEventListener('pointermove', (e) => {
    lastX = e.clientX
    lastY = e.clientY
    if (dragging) {
      dragPointer = { x: e.clientX, y: e.clientY }
      if (!dragRaf) {
        dragRaf = true
        requestAnimationFrame(flushDrag)
      }
      return
    }
    updateChatHover()
    setGrab(pointed(e.clientX, e.clientY))
  })

  // 拖拽时把一帧内最新的位移合并成一次更新，避免事件堆积导致跟手慢
  function flushDrag() {
    dragRaf = false
    if (!dragPointer) return
    const { x, y } = dragPointer
    dragPointer = null
    if (!basePos) return
    const dx = x - dragLast.x
    const dy = y - dragLast.y
    dragLast = { x, y }
    dragDelta.x += dx
    dragDelta.y += dy
    // 模型先在窗口内跟手：由 WebGL 每帧重绘，窗口不动，不会产生系统级重影
    const b = model.getBounds()
    const minX = b.width / 2
    const maxX = window.innerWidth - b.width / 2
    const minY = b.height
    const maxY = window.innerHeight
    const cX = Math.max(minX - basePos.x, Math.min(dragDelta.x, maxX - basePos.x))
    const cY = Math.max(minY - basePos.y, Math.min(dragDelta.y, maxY - basePos.y))
    model.position.set(basePos.x + cX, basePos.y + cY)
    // 模型顶到窗口边缘后，剩余位移才移动窗口（把窗口移动量减到最小）
    const ex = dragDelta.x - cX
    const ey = dragDelta.y - cY
    if (ex !== 0 || ey !== 0) window.pet.moveBy(ex, ey)
  }

  window.addEventListener('pointerleave', () => {
    lastX = -1
    lastY = -1
    updateChatHover()
    if (!dragging) setGrab(false)
  })

  window.addEventListener('pointerup', (e) => {
    dragging = false
    basePos = null
    // 只有左键才算点击，右键松开不触发摸头
    const click =
      e.button === 0 &&
      clickStart &&
      Date.now() - clickStart.t < 600 &&
      Math.abs(e.clientX - clickStart.x) < 6 &&
      Math.abs(e.clientY - clickStart.y) < 6
    console.log('[pet] pointerup', Math.round(e.clientX), Math.round(e.clientY), 'click=', !!click, 'clickStart=', !!clickStart)
    clickStart = null
    if (!pointed(e.clientX, e.clientY)) setGrab(false)
    if (click) handleClick(e.clientX, e.clientY)
  })

  window.addEventListener('blur', () => {
    dragging = false
    clickStart = null
    basePos = null
    setGrab(false)
  })

  model.on('pointerdown', (e) => {
    // 只响应左键：右键不触发摸头或拖拽
    if (e.data.originalEvent.button !== 0) return
    console.log('[pet] model pointerdown at', Math.round(e.data.global.x), Math.round(e.data.global.y))
    dragging = true
    clickStart = { x: e.data.global.x, y: e.data.global.y, t: Date.now() }
    dragLast = { x: e.data.global.x, y: e.data.global.y }
    basePos = { x: model.position.x, y: model.position.y }
    dragDelta = { x: 0, y: 0 }
  })

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat()
    else if (e.key === 'Escape') closeChat()
  })
  document.getElementById('chat-send').addEventListener('click', sendChat)

  app.ticker.add(() => {
    const b = model.getBounds()
    if (b.width <= 0) return
    bubbleTop = Math.max(6, b.y - 6)
    bubble.style.left = `${b.x + b.width / 2}px`
    bubble.style.top = `${bubbleTop}px`
    // 输入框跟随人物：水平对齐人物中心，垂直贴住人物脚底上方，人物动它就跟到哪
    const cw = chatbar.offsetWidth || 300
    const ch = chatbar.offsetHeight || 36
    const cx = Math.max(cw / 2 + 4, Math.min(b.x + b.width / 2, window.innerWidth - cw / 2 - 4))
    const cy = Math.max(ch + 10, model.position.y - ch - 10)
    chatbar.style.left = `${cx}px`
    chatbar.style.top = `${cy}px`
  })
}

function pointed(x, y) {
  if (modelHit(x, y)) return true
  if (!chatOpen) return false
  const r = chatbar.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function modelHit(x, y) {
  const b = model.getBounds()
  return b.width > 0 && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
}

function setGrab(v) {
  if (v === grab) return
  grab = v
  window.pet.setGrab(v)
}

async function handleClick(x, y) {
  const now = Date.now()
  const isDouble = now - lastClickAt < 400
  lastClickAt = now

  const head = model.hitTest('Head', x, y)
  const body = model.hitTest('Body', x, y)
  console.log('[pet] handleClick', Math.round(x), Math.round(y), 'head=', head, 'body=', body, 'isDouble=', isDouble)
  if (!head && !body) {
    closeChat()
    return
  }
  if (isDouble) {
    openChat()
    return
  }
  playReaction()
}

async function playReaction() {
  console.log('[pet] playReaction start')
  try {
    const idx = Math.floor(Math.random() * 2)
    await Promise.race([
      model.motion('Tap', idx),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
  } catch (e) { console.log('[pet] motion failed:', e.message) }
  // 只做摸头动作，不再弹出台词
  console.log('[pet] playReaction done')
}

function openChat() {
  if (chatOpen) return
  chatOpen = true
  chatbar.classList.add('visible')
  chatInput.focus()
}

function closeChat() {
  chatOpen = false
  chatbar.classList.remove('visible')
  clearTimeout(chatHideTimer)
  chatHideTimer = null
}

// 鼠标离开人物（或输入框、气泡）区域后，短暂延迟自动收起输入框
function updateChatHover() {
  if (!chatOpen) return
  const near = modelHit(lastX, lastY) || rectHit(chatbar, lastX, lastY) || rectHit(bubble, lastX, lastY)
  if (near) {
    clearTimeout(chatHideTimer)
    chatHideTimer = null
  } else if (!chatHideTimer) {
    chatHideTimer = setTimeout(closeChat, 600)
  }
}

function rectHit(el, x, y) {
  const r = el.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text || awaiting) return
  chatInput.value = ''
  awaiting = true
  showBubble('……', 0, false)
  const res = await window.pet.chat(text)
  awaiting = false
  showBubble(res.ok ? res.text : res.error, res.ok ? 0 : 6000, res.ok)
}

function showBubble(text, hideAfter = 0, type = false) {
  clearInterval(twTimer)
  clearTimeout(hideTimer)
  bubble.textContent = text
  // 按完整文本测量高度：头顶放不下就向下展开，避免被窗口上沿裁切
  bubble.classList.toggle('down', bubble.scrollHeight > bubbleTop)
  if (type) {
    bubble.textContent = ''
    let i = 0
    twTimer = setInterval(() => {
      i += 3
      bubble.textContent = text.slice(0, i)
      if (i >= text.length) clearInterval(twTimer)
    }, 16)
  }
  bubble.classList.add('visible')
  if (hideAfter > 0) hideTimer = setTimeout(() => bubble.classList.remove('visible'), hideAfter)
}

// 主进程通知（如插件更新结果），用气泡短暂显示
window.pet.notify((msg) => {
  showBubble(String(msg), 4000)
})

main()
