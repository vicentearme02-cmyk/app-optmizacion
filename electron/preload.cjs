const { contextBridge, ipcRenderer } = require('electron');

// Expose narrowly scoped operations, never an IPC transport or a shell executor.
contextBridge.exposeInMainWorld('optimizer', Object.freeze({
  getSystemInfo: () => ipcRenderer.invoke('optimizer:hardware'),
  getTweakStates: () => ipcRenderer.invoke('optimizer:states'),
  applyTweaks: ids => ipcRenderer.invoke('optimizer:apply', ids),
  listBackups: () => ipcRenderer.invoke('optimizer:backups'),
  restoreBackup: id => ipcRenderer.invoke('optimizer:restore', id),
  windowControl: action => {
    if (['minimize', 'maximize', 'close'].includes(action)) ipcRenderer.send('optimizer:window', action);
  },
}));
