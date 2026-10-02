/// <reference lib="webworker" />
import { generateChunk, type GenConfig } from './WorldGenerator';

interface Req { key: number; cx: number; cz: number; cfg: GenConfig }

self.onmessage = (e: MessageEvent<Req>) => {
  const { key, cx, cz, cfg } = e.data;
  try {
    const g = generateChunk(cfg, cx, cz);
    (self as unknown as Worker).postMessage({ key, cx, cz, blocks: g.blocks, biomes: g.biomes }, [g.blocks.buffer, g.biomes.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ key, cx, cz, error: String(err) });
  }
};
