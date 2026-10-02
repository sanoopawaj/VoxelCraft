# Voxel World

An original Minecraft-style voxel sandbox that runs in the browser. Everything - terrain, textures, sounds, UI -
is generated in code, so there are no external assets (and nothing copied from any other game).

Built with **TypeScript + Three.js (WebGL) + Vite**. Chunk generation runs in Web Workers.

## Run

```bash
npm install
npm run dev          # http://localhost:5173  (hot reload)
```

Use a desktop browser (Chrome / Edge / Firefox) with WebGL2. Click **Single Player → New World → Create World**.

## Build / serve a production copy

```bash
npm run build        # type-check + production bundle in ./dist
npm run preview      # serve ./dist on http://localhost:4173
npm start            # build + preview in one go
```

`dist/` must be served over HTTP (module workers do not run from `file://`); any static file server works.

## Tests

```bash
npm test             # 43 unit tests (vitest): registry, chunks, coordinates, generation, meshing, lighting,
                     #   physics, raycasting, inventory, crafting, saves, chunk streaming / border remeshing
npm run e2e          # drives the real game in headless Chromium through the 20-step manual test sequence
                     #   (starts its own dev server; needs a Chromium: set CHROMIUM=/path/to/chrome if not auto-found)
```

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Look |
| `Space` | Jump / swim up |
| `Shift` | Sprint (hold while moving forward) |
| Left click (hold) | Break block / attack |
| Right click | Place block / eat food |
| `1`-`9`, mouse wheel | Select hotbar slot |
| `E` | Inventory + crafting |
| `Q` | Drop one item |
| `Esc` | Pause |
| `F3` | Debug overlay (also unlocks the `/` command line) |
| `F4` | Toggle coordinates / clock |
| `F` | Fullscreen |

All keys except `Esc`, mouse buttons and `1`-`9` can be rebound under **Controls**.

## What is in the game

- **World**: deterministic, seed-based, effectively infinite terrain in 16x16x128 chunks. Layered noise gives
  oceans, beaches, plains, forests, deserts (with cacti), snowy plains, mountains and snowy mountains with smooth
  transitions. Trees (oak/spruce, varied sizes, spaced out), tunnel + chamber caves, and coal/iron/gold/diamond ore
  with different depth ranges (tables in `src/world/WorldGenerator.ts`). Same seed => same world, in every quadrant.
- **Rendering**: only exposed faces are meshed, with smooth per-vertex lighting and ambient occlusion; opaque, cutout
  (leaves/glass) and translucent water passes; frustum culling; distance fog; sky gradient, sun, moon, stars, clouds.
- **Lighting**: real voxel light - skylight and torch light are flood-filled across chunk borders; caves are dark,
  torches (placeable on solid ground) light them. Day length is configurable (default 10 minutes), time is saved.
- **Player**: AABB physics (gravity, jumping, wall sliding, no tunnelling), sprint, swimming with reduced gravity and
  an underwater view, fall damage, 100 HP with slow regeneration, death/respawn (keep-inventory rule is a setting).
- **Sandbox**: block raycast + highlight, hold-to-break with crack animation, hardness and tool tiers, drops that
  fly into your inventory, placement checks (not inside you or mobs, torches need a floor), held-item view.
- **Items**: 36-slot inventory (9-slot hotbar), stacking to 64, click / right-click split / shift-click move, drops,
  pickaxes (wood/stone/iron/diamond) and hand crafting with missing-ingredient feedback.
- **Mobs**: peaceful *Puffs* (wander, flee when hurt, drop meat you can eat) and hostile *Shades* (notice, chase,
  attack at night and in dark caves, burn in sunlight). Simple state machines, distance-based update rate.
- **Persistence**: worlds are saved as *seed + player edits* in `localStorage` (crash-safe temp-write + verify,
  corrupt saves are detected and flagged). Autosave every minute, on pause-menu Save, and on exit.
- **UI**: main menu, world list (name, seed, last played, play time; copy seed; delete with confirmation), world
  creation (name, seed, world type), loading screen with progress, pause menu, settings, controls + rebinding,
  death screen, HUD (hotbar, health, crosshair, coordinates, item name).
- **Audio**: fully synthesised (no sample files): per-material break/place/step sounds, jump/land/splash, UI clicks,
  hurt/eat/pickup, ambient wind/birds/crickets/cave drips, and quiet generative music.
- **Settings** (persisted): mouse sensitivity, invert Y, FOV, render distance (2-12), master/music/SFX volume, day
  length, graphics quality, view bobbing, coordinates, keep-inventory.

### Developer tools

Press `F3`, then `/` to open the command line:

`/give <item> [n]` · `/time set <day|noon|night|midnight|ticks>` · `/tp <x> <y> <z>` (`~` relative) · `/seed` ·
`/spawn <puff|shade> [n]` · `/fly` · `/heal` · `/kill` · `/clear` · `/xray` (marks every ore in loaded chunks) · `/chunk` · `/help`

Choose **World type → Test world** when creating a world for a flat map with a gallery of every block, a water pool,
torches, stairs, a fall tower, an underground tunnel and a full inventory.

## Project layout

```
src/
  game/          Game (state machine + loop), console Commands
  world/         BlockRegistry, Chunk, World, ChunkManager (streaming), WorldGenerator (+ worker), Biomes
  rendering/     Renderer, ChunkMesher (lighting + meshing), TextureAtlas (procedural art), DayNight, Particles, HeldItem
  player/        Player (controller), Physics (shared AABB movement)
  interaction/   BlockRaycaster, Interaction (break / place / attack)
  items/         ItemRegistry, Recipes, Inventory
  entities/      Mob, EntityManager (spawn + AI LOD), ItemDrops
  audio/         AudioManager        save/  SaveManager, Settings
  input/         InputManager        ui/    UI (DOM screens, HUD, inventory)
  utilities/     Constants (all tunables), Noise, Random, MathUtil
  tests/         vitest suites       tools/ e2e-smoke.mjs
```

Blocks, items, recipes and biomes are plain data tables, so adding content is mostly adding rows.

## Known limitations

- Water is static: you can swim in it and place/remove it, but it does not flow or spread. Sand/gravel do not fall.
- Torches stand upright on solid ground only (no wall-mounted torches). Wooden/stone tools are pickaxes only.
- Ores drop their material directly (no smelting). There is no hunger, no multiplayer, no mobile controls.
- Meshing is per-face (with hidden-face culling), not greedy meshing; lighting + meshing run on the main thread within a
  per-frame time budget (terrain generation is in workers).
- Saves live in the browser's `localStorage` (~5 MB): very heavily edited worlds could hit the quota - the game
  then reports "Save failed" and keeps the previous save intact. Mobs and dropped items are not saved.
- Tested in Chromium only (headless, software rendering). Pointer lock must be granted by a click.

## Ideas for next steps

Fluid flow, wall torches + more light sources, greedy meshing / meshing in a worker, more biomes and structures
(villages, dungeons), smelting and a 3x3 crafting grid, more mobs and a hunger system, IndexedDB saves with chunk
compression, a rendered 3D main-menu backdrop.
