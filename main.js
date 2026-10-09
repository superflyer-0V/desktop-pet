const { app, BrowserWindow, ipcMain, Menu, Tray, protocol, net, screen, shell, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const plugins = require('./plugins')

// 自定义 pet:// 协议：让渲染进程能像访问 http 一样加载本地文件（Live2D 模型用 fetch 拉取，必须走可 CORS 的 scheme）
protocol.registerSchemesAsPrivileged([
  { scheme: 'pet', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// 默认数据目录在 AppData；某些受限环境可把 PET_USER_DATA 指到项目内
if (process.env.PET_USER_DATA) app.setPath('userData', process.env.PET_USER_DATA)
plugins.setUserDataPath(app.getPath('userData'))

let win = null
let tray = null
let pinned = true
let autostart = false

// 配置路径：绿色版优先 exe 旁边的 pet.config.json（可随 exe 复制带走）；
// 目录版/安装版读用户数据目录；开发版读项目内。
// 若用户数据目录还没有配置文件，回退读打包进应用的默认配置（保证开箱即用）
function configPath() {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) return path.join(portableDir, 'pet.config.json')
  if (app.isPackaged) return path.join(app.getPath('userData'), 'pet.config.json')
  return path.join(__dirname, 'pet.config.json')
}

function loadConfig() {
  const cfgPath = configPath()
  try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')) } catch {}
  // 用户数据目录还没有配置文件时，回退读打包进应用的默认配置
  try {
    const bundled = path.join(__dirname, 'pet.config.json')
    if (bundled !== cfgPath) return JSON.parse(fs.readFileSync(bundled, 'utf8'))
  } catch {}
  return {}
}

function saveConfig(cfg) {
  try { fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)) } catch (e) { console.error('config save failed:', e.message) }
}

function readAI() {
  const ai = loadConfig().ai
  return ai && typeof ai === 'object' ? ai : {}
}

// 从配置的 GitHub 仓库同步所有插件。返回本次更新结果供托盘菜单提示。
async function syncAllPlugins() {
  const cfg = loadConfig()
  const src = plugins.pluginRepo(cfg)
  if (!src) return { ok: true, skipped: true, message: '未配置插件源（pet.config.json 的 pluginRepo 为空）' }
  if (!fs.existsSync(path.join(__dirname, 'renderer', 'models'))) fs.mkdirSync(path.join(__dirname, 'renderer', 'models'), { recursive: true })
  const base = plugins.pluginsDir()
  fs.mkdirSync(base, { recursive: true })
  try {
    // 插件源根目录下每个子目录即一个插件
    const tree = await plugins.listRemoteFiles(src)
    const roots = new Set(tree.map((f) => (f.rel.includes('/') ? f.rel.split('/')[0] : '__file__')))
    const total = []
    for (const dir of roots) {
      if (dir === '__file__') continue
      const n = await plugins.syncDir(src, dir, path.join(base, dir))
      if (n > 0) total.push(`${dir}: +${n}`)
    }
    if (!total.length) return { ok: true, message: '插件已是最新' }
    return { ok: true, message: '已更新插件：' + total.join('，') }
  } catch (e) {
    return { ok: false, message: '插件检查失败：' + e.message }
  }
}

function togglePin() {
  pinned = !pinned
  win.setAlwaysOnTop(pinned, 'screen-saver')
  updateMenus()
  return pinned
}

function toggleVisible() {
  if (!win) return
  if (win.isVisible()) win.hide()
  else win.show()
  updateMenus()
}

function setAutostart(v) {
  autostart = v
  const cfg = loadConfig()
  cfg.autostart = v
  saveConfig(cfg)
  try { app.setLoginItemSettings({ openAtLogin: v }) } catch (e) { console.error('autostart failed:', e.message) }
  updateMenus()
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: win && win.isVisible() ? '隐藏桌宠' : '显示桌宠', click: toggleVisible },
    { label: pinned ? '取消置顶' : '置顶显示', click: togglePin },
    { type: 'separator' },
    { label: '开机自启', type: 'checkbox', checked: autostart, click: (item) => setAutostart(item.checked) },
    { type: 'separator' },
    { label: '检查插件更新', click: () => runPluginCheck() },
    {
      label: '打开插件目录',
      click: () => { try { shell.openPath(plugins.pluginsDir()) } catch (e) { console.error(e.message) } },
    },
    { type: 'separator' },
    { label: '退出桌宠', click: () => app.quit() },
  ])
}

// 执行插件检查，用气泡提示结果（双击人物前的短暂文案）
function runPluginCheck() {
  syncAllPlugins().then((r) => {
    if (win && win.isVisible()) {
      win.webContents.send('pet:notify', r.message)
    }
  })
}

