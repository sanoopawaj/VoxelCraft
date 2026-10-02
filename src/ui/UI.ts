import { HOTBAR_SIZE, INVENTORY_SIZE, PLAYER_MAX_HEALTH } from '../utilities/Constants';
import { ACTION_LABELS, DEFAULT_BINDINGS, keyLabel, type Action, type InputManager } from '../input/InputManager';
import type { Inventory, ItemStack } from '../items/Inventory';
import { getItemDef } from '../items/ItemRegistry';
import { RECIPES } from '../items/Recipes';
import type { SettingsStore } from '../save/Settings';
import type { WorldMeta } from '../save/SaveManager';
import type { WorldType } from '../world/WorldGenerator';
import { getItemIcon } from '../rendering/TextureAtlas';

export type ScreenName = 'main' | 'worlds' | 'create' | 'settings' | 'controls' | 'loading' | 'pause' | 'death' | 'inventory';
const SCREENS: ScreenName[] = ['main', 'worlds', 'create', 'settings', 'controls', 'loading', 'pause', 'death', 'inventory'];

export interface UIHandlers {
  listWorlds(): Array<WorldMeta & { damaged: boolean }>;
  playWorld(meta: WorldMeta): void;
  createWorld(name: string, seed: string, type: WorldType): void;
  deleteWorld(meta: WorldMeta): void;
  resume(): void;
  save(): void;
  mainMenu(): void;
  respawn(): void;
  toggleFullscreen(): void;
  copySeed(): void;
  onUiClick(): void;
  craft(recipeIndex: number): void;
  dropStack(s: ItemStack): void;
  onScreenChange(name: ScreenName | null): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class UI {
  private current: ScreenName | null = null;
  private settingsReturn: ScreenName = 'main';
  private inv: Inventory | null = null;
  private cursor: ItemStack | null = null;
  private hotbarVersion = -1;
  private itemNameTimer = 0;
  private lastSelected = -1;
  private flashTimer = 0;
  private invVersion = -1;
  private msgs: Array<{ el: HTMLElement; t: number }> = [];
  private lastHealth = -1;

  constructor(private settings: SettingsStore, private input: InputManager, private h: UIHandlers) {
    this.buildCubes();
    this.buildHotbar();
    this.bind();
    window.addEventListener('mousemove', (e) => {
      const c = $('cursoritem');
      c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px';
      const tt = $('tooltip');
      tt.style.left = e.clientX + 14 + 'px'; tt.style.top = e.clientY + 14 + 'px';
    });
  }

  // ------------------------------------------------------------ screens
  show(name: ScreenName | null) {
    this.current = name;
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    if (name !== 'inventory') { $('cursoritem').classList.add('hidden'); $('tooltip').classList.add('hidden'); }
    if (name === 'worlds') this.renderWorldList();
    if (name === 'create') { ($('cw-name') as HTMLInputElement).value = 'New World'; ($('cw-seed') as HTMLInputElement).value = ''; }
    if (name === 'settings') this.renderSettings();
    if (name === 'controls') this.renderControls();
    if (name === 'inventory') { this.invVersion = -1; this.renderInventory(); }
    this.h.onScreenChange(name);
  }

  get screen() { return this.current; }

  showHud(on: boolean) { $('hud').classList.toggle('hidden', !on); }

  openSettings(from: ScreenName) { this.settingsReturn = from; this.show('settings'); }
  openControls(from: ScreenName) { this.settingsReturn = from; this.show('controls'); }

  private click() { this.h.onUiClick(); }

  private bind() {
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', () => { this.click(); fn(); });
    on('btn-single', () => this.show('worlds'));
    on('btn-settings', () => this.openSettings('main'));
    on('btn-controls', () => this.openControls('main'));
    on('btn-fullscreen', () => this.h.toggleFullscreen());
    on('btn-worlds-back', () => this.show('main'));
    on('btn-newworld', () => this.show('create'));
    on('btn-create-back', () => this.show('worlds'));
    on('cw-random', () => { ($('cw-seed') as HTMLInputElement).value = String(Math.floor(Math.random() * 2e9)); });
    on('cw-copy', () => {
      const v = ($('cw-seed') as HTMLInputElement).value;
      this.copyText(v || '(random)');
    });
    on('btn-create-go', () => {
      this.h.createWorld(($('cw-name') as HTMLInputElement).value, ($('cw-seed') as HTMLInputElement).value, ($('cw-type') as HTMLSelectElement).value as WorldType);
    });
    on('btn-settings-back', () => this.show(this.settingsReturn));
    on('btn-controls-back', () => this.show(this.settingsReturn));
    on('btn-controls-reset', () => { this.settings.update({ bindings: { ...DEFAULT_BINDINGS } }); this.renderControls(); });
    on('btn-resume', () => this.h.resume());
    on('btn-pause-settings', () => this.openSettings('pause'));
    on('btn-pause-controls', () => this.openControls('pause'));
    on('btn-save', () => this.h.save());
    on('btn-mainmenu', () => this.h.mainMenu());
    on('btn-copyseed', () => this.h.copySeed());
    on('btn-respawn', () => this.h.respawn());
    on('btn-death-menu', () => this.h.mainMenu());

    // Inventory interaction (delegated).
    const grid = $('invgrid');
    grid.addEventListener('mousedown', (e) => {
      const slotEl = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
      if (!slotEl || !this.inv) return;
      e.preventDefault();
      const slot = Number(slotEl.dataset.slot);
      if (e.shiftKey && e.button === 0 && !this.cursor) this.inv.quickMove(slot);
      else if (e.button === 2) this.cursor = this.inv.rightClickSlot(slot, this.cursor);
      else if (e.button === 0) this.cursor = this.inv.clickSlot(slot, this.cursor);
      this.click();
      this.renderInventory();
    });
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('mouseover', (e) => {
      const slotEl = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
      const s = slotEl && this.inv ? this.inv.get(Number(slotEl.dataset.slot)) : null;
      const tt = $('tooltip');
      if (s) { tt.textContent = getItemDef(s.id)?.name ?? 'Unknown'; tt.classList.remove('hidden'); } else tt.classList.add('hidden');
    });
    // Clicking the dim backdrop outside the panel drops the held stack.
    $('inventory').addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).id === 'inventory' && this.cursor) {
        this.h.dropStack(this.cursor);
        this.cursor = null;
        this.renderInventory();
      }
    });
    $('inventory').addEventListener('contextmenu', (e) => e.preventDefault());
    $('recipes').addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('.recipe') as HTMLElement | null;
      if (!el || !el.classList.contains('can')) return;
      this.h.craft(Number(el.dataset.idx));
      this.click();
      this.renderInventory();
    });
  }

  private buildCubes() {
    const c = $('cubes');
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('i');
      el.style.left = Math.random() * 100 + '%';
      el.style.animationDuration = 14 + Math.random() * 20 + 's';
      el.style.animationDelay = -Math.random() * 30 + 's';
      el.style.transform = `scale(${0.5 + Math.random() * 1.6})`;
      c.appendChild(el);
    }
  }

  // ------------------------------------------------------------ world list
  private renderWorldList() {
    const list = $('worldlist');
    list.innerHTML = '';
    const worlds = this.h.listWorlds();
    if (!worlds.length) { list.innerHTML = '<div class="empty">No worlds yet. Create one to begin!</div>'; return; }
    for (const w of worlds) {
      const el = document.createElement('div');
      el.className = 'world-item' + (w.damaged ? ' bad' : '');
      const last = w.lastPlayed ? new Date(w.lastPlayed).toLocaleString() : 'never';
      const mins = Math.floor(w.playTime / 60);
      el.innerHTML = `<div class="info"><div class="name"></div><div class="meta"></div></div>`;
      (el.querySelector('.name') as HTMLElement).textContent = w.name + (w.type === 'test' ? '  [test world]' : '');
      (el.querySelector('.meta') as HTMLElement).textContent = `Seed: ${w.seed} · Last played: ${last} · Play time: ${mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm'}${w.damaged ? ' · SAVE DAMAGED' : ''}`;
      const play = document.createElement('button'); play.className = 'primary small'; play.textContent = 'Play'; play.disabled = w.damaged;
      play.onclick = () => { this.click(); this.h.playWorld(w); };
      const copy = document.createElement('button'); copy.className = 'small'; copy.textContent = 'Seed'; copy.title = 'Copy seed';
      copy.onclick = () => { this.click(); this.copyText(String(w.seed)); copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Seed'), 1200); };
      const del = document.createElement('button'); del.className = 'danger small'; del.textContent = 'Delete';
      del.onclick = () => { this.click(); this.confirm('Delete world?', `"${w.name}" will be permanently deleted.`, () => { this.h.deleteWorld(w); this.renderWorldList(); }); };
      el.append(play, copy, del);
      list.appendChild(el);
    }
  }

  confirm(title: string, text: string, onYes: () => void) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm').classList.remove('hidden');
    const done = () => $('confirm').classList.add('hidden');
    ($('confirm-yes') as HTMLButtonElement).onclick = () => { done(); onYes(); };
    ($('confirm-no') as HTMLButtonElement).onclick = () => { this.click(); done(); };
  }

  copyText(t: string) {
    try { void navigator.clipboard?.writeText(t); } catch { /* clipboard may be blocked; the seed is visible on screen anyway */ }
  }

  // ------------------------------------------------------------ settings
  private renderSettings() {
    const body = $('settingsbody');
    body.innerHTML = '';
    const s = this.settings.value;
    const slider = (label: string, key: keyof typeof s, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><span class="val"></span>`;
      const inp = row.querySelector('input') as HTMLInputElement, val = row.querySelector('.val') as HTMLElement;
      inp.value = String(s[key]); val.textContent = fmt(Number(s[key]));
      inp.oninput = () => { val.textContent = fmt(Number(inp.value)); this.settings.update({ [key]: Number(inp.value) } as any); };
      body.appendChild(row);
    };
    const check = (label: string, key: keyof typeof s) => {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<label>${label}</label><input type="checkbox">`;
      const inp = row.querySelector('input') as HTMLInputElement;
      inp.checked = Boolean(s[key]);
      inp.onchange = () => { this.click(); this.settings.update({ [key]: inp.checked } as any); };
      body.appendChild(row);
    };
    slider('Mouse sensitivity', 'mouseSensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x');
    slider('Field of view', 'fov', 50, 110, 1, (v) => v + '°');
    slider('Render distance', 'renderDistance', 2, 12, 1, (v) => v + ' chunks');
    slider('Master volume', 'masterVolume', 0, 1, 0.01, (v) => Math.round(v * 100) + '%');
    slider('Music volume', 'musicVolume', 0, 1, 0.01, (v) => Math.round(v * 100) + '%');
    slider('Sound effects volume', 'sfxVolume', 0, 1, 0.01, (v) => Math.round(v * 100) + '%');
    slider('Day length', 'dayLengthSeconds', 60, 1800, 30, (v) => (v / 60).toFixed(1) + ' min');
    check('Invert Y axis', 'invertY');
    check('View bobbing', 'viewBobbing');
    check('Show coordinates', 'showCoords');
    check('Keep inventory on death', 'keepInventory');
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label>Graphics quality</label><select><option value="fancy">Fancy (clouds, sharp)</option><option value="fast">Fast (no clouds, lower res)</option></select>`;
    const sel = row.querySelector('select') as HTMLSelectElement;
    sel.value = s.quality;
    sel.onchange = () => this.settings.update({ quality: sel.value as 'fast' | 'fancy' });
    body.appendChild(row);
    const fs = document.createElement('div'); fs.className = 'row';
    fs.innerHTML = '<label>Fullscreen</label><button class="small">Toggle fullscreen</button>';
    (fs.querySelector('button') as HTMLButtonElement).onclick = () => { this.click(); this.h.toggleFullscreen(); };
    body.appendChild(fs);
  }

  // ------------------------------------------------------------ controls
  private renderControls() {
    const t = $('keytable');
    t.innerHTML = '';
    const fixed: Array<[string, string]> = [
      ['Look', 'Mouse'], ['Break / Attack', 'Left Click'], ['Place / Eat', 'Right Click'],
      ['Select hotbar slot', '1 – 9'], ['Change slot', 'Mouse Wheel'], ['Pause', 'Esc'],
    ];
    const b = this.settings.value.bindings;
    for (const a of Object.keys(ACTION_LABELS) as Action[]) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${ACTION_LABELS[a]}</td><td><button class="small" style="min-width:110px"></button></td>`;
      const btn = tr.querySelector('button') as HTMLButtonElement;
      btn.textContent = keyLabel(b[a]);
      btn.onclick = () => {
        this.click();
        btn.textContent = 'Press a key...';
        this.input.keyCapture = (e) => {
          this.input.keyCapture = null;
          if (e.code !== 'Escape') this.settings.update({ bindings: { ...this.settings.value.bindings, [a]: e.code } });
          this.renderControls();
          return true;
        };
      };
      t.appendChild(tr);
    }
    for (const [k, v] of fixed) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${k}</td><td><kbd>${v}</kbd></td>`;
      t.appendChild(tr);
    }
  }

  // ------------------------------------------------------------ loading
  setLoading(seed: number | string, text: string, frac: number) {
    $('load-seed').textContent = `Seed: ${seed}`;
    $('load-text').textContent = text;
    ($('load-bar') as HTMLElement).style.width = Math.round(frac * 100) + '%';
  }

  setPauseInfo(text: string) { $('pause-info').textContent = text; }
  setPauseStatus(text: string) { $('pause-status').textContent = text; }
  setDeathReason(text: string) { $('death-reason').textContent = text; }

  // ------------------------------------------------------------ HUD
  private buildHotbar() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const d = document.createElement('div');
      d.className = 'slot'; d.dataset.i = String(i);
      d.innerHTML = `<span class="num">${i + 1}</span><img class="hidden"><span class="cnt"></span>`;
      hb.appendChild(d);
    }
  }

  updateHud(inv: Inventory, health: number, dt: number) {
    // Hotbar re-renders only when the inventory changed or selection moved.
    if (inv.version !== this.hotbarVersion) {
      this.hotbarVersion = inv.version;
      const slots = $('hotbar').children;
      for (let i = 0; i < HOTBAR_SIZE; i++) {
        const el = slots[i] as HTMLElement;
        const s = inv.get(i);
        const img = el.querySelector('img') as HTMLImageElement, cnt = el.querySelector('.cnt') as HTMLElement;
        if (s) { img.src = getItemIcon(s.id); img.classList.remove('hidden'); cnt.textContent = s.count > 1 ? String(s.count) : ''; }
        else { img.classList.add('hidden'); cnt.textContent = ''; }
        el.classList.toggle('sel', i === inv.selected);
      }
      const sel = inv.selectedStack();
      const selKey = inv.selected * 1000 + (sel ? sel.id : 0);
      if (selKey !== this.lastSelected) {
        this.lastSelected = selKey;
        const s = sel;
        const nm = $('itemname');
        nm.textContent = s ? getItemDef(s.id)?.name ?? '' : '';
        nm.style.opacity = s ? '1' : '0';
        this.itemNameTimer = 2;
      }
    }
    if (this.itemNameTimer > 0) { this.itemNameTimer -= dt; if (this.itemNameTimer <= 0) $('itemname').style.opacity = '0'; }
    if (health !== this.lastHealth) {
      this.lastHealth = health;
      ($('healthbar').firstElementChild as HTMLElement).style.width = (health / PLAYER_MAX_HEALTH) * 100 + '%';
      $('healthtext').textContent = String(Math.ceil(health));
    }
    // Message fade-out.
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      m.t -= dt;
      if (m.t < 1) m.el.style.opacity = String(Math.max(0, m.t));
      if (m.t <= 0) { m.el.remove(); this.msgs.splice(i, 1); }
    }
    if (this.flashTimer > 0) { this.flashTimer -= dt; if (this.flashTimer <= 0) $('flash').classList.remove('on'); }
  }

  setCoords(text: string) { $('coords').textContent = text; }
  setDebug(text: string | null) {
    const d = $('debug');
    d.classList.toggle('hidden', text === null);
    if (text !== null) d.innerHTML = text;
  }
  setUnderwater(on: boolean) { $('water').style.opacity = on ? '1' : '0'; }
  damageFlash() { $('flash').classList.add('on'); this.flashTimer = 0.15; }

  message(text: string, seconds = 5) {
    const el = document.createElement('div');
    el.textContent = text;
    $('messages').appendChild(el);
    this.msgs.push({ el, t: seconds });
    while (this.msgs.length > 6) this.msgs.shift()!.el.remove();
  }

  // ------------------------------------------------------------ command line
  openCommandLine(onSubmit: (cmd: string) => void, onClose: () => void) {
    const box = $('cmdbox'), inp = $('cmdinput') as HTMLInputElement;
    box.classList.remove('hidden');
    inp.value = '/';
    inp.focus();
    const close = () => { box.classList.add('hidden'); inp.onkeydown = null; inp.blur(); onClose(); };
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = inp.value; close(); onSubmit(v); }
      else if (e.key === 'Escape') close();
    };
  }
  get commandLineOpen() { return !$('cmdbox').classList.contains('hidden'); }

  // ------------------------------------------------------------ inventory
  bindInventory(inv: Inventory) { this.inv = inv; this.cursor = null; }

  /** Take back whatever is held on the cursor (when closing the inventory). */
  releaseCursor(): ItemStack | null { const c = this.cursor; this.cursor = null; return c; }

  renderInventory() {
    const inv = this.inv;
    if (!inv) return;
    const mk = (i: number) => {
      const s = inv.get(i);
      return `<div class="slot${i === inv.selected ? ' sel' : ''}" data-slot="${i}">${s ? `<img src="${getItemIcon(s.id)}">${s.count > 1 ? `<span class="cnt">${s.count}</span>` : ''}` : ''}</div>`;
    };
    let main = '', hot = '';
    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) main += mk(i);
    for (let i = 0; i < HOTBAR_SIZE; i++) hot += mk(i);
    $('inv-main').innerHTML = main;
    $('inv-hot').innerHTML = hot;
    const rec = $('recipes');
    rec.innerHTML = RECIPES.map((r, idx) => {
      const can = inv.canCraft(r);
      const ing = r.inputs.map(([id, n]) => {
        const have = inv.count(id);
        return `<span class="${have < n ? 'miss' : ''}"><img src="${getItemIcon(id)}">${have}/${n}</span>`;
      }).join('');
      return `<div class="recipe${can ? ' can' : ''}" data-idx="${idx}"><div class="out"><img src="${getItemIcon(r.output[0])}">${r.name}${r.output[1] > 1 ? ' ×' + r.output[1] : ''}</div><div class="ing">${ing}</div></div>`;
    }).join('');
    const c = $('cursoritem');
    if (this.cursor) {
      c.classList.remove('hidden');
      c.innerHTML = `<img src="${getItemIcon(this.cursor.id)}">${this.cursor.count > 1 ? `<span class="cnt">${this.cursor.count}</span>` : ''}`;
    } else c.classList.add('hidden');
    $('tooltip').classList.add('hidden');
    this.invVersion = inv.version;
  }

  /** Re-render the open inventory if something else (a pickup) changed it. */
  refreshInventoryIfChanged() {
    if (this.current === 'inventory' && this.inv && this.inv.version !== this.invVersion) this.renderInventory();
  }
}
