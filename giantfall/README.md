# GIANTFALL

A sandbox + tycoon + crafting + boss RPG. Start with nothing, build a settlement, trade, delve dungeons,
beat five guardians, and finally face **the Giant**. Then keep going: the Abyss, Ascended bosses, Legacy bonuses.

## Run it
Double-click `index.html`. No install, no server, no internet needed (works from `file://`).

## Controls
| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Space or click | Attack / gather (aim with the mouse) |
| E | Interact (talk, open, enter portals, tend fields) |
| Shift | Dodge roll (brief invulnerability, costs stamina) |
| R | Whirlwind skill |
| 1-8 | Use quick-bar item |
| I / C / T / B / J / M / K | Inventory / Crafting / Tycoon / Build / Quests / Map / Skills |
| Esc | Menu / close |

## Tests
`node tests/logic.js` (data, economy, saves, dungeons) and `node tests/tycoon.js` need only Node.
`tests/smoke.js`, `tests/bossbot.js`, `tests/giantwin.js`, `tests/early.js` drive headless Chromium via Playwright (`OUT=<dir>` for screenshots).