function updateMenus() {
  if (tray) tray.setContextMenu(buildMenu())
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png')
  if (!fs.existsSync(iconPath)) return
  tray = new Tray(nativeImage.createFromPath(iconPath))
  tray.setToolTip('我的桌宠')
  tray.on('click', toggleVisible)
  updateMenus()
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 560,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  // 默认点击穿透，只把鼠标移动转发给页面，用于判断指针是否悬停在宠物身上
  win.setIgnoreMouseEvents(true, { forward: true })

  const wa = screen.getPrimaryDisplay().workArea
  win.setPosition(wa.x + wa.width - 520, wa.y + wa.height - 600)

  win.loadURL('pet://app/index.html')
}

ipcMain.on('pet:set-grab', (_e, grab) => {
  win?.setIgnoreMouseEvents(!grab, { forward: true })
})

ipcMain.on('pet:move-by', (_e, dx, dy) => {
  if (!win) return
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  // 允许拖出屏幕一部分，但至少保留 keep 像素可见，防止把宠物弄丢
  const keep = 60
  const wa = screen.getDisplayNearestPoint({ x: x + w / 2, y: y + h / 2 }).workArea
  win.setPosition(
    Math.min(Math.max(Math.round(x + dx), wa.x - w + keep), wa.x + wa.width - keep),
    Math.min(Math.max(Math.round(y + dy), wa.y - h + keep), wa.y + wa.height - keep)
  )
})

ipcMain.on('pet:toggle-visible', toggleVisible)

ipcMain.handle('pet:toggle-pin', () => togglePin())

ipcMain.handle('pet:set-autostart', (_e, v) => {
  setAutostart(!!v)
  return autostart
})

ipcMain.on('pet:quit', () => app.quit())

ipcMain.handle('pet:get-ai', () => {
  const ai = readAI()
  return { configured: !!ai.apiKey, model: ai.model || '' }
})

async function aiChat(text) {
  const ai = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', ...readAI() }
  if (!ai.apiKey) return { ok: false, error: 'AI 大脑还没装好：请在 pet.config.json 里填写 apiKey' }
  try {
    const res = await fetch(`${ai.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({
        model: ai.model,
        temperature: 0.8,
        max_tokens: 300,
        messages: [
          { role: 'system', content: '你是住在用户电脑桌面上的桌宠精灵，叫小团。回答要简短、口语化、可爱，但不要用表情符号，一般一两句话说完，像朋友聊天那样。' },
          { role: 'user', content: String(text).slice(0, 500) },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, error: `AI 接口返回 ${res.status}：${detail.slice(0, 120)}` }
    }
    const data = await res.json()
    const reply = data?.choices?.[0]?.message?.content?.trim()
    return reply ? { ok: true, text: reply } : { ok: false, error: 'AI 返回了空内容' }
  } catch (e) {
    return { ok: false, error: `请求失败：${e.message}` }
  }
}

ipcMain.handle('pet:chat', (_e, text) => aiChat(text))

app.whenReady().then(() => {
  const ai0 = readAI()
  console.log(`[main] config=${configPath()} aiConfigured=${!!ai0.apiKey} model=${ai0.model || ''}`)

  // 自检模式：不创建窗口，直接调一次 AI 并把结果写到工作目录，方便自动化验证
  if (process.argv.includes('--pet-test-ai')) {
    aiChat('你好，简单说一句').then((r) => {
      const out = { ok: r.ok, text: r.text || r.error, ts: Date.now() }
      try { fs.writeFileSync(path.join(process.cwd(), 'ai-test-result.json'), JSON.stringify(out, null, 2)) } catch (e) {
        console.error('[ai-test] write result failed:', e.message)
      }
      console.log('[ai-test]', JSON.stringify(out))
      app.exit(r.ok ? 0 : 2)
    })
    return
  }

  autostart = !!loadConfig().autostart
  protocol.handle('pet', (req) => {
    const { host, pathname } = new URL(req.url)
    if (host === 'plugins') {
      // 插件文件：pet://plugins/<name>/... 映射到 userData/plugins/<name>/...
      const base = plugins.pluginsDir()
      const rel = decodeURIComponent(pathname).replace(/^[/\\]+/, '')
      const target = path.normalize(path.join(base, rel))
      if (!target.startsWith(base)) return new Response('Forbidden', { status: 403 })
      if (!fs.existsSync(target)) return new Response('Not Found', { status: 404 })
      return net.fetch(pathToFileURL(target).toString())
    }
    if (host !== 'app') return new Response('Not Found', { status: 404 })
    const rel = decodeURIComponent(pathname).replace(/^[/\\]+/, '')
    const target = path.normalize(path.join(__dirname, 'renderer', rel))
    if (!target.startsWith(path.join(__dirname, 'renderer'))) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(target).toString())
  })
  // 应用启动后自动检查一次插件源（失败静默，不打扰）
  syncAllPlugins().catch(() => {})
  createWindow()
  createTray()
})

app.on('window-all-closed', () => app.quit())
