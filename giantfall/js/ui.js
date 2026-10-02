// UI core: icons, HUD, toasts, menus, modals and the panel framework.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const $ = (id) => document.getElementById(id);
  const UI = GF.UI = { panels: {}, actions: {}, cur: null };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  UI.esc = esc;

  // ------------------------------------------------------------ item icons (drawn once, cached)
  const iconCache = {};
  function iconURL(id) {
    if (iconCache[id]) return iconCache[id];
    const it = GF.ITEMS[id];
    const c = document.createElement('canvas'); c.width = c.height = 40;
    const g = c.getContext('2d');
    const col = it.col;
    g.lineJoin = 'round';
    const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.min(255, ((n >> 16) & 255) * f) | 0},${Math.min(255, ((n >> 8) & 255) * f) | 0},${Math.min(255, (n & 255) * f) | 0})`; };
    const circ = (x, y, r, f) => { g.fillStyle = f; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); };
    const poly = (pts, f, stroke) => { g.fillStyle = f; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); } };
    const rect = (x, y, w, h, f, r) => { g.fillStyle = f; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r || 2) : g.rect(x, y, w, h); g.fill(); };
    const dk = shade(col, 0.55), lt = shade(col, 1.35);
    const t = it.type;
    if (t === 'res') {
      if (/wood$/.test(id) || id === 'wood') { rect(6, 14, 28, 14, col, 4); circ(8, 21, 7, dk); circ(8, 21, 5, lt); circ(8, 21, 2, dk); }
      else if (/_ore$/.test(id) || id === 'coal') { poly([6, 30, 8, 16, 18, 8, 30, 12, 34, 30], id === 'coal' ? '#2a2c32' : '#6a6e78', '#1a1c22'); const spots = [[14, 20], [24, 18], [20, 26], [28, 25]]; for (const [x, y] of spots) poly([x, y - 4, x + 4, y, x, y + 4, x - 4, y], id === 'coal' ? '#4a4e58' : col); }
      else if (id === 'stone') { poly([5, 30, 9, 14, 22, 8, 33, 16, 35, 30], '#8a8f98', '#4a4e58'); poly([9, 14, 22, 8, 20, 18, 12, 22], '#a8adb6'); }
      else if (id === 'fiber') { g.strokeStyle = col; g.lineWidth = 3; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(10 + i * 5, 32); g.quadraticCurveTo(14 + i * 4, 18, 8 + i * 6, 6); g.stroke(); } }
      else if (id === 'clay') { g.fillStyle = col; g.beginPath(); g.ellipse(20, 24, 15, 10, 0, 0, 6.28); g.fill(); g.fillStyle = lt; g.beginPath(); g.ellipse(16, 21, 6, 3, 0, 0, 6.28); g.fill(); }
      else if (id === 'quartz' || id === 'crystal' || id === 'ember_crystal') { for (const [x, h, w] of [[12, 18, 5], [20, 28, 6], [28, 16, 5]]) { poly([x - w, 32, x, 32 - h, x + w, 32], col, dk); poly([x, 32 - h, x + w, 32, x, 32], lt); } }
      else if (id === 'obsidian') { poly([8, 32, 14, 8, 20, 32], '#2a1c44', '#10081e'); poly([18, 32, 26, 4, 32, 32], '#4a3a74', '#10081e'); }
      else if (id === 'star_ore') { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 17; g.lineTo(20 + Math.cos(a) * r, 21 + Math.sin(a) * r); } g.closePath(); g.fill(); g.strokeStyle = dk; g.stroke(); }
      else if (id === 'giant_shard') { poly([10, 34, 16, 6, 24, 20, 32, 4, 30, 34], col, dk); poly([16, 6, 24, 20, 20, 34, 14, 30], lt); }
      else if (id === 'herb') { for (let i = 0; i < 3; i++) { g.fillStyle = i === 1 ? lt : col; g.beginPath(); g.ellipse(14 + i * 6, 22 - i * 2, 4, 11, -0.5 + i * 0.5, 0, 6.28); g.fill(); } }
      else if (id === 'mushroom') { rect(17, 20, 7, 12, '#eee0c8', 3); g.fillStyle = col; g.beginPath(); g.ellipse(20, 20, 14, 10, 0, Math.PI, 0); g.fill(); circ(15, 16, 2, '#fff'); circ(24, 14, 2, '#fff'); }
      else if (id === 'sulfur') { poly([6, 30, 12, 14, 22, 10, 32, 18, 34, 30], col, '#8a7a10'); circ(16, 22, 3, lt); }
      else if (id === 'ancient_metal') { poly([6, 30, 10, 14, 24, 8, 34, 20, 30, 32], '#b8a06a', '#6a5a30'); g.strokeStyle = '#ffe9a0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(12, 22); g.lineTo(22, 18); g.lineTo(28, 26); g.stroke(); }
      else if (id === 'relic') { g.fillStyle = col; g.beginPath(); g.ellipse(20, 24, 9, 12, 0, 0, 6.28); g.fill(); rect(14, 8, 12, 6, col, 2); g.strokeStyle = dk; g.lineWidth = 2; g.beginPath(); g.arc(20, 24, 6, 0.3, 2.8); g.stroke(); }
      else { rect(8, 8, 24, 24, col, 6); }
    } else if (t === 'mat') {
      if (/_bar$/.test(id)) { poly([5, 28, 11, 14, 33, 14, 37, 28], col, dk); poly([11, 14, 33, 14, 31, 18, 13, 18], lt); }
      else if (/plank$/.test(id)) { for (let i = 0; i < 3; i++) rect(6, 8 + i * 8, 28, 7, i % 2 ? lt : col, 1); }
      else if (id === 'rope') { g.strokeStyle = col; g.lineWidth = 4; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(20, 20, 6 + i * 4, 0, 6.28); g.stroke(); } }
      else if (id === 'cloth') { rect(8, 8, 24, 24, '#e8e0cc', 3); g.strokeStyle = '#c0b898'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 20); g.lineTo(32, 20); g.moveTo(20, 8); g.lineTo(20, 32); g.stroke(); }
      else if (id === 'brick' || id === 'stone_brick') { rect(6, 10, 28, 20, col, 2); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, 20); g.lineTo(34, 20); g.moveTo(20, 10); g.lineTo(20, 20); g.moveTo(13, 20); g.lineTo(13, 30); g.moveTo(27, 20); g.lineTo(27, 30); g.stroke(); }
      else if (id === 'glass') { rect(8, 8, 24, 24, 'rgba(190,232,240,.45)', 3); g.strokeStyle = '#e8fcff'; g.lineWidth = 2; g.strokeRect(8, 8, 24, 24); g.beginPath(); g.moveTo(12, 28); g.lineTo(28, 12); g.stroke(); }
      else if (id === 'flour') { rect(9, 12, 22, 22, '#e8dcc0', 6); rect(12, 8, 16, 7, '#c8b890', 2); circ(20, 24, 5, '#fff'); }
      else rect(8, 8, 24, 24, col, 5);
    } else if (t === 'part') {
      if (id === 'gear' || id === 'ancient_core' || id === 'star_core') { g.fillStyle = col; for (let i = 0; i < 8; i++) { g.save(); g.translate(20, 20); g.rotate(i * 0.785); g.fillRect(-3, -17, 6, 8); g.restore(); } circ(20, 20, 12, col); circ(20, 20, 5, '#10162a'); if (id !== 'gear') { g.globalAlpha = 0.5; circ(20, 20, 16, lt); g.globalAlpha = 1; } }
      else if (id === 'wire') { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 4; i++) g.arc(20, 12 + i * 5, 10, 0, Math.PI, i % 2 === 0); g.stroke(); }
      else if (id === 'circuit') { rect(6, 8, 28, 24, '#1a6a4a', 3); g.strokeStyle = '#7affc0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(10, 14); g.lineTo(20, 14); g.lineTo(20, 24); g.lineTo(30, 24); g.moveTo(10, 26); g.lineTo(16, 26); g.stroke(); circ(30, 14, 3, '#ffe27a'); rect(22, 16, 8, 5, '#222', 1); }
      else if (id === 'power_cell') { rect(10, 8, 20, 26, '#2a3a5a', 4); rect(16, 5, 8, 4, '#aaa', 1); rect(13, 14, 14, 16, col, 3); g.fillStyle = '#fff'; g.fillRect(18, 18, 4, 8); }
      else { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 6; i++) g.lineTo(20 + Math.cos(i * 1.047) * 15, 20 + Math.sin(i * 1.047) * 15); g.closePath(); g.fill(); g.strokeStyle = lt; g.lineWidth = 2; g.stroke(); circ(20, 20, 5, '#fff'); }
    } else if (t === 'crop') {
      if (id === 'wheat') { g.strokeStyle = '#a89040'; g.lineWidth = 2; g.beginPath(); g.moveTo(20, 34); g.lineTo(20, 8); g.stroke(); for (let i = 0; i < 4; i++) { g.fillStyle = col; g.beginPath(); g.ellipse(15, 12 + i * 5, 3, 5, -0.5, 0, 6.28); g.fill(); g.beginPath(); g.ellipse(25, 12 + i * 5, 3, 5, 0.5, 0, 6.28); g.fill(); } }
      else if (id === 'carrot') { poly([12, 10, 28, 10, 20, 36], col, '#a05010'); g.fillStyle = '#4aa040'; g.fillRect(16, 2, 3, 9); g.fillRect(22, 4, 3, 7); }
      else if (id === 'pumpkin') { g.fillStyle = col; g.beginPath(); g.ellipse(20, 23, 15, 12, 0, 0, 6.28); g.fill(); g.strokeStyle = shade(col, 0.7); g.lineWidth = 2; g.beginPath(); g.ellipse(20, 23, 7, 12, 0, 0, 6.28); g.stroke(); rect(18, 8, 4, 6, '#4a7a30', 1); }
      else if (id === 'berry') { for (const [x, y] of [[13, 24], [24, 22], [19, 14], [28, 30], [12, 32]]) { circ(x, y, 6, col); circ(x - 2, y - 2, 1.5, '#fff'); } }
      else if (id === 'moonbloom') { for (let i = 0; i < 6; i++) { g.fillStyle = col; g.beginPath(); g.ellipse(20 + Math.cos(i * 1.047) * 8, 18 + Math.sin(i * 1.047) * 8, 6, 4, i * 1.047, 0, 6.28); g.fill(); } circ(20, 18, 4, '#fff6a0'); g.strokeStyle = '#3a8a4a'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 26); g.lineTo(20, 38); g.stroke(); }
      else { poly([20, 4, 30, 18, 26, 34, 14, 34, 10, 18], col, '#8a1a0a'); poly([20, 10, 26, 20, 20, 30, 16, 20], '#ffb04a'); }
    } else if (t === 'seed') { rect(10, 14, 20, 20, '#c8a870', 5); rect(13, 10, 14, 6, '#a88850', 2); circ(20, 26, 5, col); circ(20, 26, 2, '#fff'); }
    else if (t === 'food') {
      if (id === 'bread') { g.fillStyle = '#d8a860'; g.beginPath(); g.ellipse(20, 22, 15, 10, 0, 0, 6.28); g.fill(); g.strokeStyle = '#a07830'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(11 + i * 7, 16); g.lineTo(14 + i * 7, 26); g.stroke(); } }
      else if (id === 'stew') { rect(6, 18, 28, 14, '#5a4a3a', 6); g.fillStyle = '#c07840'; g.beginPath(); g.ellipse(20, 18, 14, 5, 0, 0, 6.28); g.fill(); circ(15, 17, 2, '#e8b060'); circ(24, 18, 2, '#6a9a3a'); }
      else if (id === 'pie') { g.fillStyle = '#e0a860'; g.beginPath(); g.ellipse(20, 24, 16, 8, 0, 0, 6.28); g.fill(); g.fillStyle = col; g.beginPath(); g.ellipse(20, 21, 13, 6, 0, 0, 6.28); g.fill(); g.strokeStyle = '#a07030'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, 21); g.lineTo(30, 21); g.moveTo(20, 15); g.lineTo(20, 27); g.stroke(); }
      else { rect(10, 14, 20, 20, col, 5); rect(12, 8, 16, 7, '#d8c8a0', 2); circ(20, 24, 3, '#fff'); }
    } else if (t === 'potion') { rect(16, 6, 8, 8, '#cfe8f0', 2); g.fillStyle = 'rgba(200,230,240,.5)'; g.beginPath(); g.arc(20, 26, 12, 0, 6.28); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(20, 27, 10, 0.1, Math.PI - 0.1); g.lineTo(11, 26); g.fill(); g.strokeStyle = '#e8fcff'; g.lineWidth = 1.5; g.beginPath(); g.arc(20, 26, 12, 0, 6.28); g.stroke(); circ(15, 22, 2, 'rgba(255,255,255,.7)'); }
    else if (t === 'weapon') {
      const k = it.kind; g.save(); g.translate(20, 20); g.rotate(-0.78);
      if (k === 'sword') { rect(-3, 4, 6, 12, '#6a4a2a', 2); rect(-9, 1, 18, 4, '#c0a060', 1); poly([-3, 2, 3, 2, 2, -17, 0, -20, -2, -17], col, '#10162a'); poly([0, 2, 3, 2, 2, -17, 0, -20], lt); }
      else if (k === 'spear') { rect(-1.5, -10, 3, 28, '#7a5a3a', 1); poly([-5, -10, 0, -22, 5, -10], col, '#10162a'); }
      else if (k === 'hammer') { rect(-1.5, -6, 3, 24, '#7a5a3a', 1); rect(-11, -14, 22, 12, col, 3); rect(-11, -14, 22, 4, lt, 2); }
      else { g.restore(); g.save(); g.translate(20, 20); g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.arc(-4, 0, 16, -1.1, 1.1); g.stroke(); g.strokeStyle = '#ddd'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-4 + Math.cos(-1.1) * 16, Math.sin(-1.1) * 16); g.lineTo(-4 + Math.cos(1.1) * 16, Math.sin(1.1) * 16); g.stroke(); g.strokeStyle = '#a07a4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-8, 0); g.lineTo(18, 0); g.stroke(); poly([18, -3, 24, 0, 18, 3], col); }
      g.restore();
      if (it.tier >= 7) { g.globalAlpha = 0.35; circ(20, 20, 18, col); g.globalAlpha = 1; }
    } else if (t === 'armor') { poly([8, 12, 14, 7, 26, 7, 32, 12, 30, 34, 10, 34], col, '#10162a'); poly([14, 7, 26, 7, 20, 14], lt); rect(18, 14, 4, 18, dk, 1); poly([8, 12, 2, 18, 8, 22], shade(col, 0.8)); poly([32, 12, 38, 18, 32, 22], shade(col, 0.8)); }
    else if (t === 'tool') {
      g.save(); g.translate(20, 20); g.rotate(-0.6); rect(-2, -14, 4, 32, '#7a5a3a', 1);
      if (id.startsWith('pickaxe')) { g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.arc(0, -4, 14, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.strokeStyle = lt; g.lineWidth = 2; g.stroke(); }
      else { poly([2, -14, 14, -10, 14, 4, 2, 0], col, '#10162a'); poly([2, -14, 14, -10, 8, -6], lt); }
      g.restore();
    } else if (t === 'charm') { g.strokeStyle = '#c8a850'; g.lineWidth = 3; g.beginPath(); g.arc(20, 14, 8, 3.5, 6); g.stroke(); circ(20, 26, 10, col); circ(20, 26, 10, 'rgba(255,255,255,.12)'); g.strokeStyle = dk; g.lineWidth = 2; g.beginPath(); g.arc(20, 26, 10, 0, 6.28); g.stroke(); circ(17, 23, 3, 'rgba(255,255,255,.6)'); }
    else if (t === 'trans') { rect(6, 12, 28, 12, col, 3); circ(12, 28, 6, '#2a2a30'); circ(12, 28, 3, '#aaa'); circ(28, 28, 6, '#2a2a30'); circ(28, 28, 3, '#aaa'); g.strokeStyle = '#6a4a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(34, 18); g.lineTo(39, 10); g.stroke(); }
    else if (t === 'machine') { rect(7, 10, 26, 24, '#5a6a8a', 4); rect(7, 10, 26, 6, '#7a8aaa', 3); g.fillStyle = col; g.beginPath(); g.arc(20, 25, 7, 0, 6.28); g.fill(); g.strokeStyle = '#10162a'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(20, 25); g.lineTo(20 + Math.cos(i * 1.57) * 7, 25 + Math.sin(i * 1.57) * 7); g.stroke(); } }
    else if (t === 'seal') { circ(20, 21, 15, col); circ(20, 21, 15, 'rgba(0,0,0,.15)'); circ(20, 21, 11, shade(col, 1.2)); g.strokeStyle = shade(col, 0.5); g.lineWidth = 2; g.beginPath(); g.arc(20, 21, 11, 0, 6.28); g.stroke(); poly([20, 12, 24, 20, 32, 21, 26, 26, 28, 34, 20, 29, 12, 34, 14, 26, 8, 21, 16, 20], shade(col, 0.55)); }
    else if (t === 'boss') { g.globalAlpha = 0.35; circ(20, 20, 18, col); g.globalAlpha = 1; poly([20, 4, 32, 20, 20, 36, 8, 20], col, '#10162a'); poly([20, 4, 32, 20, 20, 20], lt); circ(20, 20, 4, '#fff'); }
    else if (t === 'drop') {
      if (id === 'slime_gel') { g.fillStyle = col; g.beginPath(); g.ellipse(20, 24, 13, 10, 0, Math.PI, 0); g.lineTo(33, 32); g.lineTo(7, 32); g.fill(); circ(15, 20, 3, 'rgba(255,255,255,.6)'); }
      else if (id === 'hide') { poly([6, 10, 18, 6, 34, 10, 36, 28, 22, 34, 8, 30], col, dk); }
      else if (id === 'bone') { g.strokeStyle = col; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(10, 30); g.lineTo(30, 10); g.stroke(); circ(8, 32, 4, col); circ(12, 34, 4, col); circ(30, 8, 4, col); circ(34, 12, 4, col); g.lineCap = 'butt'; }
      else if (id === 'fang') { poly([12, 8, 28, 8, 20, 36], col, dk); }
      else if (id === 'silk') { g.strokeStyle = col; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(20, 20); g.lineTo(20 + Math.cos(i * 1.047) * 16, 20 + Math.sin(i * 1.047) * 16); g.stroke(); } for (let r = 6; r < 16; r += 5) { g.beginPath(); g.arc(20, 20, r, 0, 6.28); g.stroke(); } }
      else { g.globalAlpha = 0.4; circ(20, 20, 16, col); g.globalAlpha = 1; circ(20, 20, 10, col); circ(20, 20, 10, 'rgba(255,255,255,.15)'); circ(16, 16, 3, 'rgba(255,255,255,.7)'); }
    } else if (id === 'recall_scroll') { rect(8, 12, 24, 20, '#e8dcc0', 3); rect(6, 10, 28, 5, '#c8b890', 2); rect(6, 29, 28, 5, '#c8b890', 2); g.strokeStyle = '#8a6a4a'; g.lineWidth = 1.5; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(11, 18 + i * 4); g.lineTo(29, 18 + i * 4); g.stroke(); } }
    else rect(8, 8, 24, 24, col, 6);
    iconCache[id] = c.toDataURL();
    return iconCache[id];
  }
  UI.icon = iconURL;
  const img = (id) => `<img src="${iconURL(id)}" alt="">`;
  UI.img = img;

  // ------------------------------------------------------------ toasts, banners, tooltips
  function toast(msg, type) {
    const c = $('toasts'); if (!c) return;
    const d = document.createElement('div'); d.className = 'toast ' + (type || 'info'); d.textContent = msg;
    c.appendChild(d);
    while (c.children.length > 6) c.removeChild(c.firstChild);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, type === 'warn' ? 6500 : 5000);
    if (type === 'quest' || type === 'ach') GF.Audio.play('quest');
    if (type === 'level') GF.Audio.play('level');
    if (type === 'unlock') GF.Audio.play('unlock');
  }
  GF.hooks.notify = toast;
  GF.hooks.fx = (n) => { if (n === 'levelup') { GF.G.spawnParticles('levelup', GF.G.P.x, GF.G.P.y, {}); GF.Audio.play('level'); } else GF.Audio.play(n === 'event' ? 'event' : n); };

  UI.tip = function (html, x, y) { const t = $('tip'); t.innerHTML = html; t.classList.remove('hidden'); const w = t.offsetWidth, h = t.offsetHeight; t.style.left = Math.min(window.innerWidth - w - 8, x + 14) + 'px'; t.style.top = Math.min(window.innerHeight - h - 8, y + 14) + 'px'; };
  UI.untip = function () { $('tip').classList.add('hidden'); };

  // ------------------------------------------------------------ modal
  UI.modal = function (html, buttons) {
    const m = $('modal'), box = $('modal-box');
    box.innerHTML = html + `<div class="row-btns">${(buttons || [{ label: 'OK', cls: 'gold' }]).map((b, i) => `<button class="${b.cls || ''}" data-mb="${i}">${b.label}</button>`).join('')}</div>`;
    m.classList.remove('hidden');
    UI.modalOpen = true;
    box.onclick = (e) => { const b = e.target.closest('[data-mb]'); if (!b) return; const spec = (buttons || [{}])[Number(b.dataset.mb)]; if (spec.keep !== true) UI.closeModal(); GF.Audio.play('click'); if (spec.fn) spec.fn(); };
  };
  UI.closeModal = function () { $('modal').classList.add('hidden'); UI.modalOpen = false; };
  UI.showLore = function (t) { UI.modal(`<h2>${esc(t.title)}</h2><p class="muted">${esc(GF.REGIONS[t.region].name)}</p><p>${esc(t.text)}</p>`, [{ label: 'Close', cls: 'gold' }]); };
  UI.bossIntro = function () {};

  // ------------------------------------------------------------ HUD
  const last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }
  function setW(id, pct) { const v = Math.round(pct * 10) / 10; if (last[id] !== v) { last[id] = v; $(id).style.width = Math.max(0, Math.min(100, v)) + '%'; } }
  let hudT = 0, trackSig = '', quickSig = '', miniBase = null, miniFogCv = null, miniVer = -1;
  UI.hud = function (dt, time) {
    const G = GF.G, S = G.S, P = G.P, map = G.map;
    if (!S) return;
    const mh = GF.maxHp(S);
    setW('hp-fill', S.hp / mh * 100); setText('hp-text', `${Math.ceil(S.hp)} / ${mh}`);
    setW('stam-fill', P.stam);
    setW('xp-fill', S.level >= GF.MAX_LEVEL ? 100 : S.xp / GF.xpNext(S.level) * 100); setText('xp-text', S.level >= GF.MAX_LEVEL ? 'MAX' : `${U.fmt(S.xp)} / ${U.fmt(GF.xpNext(S.level))} XP`);
    setText('lvl-badge', S.level); setText('rank-text', GF.rankName(S.level).toUpperCase() + (S.sp > 0 ? `  ·  ${S.sp} SKILL POINT${S.sp > 1 ? 'S' : ''} (K)` : ''));
    setText('coin-val', U.fmt(S.coins));
    const rgName = map.kind === 'dungeon' ? (map.abyss ? `The Abyss · Floor ${map.floor}` : map.rift ? 'Dungeon Rift' : GF.DUNGEONS[map.did].name) : (GF.REGIONS[P.region || 'greenlands'] || GF.REGIONS.greenlands).name;
    setText('region-text', rgName);
    const f = GF.dayFrac(S);
    const tod = f < 0.04 ? 'Dawn' : f < 0.4 ? 'Morning' : f < 0.55 ? 'Noon' : f < 0.7 ? 'Afternoon' : f < 0.76 ? 'Dusk' : 'Night';
    setText('clock-text', `Day ${GF.dayNumber(S)} · ${tod}${S.rp >= 1 ? ' · ' + Math.floor(S.rp) + ' RP' : ''}`);
    // boss bar
    const b = map.boss;
    const bb = $('bossbar');
    if (b && b.active && !b.dead) { bb.classList.remove('hidden'); setText('boss-name', b.name.toUpperCase() + (b.asc ? ' (ASCENDED)' : '')); setW('boss-fill', b.hp / b.max * 100); const th = GF.BOSSES[b.boss].phases; setText('boss-phase', `Phase ${b.phase + 1} / ${th.length}${b.shielded ? '  ·  SHIELDED: destroy the pylons!' : ''}`); }
    else bb.classList.add('hidden');
    // event bar
    const ev = S.events.active;
    const eb = $('eventbar');
    if (ev) { eb.classList.remove('hidden'); const t = `${GF.EVENT_DEFS[ev.id].name}  ${U.fmtTime(ev.until - S.time)}` + (ev.id === 'invasion' && ev.total ? `  ·  raiders left ${G.over.enemies.filter((e) => e.raider && !e.dead).length}/${ev.total}` : ''); if (last.ev !== t) { last.ev = t; eb.textContent = t; } } else eb.classList.add('hidden');
    // banner
    const bn = $('banner');
    if (G.banner && last.banner !== G.banner) { last.banner = G.banner; bn.classList.remove('hidden'); bn.classList.toggle('boss', !!G.banner.boss); $('banner-title').textContent = G.banner.title; $('banner-sub').textContent = G.banner.sub || ''; bn.style.animation = 'none'; void bn.offsetWidth; bn.style.animation = ''; }
    if (!G.banner && last.banner) { last.banner = null; bn.classList.add('hidden'); }
    hudT += dt;
    if (hudT > 0.35) { hudT = 0; trackerUpdate(); quickUpdate(); miniUpdate(); }
  };
  function trackerUpdate() {
    const S = GF.G.S;
    const act = GF.activeMain(S);
    const tracked = S.tracked.map((id) => GF.questById(id)).filter((q) => q && GF.questAvailable(S, q));
    const list = (tracked.length ? tracked : act).slice(0, 3);
    let html = '';
    for (const q of list) {
      const p = GF.questProgress(S, q);
      const txt = p.parts ? `${p.cur}/${p.max} tasks` : q.cond.t === 'pay' ? 'Pay in quest log' : `${U.fmt(p.cur)} / ${U.fmt(p.max)}`;
      html += `<div class="q"><b>${esc(q.title)}</b><br><span class="muted">${esc(txt)}</span><div class="qp"><i style="width:${Math.min(100, p.cur / Math.max(1, p.max) * 100)}%"></i></div></div>`;
    }
    if (!list.length && S.bosses.giant) html = `<div class="q"><b>Endless goals</b><br><span class="muted">Abyss, Ascended bosses, legendary gear, Legacy.</span></div>`;
    if (html !== trackSig) { trackSig = html; $('tracker').innerHTML = html; }
  }
  function quickUpdate() {
    const S = GF.G.S;
    const sig = S.quick.map((id) => id ? id + ':' + GF.count(S, id) : '-').join('|') + '|' + GF.G.selSeed;
    if (sig === quickSig) return;
    quickSig = sig;
    $('quickbar').innerHTML = S.quick.map((id, i) => {
      const n = id ? GF.count(S, id) : 0;
      const sel = id && GF.ITEMS[id].type === 'seed' && GF.ITEMS[id].crop === GF.G.selSeed;
      return `<div class="qslot${sel ? ' sel' : ''}" data-q="${i}" title="${id ? esc(GF.ITEMS[id].name) : 'Empty'}"><span class="k">${i + 1}</span>${id && n > 0 ? `<img src="${iconURL(id)}"><span class="n">${n}</span>` : id ? `<img src="${iconURL(id)}" style="opacity:.3">` : ''}</div>`;
    }).join('');
  }
  $('quickbar').addEventListener('mousedown', (e) => { const q = e.target.closest('[data-q]'); if (q) { e.stopPropagation(); GF.G.quickUse(Number(q.dataset.q)); quickSig = ''; } });

  // minimap -----------------------------------------------------------
  const MINI_COL = { 0: '#0e2238', 1: '#4f9a46', 2: '#8a6a46', 3: '#7a7f8a', 4: '#2f5a3a', 5: '#e4eef6', 6: '#4a3a36', 7: '#8a7a60', 8: '#7a5a4a', 9: '#2a5fa8', 10: '#3a3a44', 11: '#b89a70', 12: '#e0501a', 13: '#bfe0f0', 14: '#704040' };
  UI.buildMiniBase = function () {
    const over = GF.G.over;
    miniBase = document.createElement('canvas'); miniBase.width = over.W; miniBase.height = over.H;
    const g = miniBase.getContext('2d');
    const im = g.createImageData(over.W, over.H);
    for (let i = 0; i < over.W * over.H; i++) {
      const c = MINI_COL[over.tiles[i]] || '#000';
      const n = parseInt(c.slice(1), 16);
      im.data[i * 4] = (n >> 16) & 255; im.data[i * 4 + 1] = (n >> 8) & 255; im.data[i * 4 + 2] = n & 255; im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    miniVer = over.version;
    miniFogCv = document.createElement('canvas'); miniFogCv.width = Math.ceil(over.W / 6); miniFogCv.height = Math.ceil(over.H / 6);
  };
  function fogCanvas(S) {
    const g = miniFogCv.getContext('2d');
    g.clearRect(0, 0, miniFogCv.width, miniFogCv.height);
    g.fillStyle = 'rgba(4,8,18,0.93)'; g.fillRect(0, 0, miniFogCv.width, miniFogCv.height);
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    for (const k in (S.fog || {})) { const [x, y] = k.split(',').map(Number); g.fillRect(x, y, 1, 1); }
    g.globalCompositeOperation = 'source-over';
    return miniFogCv;
  }
  function miniUpdate() {
    const G = GF.G, S = G.S, P = G.P;
    const cv = $('mini'), g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#06101c'; g.fillRect(0, 0, 150, 150);
    if (G.map.kind !== 'over') {
      const m = G.map; const sc = 3;
      g.save(); g.translate(75 - P.x * sc, 75 - P.y * sc);
      for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) { const t = m.tiles[y * m.W + x]; if (t === GF.T.DWALL) continue; g.fillStyle = t === GF.T.DARENA ? '#6a4a4a' : t === GF.T.DSEAL ? '#c04040' : '#4a4a66'; g.fillRect(x * sc, y * sc, sc, sc); }
      g.restore();
    } else {
      if (!miniBase || miniVer !== G.over.version) UI.buildMiniBase();
      const span = 64, sc = 150 / span;
      const sx = P.x - span / 2, sy = P.y - span / 2;
      g.drawImage(miniBase, sx, sy, span, span, 0, 0, 150, 150);
      const fc = fogCanvas(S);
      g.drawImage(fc, sx / 6, sy / 6, span / 6, span / 6, 0, 0, 150, 150);
      g.fillStyle = '#ffd24a'; for (const b of S.buildings.slice(0, 1)) g.fillRect((b.x - sx) * sc, (b.y - sy) * sc, 5, 5);
      for (const pt of G.over.portals) { if (!S.discovered[pt.region]) continue; g.fillStyle = GF.DUNGEONS[pt.dungeon].boss && GF.DUNGEONS[pt.dungeon].seal ? '#ff5a7a' : '#7ad0ff'; g.fillRect((pt.x - sx) * sc - 2, (pt.y - sy) * sc - 2, 5, 5); }
      const tr = S.events.treasure; if (tr) { g.fillStyle = '#ffe27a'; g.fillRect((tr.x - sx) * sc - 2, (tr.y - sy) * sc - 2, 5, 5); }
    }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(75, 75, 4, 0, 6.28); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
  }
  UI.fogCanvas = fogCanvas;
  UI.getBase = () => { if (!miniBase || miniVer !== GF.G.over.version) UI.buildMiniBase(); return miniBase; };

  // ------------------------------------------------------------ death / victory
  UI.showDeath = function (info) {
    UI.modal(`<h2 style="color:#ff8a7a">You were defeated</h2><p>Slain by <b>${esc(info.by)}</b>.${info.lost ? ` You dropped <b>${U.fmt(info.lost)}</b> Crowns in the chaos.` : ''}</p><p class="muted">You wake up in Hearthstead. Your gear is safe. Regroup, heal, and try again.</p>`, [{ label: 'Wake up at home', cls: 'gold', fn: () => GF.G.respawn() }]);
    UI.deathOpen = true;
  };
  UI.hideDeath = function () { UI.deathOpen = false; UI.closeModal(); };
  UI.showVictory = function () {
    const S = GF.G.S;
    UI.modal(`<h2 style="font-size:34px;text-align:center">THE GIANT HAS FALLEN</h2><p style="text-align:center;color:#ffe9a8">The ground stops shaking. For the first time in ten thousand years, the world is quiet.</p>
      <p>You, <b class="gold-t">${esc(S.name)}</b>, began with almost nothing in a tiny camp. You raised a settlement into an empire, forged the weapons of legend, felled five guardians and the Giant itself.</p>
      <table class="tbl"><tr><td>Play time</td><td>${U.fmtTime(S.playTime)}</td></tr><tr><td>Level</td><td>${S.level} (${GF.rankName(S.level)})</td></tr><tr><td>Crowns earned</td><td>${U.fmt(S.stats.earned)}</td></tr><tr><td>Buildings</td><td>${S.buildings.length}</td></tr><tr><td>Deaths</td><td>${S.stats.deaths}</td></tr></table>
      <p class="muted">The story is complete, but the empire is not. The Abyss, Ascended bosses, the Star Forge, legendary gear and Legacy bonuses await. The Abyss Gate has appeared in Hearthstead.</p>`, [{ label: 'Keep playing', cls: 'gold' }]);
    GF.Audio.play('victory');
  };
})(typeof window !== 'undefined' ? window : globalThis);
