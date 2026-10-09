const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pet', {
  setGrab: (grab) => ipcRenderer.send('pet:set-grab', grab),
  moveBy: (dx, dy) => ipcRenderer.send('pet:move-by', dx, dy),
  toggleVisible: () => ipcRenderer.send('pet:toggle-visible'),
  togglePin: () => ipcRenderer.invoke('pet:toggle-pin'),
  setAutostart: (v) => ipcRenderer.invoke('pet:set-autostart', v),
  quit: () => ipcRenderer.send('pet:quit'),
  getAI: () => ipcRenderer.invoke('pet:get-ai'),
  chat: (text) => ipcRenderer.invoke('pet:chat', text),
  notify: (cb) => ipcRenderer.on('pet:notify', (_e, msg) => cb(msg)),
})
