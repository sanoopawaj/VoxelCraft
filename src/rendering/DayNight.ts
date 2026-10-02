import { TICKS_PER_DAY } from '../utilities/Constants';
import { clamp, lerp, smoothstep } from '../utilities/MathUtil';

// Time 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight.

export interface SkyState {
  sunDir: [number, number, number];
  moonDir: [number, number, number];
  daylight: number; // 0 night .. 1 day
  /** Multiplier applied to skylight in the chunk shader. */
  skyBrightness: number;
  skyTint: [number, number, number];
  zenith: [number, number, number];
  horizon: [number, number, number];
  starAlpha: number;
}

const DAY_ZENITH: [number, number, number] = [0.3, 0.52, 0.93];
const DAY_HORIZON: [number, number, number] = [0.7, 0.83, 0.98];
const NIGHT_ZENITH: [number, number, number] = [0.012, 0.018, 0.07];
const NIGHT_HORIZON: [number, number, number] = [0.05, 0.065, 0.14];
const DUSK: [number, number, number] = [1.0, 0.52, 0.28];

const mix3 = (a: number[], b: number[], t: number): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function skyAt(ticks: number): SkyState {
  const a = ((((ticks % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY) / TICKS_PER_DAY) * Math.PI * 2;
  const sh = Math.sin(a);
  const sunDir: [number, number, number] = [Math.cos(a), sh, 0.28];
  const l = Math.hypot(...sunDir);
  const sd: [number, number, number] = [sunDir[0] / l, sunDir[1] / l, sunDir[2] / l];
  const daylight = smoothstep(-0.1, 0.22, sh);
  const twilight = Math.exp(-Math.pow(sh / 0.2, 2)); // peaks at sunrise/sunset
  let horizon = mix3(NIGHT_HORIZON, DAY_HORIZON, daylight);
  horizon = mix3(horizon, DUSK, clamp(twilight * 0.7, 0, 0.7));
  const zenith = mix3(NIGHT_ZENITH, DAY_ZENITH, daylight);
  const skyTint = mix3([0.5, 0.62, 1.0], [1, 1, 1], smoothstep(0, 1, daylight));
  const warm = twilight * 0.25 * daylight;
  skyTint[1] -= warm * 0.3; skyTint[2] -= warm * 0.6;
  return {
    sunDir: sd,
    moonDir: [-sd[0], -sd[1], -sd[2]],
    daylight,
    skyBrightness: lerp(0.2, 1, daylight),
    skyTint, zenith, horizon,
    starAlpha: clamp(1 - daylight * 1.6, 0, 1),
  };
}

/** HH:MM style clock for the HUD (tick 0 = 06:00). */
export function formatClock(ticks: number): string {
  const hours = ((ticks / TICKS_PER_DAY) * 24 + 6) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
