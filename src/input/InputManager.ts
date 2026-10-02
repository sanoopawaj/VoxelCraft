// All raw DOM input goes through here; the rest of the game reads actions.

export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint'
  | 'inventory' | 'debug' | 'coords' | 'fullscreen' | 'drop' | 'command';

export const DEFAULT_BINDINGS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft',
  inventory: 'KeyE', debug: 'F3', coords: 'F4', fullscreen: 'KeyF', drop: 'KeyQ', command: 'Slash',
};

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move Forward', back: 'Move Back', left: 'Move Left', right: 'Move Right', jump: 'Jump', sprint: 'Sprint',
  inventory: 'Inventory', debug: 'Debug Overlay', coords: 'Toggle Coordinates', fullscreen: 'Fullscreen', drop: 'Drop Item', command: 'Command Line',
};

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', Slash: '/', Backquote: '`' } as Record<string, string>)[code] ?? code;
}

export class InputManager {
  bindings: Record<Action, string> = { ...DEFAULT_BINDINGS };
  private down = new Set<string>();
  private pressed = new Set<string>(); // key codes pressed since last endFrame
  private mouseDown = [false, false, false];
  private mousePressed = [false, false, false];
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** When false, gameplay actions read as inactive (menus are open). */
  gameplayEnabled = false;
  /** Set by UI to capture the next key press (rebinding) or typed text; returns true if consumed. */
  keyCapture: ((e: KeyboardEvent) => boolean) | null = null;

  onPointerLockChange: ((locked: boolean) => void) | null = null;
  onEscape: (() => void) | null = null;
  onAction: ((a: Action) => void) | null = null;
  onHotbarKey: ((slot: number) => void) | null = null;
  onWheel: ((dir: number) => void) | null = null;
  onClickWhileUnlocked: (() => void) | null = null;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown.fill(false); });
    window.addEventListener('mousedown', this.mouseDownH);
    window.addEventListener('mouseup', (e) => { this.mouseDown[e.button] = false; });
    window.addEventListener('mousemove', this.mouseMove);
    window.addEventListener('wheel', this.wheelH, { passive: false });
    window.addEventListener('contextmenu', (e) => { if (this.gameplayEnabled || this.locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.mouseDown.fill(false);
      this.onPointerLockChange?.(this.locked);
    });
  }

  private keyDown = (e: KeyboardEvent) => {
    if (this.keyCapture && this.keyCapture(e)) { e.preventDefault(); return; }
    const target = e.target as HTMLElement | null;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if (typing) return;
    if (e.code === 'F3' || e.code === 'F4' || e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressed.add(e.code);
    if (e.code === 'Escape') { this.onEscape?.(); return; }
    for (const a of Object.keys(this.bindings) as Action[]) {
      if (this.bindings[a] === e.code && ['inventory', 'debug', 'coords', 'fullscreen', 'drop', 'command'].includes(a)) {
        if (e.code === 'Slash') e.preventDefault();
        this.onAction?.(a);
      }
    }
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) this.onHotbarKey?.(n - 1);
    }
  };

  private mouseDownH = (e: MouseEvent) => {
    if (this.locked) {
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
      e.preventDefault();
    } else if (this.gameplayEnabled && e.target === this.canvas) {
      this.onClickWhileUnlocked?.();
    }
  };

  private mouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private wheelH = (e: WheelEvent) => {
    if (!this.gameplayEnabled && !this.locked) return;
    e.preventDefault();
    this.wheel += Math.sign(e.deltaY);
    this.onWheel?.(Math.sign(e.deltaY));
  };

  isDown(a: Action): boolean { return this.gameplayEnabled && this.down.has(this.bindings[a]); }
  wasPressed(a: Action): boolean { return this.gameplayEnabled && this.pressed.has(this.bindings[a]); }
  mouseHeld(b: number): boolean { return this.locked && this.mouseDown[b]; }
  mouseClicked(b: number): boolean { return this.locked && this.mousePressed[b]; }

  requestLock() {
    try {
      const p = (this.canvas as HTMLCanvasElement).requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => { /* user cancelled / not allowed yet */ });
    } catch { /* ignore */ }
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /** Call once per rendered frame after consuming input. */
  endFrame() {
    this.pressed.clear();
    this.mousePressed.fill(false);
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  setBinding(a: Action, code: string) { this.bindings[a] = code; }
}
