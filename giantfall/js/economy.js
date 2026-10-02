// Shops, price dynamics, the player marketplace and customer orders.
(function (root) {
  'use strict';
  const GF = root.GF;
  const U = GF.util;
  const notify = (m, t) => GF.hooks.notify(m, t || 'info');
  const diff = (S) => GF.DIFFICULTY[S.diff] || GF.DIFFICULTY.standard;

  function tradingPost(S) { return GF.buildingsOf(S, 'trading_post').reduce((m, b) => Math.max(m, b.level), 0); }
  function postBonus(S) { const L = tradingPost(S); return L ? GF.BIZ.trading_post.sellBonus[L - 1] : 0; }
  const priceMod = (S, id) => (S.market.mod[id] === undefined ? 1 : S.market.mod[id]);
  const satur = (S, id) => S.market.satur[id] || 0;

  function npcUnlocked(S, npcId) {
    const n = GF.NPCS.find((x) => x.id === npcId);
    return !n || GF.condMet(S, n.unlock);
  }
  function shopNpcUnlocked(S, shopId) {
    if (shopId === 'caravan') return S.events.caravanUntil > S.time;
    const n = GF.NPCS.find((x) => x.shop === shopId);
    return !n || GF.condMet(S, n.unlock);
  }

  /** Multiplier on item value when selling to a shop. */
  function sellMult(S, shopId, id) {
    const shop = GF.SHOPS[shopId], it = GF.ITEMS[id];
    let m = shop.buy.all;
    if (shop.buy.types && shop.buy.types[it.type] !== undefined) m = Math.max(m, shop.buy.types[it.type]);
    if (shop.buy.items && shop.buy.items[id] !== undefined) m = Math.max(m, shop.buy.items[id]);
    m *= 1 + GF.fx(S, 'sell') + postBonus(S);
    m *= priceMod(S, id) * (1 - satur(S, id));
    m *= diff(S).income * (1 + GF.fx(S, 'income'));
    return m;
  }
  const sellPrice = (S, shopId, id) => Math.max(1, Math.floor(GF.ITEMS[id].value * sellMult(S, shopId, id)));

  /** Sell n items from the bag (prices fall slightly with each unit sold, recovering over time). */
  function sell(S, shopId, id, n) {
    n = Math.min(Math.floor(n), GF.count(S, id));
    if (n <= 0 || !GF.ITEMS[id]) return 0;
    let revenue = 0;
    for (let i = 0; i < n; i++) {
      revenue += sellPrice(S, shopId, id);
      S.market.satur[id] = Math.min(0.45, satur(S, id) + 0.012);
    }
    GF.remove(S, id, n);
    S.coins += revenue;
    S.stats.sold += revenue;
    S.stats.earned += revenue;
    GF.addXp(S, Math.max(1, revenue * 0.01));
    return revenue;
  }

  function stockOf(S, shopId, item) {
    const st = S.market.stock[shopId];
    return st && st[item] !== undefined ? st[item] : null;
  }
  function entriesFor(S, shopId) {
    const shop = GF.SHOPS[shopId];
    const out = [];
    for (const e of shop.sells) out.push(Object.assign({ src: 'base' }, e));
    const rnd = S.market.rand[shopId] || [];
    for (const r of rnd) out.push({ item: r.item, mult: r.mult, stock: r.stock, req: null, src: 'rare' });
    return out;
  }
  function buyPrice(S, shopId, e) {
    return Math.max(1, Math.ceil(GF.ITEMS[e.item].value * e.mult * priceMod(S, e.item)));
  }
  function available(S, shopId, e) {
    if (!GF.condMet(S, e.req || 'start')) return 0;
    if (e.stock < 0) return 999;
    const st = S.market.stock[shopId];
    const left = st && st[e.item] !== undefined ? st[e.item] : e.stock;
    return left;
  }
  function buy(S, shopId, item, n) {
    const e = entriesFor(S, shopId).find((x) => x.item === item);
    if (!e) return { ok: false, msg: 'Not sold here.' };
    n = Math.floor(n);
    const avail = available(S, shopId, e);
    if (n <= 0) return { ok: false, msg: 'Pick a quantity.' };
    if (avail < n) return { ok: false, msg: avail <= 0 ? 'Out of stock today.' : `Only ${avail} left.` };
    const cost = buyPrice(S, shopId, e) * n;
    if (S.coins < cost) return { ok: false, msg: 'Not enough Crowns.' };
    const room = GF.capacity(S) - GF.carry(S);
    const it = GF.ITEMS[item];
    if (room < n && !it.slot) return { ok: false, msg: 'Your bag is full.' };
    S.coins -= cost; S.stats.spent += cost;
    if (it.slot && room < n) GF.stashAdd(S, item, n, { noStat: true }); else GF.add(S, item, n, { noStat: true });
    if (e.stock >= 0) {
      const st = S.market.stock[shopId] = S.market.stock[shopId] || {};
      st[item] = (st[item] === undefined ? e.stock : st[item]) - n;
    }
    if (it.slot) GF.autoEquip(S, item);
    return { ok: true, msg: `Bought ${n} ${it.name} for ${cost}.` };
  }
  function bagUpgradeCost(S) { return GF.BAG_COST[S.bagLevel + 1]; }
  function buyBag(S) {
    const c = bagUpgradeCost(S);
    if (c === undefined) return { ok: false, msg: 'Backpack is maxed.' };
    if (S.coins < c) return { ok: false, msg: 'Not enough Crowns.' };
    S.coins -= c; S.stats.spent += c; S.bagLevel++;
    return { ok: true, msg: `Backpack upgraded! Capacity ${GF.capacity(S)}.` };
  }
  function buyCosmetic(S, id) {
    const c = GF.COSMETICS.find((x) => x.id === id);
    if (!c || S.cosm.owned[id]) return { ok: false, msg: 'Already owned.' };
    if (c.req && !GF.condMet(S, c.req)) return { ok: false, msg: GF.condText(c.req) };
    if (S.coins < c.cost) return { ok: false, msg: 'Not enough Crowns.' };
    S.coins -= c.cost; S.stats.spent += c.cost; S.cosm.owned[id] = true; S.cosm[c.slot] = id;
    return { ok: true, msg: `${c.name} purchased and worn.` };
  }

  // ---------------------------------------------------------------- daily refresh
  function refreshDaily(S) {
    const day = GF.dayNumber(S);
    const m = S.market;
    if (m.day === day) return;
    m.day = day;
    const r = U.rng(S.seed ^ (day * 7919));
    // price drift: mean-reverting random walk, 0.8 .. 1.3
    for (const id in GF.ITEMS) {
      const cur = m.mod[id] === undefined ? 1 : m.mod[id];
      m.mod[id] = U.clamp(cur + (r() - 0.5) * 0.14 + (1 - cur) * 0.3, 0.8, 1.3);
    }
    for (const id in m.satur) { m.satur[id] *= 0.4; if (m.satur[id] < 0.002) delete m.satur[id]; }
    m.stock = {};
    m.rand = {};
    for (const sid in GF.SHOPS) {
      const shop = GF.SHOPS[sid];
      if (!shop.random) continue;
      const list = [];
      for (const g of shop.random) {
        const pool = g.pool.slice();
        for (let i = 0; i < g.n && pool.length; i++) {
          const idx = Math.floor(r() * pool.length);
          list.push({ item: pool.splice(idx, 1)[0], mult: g.mult, stock: 1 });
        }
      }
      m.rand[sid] = list;
    }
  }

  // ---------------------------------------------------------------- player marketplace (simulated shoppers)
  const DEMAND = { res: 1.0, mat: 0.8, part: 0.45, crop: 1.0, food: 0.9, potion: 0.6, drop: 0.8, boss: 0.15, weapon: 0.3, armor: 0.3, tool: 0.35, charm: 0.25, machine: 0.3, trans: 0.1, seal: 0.1, seed: 0.7, misc: 0.5 };
  function maxListings(S) { const L = tradingPost(S); return L ? GF.BIZ.trading_post.listings[L - 1] : 0; }
  function marketFee(S) { const L = tradingPost(S); return L ? GF.BIZ.trading_post.fee[L - 1] - (S.techs.trade1 ? 0.01 : 0) : 0.1; }
  function fairValue(S, id) { return GF.ITEMS[id].value * priceMod(S, id); }
  function listItem(S, id, qty, price) {
    const L = tradingPost(S);
    if (!L) return { ok: false, msg: 'Build a Trading Post first.' };
    if (S.market.listings.length >= maxListings(S)) return { ok: false, msg: 'All your stall slots are used.' };
    qty = Math.floor(qty); price = Math.floor(price);
    if (qty < 1 || price < 1) return { ok: false, msg: 'Enter a quantity and price.' };
    if (GF.count(S, id) < qty) return { ok: false, msg: 'You do not carry that many.' };
    GF.remove(S, id, qty);
    S.market.listings.push({ id: S.nextUid++, item: id, qty, price, sold: 0, earned: 0 });
    return { ok: true, msg: `Listed ${qty} ${GF.ITEMS[id].name} at ${price} each.` };
  }
  function cancelListing(S, lid) {
    const i = S.market.listings.findIndex((l) => l.id === lid);
    if (i < 0) return;
    const l = S.market.listings[i];
    const left = GF.give(S, l.item, l.qty, { noStat: true });
    if (left > 0) GF.hooks.floatText && GF.hooks.floatText(`${left} ${GF.ITEMS[l.item].name} lost: no room!`);
    S.market.listings.splice(i, 1);
  }
  function marketTick(S, dt, rnd) {
    const L = tradingPost(S);
    if (!L) return;
    const post = GF.BIZ.trading_post;
    S.coins += post.income[L - 1] * dt / 60 * diff(S).income;
    S.stats.earned += post.income[L - 1] * dt / 60 * diff(S).income;
    for (let i = S.market.listings.length - 1; i >= 0; i--) {
      const l = S.market.listings[i];
      const ratio = l.price / Math.max(1, fairValue(S, l.item));
      const g = U.clamp((1.7 - ratio) / 0.7, 0, 2.5);
      const rate = 0.04 * g * (DEMAND[GF.ITEMS[l.item].type] || 0.5) * (1 + 0.12 * L) * dt;
      // expected sales this tick; carry the fractional part as probability
      let sales = Math.floor(rate);
      if ((rnd || Math.random)() < rate - sales) sales++;
      sales = Math.min(sales, l.qty);
      if (sales > 0) {
        const gross = sales * l.price;
        const net = Math.floor(gross * (1 - marketFee(S)));
        l.qty -= sales; l.sold += sales; l.earned += net;
        S.coins += net; S.stats.earned += net; S.stats.trades += sales;
        GF.addXp(S, Math.max(1, net * 0.01));
        notify(`A shopper bought ${sales} ${GF.ITEMS[l.item].name} for ${net} Crowns.`, 'coin');
        if (l.qty <= 0) S.market.listings.splice(i, 1);
      }
    }
  }
  function refreshOffers(S, force) {
    const m = S.market;
    if (!force && S.time < m.offerTime) return;
    m.offerTime = S.time + 240;
    const r = U.rng((S.seed + Math.floor(S.time)) >>> 0);
    const pool = Object.values(GF.ITEMS).filter((i) => ['res', 'mat', 'part', 'crop', 'drop', 'machine', 'potion', 'charm', 'food', 'seed'].includes(i.type) && i.value >= 3 && !(i.type === 'res' && i.value > 400));
    // bias toward things from regions the player has reached
    const maxTier = 1 + Object.keys(S.bosses).length;
    m.offers = [];
    for (let i = 0; i < 7; i++) {
      const it = pool[Math.floor(r() * pool.length)];
      if (it.value > 40 * Math.pow(2.2, maxTier)) { i--; if (r() < 0.2) break; continue; }
      const ratio = 0.62 + r() * 0.9;
      const qty = Math.max(1, Math.floor((3 + r() * 14) * (it.value > 100 ? 0.3 : 1)));
      m.offers.push({ id: S.nextUid++, item: it.id, qty, price: Math.max(1, Math.round(it.value * ratio)), seller: ['Wren', 'Tobias', 'Ilsa', 'Karn', 'Dessa', 'Orrin', 'Pell'][Math.floor(r() * 7)] });
    }
  }
  function buyOffer(S, oid, n) {
    const o = S.market.offers.find((x) => x.id === oid);
    if (!o) return { ok: false, msg: 'Offer gone.' };
    n = Math.min(Math.floor(n), o.qty);
    if (n < 1) return { ok: false, msg: 'Pick a quantity.' };
    const cost = n * o.price;
    if (S.coins < cost) return { ok: false, msg: 'Not enough Crowns.' };
    if (GF.capacity(S) - GF.carry(S) < n) return { ok: false, msg: 'Your bag is full.' };
    S.coins -= cost; S.stats.spent += cost;
    GF.add(S, o.item, n, { noStat: true });
    o.qty -= n;
    if (o.qty <= 0) S.market.offers.splice(S.market.offers.indexOf(o), 1);
    return { ok: true, msg: `Bought ${n} ${GF.ITEMS[o.item].name} from ${o.seller}.` };
  }

  // ---------------------------------------------------------------- customer orders
  function orderSlots(S) { const L = tradingPost(S); return L ? 2 + L + GF.fx(S, 'orders') : 0; }
  function genOrders(S) {
    const day = GF.dayNumber(S);
    const m = S.market;
    if (m.orderDay === day && m.orders.length >= orderSlots(S)) return;
    if (!tradingPost(S)) return;
    m.orderDay = day;
    m.orders = m.orders.filter((o) => o.expire >= day);
    const r = U.rng((S.seed ^ (day * 104729)) >>> 0);
    const maxTier = 1 + Object.keys(S.bosses).length;
    const pool = Object.values(GF.ITEMS).filter((i) => ['res', 'mat', 'crop', 'food', 'part', 'potion', 'drop'].includes(i.type) && i.value >= 3 && i.value <= 25 * Math.pow(2.3, maxTier));
    while (m.orders.length < orderSlots(S) && pool.length) {
      const it = pool[Math.floor(r() * pool.length)];
      const qty = Math.max(1, Math.round((6 + r() * 16) / Math.max(1, Math.sqrt(it.value / 6))));
      const mult = 1.4 + r() * 0.6;
      m.orders.push({ id: S.nextUid++, item: it.id, qty, reward: Math.round(it.value * qty * mult), xp: Math.round(it.value * qty * 0.15) + 5, expire: day + 3 + Math.floor(r() * 3), who: ['Baker Tilda', 'Captain Orsk', 'Lady Fenn', 'Old Merrin', 'Pilgrim Joss', 'Mayor Hale'][Math.floor(r() * 6)] });
    }
  }
  function deliverOrder(S, oid) {
    const o = S.market.orders.find((x) => x.id === oid);
    if (!o) return { ok: false, msg: 'Order expired.' };
    if (GF.total(S, o.item) < o.qty) return { ok: false, msg: `Need ${o.qty} ${GF.ITEMS[o.item].name}.` };
    GF.take(S, o.item, o.qty);
    const rew = Math.round(o.reward * diff(S).income * (1 + GF.fx(S, 'income')));
    S.coins += rew; S.stats.earned += rew; S.stats.orders++;
    GF.addXp(S, o.xp);
    S.market.orders.splice(S.market.orders.indexOf(o), 1);
    return { ok: true, msg: `Order delivered: +${rew} Crowns!` };
  }

  Object.assign(GF, {
    tradingPost, sellMult, sellPrice, sell, buyPrice, available, buy, entriesFor, shopNpcUnlocked, npcUnlocked, refreshDaily, bagUpgradeCost, buyBag, buyCosmetic,
    listItem, cancelListing, marketTick, refreshOffers, buyOffer, maxListings, marketFee, fairValue, genOrders, deliverOrder, orderSlots, stockOf,
  });
})(typeof window !== 'undefined' ? window : globalThis);
