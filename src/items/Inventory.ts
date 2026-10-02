import { HOTBAR_SIZE, INVENTORY_SIZE } from '../utilities/Constants';
import { getItemDef, isValidItemId } from './ItemRegistry';
import type { Recipe } from './Recipes';

export interface ItemStack { id: number; count: number }

/** 36 slots: 0..8 hotbar, 9..35 main inventory. Slots are null or a valid, bounded stack. */
export class Inventory {
  slots: Array<ItemStack | null> = new Array(INVENTORY_SIZE).fill(null);
  selected = 0;
  /** Bumped on any change so the UI can cheaply re-render. */
  version = 0;

  private touch() { this.version++; }

  get(slot: number): ItemStack | null { return this.slots[slot] ?? null; }

  selectedStack(): ItemStack | null { return this.slots[this.selected]; }

  setSelected(i: number) {
    this.selected = ((i % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    this.touch();
  }

  set(slot: number, stack: ItemStack | null) {
    this.slots[slot] = stack && stack.count > 0 ? { id: stack.id, count: stack.count } : null;
    this.touch();
  }

  /** Add items, filling existing stacks first (hotbar first). Returns the count that did not fit. */
  add(id: number, count: number): number {
    const def = getItemDef(id);
    if (!def || count <= 0) return Math.max(0, count);
    let left = Math.floor(count);
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < def.maxStack) {
        const n = Math.min(left, def.maxStack - s.count);
        s.count += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(left, def.maxStack);
        this.slots[i] = { id, count: n };
        left -= n;
      }
    }
    this.touch();
    return left;
  }

  count(id: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  has(id: number, count = 1): boolean { return this.count(id) >= count; }

  /** Remove up to `count` items; returns how many were actually removed. */
  remove(id: number, count: number): number {
    let left = Math.floor(count);
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const n = Math.min(left, s.count);
        s.count -= n;
        left -= n;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.touch();
    return Math.floor(count) - left;
  }

  /** Remove `n` from a specific slot. */
  removeFromSlot(slot: number, n = 1): boolean {
    const s = this.slots[slot];
    if (!s || s.count < n) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[slot] = null;
    this.touch();
    return true;
  }

  /** Can `count` of `id` be added without dropping anything? */
  canFit(id: number, count: number): boolean {
    const def = getItemDef(id);
    if (!def) return false;
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += def.maxStack;
      else if (s.id === id) room += def.maxStack - s.count;
    }
    return room >= count;
  }

  canCraft(r: Recipe): boolean {
    return r.inputs.every(([id, n]) => this.has(id, n)) && this.canFit(r.output[0], r.output[1]);
  }

  craft(r: Recipe): boolean {
    if (!r.inputs.every(([id, n]) => this.has(id, n))) return false;
    // Remove first so the freed slots count toward fitting the output.
    const snapshot = this.slots.map((s) => (s ? { ...s } : null));
    for (const [id, n] of r.inputs) this.remove(id, n);
    if (this.add(r.output[0], r.output[1]) > 0) {
      this.slots = snapshot;
      this.touch();
      return false;
    }
    return true;
  }

  /** Merge-or-swap click behaviour for a slot while holding `cursor`. Returns the new cursor. */
  clickSlot(slot: number, cursor: ItemStack | null): ItemStack | null {
    const s = this.slots[slot];
    if (!cursor) {
      this.slots[slot] = null;
      this.touch();
      return s;
    }
    if (!s) {
      this.slots[slot] = cursor;
      this.touch();
      return null;
    }
    if (s.id === cursor.id) {
      const max = getItemDef(s.id)!.maxStack;
      const n = Math.min(cursor.count, max - s.count);
      s.count += n;
      const rest = cursor.count - n;
      this.touch();
      return rest > 0 ? { id: cursor.id, count: rest } : null;
    }
    this.slots[slot] = cursor;
    this.touch();
    return s;
  }

  /** Right-click: take half the stack, or drop one item from the cursor into the slot. */
  rightClickSlot(slot: number, cursor: ItemStack | null): ItemStack | null {
    const s = this.slots[slot];
    if (!cursor) {
      if (!s) return null;
      const take = Math.ceil(s.count / 2);
      s.count -= take;
      if (s.count <= 0) this.slots[slot] = null;
      this.touch();
      return { id: s.id, count: take };
    }
    const max = getItemDef(cursor.id)!.maxStack;
    if (!s) {
      this.slots[slot] = { id: cursor.id, count: 1 };
      this.touch();
      return cursor.count > 1 ? { id: cursor.id, count: cursor.count - 1 } : null;
    }
    if (s.id === cursor.id && s.count < max) {
      s.count++;
      this.touch();
      return cursor.count > 1 ? { id: cursor.id, count: cursor.count - 1 } : null;
    }
    return this.clickSlot(slot, cursor);
  }

  /** Move a slot's stack between hotbar and main inventory (shift-click). */
  quickMove(slot: number) {
    const s = this.slots[slot];
    if (!s) return;
    const [from, to] = slot < HOTBAR_SIZE ? [0, 9] : [9, 0];
    const range = slot < HOTBAR_SIZE ? [9, INVENTORY_SIZE] : [0, HOTBAR_SIZE];
    void from; void to;
    const def = getItemDef(s.id)!;
    for (let pass = 0; pass < 2 && s.count > 0; pass++) {
      for (let i = range[0]; i < range[1] && s.count > 0; i++) {
        const d = this.slots[i];
        if (pass === 0 && d && d.id === s.id && d.count < def.maxStack) {
          const n = Math.min(s.count, def.maxStack - d.count);
          d.count += n; s.count -= n;
        } else if (pass === 1 && !d) {
          this.slots[i] = { id: s.id, count: s.count };
          s.count = 0;
        }
      }
    }
    if (s.count <= 0) this.slots[slot] = null;
    this.touch();
  }

  clear() {
    this.slots.fill(null);
    this.touch();
  }

  toJSON(): Array<[number, number] | null> {
    return this.slots.map((s) => (s ? [s.id, s.count] : null));
  }

  /** Load defensively: unknown ids and bad counts are discarded rather than crashing. */
  loadJSON(data: unknown, selected = 0) {
    this.slots.fill(null);
    if (Array.isArray(data)) {
      for (let i = 0; i < Math.min(data.length, INVENTORY_SIZE); i++) {
        const e = data[i];
        if (!Array.isArray(e)) continue;
        const [id, count] = e as [number, number];
        if (!isValidItemId(id) || !Number.isFinite(count) || count < 1) continue;
        const max = getItemDef(id)!.maxStack;
        this.slots[i] = { id, count: Math.min(max, Math.floor(count)) };
      }
    }
    this.selected = Number.isInteger(selected) && selected >= 0 && selected < HOTBAR_SIZE ? selected : 0;
    this.touch();
  }
}
