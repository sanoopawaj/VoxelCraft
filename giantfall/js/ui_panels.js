// Panels: inventory, crafting, shops, tycoon, build, quests, map, skills, menus.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const UI = GF.UI;
  const $ = (id) => document.getElementById(id);
  const esc = UI.esc, img = UI.img;
  const G = () => GF.G;
  const S = () => GF.G.S;
  const PB = { name: null, tab: null, sel: null, data: {} };
  UI.PB = PB;
  const P = UI.panels, A = UI.actions;

  // ------------------------------------------------------------ framework
  UI.open = function (name, opt) {
    opt = opt || {};
    PB.name = name; PB.tab = opt.tab || (P[name].tabs ? P[name].tabs(PB)[0][0] : null); PB.sel = opt.sel === undefined ? null : opt.sel; PB.data = opt.data || {};
    $('panel').classList.remove('hidden');
    G().panel = name; G().buildMode = null;
    GF.Audio.play('click');
    render(true);
  };
  UI.close = function () {
    $('panel').classList.add('hidden');
    G().panel = null; PB.name = null; UI.untip();
  };
  UI.isOpen = () => !!PB.name;
  function render(reset) {
    if (!PB.name) return;
    const def = P[PB.name];
    const tabs = def.tabs ? def.tabs(PB) : null;
    if (tabs && !tabs.find((t) => t[0] === PB.tab)) PB.tab = tabs[0][0];
    $('panel-title').textContent = def.title(PB);
    $('panel-tabs').innerHTML = tabs ? tabs.map(([id, label]) => `<button class="${id === PB.tab ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('') : '';
    const body = $('panel-body');
    const keep = []; if (!reset) body.querySelectorAll('.cols > div, .scrollkeep').forEach((el) => keep.push(el.scrollTop));
    const top = body.scrollTop;
    body.innerHTML = def.render(PB);
    if (!reset) { body.querySelectorAll('.cols > div, .scrollkeep').forEach((el, i) => { if (keep[i] !== undefined) el.scrollTop = keep[i]; }); body.scrollTop = top; }
    if (def.after) def.after(PB);
  }
  UI.render = render;
  $('panel-close').onclick = () => UI.close();
  $('panel-tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { PB.tab = b.dataset.tab; PB.sel = null; GF.Audio.play('click'); render(true); } };
  $('panel-body').addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.a];
    if (fn) { fn(el.dataset, e); GF.Audio.play(el.dataset.snd || 'click'); render(); }
  });
  $('panel-body').addEventListener('mousemove', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el) UI.tip(el.dataset.tip, e.clientX, e.clientY); else UI.untip();
  });
  $('panel-body').addEventListener('input', (e) => { const el = e.target; if (el.dataset.in) { PB.data[el.dataset.in] = el.value; } });
  $('panel-body').addEventListener('change', (e) => { const el = e.target; if (el.dataset.chg && A[el.dataset.chg]) { A[el.dataset.chg](el.dataset, e, el.value); render(); } });

  // ------------------------------------------------------------ helpers
  const num = (n) => U.fmt(n);
  const coin = (n) => `<span class="pill"><span class="coin-ico" style="width:14px;height:14px"></span>${num(n)}</span>`;
  function pills(items, label) {
    let h = '';
    for (const k in items) {
      const need = items[k]; if (!(need > 0)) continue;
      const have = GF.total(S(), k);
      h += `<span class="pill ${have >= need ? 'have' : 'miss'}" data-tip="${esc(GF.ITEMS[k].name)}: you have ${have}">${img(k)}${num(have)}/${num(need)}</span>`;
    }
    return h;
  }
  const costPills = (c) => (c.coins ? `<span class="pill ${S().coins >= c.coins ? 'have' : 'miss'}"><span class="coin-ico" style="width:14px;height:14px"></span>${num(S().coins)}/${num(c.coins)}</span>` : '') + pills(c.items || {});
  const msg = (r) => { if (r && r.msg) GF.hooks.notify(r.msg, r.ok === false ? 'warn' : 'info'); return r; };
  const atHome = () => GF.nearHome(S(), G().P.x, G().P.y) && G().map.kind === 'over';
  const TYPE_ORDER = ['weapon', 'armor', 'tool', 'charm', 'trans', 'seal', 'machine', 'potion', 'food', 'seed', 'crop', 'part', 'mat', 'res', 'drop', 'boss', 'misc'];
  const typeOrder = (id) => { const i = TYPE_ORDER.indexOf(GF.ITEMS[id].type); return i < 0 ? 99 : i; };
  const tipFor = (id) => { const it = GF.ITEMS[id]; return `<b>${esc(it.name)}</b><br>${esc(it.desc || '')}<br><span class='muted'>Value ${it.value}</span>`; };

  // ------------------------------------------------------------ INVENTORY
  P.inv = {
    title: () => 'Inventory & Equipment',
    tabs: () => [['bag', 'Bag'], ['stash', 'Home Stash']],
    render(pb) {
      const s = S(), stash = pb.tab === 'stash', src = stash ? s.stash : s.inv;
      const ids = Object.keys(src).filter((k) => src[k] > 0 && GF.ITEMS[k]).sort((a, b) => typeOrder(a) - typeOrder(b) || GF.ITEMS[b].value - GF.ITEMS[a].value);
      const cap = stash ? GF.stashCap(s) : GF.capacity(s), used = stash ? GF.stashUsed(s) : GF.carry(s);
      let left = `<div class="statline"><span>${stash ? 'Home stash (businesses deliver here)' : 'Bag'}</span><b class="${used >= cap ? 'bad' : ''}">${used} / ${cap}</b></div><div class="prog"><i style="width:${Math.min(100, used / cap * 100)}%"></i></div><div style="height:10px"></div>`;
      left += ids.length ? `<div class="grid">${ids.map((id) => `<div class="cell ${pb.sel === id ? 'sel' : ''}" data-a="isel" data-id="${id}" data-tip="${esc(tipFor(id))}">${img(id)}<span class="n">${src[id]}</span></div>`).join('')}</div>` : `<div class="bigmsg">${stash ? 'The stash is empty. Businesses with a conveyor (or the Automation Hub) deliver here, and you can move items from your bag when at home.' : 'Your bag is empty. Go gather something!'}</div>`;
      const eq = ['weapon', 'armor', 'pick', 'axe', 'charm', 'trans'].map((sl) => {
        const id = s.equip[sl]; const lab = { weapon: 'Weapon', armor: 'Armor', pick: 'Pickaxe', axe: 'Axe', charm: 'Charm', trans: 'Transport' }[sl];
        return `<div class="eqslot ${id ? 'full' : ''}" data-a="unequip" data-slot="${sl}" ${id ? `data-tip="${esc(tipFor(id))}<br>Click to unequip"` : ''}>${id ? img(id) : ''}${id ? esc(GF.ITEMS[id].name) : lab}</div>`;
      }).join('');
      const w = GF.weapon(s);
      const stats = `<div class="statline"><span>Health</span><b>${Math.ceil(s.hp)} / ${GF.maxHp(s)}</b></div><div class="statline"><span>Damage</span><b>${Math.round(GF.playerDamage(s))}${w ? '' : ' (fists)'}</b></div><div class="statline"><span>Defense</span><b>${Math.round(GF.defense(s))} (${Math.round(100 - 80 / (80 + GF.defense(s)) * 100)}% less damage)</b></div><div class="statline"><span>Speed</span><b>${(5.2 * (1 + GF.fx(s, 'speed'))).toFixed(1)}</b></div><div class="statline"><span>Pickaxe / Axe tier</span><b>${GF.toolTier(s, 'pick')} / ${GF.toolTier(s, 'axe')}</b></div><div class="statline"><span>Crit chance</span><b>${Math.round((0.05 + GF.fx(s, 'crit')) * 100)}%</b></div>`;
      let det = '';
      const id = pb.sel;
      if (id && src[id]) {
        const it = GF.ITEMS[id];
        const uses = GF.usesOf(id).slice(0, 6);
        det = `<div class="card"><h3>${img(id)} ${esc(it.name)} <span class="muted">x${src[id]}</span></h3><div class="small-note">${esc(it.desc || '')}</div><div class="small-note">Value ${it.value} each${uses.length ? ' · Used in: ' + esc(uses.join(', ')) : ''}</div><div class="row">`;
        if (it.slot && !stash) det += `<button class="small gold" data-a="equip" data-id="${id}">Equip</button>`;
        if (!stash && (it.heal || it.buff || it.type === 'seed' || id === 'recall_scroll')) det += `<button class="small gold" data-a="use" data-id="${id}">${it.type === 'seed' ? 'Select for planting' : 'Use'}</button>`;
        if (!stash && ['food', 'potion', 'seed', 'misc'].includes(it.type)) det += `<span class="small-note">Quick bar:</span>` + [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button class="small" data-a="qset" data-id="${id}" data-n="${n - 1}">${n}</button>`).join('');
        det += `</div><div class="row">`;
        if (atHome()) { det += stash ? `<button class="small" data-a="tobag" data-id="${id}" data-n="1">To bag ×1</button><button class="small" data-a="tobag" data-id="${id}" data-n="999">To bag all</button>` : `<button class="small" data-a="tostash" data-id="${id}" data-n="1">To stash ×1</button><button class="small" data-a="tostash" data-id="${id}" data-n="999">To stash all</button>`; }
        else det += `<span class="small-note">Return home to move items between bag and stash.</span>`;
        if (!stash) det += `<button class="small red" data-a="discard" data-id="${id}">Discard</button>`;
        det += `</div></div>`;
      } else det = `<div class="small-note">Click an item for options. Items in your <b>Home Stash</b> are used for crafting, building and machine inputs too.</div>`;
      return `<div class="cols"><div>${left}</div><div><div class="slotbox">${eq}</div>${det}<div class="card"><h3>Character</h3>${stats}</div></div></div>`;
    },
  };
  A.isel = (d) => { PB.sel = d.id; };
  A.equip = (d) => { GF.equip(S(), d.id); GF.hooks.sound('click'); PB.sel = null; };
  A.unequip = (d) => { if (!GF.unequip(S(), d.slot)) GF.hooks.notify('Your bag is full.', 'warn'); };
  A.use = (d) => { G().useItem(d.id); };
  A.qset = (d) => { const s = S(); const n = Number(d.n); const old = s.quick.indexOf(d.id); if (old >= 0) s.quick[old] = s.quick[n]; s.quick[n] = d.id; };
  A.tostash = (d) => { const s = S(); const n = Math.min(Number(d.n), GF.count(s, d.id)); const left = GF.stashAdd(s, d.id, n, { noStat: true }); GF.remove(s, d.id, n - left); if (left) GF.hooks.notify('Stash is full. Upgrade the Warehouse!', 'warn'); };
  A.tobag = (d) => { const s = S(); const n = Math.min(Number(d.n), GF.stashCount(s, d.id)); const left = GF.add(s, d.id, n, { noStat: true }); GF.stashRemove(s, d.id, n - left); if (left) GF.hooks.notify('Your bag is full.', 'warn'); };
  A.discard = (d) => { UI.modal(`<h2>Discard ${esc(GF.ITEMS[d.id].name)}?</h2><p>This destroys all ${GF.count(S(), d.id)} from your bag. Consider selling instead!</p>`, [{ label: 'Cancel' }, { label: 'Discard', cls: 'red', fn: () => { GF.remove(S(), d.id, 99999); PB.sel = null; render(); } }]); };

  // ------------------------------------------------------------ CRAFTING
  P.craft = {
    title: () => 'Crafting',
    tabs: () => GF.CRAFT_CATS.map(([id, label]) => [id, label]),
    render(pb) {
      const s = S();
      const list = GF.RECIPES.filter((r) => pb.tab === 'all' || r.cat === pb.tab || (pb.tab === 'tech' && r.cat === 'tech'));
      const status = (r) => (GF.recipeUnlocked(s, r) ? (GF.stationOk(s, r) ? (GF.maxCraft(s, r) > 0 ? 2 : 1) : 0) : -1);
      list.sort((a, b) => status(b) - status(a));
      let left = '';
      const sel = pb.sel && GF.RECIPES.find((r) => r.id === pb.sel);
      for (const r of list) {
        const st = status(r);
        left += `<div class="list-item ${sel && sel.id === r.id ? 'sel' : ''} ${st < 0 ? 'lock' : ''}" data-a="rsel" data-id="${r.id}">${img(r.out)}<div class="grow"><div class="t">${esc(GF.ITEMS[r.out].name)}${r.qty > 1 ? ' ×' + r.qty : ''}</div><div class="s">${st === 2 ? '<span class="good">Ready to craft</span>' : st === 1 ? 'Missing ingredients' : st === 0 ? 'Needs ' + esc(GF.STATION_NAMES[r.station]) : 'Locked: ' + esc(GF.condText(r.unlock))}</div></div></div>`;
      }
      if (!list.length) left = '<div class="bigmsg">No recipes in this category yet.</div>';
      let right = '<div class="bigmsg">Select a recipe.<br><br>Recipes unlock through quests, bosses, research and levels. Locked recipes show what you need.</div>';
      if (sel) {
        const it = GF.ITEMS[sel.out];
        const why = GF.craftBlocker(s, sel, 1, G().P);
        const m = GF.maxCraft(s, sel);
        right = `<div class="card"><h3>${img(sel.out)} ${esc(it.name)}${sel.qty > 1 ? ' ×' + sel.qty : ''}</h3><div class="small-note">${esc(it.desc || '')}</div>
          <div style="margin:8px 0"><div class="small-note">INGREDIENTS (bag + stash)</div>${pills(sel.ing)}</div>
          <div class="statline"><span>Station</span><b class="${GF.stationOk(s, sel) ? 'good' : 'bad'}">${esc(GF.STATION_NAMES[sel.station])} ${GF.stationOk(s, sel) ? '✓' : '✗'}</b></div>
          <div class="statline"><span>Unlock</span><b class="${GF.recipeUnlocked(s, sel) ? 'good' : 'bad'}">${GF.recipeUnlocked(s, sel) ? 'Unlocked ✓' : esc(GF.condText(sel.unlock))}</b></div>
          <div class="statline"><span>Free craft chance</span><b>${Math.round(GF.saveChance(s, sel) * 100)}%</b></div>
          <div class="statline"><span>Sell value</span><b>${it.value} each</b></div>
          <div class="row"><button class="gold" data-a="craft" data-n="1" ${why ? 'disabled' : ''}>Craft ×1</button><button data-a="craft" data-n="5" ${GF.craftBlocker(s, sel, 5, G().P) ? 'disabled' : ''}>×5</button><button data-a="craft" data-n="${Math.max(1, m)}" ${why || m < 2 ? 'disabled' : ''}>Max (${m})</button></div>
          ${why ? `<div class="small-note bad" style="margin-top:6px">${esc(why)}</div>` : ''}</div>`;
      }
      return `<div class="cols"><div>${left}</div><div>${right}</div></div>`;
    },
  };
  A.rsel = (d) => { PB.sel = d.id; };
  A.craft = (d) => {
    const r = GF.RECIPES.find((x) => x.id === PB.sel);
    const res = GF.craft(S(), r, Number(d.n), G().P);
    msg(res);
    if (res.ok) { GF.Audio.play('craft'); G().spawnParticles('craft', G().P.x, G().P.y, {}); GF.checkQuests(S()); }
  };

  // ------------------------------------------------------------ SHOPS
  UI.openShop = function (shopId, npc) {
    const rum = GF.RUMORS[Math.floor((S().time / 60 + (npc ? npc.x : 0)) % GF.RUMORS.length)];
    UI.open('shop', { tab: 'buy', data: { shop: shopId, npc, rumor: rum } });
  };
  P.shop = {
    title: (pb) => GF.SHOPS[pb.data.shop].name,
    tabs: (pb) => { const t = [['buy', 'Buy'], ['sell', 'Sell']]; if (pb.data.shop === 'general') t.push(['up', 'Upgrades'], ['cos', 'Cosmetics']); if (GF.tradingPost(S())) t.push(['market', 'Player Market']); return t; },
    render(pb) {
      const s = S(), sid = pb.data.shop, shop = GF.SHOPS[sid];
      const head = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span class="small-note">${esc(pb.data.rumor || '')}</span><span>${coin(s.coins)}</span></div>`;
      if (pb.tab === 'buy') {
        const entries = GF.entriesFor(s, sid);
        return head + entries.map((e) => {
          const it = GF.ITEMS[e.item], lockMsg = GF.condMet(s, e.req || 'start') ? '' : GF.condText(e.req), avail = lockMsg ? 0 : GF.available(s, sid, e), price = GF.buyPrice(s, sid, e);
          return `<div class="list-item ${lockMsg ? 'lock' : ''}" data-tip="${esc(tipFor(e.item))}">${img(e.item)}<div class="grow"><div class="t">${esc(it.name)} ${e.src === 'rare' ? '<span class="gold-t">★ Rare offer</span>' : ''}</div><div class="s">${lockMsg ? '🔒 ' + esc(lockMsg) : avail <= 0 ? 'Sold out today' : (e.stock < 0 ? 'Always in stock' : `In stock: ${avail}`)} · you have ${GF.total(s, e.item)}</div></div>${coin(price)}<button class="small" data-a="buy" data-item="${e.item}" data-n="1" ${avail < 1 || s.coins < price ? 'disabled' : ''} data-snd="buy">Buy</button><button class="small" data-a="buy" data-item="${e.item}" data-n="5" ${avail < 5 || s.coins < price * 5 ? 'disabled' : ''} data-snd="buy">×5</button><button class="small" data-a="buy" data-item="${e.item}" data-n="20" ${avail < 20 || s.coins < price * 20 ? 'disabled' : ''} data-snd="buy">×20</button></div>`;
        }).join('');
      }
      if (pb.tab === 'sell') {
        const ids = Object.keys(s.inv).filter((k) => s.inv[k] > 0).sort((a, b) => GF.sellPrice(s, sid, b) - GF.sellPrice(s, sid, a));
        if (!ids.length) return head + '<div class="bigmsg">Nothing to sell. Gather, hunt and craft!</div>';
        const total = ids.reduce((a, id) => a + GF.sellPrice(s, sid, id) * s.inv[id], 0);
        return head + `<div class="small-note" style="margin-bottom:8px">${esc(shop.name)} pays ${Math.round(shop.buy.all * 100)}% of value for most goods and more for their specialty. Prices dip as you sell more of one item, so spread your sales. Selling to a specialist or the Player Market pays best.</div>` + ids.map((id) => {
          const p = GF.sellPrice(s, sid, id), mult = GF.sellMult(s, sid, id);
          return `<div class="list-item" data-tip="${esc(tipFor(id))}">${img(id)}<div class="grow"><div class="t">${esc(GF.ITEMS[id].name)} <span class="muted">×${s.inv[id]}</span></div><div class="s">${Math.round(mult * 100)}% of value${GF.ITEMS[id].slot && GF.equipped(s, id) ? '' : ''}</div></div>${coin(p)}<button class="small" data-a="sell" data-item="${id}" data-n="1" data-snd="coin">Sell</button><button class="small" data-a="sell" data-item="${id}" data-n="10" data-snd="coin">×10</button><button class="small gold" data-a="sell" data-item="${id}" data-n="9999" data-snd="coin">All</button></div>`;
        }).join('') + `<div class="row-btns" style="display:flex;justify-content:flex-end"><span class="small-note" style="margin-right:auto">Whole bag is worth about ${num(total)} Crowns here.</span></div>`;
      }
      if (pb.tab === 'up') {
        const c = GF.bagUpgradeCost(s);
        let h = head + `<div class="card"><h3>🎒 Backpack Upgrade</h3><div class="small-note">Carry capacity now <b>${GF.capacity(s)}</b>. A bigger pack means longer expeditions.</div><div class="row">${c === undefined ? '<b class="good">Maxed out!</b>' : `${coin(c)}<button class="gold" data-a="buybag" ${s.coins < c ? 'disabled' : ''} data-snd="buy">Upgrade to ${GF.BAG_CAP[s.bagLevel + 1]}</button>`}</div></div>`;
        h += `<div class="card"><h3>Other ways to carry more</h3><div class="small-note">Craft transport (Handcart, Pack Mule, Wagon, Steam Wagon, Sky Skiff), research Logistics, and build Warehouses for your home stash.</div></div>`;
        return h;
      }
      if (pb.tab === 'cos') return head + GF.COSMETICS.map((c) => { const own = s.cosm.owned[c.id], worn = s.cosm[c.slot] === c.id, lock = c.req && !GF.condMet(s, c.req); return `<div class="list-item ${lock ? 'lock' : ''}"><div style="width:34px;height:34px;border-radius:50%;background:${c.col};border:3px solid #fff3"></div><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${lock ? '🔒 ' + esc(GF.condText(c.req)) : c.slot === 'hat' ? 'Hat' : 'Cape'}</div></div>${own ? `<button class="small ${worn ? 'gold' : ''}" data-a="wear" data-id="${c.id}">${worn ? 'Worn' : 'Wear'}</button>` : `${coin(c.cost)}<button class="small" data-a="buycos" data-id="${c.id}" ${lock || s.coins < c.cost ? 'disabled' : ''}>Buy</button>`}</div>`; }).join('') + `<div class="row"><button class="small" data-a="unwear" data-slot="hat">Remove hat</button><button class="small" data-a="unwear" data-slot="cape">Remove cape</button></div>`;
      if (pb.tab === 'market') return head + marketHtml();
      return head;
    },
  };
  GF.equipped = (s, id) => Object.values(s.equip).includes(id);
  A.buy = (d) => msg(GF.buy(S(), PB.data.shop, d.item, Number(d.n)));
  A.sell = (d) => { const r = GF.sell(S(), PB.data.shop, d.item, Number(d.n)); if (r > 0) { GF.hooks.notify(`Sold for ${num(r)} Crowns.`, 'coin'); GF.checkQuests(S()); } };
  A.buybag = () => msg(GF.buyBag(S()));
  A.buycos = (d) => msg(GF.buyCosmetic(S(), d.id));
  A.wear = (d) => { const c = GF.COSMETICS.find((x) => x.id === d.id); S().cosm[c.slot] = d.id; };
  A.unwear = (d) => { S().cosm[d.slot] = null; };

  // ------------------------------------------------------------ PLAYER MARKET (used in shop + tycoon tabs)
  function marketHtml() {
    const s = S(), m = s.market;
    const slots = GF.maxListings(s);
    const bag = Object.keys(s.inv).filter((k) => s.inv[k] > 0 && GF.ITEMS[k].value >= 1);
    const sel = PB.data.mitem && s.inv[PB.data.mitem] ? PB.data.mitem : bag[0];
    PB.data.mitem = sel;
    const fair = sel ? Math.round(GF.fairValue(s, sel)) : 0;
    let h = `<div class="card"><h3>Your stall <span class="muted">(${m.listings.length}/${slots} slots · ${Math.round(GF.marketFee(s) * 100)}% fee)</span></h3><div class="small-note">Real shoppers buy from your stall over time. Price near fair value to sell steadily; overprice and nobody comes. Pays far better than merchants.</div>`;
    if (m.listings.length < slots && bag.length) h += `<div class="row"><select data-chg="mitem">${bag.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(GF.ITEMS[k].name)} (${s.inv[k]})</option>`).join('')}</select>Qty <input type="number" min="1" max="${s.inv[sel] || 1}" value="${PB.data.mqty || Math.min(10, s.inv[sel] || 1)}" style="width:70px" data-in="mqty">Price each <input type="number" min="1" value="${PB.data.mprice || fair}" style="width:90px" data-in="mprice"><button class="gold small" data-a="list">List</button><span class="small-note">fair ≈ ${fair}</span></div>`;
    else if (!bag.length) h += '<div class="small-note" style="margin-top:6px">Carry some goods in your bag to list them.</div>';
    h += '</div>';
    for (const l of m.listings) { const ratio = l.price / Math.max(1, GF.fairValue(s, l.item)); h += `<div class="list-item">${img(l.item)}<div class="grow"><div class="t">${esc(GF.ITEMS[l.item].name)} ×${l.qty} @ ${l.price}</div><div class="s">${ratio < 0.9 ? 'Cheap: sells fast' : ratio < 1.15 ? 'Fair: sells steadily' : ratio < 1.5 ? 'Pricey: sells slowly' : 'Too high: nobody buys'} · sold ${l.sold} for ${num(l.earned)} Crowns</div></div><button class="small red" data-a="unlist" data-id="${l.id}">Withdraw</button></div>`; }
    h += `<div class="card"><h3>Other players are selling</h3><div class="small-note">Refreshes every few minutes. Grab bargains and resell them, or buy what you need.</div></div>`;
    if (!m.offers.length) h += '<div class="bigmsg">No offers right now.</div>';
    for (const o of m.offers) { const it = GF.ITEMS[o.item], ratio = o.price / it.value; h += `<div class="list-item" data-tip="${esc(tipFor(o.item))}">${img(o.item)}<div class="grow"><div class="t">${esc(it.name)} ×${o.qty}</div><div class="s">from ${esc(o.seller)} · ${ratio < 0.85 ? '<span class="good">Bargain!</span>' : ratio > 1.15 ? 'Pricey' : 'Fair'}</div></div>${coin(o.price)}<button class="small" data-a="buyoffer" data-id="${o.id}" data-n="1" ${s.coins < o.price ? 'disabled' : ''} data-snd="buy">Buy</button><button class="small" data-a="buyoffer" data-id="${o.id}" data-n="${o.qty}" ${s.coins < o.price * o.qty ? 'disabled' : ''} data-snd="buy">All</button></div>`; }
    return h;
  }
  A.mitem = (d, e, v) => { PB.data.mitem = v; PB.data.mprice = null; };
  A.list = () => { const r = GF.listItem(S(), PB.data.mitem, Number(PB.data.mqty || 1), Number(PB.data.mprice || Math.round(GF.fairValue(S(), PB.data.mitem)))); msg(r); if (r.ok) { PB.data.mqty = null; PB.data.mprice = null; } };
  A.unlist = (d) => GF.cancelListing(S(), Number(d.id));
  A.buyoffer = (d) => msg(GF.buyOffer(S(), Number(d.id), Number(d.n)));

  // ------------------------------------------------------------ TYCOON
  UI.openBuilding = function (b) {
    const d = GF.BUILDINGS[b.type];
    if (b.type === 'trading_post') return UI.open('tycoon', { tab: 'market' });
    UI.open('tycoon', { tab: 'buildings', data: { focus: b.uid } });
  };
  function estimateIncome() {
    const s = S(); let v = 0, wages = 0;
    for (const b of s.buildings) {
      if (!GF.BIZ[b.type]) continue;
      if (b.type === 'house') v += GF.BIZ.house.residents[b.level - 1] * 0.2;
      if (!GF.PRODUCERS.includes(b.type)) continue;
      const r = GF.bizReport(s, b); wages += r.wage; if (b.mode === 'sell' || b.machines && b.machines.conveyor) v += r.value;
    }
    const tp = GF.tradingPost(s); if (tp) v += GF.BIZ.trading_post.income[tp - 1];
    return { v, wages };
  }
  P.tycoon = {
    title: () => 'Settlement & Tycoon',
    tabs: () => [['overview', 'Overview'], ['buildings', 'Businesses'], ['farm', 'Farms'], ['research', 'Research'], ['orders', 'Orders'], ['market', 'Marketplace'], ['land', 'Land']],
    render(pb) {
      const s = S();
      const t = pb.tab;
      const near = atHome();
      if (t === 'overview') {
        const pw = s.power, pp = s.pop, inc = estimateIncome();
        const th = s.buildings.find((b) => b.type === 'townhall');
        const info = GF.upgradeInfo(s, th);
        let nextCard = '';
        if (info) { nextCard = `<div class="card"><h3>⬆ Town Hall → Level ${th.level + 1}</h3><div class="small-note">Unlocks new buildings and raises your Settlement Level.</div><div style="margin:6px 0">${costPills(info.cost)}</div>${info.block ? `<div class="small-note bad">${esc(info.block)}</div>` : ''}<button class="gold" data-a="upg" data-uid="${th.uid}" ${info.block || !GF.canAfford(s, info.cost) ? 'disabled' : ''}>Upgrade Town Hall</button></div>`; }
        const unlockedNext = Object.values(GF.BUILDINGS).filter((b) => b.settle === GF.settleLevel(s) + 1).map((b) => b.name);
        return `<div class="cols"><div>
          <div class="card"><h3>Hearthstead · Settlement Level ${GF.settleLevel(s)}</h3>
            <div class="statline"><span>Prosperity</span><b>${num(GF.prosperity(s))}</b></div>
            <div class="statline"><span>Net income (auto)</span><b class="${inc.v - inc.wages >= 0 ? 'good' : 'bad'}">${inc.v - inc.wages >= 0 ? '+' : ''}${(inc.v - inc.wages).toFixed(1)} Crowns/min</b></div>
            <div class="statline"><span>Wages</span><b>${inc.wages.toFixed(1)} Crowns/min</b></div>
            <div class="statline"><span>Population</span><b class="${pp.pop >= pp.need ? 'good' : 'bad'}">${pp.pop} residents / ${pp.need} workers needed</b></div>
            <div class="prog"><i style="width:${Math.min(100, pp.pop / Math.max(1, pp.need) * 100)}%"></i></div>
            <div class="statline" style="margin-top:6px"><span>Power</span><b class="${pw.supply >= pw.demand ? 'good' : 'bad'}">${pw.supply.toFixed(0)} supply / ${pw.demand.toFixed(0)} demand${s.flags.fuel === false && pw.supply === 0 && pw.demand > 0 ? ' · OUT OF COAL' : ''}</b></div>
            <div class="prog"><i style="width:${Math.min(100, pw.demand ? pw.supply / pw.demand * 100 : 100)}%"></i></div>
            <div class="statline" style="margin-top:6px"><span>Research points</span><b>${Math.floor(s.rp)}</b></div>
            <div class="statline"><span>Stash</span><b>${GF.stashUsed(s)} / ${GF.stashCap(s)}</b></div>
            <div class="row">${near ? '<button class="gold" data-a="collectall">Collect all businesses</button>' : '<span class="small-note">Return home to collect production.</span>'}</div></div>
          <div class="card"><h3>What next?</h3><ul class="small-note" style="margin:0;padding-left:18px;line-height:1.7">${nextSteps().map((x) => `<li>${x}</li>`).join('')}</ul></div>
          </div><div>${nextCard}${unlockedNext.length ? `<div class="card"><h3>Next level unlocks</h3><div class="small-note">${esc(unlockedNext.join(', '))}</div></div>` : ''}
          <div class="card"><h3>How the empire works</h3><div class="small-note" style="line-height:1.6">• <b>Businesses</b> produce goods; workers (from Houses) and power matter.<br>• <b>Collect</b> output at home, or add a <b>Conveyor Kit</b>/<b>Automation Hub</b> to send it to your <b>stash</b>.<br>• Processors (Smithy, Factory, Bakery) pull inputs from the stash.<br>• Switch a business to <b>Auto-sell</b> (needs a Trading Post) for steady Crowns.<br>• Stations improve crafting; the Observatory weakens the Giant.</div></div></div></div>`;
      }
      if (t === 'buildings') {
        const bl = s.buildings.filter((b) => GF.BUILDINGS[b.type].kind !== 'decor' && (!pb.data.focus || b.uid === pb.data.focus));
        let h = pb.data.focus ? `<div class="row"><button class="small" data-a="unfocus">← All buildings</button></div>` : '';
        for (const b of bl) h += buildingCard(b, near);
        const decor = s.buildings.filter((b) => GF.BUILDINGS[b.type].kind === 'decor');
        if (!pb.data.focus && decor.length) h += `<div class="card"><h3>Decorations (${decor.length})</h3><div class="small-note">Decorations add prosperity. Right-click in Build mode is not needed: demolish from here.</div><div class="row">${decor.map((b) => `<button class="small red" data-a="demo" data-uid="${b.uid}" data-tip="Demolish (50% refund)">${esc(GF.BUILDINGS[b.type].name)} ✕</button>`).join('')}</div></div>`;
        return h || '<div class="bigmsg">No buildings yet. Press B to build.</div>';
      }
      if (t === 'farm') {
        const fields = s.buildings.filter((b) => b.plots);
        if (!fields.length) return '<div class="bigmsg">Build a <b>Farm Field</b> (B) to start farming.</div>';
        const seeds = Object.keys(s.inv).concat(Object.keys(s.stash)).filter((k, i, a) => GF.ITEMS[k].type === 'seed' && a.indexOf(k) === i);
        let h = `<div class="card"><h3>Crops</h3><div class="small-note">Plant seeds, water them (watered crops grow 4× faster than dry ones), harvest when ripe. ${near ? '' : 'Return home to use bulk actions, or walk onto a field and press E.'}</div><div class="row">Seed: <select data-chg="seed">${['wheat', 'carrot', 'pumpkin', 'berry', 'moonbloom', 'emberpepper'].map((c) => `<option value="${c}" ${G().selSeed === c ? 'selected' : ''}>${esc(GF.ITEMS[c].name)} (${GF.total(s, 'seed_' + c)} seeds · ${GF.CROPDATA[c].grow}s)</option>`).join('')}</select></div></div>`;
        for (const f of fields) {
          const ripe = f.plots.filter((p) => p.crop && p.prog >= 1).length, growing = f.plots.filter((p) => p.crop && p.prog < 1).length, empty = f.plots.filter((p) => !p.crop).length;
          h += `<div class="card"><h3>Field (Lv ${f.level}) — ${ripe} ripe · ${growing} growing · ${empty} empty</h3><div style="display:grid;grid-template-columns:repeat(3,48px);gap:4px;margin:6px 0">${f.plots.map((p) => `<div style="height:48px;border-radius:6px;border:2px solid ${p.crop ? (p.prog >= 1 ? '#ffd24a' : '#3a6a3a') : '#4a3a2a'};background:${p.crop ? GF.ITEMS[p.crop].col + '55' : '#2a1a10'};display:flex;align-items:center;justify-content:center;font-size:11px;position:relative">${p.crop ? img(p.crop).replace('<img', '<img style="width:30px;height:30px;opacity:' + (0.35 + 0.65 * Math.min(1, p.prog)) + '"') : ''}${p.crop && p.water > 0 ? '<span style="position:absolute;right:2px;top:0">💧</span>' : ''}</div>`).join('')}</div>
          <div class="row"><button class="small gold" data-a="fplant" data-uid="${f.uid}" ${near ? '' : 'disabled'}>Plant all</button><button class="small" data-a="fwater" data-uid="${f.uid}" ${near ? '' : 'disabled'}>Water all</button><button class="small gold" data-a="fharv" data-uid="${f.uid}" ${near && ripe ? '' : 'disabled'}>Harvest all (${ripe})</button></div></div>`;
        }
        return h;
      }
      if (t === 'research') {
        const lab = GF.buildingsOf(s, 'lab').length;
        let h = `<div class="card"><h3>Research · ${Math.floor(s.rp)} points</h3><div class="small-note">${lab ? 'Your lab generates points over time (needs workers and power). Tablets, bosses and quests grant some too.' : 'Build a Research Lab (Town Hall level 3) to research technologies.'}</div></div>`;
        for (const id in GF.TECHS) {
          const t2 = GF.TECHS[id], st = GF.techState(s, id);
          h += `<div class="card" style="${st.done ? 'opacity:.6' : ''}"><h3>${esc(t2.name)} ${st.done ? '<span class="good">✓ Researched</span>' : ''}</h3><div class="small-note">${esc(t2.desc)}</div>${st.done ? '' : `<div class="row"><span class="pill ${s.rp >= t2.rp ? 'have' : 'miss'}">${Math.floor(s.rp)}/${t2.rp} RP</span>${coin(t2.coins)}${st.lock ? `<span class="small-note bad">${esc(st.lock)}</span>` : `<button class="small gold" data-a="research" data-id="${id}" ${s.rp >= t2.rp && s.coins >= t2.coins ? '' : 'disabled'}>Research</button>`}</div>`}</div>`;
        }
        return h;
      }
      if (t === 'orders') {
        if (!GF.tradingPost(s)) return '<div class="bigmsg">Build a <b>Trading Post</b> (Town Hall level 2) to receive customer orders.</div>';
        let h = `<div class="card"><h3>Customer Orders</h3><div class="small-note">Villagers want specific goods and pay a premium. New orders arrive every day. Delivers from bag + stash.</div></div>`;
        if (!s.market.orders.length) h += '<div class="bigmsg">No orders right now. Check back tomorrow.</div>';
        for (const o of s.market.orders) { const have = GF.total(s, o.item); h += `<div class="list-item">${img(o.item)}<div class="grow"><div class="t">${esc(o.who)} wants ${o.qty} × ${esc(GF.ITEMS[o.item].name)}</div><div class="s">You have ${have} · expires day ${o.expire} · +${o.xp} XP</div></div>${coin(o.reward)}<button class="small gold" data-a="deliver" data-id="${o.id}" ${have >= o.qty ? '' : 'disabled'} data-snd="coin">Deliver</button></div>`; }
        return h;
      }
      if (t === 'market') { if (!GF.tradingPost(s)) return '<div class="bigmsg">Build a <b>Trading Post</b> to run your own marketplace stall.</div>'; return marketHtml(); }
      if (t === 'land') {
        const next = s.land + 1, c = GF.LAND_COST[next];
        return `<div class="card"><h3>Settlement land</h3><div class="small-note">Expand your buildable area. Current expansion: ${s.land + 1} of ${GF.BUILD_ZONES.length}.</div><div class="row">${c === undefined ? '<b class="good">All land owned.</b>' : `${coin(c)}<button class="gold" data-a="land" ${s.coins < c ? 'disabled' : ''}>Buy more land</button>`}</div></div>`;
      }
      return '';
    },
  };
  function nextSteps() {
    const s = S(), out = [];
    const th = s.buildings.find((b) => b.type === 'townhall');
    const info = GF.upgradeInfo(s, th);
    if (info && !info.block && GF.canAfford(s, info.cost)) out.push('<b>You can upgrade the Town Hall!</b>');
    for (const b of s.buildings) { const i = GF.upgradeInfo(s, b); if (i && !i.block && b.type !== 'townhall' && GF.canAfford(s, i.cost) && out.length < 4) out.push(`Upgrade your ${GF.BUILDINGS[b.type].name} to level ${b.level + 1}.`); }
    const stock = s.buildings.filter((b) => b.stock && GF.stockTotal(b) > 10);
    if (stock.length) out.push(`Collect production from ${stock.length} business${stock.length > 1 ? 'es' : ''}.`);
    if (s.pop.pop < s.pop.need) out.push('Your businesses need more workers: build Houses.');
    if (s.power.demand > s.power.supply && s.power.demand > 0) out.push('Power shortage: upgrade the Power Plant and keep coal in your stash.');
    if (!GF.buildingsOf(s, 'trading_post').length && GF.settleLevel(s) >= 2) out.push('Build a Trading Post for orders, auto-sell and your marketplace.');
    if (!GF.buildingsOf(s, 'house').length) out.push('Build a House to grow your population.');
    const q = GF.activeMain(s)[0]; if (q) out.push(`Quest: <b>${esc(q.title)}</b>`);
    out.push('Explore a new region, hunt rare resources, or take on a dungeon!');
    return out.slice(0, 6);
  }
  function buildingCard(b, near) {
    const s = S(), d = GF.BUILDINGS[b.type], biz = GF.BIZ[b.type];
    let h = `<div class="card"><h3>${esc(d.name)} <span class="gold-t">Lv ${b.level}${d.maxLevel > 1 ? '/' + d.maxLevel : ''}</span></h3><div class="small-note">${esc(d.desc)}</div>`;
    if (GF.PRODUCERS.includes(b.type)) {
      const r = GF.bizReport(s, b);
      if (b.type === 'lab') h += `<div class="small-note">Generates <b>${(GF.BIZ.lab.rp[b.level - 1] * r.mult * (1 + GF.fx(s, 'rp'))).toFixed(1)}</b> research points/min.</div>`;
      else if (b.type === 'powerplant') h += `<div class="small-note">Supplies <b>${(GF.BIZ.powerplant.supply[b.level - 1] * (1 + GF.fx(s, 'power'))).toFixed(0)}</b> power, burning ${GF.BIZ.powerplant.coalPerMin * b.level} coal/min from your stash.</div>`;
      else h += `<div class="small-note">Produces: ${r.out.length ? r.out.map((o) => `<span class="pill">${img(o.item)}${o.perMin.toFixed(1)}/min</span>`).join('') : 'nothing yet (upgrade or unlock regions)'}${r.out.some((o) => o.inputs) ? '<br>Consumes from stash: ' + Object.entries(r.out.find((o) => o.inputs).inputs).map(([k, n]) => `${n} ${GF.ITEMS[k].name}`).join(', ') + ' per cycle' : ''}</div>`;
      h += `<div class="small-note">Wages: ${r.wage} Crowns/min${b.unpaid ? ' <b class="bad">· UNPAID (out of Crowns)</b>' : ''}${b.starved ? ' <b class="bad">· waiting for inputs in the stash</b>' : ''}</div>`;
      const stock = GF.stockTotal(b);
      if (b.stock && (GF.BIZ[b.type].cap || stock > 0)) h += `<div class="row">Stock ${Math.floor(stock)}/${Math.floor(GF.stockCap(b))} ${Object.keys(b.stock).map((k) => `<span class="pill">${img(k)}${Math.floor(b.stock[k])}</span>`).join('')}<button class="small gold" data-a="collect" data-uid="${b.uid}" ${near && stock >= 1 ? '' : 'disabled'}>Collect</button></div>`;
      if (GF.BIZ[b.type].cap) h += `<div class="row"><span class="small-note">Output:</span><button class="small ${b.mode !== 'sell' ? 'gold' : ''}" data-a="mode" data-uid="${b.uid}" data-mode="stock">Keep items</button><button class="small ${b.mode === 'sell' ? 'gold' : ''}" data-a="mode" data-uid="${b.uid}" data-mode="sell" ${GF.tradingPost(s) ? '' : 'disabled'} data-tip="${GF.tradingPost(s) ? 'Sold automatically at ~70% + bonuses' : 'Needs a Trading Post'}">Auto-sell</button></div>`;
    }
    if (b.type === 'trading_post') h += `<div class="small-note">Sell bonus +${Math.round(GF.BIZ.trading_post.sellBonus[b.level - 1] * 100)}% · ${GF.maxListings(s)} stall slots · trade income ${GF.BIZ.trading_post.income[b.level - 1]}/min</div><div class="row"><button class="small gold" data-a="gotab" data-tab="market">Open marketplace</button><button class="small" data-a="gotab" data-tab="orders">Orders</button></div>`;
    if (b.type === 'house') h += `<div class="small-note">Houses ${GF.BIZ.house.residents[b.level - 1]} residents.</div>`;
    if (b.type === 'warehouse') h += `<div class="small-note">Adds ${GF.BIZ.warehouse.cap[b.level - 1]} stash capacity.</div>`;
    if (b.type === 'tower') h += `<div class="small-note">Damage ${GF.BIZ.tower.dmg[b.level - 1]} per shot against raiders.</div>`;
    if (b.type === 'hub') h += `<div class="small-note">Sweeps every business into the stash every ${GF.BIZ.hub.interval[b.level - 1]}s. Sorters: ${(b.machines && b.machines.sorter) || 0}/${b.level} (+25% processing speed each).</div>`;
    if (b.type === 'observatory') h += `<div class="small-note">Gives +${b.level * 6}% damage against the Giant.</div>`;
    if (b.type === 'portal_hub') h += `<div class="small-note">Fast travel from the Map (M) to attuned Portal Stones.</div>`;
    if (d.station) h += `<div class="row"><span class="small-note">Station: ${esc(GF.STATION_NAMES[d.station])} · ${Math.round(GF.saveChance(s, { station: d.station }) * 100)}% free-craft bonus</span><button class="small gold" data-a="gocraft">Craft here</button></div>`;
    // machines
    const slots = Object.keys(GF.MACHINE_RULES).filter((m) => GF.MACHINE_RULES[m].on.includes(b.type));
    if (slots.length) {
      h += `<div class="row">Machines: ${Object.keys(b.machines || {}).map((m) => `<span class="pill">${esc(m.replace('_', ' '))} ×${b.machines[m]}</span>`).join('') || '<span class="small-note">none installed</span>'}</div><div class="row">${slots.map((m) => { const item = Object.values(GF.ITEMS).find((i) => i.machine === m); const have = GF.total(s, item.id); return `<button class="small" data-a="install" data-uid="${b.uid}" data-id="${item.id}" ${have > 0 ? '' : 'disabled'} data-tip="${esc(item.desc)}">+ ${esc(item.name)} (${have})</button>`; }).join('')}</div>`;
    }
    const up = GF.upgradeInfo(s, b);
    if (up) h += `<div class="row"><b class="gold-t">Upgrade → Lv ${b.level + 1}</b>${costPills(up.cost)}${up.block ? `<span class="small-note bad">${esc(up.block)}</span>` : ''}<button class="small gold" data-a="upg" data-uid="${b.uid}" ${up.block || !GF.canAfford(s, up.cost) ? 'disabled' : ''} data-snd="build">Upgrade</button></div>`;
    else if (d.maxLevel > 1) h += `<div class="small-note good">Maximum level.</div>`;
    if (b.type !== 'townhall') h += `<div class="row"><button class="small red" data-a="demo" data-uid="${b.uid}">Demolish</button></div>`;
    return h + '</div>';
  }
  A.upg = (d) => { const r = GF.upgrade(S(), Number(d.uid)); msg(r); if (r.ok) { G().cam.shake = 0.12; G().spawnParticles('build', G().P.x, G().P.y, {}); GF.checkQuests(S()); } };
  A.collect = (d) => { const n = GF.collect(S(), Number(d.uid)); if (n) { GF.hooks.notify(`Collected ${n} items.`, 'info'); GF.Audio.play('pickup'); } };
  A.collectall = () => { let n = 0; for (const b of S().buildings) if (b.stock) n += GF.collect(S(), b.uid); GF.hooks.notify(n ? `Collected ${n} items from all businesses.` : 'Nothing to collect.', 'info'); };
  A.mode = (d) => GF.setMode(S(), Number(d.uid), d.mode);
  A.install = (d) => { const r = GF.installMachine(S(), Number(d.uid), d.id); msg(r); if (r.ok) GF.checkQuests(S()); };
  A.demo = (d) => { UI.modal('<h2>Demolish building?</h2><p>You get 50% of the build cost back.</p>', [{ label: 'Cancel' }, { label: 'Demolish', cls: 'red', fn: () => { msg(GF.demolish(S(), Number(d.uid))); render(); } }]); };
  A.unfocus = () => { PB.data.focus = null; };
  A.gotab = (d) => { PB.tab = d.tab; };
  A.gocraft = () => { UI.open('craft', { tab: 'all' }); };
  A.research = (d) => { const r = GF.research(S(), d.id); msg(r); if (r.ok) { GF.Audio.play('unlock'); GF.checkQuests(S()); } };
  A.deliver = (d) => { const r = GF.deliverOrder(S(), Number(d.id)); msg(r); if (r.ok) GF.checkQuests(S()); };
  A.land = () => msg(GF.buyLand(S()));
  A.seed = (d, e, v) => { G().selSeed = v; };
  A.fplant = (d) => { const f = S().buildings.find((b) => b.uid === Number(d.uid)); let n = 0; for (let i = 0; i < 9; i++) if (!f.plots[i].crop && GF.plant(S(), f.uid, i, G().selSeed).ok) n++; GF.hooks.notify(n ? `Planted ${n} ${GF.ITEMS[G().selSeed].name}.` : `Could not plant: need ${GF.ITEMS['seed_' + G().selSeed].name} (and a high enough field level).`, n ? 'info' : 'warn'); };
  A.fwater = (d) => { const f = S().buildings.find((b) => b.uid === Number(d.uid)); let n = 0; for (let i = 0; i < 9; i++) if (f.plots[i].crop && f.plots[i].water <= 0 && GF.water(S(), f.uid, i)) n++; GF.hooks.notify(`Watered ${n} plots.`, 'info'); };
  A.fharv = (d) => { const f = S().buildings.find((b) => b.uid === Number(d.uid)); let n = 0; for (let i = 0; i < 9; i++) if (GF.harvest(S(), f.uid, i).ok) n++; GF.hooks.notify(`Harvested ${n} plots.`, 'info'); GF.checkQuests(S()); };

  // ------------------------------------------------------------ BUILD
  const BCATS = [['Production', ['lumber', 'mine', 'bakery', 'smithy', 'factory', 'lab', 'powerplant', 'trading_post', 'star_forge']], ['Crafting Stations', ['furnace', 'workshop', 'smithy', 'factory', 'lab', 'ancient_forge', 'star_forge']], ['Farming & Housing', ['field', 'house', 'warehouse']], ['Automation & Special', ['hub', 'portal_hub', 'observatory']], ['Defense', ['tower']], ['Decoration', ['lamp', 'garden', 'fountain', 'statue', 'obelisk']]];
  P.build = {
    title: () => 'Build',
    render() {
      const s = S();
      let h = `<div class="small-note" style="margin-bottom:8px">Pick a building, then click in your settlement to place it (hold Shift to place several). Buildings use your bag + stash. Settlement Level ${GF.settleLevel(s)} · Land ${s.land + 1}/${GF.BUILD_ZONES.length}.</div>`;
      const shown = new Set();
      for (const [cat, ids] of BCATS) {
        const list = ids.filter((id) => !shown.has(id) || cat === 'Crafting Stations');
        h += `<h3 class="gold-t" style="margin:12px 0 6px">${cat}</h3><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px">`;
        for (const id of list) {
          shown.add(id);
          const d = GF.BUILDINGS[id], have = GF.buildingsOf(s, id).length, lim = GF.countLimit(s, id), locked = GF.settleLevel(s) < d.settle, full = have >= lim;
          h += `<div class="card" style="${locked ? 'opacity:.55' : ''};margin:0"><h3>${esc(d.name)} <span class="muted">${d.w}×${d.h}</span> <span class="small-note">(${have}/${lim})</span></h3><div class="small-note">${esc(d.desc)}</div><div style="margin:5px 0">${costPills({ coins: d.cost.coins, items: d.cost.items })}</div>${locked ? `<div class="small-note bad">🔒 Town Hall level ${d.settle}</div>` : ''}<button class="small gold" data-a="pickb" data-id="${id}" ${locked || full ? 'disabled' : ''}>${full ? 'Limit reached' : 'Build'}</button></div>`;
        }
        h += '</div>';
      }
      return h;
    },
  };
  A.pickb = (d) => { G().buildMode = { type: d.id }; UI.close(); GF.hooks.notify(`Placing ${GF.BUILDINGS[d.id].name}: click to build, Shift+click for more, right-click/Esc to cancel.`, 'info'); };

  // ------------------------------------------------------------ QUESTS
  UI.openBoard = () => UI.open('quests', { tab: 'board' });
  P.quests = {
    title: () => 'Quests & Journal',
    tabs: () => [['main', 'Main Quests'], ['board', 'Quest Board'], ['prep', 'Bosses & Final Prep'], ['journal', 'Journal'], ['ach', 'Achievements'], ['stats', 'Stats']],
    render(pb) {
      const s = S(), t = pb.tab;
      if (t === 'main') {
        const act = GF.activeMain(s);
        const done = GF.QUESTS.filter((q) => s.questDone[q.id]).length;
        let h = `<div class="small-note" style="margin-bottom:8px">${done} of ${GF.QUESTS.filter((q) => !q.post).length} story quests complete. You can pursue several at once. Click ★ to track on your HUD.</div>`;
        if (!act.length) h += '<div class="bigmsg">All current quests are complete! Try the Quest Board, the Abyss, or Ascended bosses.</div>';
        for (const q of act) {
          const p = GF.questProgress(s, q);
          const pay = GF.payBlocker(s, q)[0];
          h += `<div class="card"><h3><span data-a="track" data-id="${q.id}" style="cursor:pointer;color:${s.tracked.includes(q.id) ? '#ffd24a' : '#666'}">★</span> ${esc(q.title)} ${q.post ? '<span class="muted">(endgame)</span>' : ''}</h3><div class="small-note">${esc(q.desc)}</div>${q.hint ? `<div class="small-note muted">Hint: ${esc(q.hint)}</div>` : ''}`;
          if (p.parts) h += `<ul class="small-note" style="margin:6px 0;padding-left:18px">${p.parts.map((x, i) => `<li class="${x.cur >= x.max ? 'good' : ''}">${condLabel(q.cond.all[i], x)}</li>`).join('')}</ul>`; else h += `<div class="small-note" style="margin-top:4px">${condLabel(q.cond, p)}</div>`;
          h += `<div class="prog"><i style="width:${Math.min(100, p.cur / Math.max(1, p.max) * 100)}%"></i></div><div class="row"><span class="small-note">Reward:</span>${rewardPills(q.reward)}${pay && !(s.questPaid[q.id] >= pay.n) ? `<button class="small gold" data-a="payq" data-id="${q.id}" ${s.coins >= pay.n ? '' : 'disabled'}>${esc(pay.label || 'Pay')} (${num(pay.n)})</button>` : ''}</div></div>`;
        }
        return h;
      }
      if (t === 'board') {
        let h = `<div class="small-note" style="margin-bottom:8px">The Foreman posts new jobs every day. Accept up to 5. Endless, and the rewards grow as you progress.</div>`;
        for (const q of s.board) {
          const p = q.accepted ? GF.questProgress(s, { cond: q.cond, base: q.base }) : { cur: 0, max: q.cond.n };
          const have = q.kind === 'deliver' ? GF.total(s, q.cond.item) : 0;
          h += `<div class="card"><h3>${esc(q.title)} ${q.accepted ? '<span class="good">· accepted</span>' : ''}</h3><div class="small-note">${esc(q.desc)} · expires day ${q.expire}</div>${q.accepted ? `<div class="prog"><i style="width:${Math.min(100, (q.kind === 'deliver' ? have : p.cur) / q.cond.n * 100)}%"></i></div><div class="small-note">${q.kind === 'deliver' ? have : U.fmt(p.cur)} / ${U.fmt(q.cond.n)}</div>` : ''}<div class="row">${coin(q.reward.coins)}<span class="pill">${q.reward.xp} XP</span>${q.accepted ? (q.kind === 'deliver' ? `<button class="small gold" data-a="bdeliver" data-id="${q.id}" ${have >= q.cond.n ? '' : 'disabled'}>Deliver</button>` : '') + `<button class="small red" data-a="babandon" data-id="${q.id}">Abandon</button>` : `<button class="small gold" data-a="baccept" data-id="${q.id}">Accept</button>`}</div></div>`;
        }
        return h || '<div class="bigmsg">No jobs posted.</div>';
      }
      if (t === 'prep') {
        let h = `<div class="card"><h3>⚔ Bosses</h3>`;
        const bl = ['slimeking', 'guardian', 'forestking', 'wyrm', 'titan', 'warden', 'giant'];
        for (const id of bl) {
          const b = GF.BOSSES[id], d = GF.DUNGEONS[b.dungeon], won = s.bosses[id], rec = GF.RECIPES.find((r) => r.out === d.seal);
          const regOpen = s.unlocked[d.region];
          h += `<div class="list-item" style="cursor:default"><div class="grow"><div class="t">${esc(b.name)} ${won ? '<span class="good">✓ defeated</span>' : ''}</div><div class="s">${esc(b.title)} · ${esc(d.name)} (${esc(GF.REGIONS[d.region].name)}${regOpen ? '' : ' · locked'})${d.seal ? ` · needs ${esc(GF.ITEMS[d.seal].name)}${GF.total(s, d.seal) ? ' ✓' : ''}` : ' · no seal'} · recommended gear tier ${b.tier}+</div></div></div>`;
        }
        h += '</div>';
        h += `<div class="card"><h3>🏔 Final Preparations: The Giant</h3><div class="small-note">Everything you need before the Giant's Keep will open.${GF.giantReady(s) ? ' <b class="good">You are ready!</b>' : ''}</div>`;
        for (const it of GF.finalPrep(s)) h += `<div class="statline"><span>${it.done ? '✓' : '○'} ${esc(it.label)}</span><b class="${it.done ? 'good' : ''}">${U.fmt(it.cur)}/${U.fmt(it.max)}</b></div><div class="prog"><i style="width:${it.cur / it.max * 100}%"></i></div>${it.done ? '' : `<div class="small-note" style="margin-bottom:5px">${esc(it.hint)}</div>`}`;
        h += '</div>';
        return h;
      }
      if (t === 'journal') {
        let h = `<div class="card"><h3>📜 Ancient tablets ${Object.keys(s.tablets).length}/12</h3>`;
        for (const tb of GF.TABLETS) h += s.tablets[tb.id] ? `<div class="card"><h3>${esc(tb.title)} <span class="muted">(${esc(GF.REGIONS[tb.region].name)})</span></h3><div class="small-note" style="font-size:13px;line-height:1.5">${esc(tb.text)}</div></div>` : `<div class="small-note muted">??? Undiscovered tablet somewhere in the ${esc(GF.REGIONS[tb.region].name)}.</div>`;
        h += '</div><div class="card"><h3>Rumors</h3>';
        const n = Math.min(GF.RUMORS.length, 3 + Object.keys(s.bosses).length);
        for (let i = 0; i < n; i++) h += `<div class="small-note" style="margin:5px 0;font-style:italic">${esc(GF.RUMORS[i])}</div>`;
        return h + '</div>';
      }
      if (t === 'ach') {
        const total = GF.ACHIEVEMENTS.length, got = GF.ACHIEVEMENTS.filter((a) => s.ach[a.id]).length;
        return `<div class="small-note" style="margin-bottom:8px">${got} / ${total} achievements. Each pays Crowns and XP.</div>` + GF.ACHIEVEMENTS.map((a) => `<div class="list-item" style="cursor:default;${s.ach[a.id] ? '' : 'opacity:.7'}"><div class="grow"><div class="t">${s.ach[a.id] ? '🏆' : '○'} ${esc(a.name)}</div><div class="s">${esc(a.desc)}</div></div>${coin(a.reward.coins || 0)}</div>`).join('');
      }
      const st = s.stats;
      const row = (a, b) => `<tr><td>${a}</td><td><b>${b}</b></td></tr>`;
      return `<table class="tbl">${row('Play time', U.fmtTime(s.playTime))}${row('Crowns earned', num(st.earned))}${row('Crowns spent', num(st.spent))}${row('Items sold for', num(st.sold))}${row('Creatures defeated', num(Object.values(st.killed).reduce((a, b) => a + b, 0)))}${row('Resource nodes harvested', num(st.nodes))}${row('Items crafted', num(Object.values(st.crafted).reduce((a, b) => a + b, 0)))}${row('Crops harvested', num(Object.values(st.harvested).reduce((a, b) => a + b, 0)))}${row('Orders delivered', st.orders)}${row('Marketplace sales', st.trades)}${row('Deaths', st.deaths)}${row('Best Abyss floor', st.abyss)}${row('Difficulty', GF.DIFFICULTY[s.diff].name)}${row('Seed', esc(s.seedText))}</table>`;
    },
  };
  function condLabel(c, p) {
    const n = (k) => GF.ITEMS[k] ? GF.ITEMS[k].name : k;
    const prog = `<b>${U.fmt(p.cur)}/${U.fmt(p.max)}</b>`;
    switch (c.t) {
      case 'got': return `Collect ${n(c.item)}: ${prog}`; case 'craft': return `Craft ${n(c.item)}: ${prog}`; case 'kill': return `Defeat ${c.enemy ? GF.ENEMIES[c.enemy].name + 's' : c.enemies ? c.enemies.map((e) => GF.ENEMIES[e].name).join('/') : 'creatures'}: ${prog}`;
      case 'sold': return `Earn Crowns by selling: ${prog}`; case 'earn': return `Earn Crowns in total: ${prog}`; case 'build': return `Build a ${GF.BUILDINGS[c.type].name}: ${p.cur >= p.max ? 'done' : 'not yet'}`;
      case 'harvest': return `Harvest ${c.crop ? n(c.crop) : 'crops'}: ${prog}`; case 'level': return `Reach level ${c.n}: ${prog}`; case 'region': return `Discover ${GF.REGIONS[c.id].name}`; case 'boss': return `Defeat ${GF.BOSSES[c.id].name}`;
      case 'settle': return `Town Hall level ${c.n}: ${prog}`; case 'research': return `Research a technology: ${prog}`; case 'tablets': return `Read ancient tablets: ${prog}`; case 'power': return `Reach ${c.n} power: ${prog}`; case 'install': return `Install a machine: ${p.cur >= p.max ? 'done' : 'not yet'}`;
      case 'pay': return `Pay ${U.fmt(c.n)} Crowns: ${p.cur >= p.max ? 'paid' : 'not yet'}`; case 'abyss': return `Reach Abyss floor ${c.n}: ${prog}`; case 'ascended': return `Defeat Ascended bosses: ${prog}`; case 'have': return `Have ${n(c.item)}: ${prog}`;
      default: return `Progress: ${prog}`;
    }
  }
  function rewardPills(r) { let h = ''; if (r.coins) h += coin(r.coins); if (r.xp) h += `<span class="pill">${U.fmt(r.xp)} XP</span>`; if (r.rp) h += `<span class="pill">${r.rp} RP</span>`; for (const k in (r.items || {})) if (r.items[k] > 0) h += `<span class="pill">${img(k)}${r.items[k]}</span>`; if (r.text) h += `<span class="small-note">${esc(r.text)}</span>`; if (r.unlock) h += `<span class="pill">Opens ${esc(GF.REGIONS[r.unlock].name)}</span>`; return h; }
  A.track = (d) => { const s = S(); const i = s.tracked.indexOf(d.id); if (i >= 0) s.tracked.splice(i, 1); else { s.tracked.push(d.id); if (s.tracked.length > 3) s.tracked.shift(); } };
  A.payq = (d) => msg(GF.payQuest(S(), d.id));
  A.baccept = (d) => msg(GF.acceptBoard(S(), Number(d.id)));
  A.babandon = (d) => GF.abandonBoard(S(), Number(d.id));
  A.bdeliver = (d) => msg(GF.deliverBoard(S(), Number(d.id)));

  // ------------------------------------------------------------ MAP
  P.map = {
    title: () => 'World Map',
    render() {
      const s = S();
      const hub = GF.buildingsOf(s, 'portal_hub').length > 0;
      const travel = hub && G().map.kind === 'over' ? `<div class="card"><h3>Fast travel (Portal Hub)</h3><div class="row"><button class="small gold" data-a="travel" data-to="home">🏠 Hearthstead</button>${Object.keys(GF.GATES).filter((r) => s.flags['stone_' + r]).map((r) => `<button class="small" data-a="travel" data-to="${r}">${esc(GF.REGIONS[r].name)}</button>`).join('')}</div><div class="small-note">Touch a Portal Stone at each region entrance to attune it.</div></div>` : `<div class="small-note">Build a Portal Hub (Town Hall level 5) to fast travel between attuned Portal Stones. Recall Scrolls take you home.</div>`;
      return `<canvas id="mapcv" width="760" height="600"></canvas><div class="legend"><span><i style="background:#ffd24a"></i>Settlement</span><span><i style="background:#7ad0ff"></i>Dungeon</span><span><i style="background:#ff5a7a"></i>Boss dungeon</span><span><i style="background:#c0a0ff"></i>Portal Stone</span><span><i style="background:#ffe27a"></i>Event</span><span><i style="background:#fff"></i>You</span></div>${travel}`;
    },
    after() {
      const cv = $('mapcv'); if (!cv) return;
      const g = cv.getContext('2d'), s = S(), over = G().over;
      if (!over) return;
      UI.buildMiniBase();
      const sc = 4;
      cv.width = over.W * 4; cv.height = over.H * 4;
      g.imageSmoothingEnabled = false;
      g.drawImage(document.createElement('canvas').width ? cv : cv, 0, 0, 0, 0); // no-op keeps canvas context warm
      const base = document.createElement('canvas'); base.width = over.W; base.height = over.H; base.getContext('2d').drawImage(UI.getBase(), 0, 0);
      g.drawImage(base, 0, 0, over.W * sc, over.H * sc);
      g.drawImage(UI.fogCanvas(s), 0, 0, over.W * sc, over.H * sc);
      // undiscovered region masks + labels
      for (const r in GF.REGIONS) {
        const [x0, y0, x1, y1] = GF.REGIONS[r].rect;
        if (!s.discovered[r]) { g.fillStyle = 'rgba(6,10,20,0.55)'; g.fillRect(x0 * sc, y0 * sc, (x1 - x0) * sc, (y1 - y0) * sc); }
        g.fillStyle = s.discovered[r] ? '#fff' : '#8a96b8'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.strokeStyle = '#000'; g.lineWidth = 3;
        const lbl = s.discovered[r] ? GF.REGIONS[r].name : '? ? ?'; g.strokeText(lbl, (x0 + x1) / 2 * sc, (y0 + y1) / 2 * sc); g.fillText(lbl, (x0 + x1) / 2 * sc, (y0 + y1) / 2 * sc);
      }
      for (const gk in GF.GATES) { const [x, y, w, h] = GF.GATES[gk].rect; if (!s.unlocked[gk]) { g.fillStyle = '#ff6a6a'; g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillText('🔒', (x + w / 2) * sc, (y + h / 2) * sc + 5); } }
      const dot = (x, y, c, r) => { g.fillStyle = c; g.beginPath(); g.arc(x * sc, y * sc, r || 5, 0, 6.28); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); };
      dot(GF.HOME.x, GF.HOME.y, '#ffd24a', 7);
      for (const pt of over.portals) { const cell = S().fog && S().fog[Math.floor(pt.x / 6) + ',' + Math.floor(pt.y / 6)]; if (!cell && !s.discovered[pt.region]) continue; if (!cell) continue; const d = GF.DUNGEONS[pt.dungeon]; dot(pt.x, pt.y, d.boss && d.seal ? '#ff5a7a' : '#7ad0ff', 5); g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(d.name, pt.x * sc, pt.y * sc - 8); }
      for (const st of over.stones) if (s.flags['stone_' + st.region]) dot(st.x, st.y, '#c0a0ff', 4);
      const tr = s.events.treasure; if (tr && s.events.active && s.events.active.id === 'treasure') { dot(tr.x, tr.y, '#ffe27a', 6); g.fillStyle = '#fff'; g.fillText('X', tr.x * sc - 3, tr.y * sc + 4); }
      if (s.events.wanderer) dot(s.events.wanderer.x, s.events.wanderer.y, '#ffe27a', 6);
      if (G().rift) dot(G().rift.x, G().rift.y, '#ff70c0', 6);
      if (G().map.kind === 'over') { dot(G().P.x, G().P.y, '#fff', 6); }
    },
  };
  A.travel = (d) => {
    const s = S(), g = G();
    if (g.map.kind !== 'over') return;
    const st = d.to === 'home' ? { x: GF.HOME.x + 0.5, y: GF.HOME.y + 4.5 } : g.over.stones.find((x) => x.region === d.to);
    if (!st) return;
    g.P.x = st.x; g.P.y = st.y + (d.to === 'home' ? 0 : 1.5); g.cam.x = g.P.x; g.cam.y = g.P.y;
    GF.hooks.sound('portal'); g.spawnParticles('levelup', g.P.x, g.P.y, {}); UI.close();
  };

  // ------------------------------------------------------------ SKILLS
  P.skills = {
    title: () => 'Character & Skills',
    tabs: () => [['skills', 'Skills'], ['legacy', 'Legacy']],
    render(pb) {
      const s = S();
      if (pb.tab === 'legacy') {
        const meta = GF.loadMeta();
        const pts = legacyPoints(s);
        let h = `<div class="card"><h3>Legacy ${meta.legacy - meta.spent} points available</h3><div class="small-note">Ascend to start a brand-new world with permanent bonuses. Legacy points come from Crowns earned, bosses defeated and your best Abyss floor. Available once you have defeated the Giant.</div><div class="row"><span class="pill">Prestiges: ${meta.prestiges}</span><span class="pill">Wins: ${meta.wins || 0}</span><span class="pill">Best Abyss: ${meta.bestAbyss || 0}</span></div></div>`;
        for (const id in GF.LEGACY_PERKS) { const p = GF.LEGACY_PERKS[id], r = meta.perks[id] || 0; h += `<div class="list-item" style="cursor:default"><div class="grow"><div class="t">${esc(p.name)} <span class="gold-t">${r}/${p.max}</span></div><div class="s">${esc(p.desc)}</div></div><span class="pill">${p.cost} pt</span><button class="small gold" data-a="perk" data-id="${id}" ${r >= p.max || meta.legacy - meta.spent < p.cost ? 'disabled' : ''}>Buy</button></div>`; }
        h += `<div class="card"><h3>✨ Ascend (New Game+)</h3><div class="small-note">This world will be saved as it is, then a new world starts. You would earn <b class="gold-t">${pts}</b> Legacy points.</div><div class="row"><button class="gold" data-a="prestige" ${s.bosses.giant ? '' : 'disabled'}>${s.bosses.giant ? 'Ascend now' : 'Defeat the Giant first'}</button></div></div>`;
        return h;
      }
      const w = GF.weapon(s);
      let h = `<div class="card"><h3>Level ${s.level} · ${GF.rankName(s.level)} · <span class="gold-t">${s.sp} skill point${s.sp === 1 ? '' : 's'}</span></h3><div class="small-note">Start bonus: ${GF.STARTS[s.start].name} · Difficulty: ${GF.DIFFICULTY[s.diff].name}. Every level grants a skill point.</div></div><div class="cols" style="height:auto"><div>`;
      for (const id in GF.SKILLS) {
        const sk = GF.SKILLS[id], r = s.skills[id] || 0, lock = sk.minLevel && s.level < sk.minLevel;
        h += `<div class="list-item ${lock ? 'lock' : ''}" style="cursor:default"><div class="grow"><div class="t">${esc(sk.name)} <span class="gold-t">${r}/${sk.max}</span></div><div class="s">${esc(sk.desc)}${lock ? ' · needs level ' + sk.minLevel : ''}</div></div><button class="small gold" data-a="skill" data-id="${id}" ${s.sp < 1 || r >= sk.max || lock ? 'disabled' : ''}>+</button></div>`;
      }
      h += `</div><div><div class="card"><h3>Stats</h3><div class="statline"><span>Health</span><b>${GF.maxHp(s)}</b></div><div class="statline"><span>Damage</span><b>${Math.round(GF.playerDamage(s))}</b></div><div class="statline"><span>Defense</span><b>${Math.round(GF.defense(s))}</b></div><div class="statline"><span>Gather power (hand/pick)</span><b>${Math.round(GF.toolPower(s, 'hand'))} / ${Math.round(GF.toolPower(s, 'pick'))}</b></div><div class="statline"><span>Sell bonus</span><b>+${Math.round(GF.fx(s, 'sell') * 100)}%</b></div><div class="statline"><span>Business output</span><b>+${Math.round(GF.fx(s, 'biz') * 100)}%</b></div><div class="statline"><span>Crop growth / yield</span><b>+${Math.round(GF.fx(s, 'grow') * 100)}% / +${Math.round(GF.fx(s, 'yield') * 100)}%</b></div><div class="statline"><span>Double-drop chance</span><b>${Math.round(GF.fx(s, 'luck') * 100)}%</b></div><div class="statline"><span>XP bonus</span><b>+${Math.round(GF.fx(s, 'xp') * 100)}%</b></div></div></div></div>`;
      return h;
    },
  };
  A.skill = (d) => { GF.spendSkill(S(), d.id); S().hp = Math.min(S().hp + 0, GF.maxHp(S())); };
  A.perk = (d) => { const m = GF.loadMeta(), p = GF.LEGACY_PERKS[d.id]; if ((m.perks[d.id] || 0) < p.max && m.legacy - m.spent >= p.cost) { m.spent += p.cost; m.perks[d.id] = (m.perks[d.id] || 0) + 1; GF.saveMeta(); } };
  function legacyPoints(s) { return Math.floor(Math.sqrt(s.stats.earned / 2000)) + 5 * Object.keys(s.bosses).length + (s.bosses.giant ? 20 : 0) + Math.floor((s.stats.abyss || 0) / 2); }
  A.prestige = () => UI.modal(`<h2>Ascend?</h2><p>Your current world is saved. A new world begins with a random seed and your Legacy bonuses. You earn <b>${legacyPoints(S())}</b> Legacy points.</p>`, [{ label: 'Cancel' }, { label: 'Ascend', cls: 'gold', fn: () => { const s = S(); const m = GF.loadMeta(); m.legacy += legacyPoints(s); m.prestiges++; GF.saveMeta(); G().save(true); UI.close(); GF.Main.startNew({ name: s.name, seed: '', start: s.start, diff: s.diff, slot: s.slot }); } }]);

  // ------------------------------------------------------------ ABYSS / TRIALS
  UI.openAbyss = () => UI.open('abyss', { tab: 'abyss' });
  P.abyss = {
    title: () => 'The Abyss Gate',
    tabs: () => [['abyss', 'The Abyss'], ['trials', 'Ascended Trials']],
    render(pb) {
      const s = S(), best = Math.max(s.stats.abyss, 0);
      if (pb.tab === 'abyss') {
        let h = `<div class="card"><h3>The Abyss: an endless dungeon</h3><div class="small-note">Every floor is harder. Every fifth floor has an Ascended guardian. Loot Abyss Shards, Giant Shards and Star Ore for legendary gear at the Star Forge. Best floor: <b class="gold-t">${best}</b>.</div><div class="row"><button class="gold" data-a="abyss" data-f="1">Descend from floor 1</button>${best >= 5 ? `<button data-a="abyss" data-f="${Math.floor(best / 5) * 5 - 4 + 4}">Floor ${Math.max(1, Math.floor(best / 5) * 5)}</button>` : ''}${best >= 2 ? `<button data-a="abyss" data-f="${best}">Resume at floor ${best}</button>` : ''}</div></div>`;
        return h;
      }
      let h = '<div class="small-note" style="margin-bottom:8px">Rematch any boss at double health and 50% more damage. Needs the boss seal again. Drops Abyss Shards and a chance at Giant Shards and Star Cores.</div>';
      for (const id of GF.Dungeon.BOSS_ORDER.concat(['giant'])) { const b = GF.BOSSES[id], d = GF.DUNGEONS[b.dungeon]; h += `<div class="list-item" style="cursor:default"><div class="grow"><div class="t">${esc(b.name)} ${s.ascended[id] ? '<span class="good">✓ Ascended defeated</span>' : ''}</div><div class="s">${esc(d.name)} · ${GF.total(s, d.seal) ? 'seal ready ✓' : 'needs ' + esc(GF.ITEMS[d.seal].name)}</div></div><button class="small gold" data-a="trial" data-d="${b.dungeon}" ${GF.total(s, d.seal) ? '' : 'disabled'}>Enter</button></div>`; }
      return h;
    },
  };
  A.abyss = (d) => { UI.close(); GF.Dungeon.enterAbyss(Number(d.f)); };
  A.trial = (d) => { UI.close(); GF.Dungeon.enter(d.d, { ascended: true }); };

  // ------------------------------------------------------------ PORTAL (dungeon entrance)
  UI.openPortal = function (pt) {
    const s = S(), d = GF.DUNGEONS[pt.dungeon], b = GF.BOSSES[d.boss];
    const rec = d.seal ? GF.RECIPES.find((r) => r.out === d.seal) : null;
    const prepOk = GF.giantReady && pt.dungeon === 'giants_keep' ? GF.giantReady(s) : true;
    let html = `<h2>${esc(d.name)}</h2><p class="muted">${esc(GF.REGIONS[d.region].name)} · Boss: <b>${esc(b.name)}</b> — ${esc(b.title)}</p><p>${esc(b.lore)}</p><p class="small-note">${esc(d.req)} Chests and enemies are generated fresh every visit. ${d.seal ? `The arena door is sealed: bring the <b>${esc(GF.ITEMS[d.seal].name)}</b> (${GF.total(s, d.seal) ? '<span class="good">you have it</span>' : '<span class="bad">you do not have it yet</span>'}). It is consumed when you win.` : ''}</p>`;
    if (d.boss === 'giant' && !GF.giantReady(s)) html += `<p class="bad"><b>You are not ready.</b> Complete the Final Preparations in the Quest log (J). The Giant is not an ordinary enemy.</p>`;
    html += `<p class="small-note">Recommended: weapon/armor tier ${b.tier}+, healing potions, food. Defeat enemies, grab chests, then breach the arena.</p>`;
    const btns = [{ label: 'Not yet' }];
    if (d.boss === 'giant' && !GF.giantReady(s)) { /* locked */ } else btns.push({ label: 'Enter dungeon', cls: 'gold', fn: () => GF.Dungeon.enter(pt.dungeon, {}) });
    if (s.bosses[d.boss] && s.bosses.giant && d.seal) btns.push({ label: 'Enter (Ascended)', cls: 'gold', fn: () => GF.Dungeon.enter(pt.dungeon, { ascended: true }) });
    UI.modal(html, btns);
  };

  // ------------------------------------------------------------ MENU (pause)
  P.menu = {
    title: () => 'Menu',
    tabs: () => [['main', 'Game'], ['options', 'Options'], ['help', 'How to Play'], ['save', 'Save Data']],
    render(pb) {
      const s = S();
      if (pb.tab === 'main') return `<div class="menu-stack" style="margin:20px auto"><button class="gold" data-a="resume">Resume</button><button data-a="savegame">Save game</button><button data-a="gotab" data-tab="options">Options</button><button data-a="gotab" data-tab="help">How to play</button><button class="red" data-a="quit">Save &amp; quit to title</button></div><div class="bigmsg">${esc(s.name)} · Level ${s.level} · ${U.fmtTime(s.playTime)} played<br>The game autosaves every 45 seconds.</div>`;
      if (pb.tab === 'options') {
        const v = GF.Audio.vol;
        return `<div class="card"><h3>Audio</h3>${['master', 'sfx', 'music'].map((k) => `<div class="row"><span style="width:150px">${k === 'master' ? 'Master volume' : k === 'sfx' ? 'Sound effects' : 'Music'}</span><input type="range" min="0" max="1" step="0.05" value="${v[k]}" data-chg="vol" data-k="${k}" style="flex:1"></div>`).join('')}</div><div class="card"><h3>Display</h3><div class="row"><button class="small" data-a="fs">Toggle fullscreen</button></div></div>`;
      }
      if (pb.tab === 'help') return helpHtml();
      return `<div class="card"><h3>Export save</h3><div class="small-note">Copy this text to back up your save or move it to another computer.</div><textarea id="exp" style="width:100%;height:100px;background:#0a0f20;color:#9fb;border:2px solid var(--line);border-radius:6px;font-size:11px" readonly>${esc(exportSave())}</textarea></div>`;
    },
  };
  function helpHtml() {
    return `<div class="card"><h3>Controls</h3><table class="tbl"><tr><td><b>W A S D / arrows</b></td><td>Move</td></tr><tr><td><b>Mouse</b></td><td>Aim</td></tr><tr><td><b>Left click / Space</b></td><td>Attack, or chop/mine whatever you face (tools are chosen automatically)</td></tr><tr><td><b>E</b></td><td>Interact: talk, open buildings, farm plots, portals, chests</td></tr><tr><td><b>Shift</b></td><td>Dodge roll (brief invulnerability, uses stamina)</td></tr><tr><td><b>R</b></td><td>Whirlwind (learn it in Skills at level 10)</td></tr><tr><td><b>1–8</b></td><td>Quick bar: potions, food, seeds, scrolls</td></tr><tr><td><b>I C T B J M K</b></td><td>Inventory · Crafting · Tycoon · Build · Quests · Map · Skills</td></tr><tr><td><b>Esc</b></td><td>Menu / close windows / cancel building</td></tr></table></div>
      <div class="card"><h3>The loop</h3><div class="small-note" style="line-height:1.7">1. <b>Gather</b> wood, stone and fiber by hand. Craft a pickaxe and axe (C).<br>2. <b>Sell</b> to Mara. Build a <b>Lumber Mill</b>, a <b>Furnace</b> and a <b>Farm</b> (B).<br>3. Grow the <b>Town Hall</b>; unlock mines, workshops, labs, factories.<br>4. <b>Explore</b> new regions for better ore. Better tools mine better nodes.<br>5. <b>Fight</b> through dungeons. Craft a Boss Seal, then take down each guardian to open the next region.<br>6. Automate with conveyors, drones and the hub. Build an empire.<br>7. Forge the <b>Giant-Slayer</b> gear. Break the seal. <b>Defeat the Giant.</b> Then Ascend.</div></div>`;
  }
  function exportSave() { try { G().save(true); return btoa(unescape(encodeURIComponent(JSON.stringify(S())))); } catch (e) { return 'error'; } }
  A.vol = (d, e, v) => { const a = GF.Audio.vol; a[d.k] = Number(v); GF.Audio.setVolumes(a.master, a.sfx, a.music); try { localStorage.setItem('giantfall:vol', JSON.stringify(a)); } catch (er) { /* ignore */ } };
  A.fs = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
  A.resume = () => UI.close();
  A.savegame = () => G().save(false);
  A.quit = () => { G().save(true); UI.close(); GF.Main.toTitle(); };
  UI.exportSave = exportSave;
})(typeof window !== 'undefined' ? window : globalThis);
