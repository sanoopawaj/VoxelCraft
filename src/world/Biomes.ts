// Small, data-driven biome table. Terrain generation picks a biome id per column.

export const enum Biome {
  PLAINS = 0, FOREST, DESERT, MOUNTAINS, SNOWY_MOUNTAINS, BEACH, SNOWY_PLAINS, OCEAN,
}

export interface BiomeDef {
  id: number;
  name: string;
  /** Tree attempts per column (0..1 probability scale for the hash test). */
  treeDensity: number;
  grassTint: [number, number, number];
  leafTint: [number, number, number];
  /** Fog / sky tint hint (unused by terrain, handy for debug). */
  temperature: number;
}

export const BIOMES: BiomeDef[] = [
  { id: Biome.PLAINS, name: 'Plains', treeDensity: 0.004, grassTint: [0.58, 0.82, 0.32], leafTint: [0.55, 0.8, 0.3], temperature: 0.5 },
  { id: Biome.FOREST, name: 'Forest', treeDensity: 0.03, grassTint: [0.42, 0.7, 0.27], leafTint: [0.4, 0.72, 0.28], temperature: 0.45 },
  { id: Biome.DESERT, name: 'Desert', treeDensity: 0.003, grassTint: [0.75, 0.75, 0.4], leafTint: [0.6, 0.7, 0.3], temperature: 1.0 },
  { id: Biome.MOUNTAINS, name: 'Mountains', treeDensity: 0.006, grassTint: [0.5, 0.72, 0.38], leafTint: [0.4, 0.65, 0.3], temperature: 0.2 },
  { id: Biome.SNOWY_MOUNTAINS, name: 'Snowy Mountains', treeDensity: 0.005, grassTint: [0.6, 0.8, 0.6], leafTint: [0.3, 0.55, 0.38], temperature: -0.3 },
  { id: Biome.BEACH, name: 'Beach', treeDensity: 0, grassTint: [0.7, 0.8, 0.4], leafTint: [0.55, 0.8, 0.3], temperature: 0.6 },
  { id: Biome.SNOWY_PLAINS, name: 'Snowy Plains', treeDensity: 0.006, grassTint: [0.6, 0.8, 0.6], leafTint: [0.3, 0.55, 0.38], temperature: -0.4 },
  { id: Biome.OCEAN, name: 'Ocean', treeDensity: 0, grassTint: [0.5, 0.75, 0.4], leafTint: [0.5, 0.75, 0.4], temperature: 0.4 },
];

export function biomeName(id: number): string {
  return BIOMES[id]?.name ?? 'Unknown';
}
