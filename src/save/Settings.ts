import { DEFAULT_RENDER_DISTANCE, DEFAULT_DAY_LENGTH_SECONDS, MAX_RENDER_DISTANCE, MIN_RENDER_DISTANCE, STORAGE_PREFIX } from '../utilities/Constants';
import { clamp } from '../utilities/MathUtil';
import { DEFAULT_BINDINGS, type Action } from '../input/InputManager';

export interface Settings {
  mouseSensitivity: number; // 0.2 .. 3
  invertY: boolean;
  renderDistance: number;
  fov: number;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: 'fast' | 'fancy';
  showCoords: boolean;
  keepInventory: boolean;
  viewBobbing: boolean;
  dayLengthSeconds: number;
  bindings: Record<Action, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  mouseSensitivity: 1, invertY: false, renderDistance: DEFAULT_RENDER_DISTANCE, fov: 75,
  masterVolume: 0.8, musicVolume: 0.35, sfxVolume: 0.8, quality: 'fancy',
  showCoords: true, keepInventory: true, viewBobbing: true,
  dayLengthSeconds: DEFAULT_DAY_LENGTH_SECONDS, bindings: { ...DEFAULT_BINDINGS },
};

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number, def: number) => {
    const v = Number(r[k]);
    return Number.isFinite(v) ? clamp(v, lo, hi) : def;
  };
  const bool = (k: string, def: boolean) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : def);
  const bindings = { ...DEFAULT_BINDINGS };
  const rb = r.bindings as Record<string, unknown> | undefined;
  if (rb && typeof rb === 'object') for (const a of Object.keys(bindings) as Action[]) if (typeof rb[a] === 'string') bindings[a] = rb[a] as string;
  return {
    mouseSensitivity: num('mouseSensitivity', 0.1, 4, d.mouseSensitivity),
    invertY: bool('invertY', d.invertY),
    renderDistance: Math.round(num('renderDistance', MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE, d.renderDistance)),
    fov: Math.round(num('fov', 50, 110, d.fov)),
    masterVolume: num('masterVolume', 0, 1, d.masterVolume),
    musicVolume: num('musicVolume', 0, 1, d.musicVolume),
    sfxVolume: num('sfxVolume', 0, 1, d.sfxVolume),
    quality: r.quality === 'fast' ? 'fast' : 'fancy',
    showCoords: bool('showCoords', d.showCoords),
    keepInventory: bool('keepInventory', d.keepInventory),
    viewBobbing: bool('viewBobbing', d.viewBobbing),
    dayLengthSeconds: num('dayLengthSeconds', 60, 3600, d.dayLengthSeconds),
    bindings,
  };
}

export class SettingsStore {
  value: Settings;
  private listeners: Array<(s: Settings) => void> = [];

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()) {
    let raw: unknown = null;
    try { raw = JSON.parse(storage?.getItem(STORAGE_PREFIX + 'settings') ?? 'null'); } catch { /* corrupt settings -> defaults */ }
    this.value = sanitizeSettings(raw);
  }

  onChange(fn: (s: Settings) => void) { this.listeners.push(fn); }

  update(patch: Partial<Settings>) {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    try { this.storage?.setItem(STORAGE_PREFIX + 'settings', JSON.stringify(this.value)); } catch (e) { console.warn('[Settings] could not persist', e); }
    for (const l of this.listeners) l(this.value);
  }
}

export function safeLocalStorage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
