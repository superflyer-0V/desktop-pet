// 独立验证插件下载链路：使用 Live2D 官方 CubismWebSamples（纯文件、无 submodule/symlink）
const path = require('path')
const os = require('os')
const fs = require('fs')
const plugins = require('../plugins')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-plugintest-'))
plugins.setUserDataPath(tmp)

const src = {
  owner: 'githubtraining',
  repo: 'hellogitworld',
  branch: 'master',
  dir: '',
}

;(async () => {
  try {
    // 1. 列出远端文件
    const files = await plugins.listRemoteFiles(src)
    console.log('listRemoteFiles count =', files.length)
    if (!files.length) throw new Error('远端文件列表为空')
    console.log('sample rel:', files[0].rel)

    // 2. 同步插件目录（src 是一个插件）
    const localDir = path.join(tmp, 'src')
    const n = await plugins.syncDir(src, 'src', localDir)
    console.log('syncDir updated =', n)
    if (!n) throw new Error('未下载任何文件')

    // 3. 二次同步同一插件目录应返回 0（已是最新）
    const n2 = await plugins.syncDir(src, 'src', localDir)
    console.log('syncDir re-run updated =', n2, '(expect 0)')
    if (n2 !== 0) throw new Error(`二次同步应返回 0，实际 ${n2}`)

    // 4. 校验本地真实文件落地（Division.groovy 确属 src 插件目录）
    const local = path.join(localDir, 'Division.groovy')
    console.log('local file exists =', fs.existsSync(local), 'size =', fs.existsSync(local) ? fs.statSync(local).size : 0)
    if (!fs.existsSync(local)) throw new Error('src 插件文件未落地')

    console.log('PLUGIN_TEST_OK')
  } catch (e) {
    console.error('PLUGIN_TEST_FAIL:', e)
    process.exit(1)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})()