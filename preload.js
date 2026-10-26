const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onSay: (cb) => ipcRenderer.on('say', (_e, m) => cb(m)),
  setIgnore: (v) => ipcRenderer.send('ignore', v),
  dragStart: () => ipcRenderer.send('drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('drag-move', dx, dy),
  dragEnd: () => ipcRenderer.send('drag-end'),
  context: () => ipcRenderer.send('context'),
  choice: (id) => ipcRenderer.send('choice', id),
  chat: (t) => ipcRenderer.invoke('chat', t),
  focus: () => ipcRenderer.send('focus'),
  clicked: () => ipcRenderer.send('clicked'),
});
