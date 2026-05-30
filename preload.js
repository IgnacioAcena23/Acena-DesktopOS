/**
 * Ace-a-DesktopOS - Preload Script
 * Bridge seguro entre el proceso principal (Node.js) y el renderer (página web).
 * Usa contextBridge para exponer solo las funciones necesarias.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Indicador de que estamos en Electron
    isElectron: true,

    // --- APIs del Sistema ---
    getSystemStats: () => ipcRenderer.invoke('system:getStats'),
    getProcesses: () => ipcRenderer.invoke('system:getProcesses'),
    launchApp: (appName) => ipcRenderer.invoke('system:launchApp', appName),
    killProcess: (pid) => ipcRenderer.invoke('system:killProcess', pid),

    // --- Control de Ventana (modo frameless) ---
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen')
});
