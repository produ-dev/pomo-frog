const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 652,
    useContentSize: true,
    resizable: false,
    frame: false,
    backgroundColor: '#0b1a07',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile('pomodoro.html');
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('win-minimize', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.minimize();
  });

  ipcMain.on('win-close', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.close();
  });

  ipcMain.on('focus-window', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.setAlwaysOnTop(true);
      win.show();
      win.focus();
      win.setAlwaysOnTop(false);
    }
  });

  ipcMain.on('enter-compact', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    const margin = 28;
    const compactW = 200, compactH = 110;
    win.setMinimizable(false);
    win.setAlwaysOnTop(true);
    win.setContentSize(compactW, compactH);
    win.setPosition(width - compactW - margin, margin);
  });

  ipcMain.on('exit-compact', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const normalW = 520, normalH = 652;
    win.setMinimizable(true);
    win.setAlwaysOnTop(false);
    win.setContentSize(normalW, normalH);
    win.setPosition(
      Math.round((width - normalW) / 2),
      Math.round((height - normalH) / 2)
    );
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
