import type { MapSpec, TileSpec } from '../engine/map';

/**
 * "The Table of 2026": the hand-painted board photographed after the last
 * live game (Google Drive folder "Akinlandia", IMG_4927-4974). Reconstructed
 * from a lattice fitted to photo IMG_4958 and per-tile readings of the
 * close-ups; see DESIGN_DECISIONS.md 95-97 for the reading rules.
 *
 * Every tile is written as `auto` with an explicit list of its sea edges, so
 * an edge is sea whenever either neighbour paints water across it. Direction
 * indices follow src/engine/hex.ts (0 down-right, 1 up-right, 2 up, 3 up-left,
 * 4 down-left, 5 down).
 */

type Row = [q: number, r: number, sea: string, features?: string, city?: string];

// sea: six characters, one per direction, 'S' sea / 'L' land.
// features: w wheat, t wood (trees), s stone, i iron, f fish, m<d> mountain on edge d.
const ROWS: Row[] = [
  // top-right arm
  [10, -6, 'SSLLLS', 'w', 'Astyra'],
  [11, -6, 'SSSLLS', '', 'Zeleia'],
  [6, -5, 'SLLLSS', 'w'],
  [7, -5, 'SLLLLS', '', 'Tenedos'],
  [8, -5, 'SSSLLS', 'w'],
  [9, -5, 'SSSLLL', 'w', 'Lampsacus'],
  [10, -5, 'LLLLSL', 'ws'],
  [4, -4, 'SSSSSS'],
  [5, -4, 'LSSSSS', 'w'],
  [6, -4, 'SSLLSS', 'w', 'Abydos'],
  [7, -4, 'SLLSSS', 'w', 'Sestos'],
  [8, -4, 'SSLLLL', 'w', 'Cyzicus'],
  [9, -4, 'SSLLSS', '', 'Priapus'],
  [10, -4, 'LLSSSS'],
  [11, -4, 'SSLLSS'],
  [0, -3, 'LLLLLS', 'w', 'Byzantion'],
  [1, -3, 'LLLLLL', 'w'],
  [3, -3, 'SSSSSS', 'f'],
  [5, -3, 'SSSSSS', 'w', 'Lemnos'],
  [6, -3, 'SSSSSS', 'f'],
  [8, -3, 'LLSSLL', 'w'],
  [9, -3, 'LSSSSL', 'w', 'Parium'],
  [10, -3, 'LLLLSS', 'w', 'Dascylium'],
  [11, -3, 'LLLLLL', '', 'Cius'],
  [-1, -2, 'SLLLLL', 'wt'],
  [0, -2, 'SLLSSS', 'f'],
  [1, -2, 'SLLLSS', 'w'],
  [2, -2, 'SSSSSS'],
  [3, -2, 'SSSSSS', 'f'],
  [4, -2, 'SSSSLS', 'w'],
  [5, -2, 'SSLLLL', 'w', 'Perinthus'],
  [7, -2, 'LLLSLL', 'w'],
  [8, -2, 'SLLLLL', 'wt'],
  [9, -2, 'LLSSSL', 'w'],
  [10, -2, 'LLLLLL', 'w', 'Nicaea'],
  [-1, -1, 'SSLLLL', 'w m4'],
  [0, -1, 'SSSLSS'],
  [1, -1, 'SSSSSS'],
  [2, -1, 'SSSSSS', 'w'],
  [3, -1, 'SSSSSL'],
  [4, -1, 'LLLLSL', 'w', 'Chalcedon'],
  [5, -1, 'LLLLLL', 'w', 'Nicomedia'],
  [6, -1, 'LLSSSL'],
  [7, -1, 'LSLLSL', 'w'],
  [8, -1, 'LLLLLL', 'w', 'Prusa'],
  [9, -1, 'LLLLLL', 'w'],
  [10, -1, 'LLLLLL', '', 'Apamea'],
  [-1, 0, 'SSLLLL', 'wt'],
  [0, 0, 'SSSSSS'],
  [1, 0, 'SSSSSS', 'w', 'Marmara'],
  [2, 0, 'LLSSSS', 'w'],
  [3, 0, 'LLLLLL', 'wt'],
  [4, 0, 'LLLLLL', 'wt'],
  [5, 0, 'LLLLLL', 'w', 'Ancyra'],
  [6, 0, 'LSSSSL', 'w', 'Heraclea'],
  [7, 0, 'LLLLLL', 'w'],
  [8, 0, 'LLLLLL', 'w'],
  [-1, 1, 'LLSSLL', 'w', 'Selymbria'],
  [0, 1, 'SSSSSS'],
  [3, 1, 'LLLLLL', 'wts'],
  [4, 1, 'LLLLLL', 'w'],
  [5, 1, 'LSLLLL', 'w'],
  [6, 1, 'LSSSSS'],
  [7, 1, 'LLLSLS', 'w', 'Amastris'],
  [8, 1, 'LLLLLL', '', 'Sinope'],
  [-3, 2, 'LLLLLL', 'wt'],
  [-1, 2, 'LLLLLL', 'm4 m5'],
  [0, 2, 'LSLLLL', 'w m4'],
  [1, 2, 'LSSLLL', 'w'],
  [2, 2, 'LLLLLL', 'w', 'Gordion'],
  [3, 2, 'LLLLLL', 'w'],
  [4, 2, 'LLLLLL', 'w'],
  [5, 2, 'SSSSLS', 'w'],
  [6, 2, 'SSSSSS', '', 'Tenos'],
  [7, 2, 'LLSSSL'],
  [-3, 3, 'LLLLLL', 't m1'],
  [-2, 3, 'LLLLLL', 'w m2'],
  [-1, 3, 'LLLLLL', 'm2', 'Pessinus'],
  [0, 3, 'LLLLLL', 'w m4'],
  [1, 3, 'LLLLLL', 'w m3'],
  [2, 3, 'LLLLLL', 'w m3'],
  [3, 3, 'LLLLLL', '', 'Tavium'],
  [4, 3, 'SSLLLS'],
  [5, 3, 'SSSSSS', 'w', 'Andros'],
  [-2, 4, 'LLLLLL'],
  [-1, 4, 'LLLLLL', 'wt m1'],
  [0, 4, 'LLLLLL', 't m2'],
  [1, 4, 'LLLLLL', 'm2', 'Amorium'],
  [2, 4, 'LLLLLL', 'wt'],
  [3, 4, 'SSLLLS'],
  [-1, 5, 'LLLLLL', 'w'],
  [0, 5, 'LLLLLL', '', 'Iconium'],
  [1, 5, 'LLLLLL'],
];

