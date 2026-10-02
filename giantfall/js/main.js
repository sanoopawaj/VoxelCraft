// Boot, title screen, input and the main loop.
(function (root) {
  'use strict';
  const GF = root.GF;
  const UI = GF.UI, G = GF.G, U = GF.util;
  const $ = (id) => document.getElementById(id);
  const esc = UI.esc;
  const Main = GF.Main = {};
  let running = false, last = 0, inGame = false, form = { name: 'Hero', seed: '', start: 'wanderer', diff: 'standard' };

  // ------------------------------------------------------------ title screen
  function showOverlay(html) { const o = $('overlay'); o.className = ''; o.innerHTML = html; }
  function hideOverlay() { $('overlay').className = 'hidden'; $('overlay').innerHTML = ''; }

  function title() {
    inGame = false;
    $('hud').classList.add('hidden');
    const cards = [1, 2, 3].map((n) => {
      const i = GF.slotInfo(n);
      if (!i) return `<div class="slot-card"><div class="g"><div class="t">Slot ${n}: Empty</div></div><button class="gold" data-t="new" data-n="${n}">New Game</button></div>`;
      if (i.damaged) return `<div class="slot-card"><div class="g"><div class="t">Slot ${n}: damaged save</div></div><button class="red" data-t="del" data-n="${n}">Delete</button></div>`;
      return `<div class="slot-card"><div class="g"><div class="t">Slot ${n}: ${esc(i.name)}${i.won ? ' ★' : ''}</div><div class="s">Level ${i.level} · ${U.fmt(i.coins)} Crowns · ${i.bosses} bosses · ${U.fmtTime(i.play || 0)} · ${esc(i.diff)}</div></div><button class="gold" data-t="load" data-n="${n}">Continue</button><button class="red small" data-t="del" data-n="${n}">✕</button></div>`;
    }).join('');
    showOverlay(`<h1 class="logo">GIANTFALL</h1><p class="tagline">Build an empire. Become powerful. Slay the Giant.</p>${cards}
      <div class="row-btns"><button data-t="import">Import save</button><button data-t="help">How to play</button></div>`);
  }
  function newForm(slot) {
    const st = Object.entries(GF.STARTS).map(([k, v]) => `<option value="${k}" ${form.start === k ? 'selected' : ''}>${v.name}: ${esc(v.desc)}</option>`).join('');
    const df = Object.entries(GF.DIFFICULTY).map(([k, v]) => `<option value="${k}" ${form.diff === k ? 'selected' : ''}>${v.name}: ${esc(v.desc)}</option>`).join('');
    showOverlay(`<h1 class="logo small">New Game (slot ${slot})</h1><div class="card" style="min-width:min(560px,92vw)">
      <div class="row"><span style="width:110px">Name</span><input id="f-name" value="${esc(form.name)}" maxlength="16" style="flex:1"></div>
      <div class="row"><span style="width:110px">World seed</span><input id="f-seed" value="${esc(form.seed)}" placeholder="random" style="flex:1"></div>
      <div class="row"><span style="width:110px">Start bonus</span><select id="f-start" style="flex:1">${st}</select></div>
      <div class="row"><span style="width:110px">Difficulty</span><select id="f-diff" style="flex:1">${df}</select></div>
      <div class="row-btns"><button data-t="back">Back</button><button class="gold" data-t="start" data-n="${slot}">Begin</button></div></div>`);
  }
  $('overlay').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    GF.Audio.init(); GF.Audio.play('click');
    const t = b.dataset.t, n = Number(b.dataset.n);
    if (t === 'new') newForm(n);
    else if (t === 'back') title();
    else if (t === 'start') {
      form = { name: $('f-name').value.trim() || 'Hero', seed: $('f-seed').value.trim(), start: $('f-start').value, diff: $('f-diff').value };
      Main.startNew(Object.assign({ slot: n }, form));
    } else if (t === 'load') loadSlot(n);
    else if (t === 'del') UI.modal(`<h2>Delete slot ${n}?</h2><p>This cannot be undone.</p>`, [{ label: 'Cancel' }, { label: 'Delete', cls: 'red', fn: () => { GF.deleteSlot(n); title(); } }]);
    else if (t === 'import') {
      UI.modal(`<h2>Import save</h2><p class="muted">Paste exported save text. It goes into the first free slot (or slot 3).</p><textarea id="imp" style="width:100%;height:110px;background:#0a0f20;color:#9fb;border:2px solid var(--line);border-radius:6px"></textarea>`,
        [{ label: 'Cancel' }, { label: 'Import', cls: 'gold', fn: () => importSave($('imp').value) }]);
    } else if (t === 'help') UI.modal(helpHtml(), [{ label: 'Close', cls: 'gold' }]);
  });
  function importSave(txt) {
    try {
      const S = JSON.parse(decodeURIComponent(escape(atob(txt.trim()))));
      if (!GF.validate(S)) throw new Error('bad');
      const slot = [1, 2, 3].find((n) => !GF.slotInfo(n)) || 3;
      S.slot = slot; GF.saveGame(S, slot); title();
      GF.hooks.notify('Imported into slot ' + slot, 'info');
    } catch (e) { UI.modal('<h2>Import failed</h2><p>That text is not a valid save.</p>'); }
  }
  function helpHtml() {
    return `<h2>How to play</h2><p><b>Move</b> WASD · <b>Attack/gather</b> Space or click · <b>Interact</b> E · <b>Dodge</b> Shift · <b>Whirlwind</b> R · <b>Quick items</b> 1-8</p>
    <p><b>Panels</b> I Inventory, C Crafting, T Tycoon, B Build, J Quests, M Map, K Skills, Esc Menu.</p>
    <p>Gather wood and stone, craft tools, build your settlement, start businesses, trade, clear dungeons, beat the bosses, and prepare to face the Giant.</p>`;
  }

  // ------------------------------------------------------------ start / load
  function enterGame() {
    hideOverlay(); inGame = true;
    $('hud').classList.remove('hidden');
    GF.Render.invalidate();
    const S = G.S;
    if (S && S.away) {
      const a = S.away; S.away = null;
      UI.modal(`<h2>While you were away…</h2><p>${`You were gone ${U.fmtTime(a.seconds)}. Your businesses earned <b>${U.fmt(a.coins)}</b> Crowns and <b>${U.fmt(a.rp)}</b> research points.`}</p>`, [{ label: 'Continue', cls: 'gold' }]);
    }
  }
  Main.startNew = function (opts) {
    GF.Audio.init();
    const S = G.newGame(opts); GF.S = S;
    G.save(true); enterGame();
  };
  function loadSlot(n) {
    const S = G.loadSlot(n);
    if (!S) { UI.modal('<h2>Could not load</h2><p>That save is damaged.</p>'); return; }
    enterGame();
  }
  Main.toTitle = function () { G.over = null; G.map = null; G.S = null; GF.S = null; UI.closeModal(); if (UI.isOpen()) UI.close(); title(); };

  // ------------------------------------------------------------ input
  const KEYMAP = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' };
  const PANEL_KEYS = { i: 'inv', c: 'craft', t: 'tycoon', b: 'build', j: 'quests', m: 'map', k: 'skills' };
  function typing(e) { const t = e.target && e.target.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT'; }
  window.addEventListener('keydown', (e) => {
    if (typing(e) || !inGame || !G.S) return;
    let k = e.key.toLowerCase(); k = KEYMAP[k] || k;
    if (e.key === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (UI.modalOpen) { if (k === 'escape' && !UI.deathOpen) UI.closeModal(); return; }
    if (k === 'escape') {
      if (UI.isOpen()) UI.close(); else if (G.buildMode) G.buildMode = null; else UI.open('menu', { tab: 'main' });
      return;
    }
    if (PANEL_KEYS[k] && !e.ctrlKey && !e.metaKey) {
      if (UI.isOpen() && UI.PB.name === PANEL_KEYS[k]) UI.close(); else UI.open(PANEL_KEYS[k]);
      return;
    }
    if (UI.isOpen()) return;
    G.keys[k] = true; if (e.shiftKey) G.keys.shift = true;
    if (e.repeat) return;
    if (k === 'shift') G.dodge();
    else if (k === 'r') G.actionWhirl();
    else if (k === 'e') G.interact();
    else if (k >= '1' && k <= '8') G.quickUse(Number(k) - 1);
  });
  window.addEventListener('keyup', (e) => {
    let k = e.key.toLowerCase(); k = KEYMAP[k] || k; G.keys[k] = false; if (k === 'shift') G.keys.shift = false;
  });
  window.addEventListener('blur', () => { for (const k in G.keys) G.keys[k] = false; G.mouse.down = false; });
  const cv = $('game');
  cv.addEventListener('mousemove', (e) => { G.mouse.x = e.clientX; G.mouse.y = e.clientY; });
  cv.addEventListener('mousedown', (e) => {
    if (!inGame || !G.S || UI.isOpen() || UI.modalOpen) return;
    GF.Audio.init();
    G.mouse.x = e.clientX; G.mouse.y = e.clientY; G.screenToWorld(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    if (e.button === 2) { G.buildMode = null; return; }
    if (G.buildMode) { G.tryPlace(); return; }
    G.mouse.down = true;
  });
  window.addEventListener('mouseup', () => { G.mouse.down = false; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('beforeunload', () => { if (inGame && G.S) G.save(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && inGame && G.S) G.save(true); });

  // ------------------------------------------------------------ loop
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    try {
      if (inGame && G.S && G.map) {
        if (G.mouse.x || G.mouse.y) G.screenToWorld(G.mouse.x, G.mouse.y, window.innerWidth, window.innerHeight);
        if (!UI.isOpen() && !UI.modalOpen) G.update(dt);
        else if (UI.deathOpen) G.update(dt * 0);
        GF.Render.draw(now / 1000);
        UI.hud(dt, now / 1000);
        GF.Audio.update(dt, G.map.boss ? 'boss' : GF.isNight(G.S) ? 'night' : 'day');
      }
    } catch (err) {
      console.error(err);
      if (!Main.errShown) { Main.errShown = true; GF.hooks.notify('Error: ' + err.message, 'warn'); }
    }
  }
  Main.errors = [];
  window.addEventListener('error', (e) => Main.errors.push(String(e.message)));

  // ------------------------------------------------------------ boot
  try { const v = JSON.parse(localStorage.getItem('giantfall:vol')); if (v) GF.Audio.setVolumes(v.master, v.sfx, v.music); } catch (e) { /* ignore */ }
  GF.Render.init(cv);
  GF.Main.ready = true;
  title();
  requestAnimationFrame(frame);
})(window);
