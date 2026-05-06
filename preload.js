const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  focusWindow:  () => ipcRenderer.send('focus-window'),
  enterCompact: () => ipcRenderer.send('enter-compact'),
  exitCompact:  () => ipcRenderer.send('exit-compact'),
  winMinimize:  () => ipcRenderer.send('win-minimize'),
  winClose:     () => ipcRenderer.send('win-close'),
});
