/**
 * Axial hex coordinates (flat-top orientation).
 *
 * Direction index i (0..5) is also the edge index of a tile: edge i faces
 * neighbour i. Neighbour i sees the same shared edge as its edge (i + 3) % 6.
 *
 *   dir 0: (+1,  0) down-right     dir 3: (-1,  0) up-left
 *   dir 1: (+1, -1) up-right       dir 4: (-1, +1) down-left
 *   dir 2: ( 0, -1) up             dir 5: ( 0, +1) down
 */

export interface Axial {
  q: number;
  r: number;
}

export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export type TileId = string;

export function tileId(q: number, r: number): TileId {
  return `${q},${r}`;
}

export function parseTileId(id: TileId): Axial {
  const [q, r] = id.split(',').map(Number);
  return { q, r };
}

export function neighbor(a: Axial, dir: number): Axial {
  const d = DIRECTIONS[dir];
  return { q: a.q + d.q, r: a.r + d.r };
}

export function neighborId(id: TileId, dir: number): TileId {
  const n = neighbor(parseTileId(id), dir);
  return tileId(n.q, n.r);
}

export function oppositeDir(dir: number): number {
  return (dir + 3) % 6;
}

/** Direction from a to b if adjacent, else -1. */
export function directionBetween(a: Axial, b: Axial): number {
  for (let i = 0; i < 6; i++) {
    const d = DIRECTIONS[i];
    if (a.q + d.q === b.q && a.r + d.r === b.r) return i;
  }
  return -1;
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -dq - dr;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

/** Rotate around the origin by 120 degrees (three applications = identity). */
export function rotate120(a: Axial): Axial {
  return { q: -a.q - a.r, r: a.q };
}

/** Rotate a direction index by 120 degrees, consistent with rotate120. */
export function rotateDir120(dir: number): number {
  return (dir + 4) % 6;
}

/** All axial coordinates within `radius` of the origin. */
export function hexesWithinRadius(radius: number): Axial[] {
  const out: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push({ q, r });
    }
  }
  return out;
}

/** Pixel centre for flat-top hexes with the given size (circumradius). */
export function hexToPixel(a: Axial, size: number): { x: number; y: number } {
  return {
    x: size * 1.5 * a.q,
    y: size * Math.sqrt(3) * (a.r + a.q / 2),
  };
}

/** Corner points of a flat-top hex centred at (cx, cy). Corner k sits between edges k-1 and k. */
export function hexCorners(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const angle = (Math.PI / 180) * (60 * k);
    pts.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return pts;
}

/**
 * The two corners (indices into hexCorners) bounding edge `dir`.
 * With corners at angles 0,60,...,300 degrees and flat-top orientation,
 * edge 0 (down-right, direction (+1,0)) is the edge between corners 0 and 1.
 */
export function edgeCorners(dir: number): [number, number] {
  // dir 0 -> corners 0,1 (angles 0..60: right-down), dir 5 -> corners 1,2 (60..120: down)
  // dir 4 -> 2,3, dir 3 -> 3,4, dir 2 -> 4,5, dir 1 -> 5,0
  const map: [number, number][] = [
    [0, 1],
    [5, 0],
    [4, 5],
    [3, 4],
    [2, 3],
    [1, 2],
  ];
  return map[dir];
}