/** Faction slots: three homelands read off the board (decision 97). */
const SLOTS: Record<string, string> = {
  '-1,1': 'white-purple',
  '-1,3': 'white-purple',
  '0,-3': 'white-second',
  '1,0': 'white-second',
  '2,2': 'white-third',
  '3,3': 'white-third',
  '6,0': 'black-purple',
  '5,0': 'black-purple',
  '7,1': 'black-second',
  '8,1': 'black-second',
  '4,-1': 'black-third',
  '5,-1': 'black-third',
  '10,-3': 'green-purple',
  '10,-2': 'green-purple',
  '8,-4': 'green-second',
  '9,-3': 'green-second',
  '6,-4': 'green-third',
  '7,-4': 'green-third',
};

function parseFeatures(f: string): { resources: TileSpec['resources']; mountains: number[] } {
  const resources: NonNullable<TileSpec['resources']> = [];
  const mountains: number[] = [];
  for (const tok of f.split(' ')) {
    if (!tok) continue;
    if (tok[0] === 'm') {
      mountains.push(Number(tok.slice(1)));
      continue;
    }
    for (const ch of tok) {
      if (ch === 'w') resources.push('wheat');
      else if (ch === 't') resources.push('wood');
      else if (ch === 's') resources.push('stone');
      else if (ch === 'i') resources.push('iron');
      else if (ch === 'f') resources.push('fish');
    }
  }
  return { resources, mountains };
}

function build(): MapSpec {
  const tiles: TileSpec[] = [];
  const mountains: MapSpec['mountains'] = [];
  const dirs = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  for (const [q, r, sea, features = '', city] of ROWS) {
    const { resources, mountains: mts } = parseFeatures(features);
    const seaEdges = [...sea].map((c, i) => (c === 'S' ? i : -1)).filter((d) => d >= 0);
    const t: TileSpec = { q, r, base: 'auto', seaEdges, resources };
    if (city) {
      const slot = SLOTS[`${q},${r}`] ?? 'neutral';
      t.city = { name: city, slot };
    }
    tiles.push(t);
    for (const d of mts) mountains.push({ a: [q, r], b: [q + dirs[d][0], r + dirs[d][1]] });
  }
  return { id: 'table2026', name: 'The Table of 2026', tiles, mountains };
}

export const TABLE_MAP: MapSpec = build();

export const TABLE_SLOTS: Record<string, string> = {
  'white-purple': 'white-purple',
  'white-second': 'white-crimson',
  'white-third': 'white-azure',
  'black-purple': 'black-purple',
  'black-second': 'black-orange',
  'black-third': 'black-gold',
  'green-purple': 'green-purple',
  'green-second': 'green-rose',
  'green-third': 'green-teal',
};
