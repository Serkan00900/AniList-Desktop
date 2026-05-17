const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveToken: (tokenData) => ipcRenderer.invoke('save-token', tokenData),
  loadToken: () => ipcRenderer.invoke('load-token'),
  deleteToken: () => ipcRenderer.invoke('delete-token'),
  openExternal: (url) => ipcRenderer.invoke('open-external-link', url),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  openAdBrowser: (url) => ipcRenderer.invoke('open-external-link', url)
});