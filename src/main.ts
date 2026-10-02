import { Game } from './game/Game';

const game = new Game();
// Handy handle for debugging and automated tests.
(window as any).__voxel = game;
