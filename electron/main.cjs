const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { OptimizerEngine } = require('./engine.cjs');
const { WindowsAdapter } = require('./windows-adapter.cjs');

let window;
let engine;
let adapter;
const productionPage = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
const requestedDevURL = process.env.VITE_DEV_SERVER_URL;
const devURL = !app.isPackaged && requestedDevURL === 'http://127.0.0.1:5173' ? requestedDevURL : null;

function authorize(event) {
  if (!window || event.sender !== window.webContents || !event.senderFrame || event.senderFrame.parent) throw new Error('Solicitud de una ventana no autorizada.');
  const url = new URL(event.senderFrame.url);
  if (devURL ? url.origin !== devURL : `${url.protocol}//${url.host}${url.pathname}` !== productionPage) throw new Error('Origen no autorizado.');
}

function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    authorize(event);
    return handler(...args);
  });
}

function demoInfo() {
  return {
    mode: 'demo', platform: process.platform,
    cpu: { name: 'Intel Core i5-9400F', cores: 6, usage: 24 },
    gpu: { name: 'AMD Radeon RX 560', memoryGB: 4, usage: null },
    ram: { totalGB: 16, usedGB: 5.2, type: 'DDR4' },
    storage: { totalGB: 1600, freeGB: 864, drives: [{ name: 'C:', totalGB: 500, freeGB: 260, type: 'SSD · demostración' }, { name: 'D:', totalGB: 1100, freeGB: 604, type: 'HDD · demostración' }] },
    os: 'Perfil de ejemplo · Windows 11', updatedAt: new Date().toISOString(), admin: false,
  };
}

function registerIPC() {
  let hardwareRequest = null;
  handle('optimizer:hardware', () => {
    if (process.platform !== 'win32') return demoInfo();
    // Multiple views share a pending read instead of launching competing WMI queries.
    if (!hardwareRequest) hardwareRequest = adapter.getSystemInfo().finally(() => { hardwareRequest = null; });
    return hardwareRequest;
  });
  handle('optimizer:states', () => engine.getTweakStates());
  handle('optimizer:apply', ids => engine.applyTweaks(ids));
  handle('optimizer:backups', () => engine.listBackups());
  handle('optimizer:restore', id => engine.restoreBackup(id));
  ipcMain.on('optimizer:window', (event, action) => {
    try { authorize(event); } catch { return; }
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
  });
}

async function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1024, minHeight: 700,
    icon: path.join(__dirname, '..', 'build', 'icon.png'), backgroundColor: '#0c1017', title: 'Máximo FPS', frame: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, destination) => {
    const allowed = devURL ? new URL(destination).origin === devURL : destination === productionPage;
    if (!allowed) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  if (devURL) await window.loadURL(devURL);
  else await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'tweaks.json'), 'utf8'));
    adapter = new WindowsAdapter();
    engine = new OptimizerEngine({ catalog, adapter, backupDir: path.join(app.getPath('userData'), 'backups') });
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const policy = `default-src 'self'; script-src 'self'${devURL ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${devURL ? ' ws://127.0.0.1:5173' : ''}; object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'none'`;
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } });
    });
    registerIPC();
    await createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => {
    console.error('No se pudo iniciar Máximo FPS:', error.message);
    app.quit();
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
