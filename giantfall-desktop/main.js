const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({ width: 1280, height: 800, backgroundColor: '#0b1020', title: 'Giantfall', autoHideMenuBar: true, webPreferences: { contextIsolation: true } });
  win.loadFile(path.join(__dirname, 'game', 'index.html'));
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && i.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
});
app.on('window-all-closed', () => app.quit());
