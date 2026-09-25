/**
 * Seeded RNG (mulberry32). The RNG state lives inside the GameState so every
 * die roll, shuffle and tile draw is reproducible from seed + action log.
 */

export interface RngState {
  seed: number; // original seed (for display / replay)
  s: number; // current 32-bit state
  calls: number; // number of draws so far (handy for debugging replays)
}

export function createRng(seed: number): RngState {
  const s = (seed >>> 0) || 0x9e3779b9;
  return { seed: seed >>> 0, s, calls: 0 };
}

/** Returns a float in [0, 1) and advances the RNG in place. */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  rng.calls += 1;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function nextInt(rng: RngState, n: number): number {
  if (n <= 0) throw new Error(`nextInt: n must be positive, got ${n}`);
  return Math.floor(nextFloat(rng) * n);
}

/** Roll a six-sided die: 1..6 */
export function rollD6(rng: RngState): number {
  return nextInt(rng, 6) + 1;
}

/** Fisher-Yates shuffle in place, using the seeded RNG. */
export function shuffle<T>(rng: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/** Hash a string into a 32-bit seed (for user-entered seed text). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
