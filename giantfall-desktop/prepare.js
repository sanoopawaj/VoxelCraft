// Copies the game files into ./game so electron-builder can package them.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'giantfall'), dst = path.join(__dirname, 'game');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of ['index.html', 'style.css']) fs.copyFileSync(path.join(src, f), path.join(dst, f));
fs.cpSync(path.join(src, 'js'), path.join(dst, 'js'), { recursive: true });
