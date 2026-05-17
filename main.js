const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const TOKEN_PATH = path.join(app.getPath('userData'), 'anilist_session.json');
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 880,
    frame: false, // Disables native OS window frame to allow our custom rounded corners and header buttons
    transparent: false, // Ensures app remains completely opaque as requested
    backgroundColor: '#0b1622',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
}

// Window control listeners
ipcMain.on('window-minimize', () => { if (win) win.minimize(); });
ipcMain.on('window-maximize', () => {
  if (win) {
    if (win.isMaximized()) { win.unmaximize(); } else { win.maximize(); }
  }
});
ipcMain.on('window-close', () => { if (win) win.close(); });

ipcMain.handle('save-token', async (event, tokenData) => {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData), 'utf-8');
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('load-token', async () => {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }
    return null;
  } catch (err) { return null; }
});

ipcMain.handle('delete-token', async () => {
  try {
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
    return true;
  } catch (err) { return false; }
});

ipcMain.handle('open-external-link', async (event, url) => {
  await shell.openExternal(url);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });