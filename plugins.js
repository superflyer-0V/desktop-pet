// 插件系统：从 GitHub 公开仓库拉取插件目录，下载到本地 userData/plugins 下。
// 插件源在 pet.config.json 里配置：
//   "pluginRepo": { "owner": "yourname", "repo": "desktop-pet-plugins", "branch": "main", "path": "plugins" }
// 仓库公开即可，无需 token（GitHub 匿名读取 trees API 有 60 次/小时配额，足够个人使用）。
const path = require('path')
const fs = require('fs')

const GITHUB_API = 'https://api.github.com'
const GITHUB_RAW = 'https://raw.githubusercontent.com'

// 本地插件根目录。userDataPath 由 main.js 注入，便于独立测试（不依赖 electron）
let userDataPath = null
function setUserDataPath(p) { userDataPath = p }

function pluginsDir() {
  if (!userDataPath) throw new Error('userDataPath 未设置')
  return path.join(userDataPath, 'plugins')
}

// 解析配置，识别插件库位置。owner/repo 缺失时返回 null（表示未配置远程源）
function pluginRepo(cfg) {
  cfg = cfg || {}
  const repo = cfg.pluginRepo
  if (!repo || !repo.owner || !repo.repo) return null
  return {
    owner: String(repo.owner).trim(),
    repo: String(repo.repo).trim(),
    branch: (repo.branch || 'main').trim() || 'main',
    dir: (repo.path || 'plugins').replace(/^\/+|\/+$/g, ''),
  }
}

async function gitHubFetch(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'desktop-pet-plugin', Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub 返回 ${res.status}`)
  return res.json()
}

// 递归取目录下所有文件路径及大小
async function listRemoteFiles(src) {
  const treeUrl = `${GITHUB_API}/repos/${src.owner}/${src.repo}/git/trees/${src.branch}?recursive=1`
  const tree = await gitHubFetch(treeUrl)
  const prefix = (src.dir ? src.dir + '/' : '')
  // 100644=普通文件, 100755=可执行文件；120000=symlink、160000=submodule 均不可 raw 下载，需排除
  const okMode = new Set(['100644', '100755'])
  return (tree.tree || [])
    .filter((n) => n.type === 'blob' && okMode.has(n.mode) && n.path.startsWith(prefix))
    .map((n) => ({ rel: n.path.slice(prefix.length), size: n.size || 0 }))
    .filter((f) => f.rel)
}

async function downloadRaw(src, rel, retries = 3) {
  // rel 是相对 src.dir 的路径；src.dir 为空时 rel 即仓库根下相对路径
  const base = src.dir ? src.dir + '/' : ''
  const url = `${GITHUB_RAW}/${src.owner}/${src.repo}/${src.branch}/${encodeURI(base + rel)}`
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'desktop-pet-plugin' } })
      if (!res.ok) throw new Error(`下载失败 ${res.status}: ${rel}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (attempt === retries) throw e
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
}

// diff：返回需要新增/更新的文件（以大小变化为准）
function diffFiles(remote, localBase) {
  const localMap = new Map()
  if (fs.existsSync(localBase)) {
    for (const rel of walk(localBase)) {
      try { localMap.set(rel, fs.statSync(path.join(localBase, rel)).size) } catch {}
    }
  }
  return remote.filter((r) => localMap.get(r.rel) !== r.size)
}

function walk(dir, base) {
  const out = []
  base = base || dir
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e)
    const rel = path.relative(base, p).split(path.sep).join('/')
    if (fs.statSync(p).isDirectory()) out.push(...walk(p, base))
    else out.push(rel)
  }
  return out
}

// 同步一个插件目录。返回本次更新的文件数。
async function syncDir(src, rel, localDir) {
  const remoteFiles = await listRemoteFiles({ ...src, dir: rel })
  if (!remoteFiles.length) return 0
  const pending = diffFiles(remoteFiles, localDir)
  for (const f of pending) {
    const data = await downloadRaw(src, rel + '/' + f.rel)
    const out = path.join(localDir, ...f.rel.split('/'))
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, data)
  }
  return pending.length
}

module.exports = { pluginsDir, setUserDataPath, pluginRepo, diffFiles, listRemoteFiles, syncDir }