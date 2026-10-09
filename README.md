# DesktopPet 桌面桌宠

基于 Electron + Live2D 的桌面桌宠应用，支持 AI 聊天、拖拽互动、插件扩展。

## 功能

- Live2D 模型渲染（Cubism 4/5），支持摸头、戳身体等轻量互动
- 双击人物打开 AI 聊天（默认接入 DeepSeek，可在 `pet.config.json` 配置）
- 系统托盘菜单：隐藏/显示、置顶、开机自启、退出
- 插件系统：从 GitHub 仓库自动拉取新功能，托盘菜单「检查插件更新」手动同步

## 快速开始

```bash
npm install
npm start        # 开发运行
npm run dist     # 生成免安装目录（release/）
npm run dist:installer  # 生成 NSIS 安装包 + 便携版（release/）
```

## 配置

应用安装后，配置文件位于用户数据目录 `pet.config.json`（便携版则在 exe 同目录）：

```json
{
  "ai": {
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "在这里填你的 DeepSeek API Key",
    "model": "deepseek-chat"
  },
  "pluginRepo": {
    "owner": "superflyer-0V",
    "repo": "desktop-pet",
    "branch": "main",
    "path": "plugins"
  }
}
```

- `ai.apiKey` 为空时 AI 聊天不可用，填上即可
- `pluginRepo` 指向插件源仓库（公开仓库，无需 Token）；仓库根下 `plugins/` 目录中的每个子目录即一个插件

## 插件开发

在插件源仓库的 `plugins/` 目录下新建子目录，放一个 Live2D 模型（含 `*.model3.json`）或任意资源文件，推送后用户点击托盘「检查插件更新」即可拉取。

## 下载

正式版安装包见 [Releases](https://github.com/superflyer-0V/desktop-pet/releases)：

- `DesktopPet Setup 1.0.0.exe`：安装向导版
- `DesktopPet 1.0.0.exe`：便携版（解压即用）

## 技术栈

- Electron 33
- Pixi.js + pixi-live2d-display
- Live2D Cubism Core
