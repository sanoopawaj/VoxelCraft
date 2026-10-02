import { TICKS_PER_DAY } from '../utilities/Constants';
import { ITEM_DEFS } from '../items/ItemRegistry';
import type { Game } from './Game';

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

function findItem(name: string): number | null {
  if (/^\d+$/.test(name) && ITEM_DEFS.has(Number(name))) return Number(name);
  const n = norm(name);
  let partial: number | null = null;
  for (const d of ITEM_DEFS.values()) {
    const dn = norm(d.name);
    if (dn === n) return d.id;
    if (partial === null && dn.startsWith(n)) partial = d.id;
  }
  return partial;
}

const TIME_NAMES: Record<string, number> = { sunrise: 0, day: 1500, noon: 6000, sunset: 12000, night: 14500, midnight: 18000 };

/** Developer console commands (only reachable while the debug overlay is on). */
export function runCommand(game: Game, line: string): string[] {
  const parts = line.trim().replace(/^\//, '').split(/\s+/);
  const cmd = (parts[0] ?? '').toLowerCase();
  const args = parts.slice(1);
  const p = game.player;
  switch (cmd) {
    case 'help':
      return ['/give <item> [n]', '/time set <day|noon|night|midnight|ticks>', '/tp <x> <y> <z> (~ = relative)', '/seed', '/spawn <puff|shade> [n]', '/fly', '/heal', '/kill', '/clear', '/xray (toggle ore markers)', '/chunk'];
    case 'give': {
      if (!args[0]) return ['Usage: /give <item> [amount]'];
      const amount = Math.max(1, Math.min(2304, Math.floor(Number(args[1] ?? 1)) || 1));
      const name = args[0];
      const id = findItem(args.length > 2 ? args.slice(0, -1).join(' ') : name) ?? findItem(name);
      if (id === null) return [`Unknown item "${name}"`];
      const left = game.inventory.add(id, amount);
      return [`Gave ${amount - left} x ${ITEM_DEFS.get(id)!.name}${left ? ` (${left} did not fit)` : ''}`];
    }
    case 'time': {
      if (args[0] === 'set' && args[1] !== undefined) {
        const v = TIME_NAMES[args[1].toLowerCase()] ?? Number(args[1]);
        if (!Number.isFinite(v)) return ['Usage: /time set <day|noon|night|midnight|ticks>'];
        game.time = ((v % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
        return [`Time set to ${Math.round(game.time)}`];
      }
      return [`Time: ${Math.round(game.time)}`];
    }
    case 'tp': {
      if (args.length < 3) return ['Usage: /tp <x> <y> <z>'];
      const rel = (a: string, cur: number) => (a.startsWith('~') ? cur + (Number(a.slice(1)) || 0) : Number(a));
      const x = rel(args[0], p.x), y = rel(args[1], p.y), z = rel(args[2], p.z);
      if (![x, y, z].every(Number.isFinite)) return ['Invalid coordinates'];
      p.teleport(x, Math.max(-10, Math.min(300, y)), z);
      return [`Teleported to ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)} (waits for chunks to load)`];
    }
    case 'seed': return [`Seed: ${game.meta?.seed ?? 'n/a'}`];
    case 'spawn': {
      const kind = args[0] === 'shade' ? 'shade' : args[0] === 'puff' ? 'puff' : null;
      if (!kind) return ['Usage: /spawn <puff|shade> [n]'];
      const n = Math.min(10, Math.max(1, Number(args[1] ?? 1) || 1));
      for (let i = 0; i < n; i++) game.entities!.spawn(kind, p.x - Math.sin(p.yaw) * -3 + i, p.y + 1, p.z - Math.cos(p.yaw) * 3);
      return [`Spawned ${n} ${kind}`];
    }
    case 'fly': p.flying = !p.flying; return [`Fly ${p.flying ? 'ON (Space = up, Shift = fast)' : 'OFF'}`];
    case 'heal': p.health = 100; return ['Healed'];
    case 'kill': p.damage(1000, 'command'); return ['Ouch'];
    case 'clear': game.inventory.clear(); return ['Inventory cleared'];
    case 'xray': {
      game.chunks!.setOreDebug(!game.chunks!.oreDebug);
      return [`Ore markers ${game.chunks!.oreDebug ? 'ON' : 'OFF'}`];
    }
    case 'chunk': {
      const s = game.chunks!.stats();
      return [`Loaded ${s.loaded}, meshed ${s.meshed}, generating ${s.generating}, mesh queue ${s.meshQueue}`];
    }
    default: return [`Unknown command "${cmd}". Try /help`];
  }
}
