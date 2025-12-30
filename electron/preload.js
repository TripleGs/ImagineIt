const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    listFiles: () => ipcRenderer.invoke('file:list'),
    saveFile: (name, content) => ipcRenderer.invoke('file:save', name, content),
    loadFile: (name) => ipcRenderer.invoke('file:load', name),
    updateMetadata: (filename, metadata) => ipcRenderer.invoke('file:update-meta', filename, metadata),
    deleteFile: (filename) => ipcRenderer.invoke('file:delete', filename),
    renameFile: (oldName, newName) => ipcRenderer.invoke('file:rename', oldName, newName),
    setAppIcon: (dataUrl) => ipcRenderer.invoke('app:set-icon', dataUrl)
});
