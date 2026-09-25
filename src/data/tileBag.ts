import type { Edge, Resource } from '../engine/types';

/**
 * A tile in the Full Game bag (decision 78). Edges are indexed by direction
 * before rotation; rotating by k steps moves edge i to direction (i + k) % 6.
 */
export interface BagTileSpec {
  id: string;
  edges: Edge[];
  city?: { name: string };
  resources: Resource[];
}

const CITY_NAMES = [
  'Thebes', 'Corinth', 'Rhodes', 'Delos', 'Naxos', 'Chios', 'Lesbos', 'Byzantion', 'Abydos', 'Larissa', 'Pella', 'Amphipolis', 'Olynthos', 'Phocaea', 'Knidos', 'Kos',
  'Sicyon', 'Tegea', 'Mantinea', 'Elis', 'Chalcis', 'Eretria', 'Thespiae', 'Plataea', 'Orchomenos', 'Tanagra', 'Megalopolis', 'Sybaris',
];

function sea(): Edge {
  return { type: 'sea' };
}
function land(mountain = false): Edge {
  return mountain ? { type: 'land', mountain: true } : { type: 'land' };
}

/** Coastal tile with `n` contiguous sea edges starting at direction 0. */
function coast(n: number, mountains: number[] = []): Edge[] {
  const out: Edge[] = [];
  for (let d = 0; d < 6; d++) out.push(d < n ? sea() : land(mountains.includes(d)));
  return out;
}

function landTile(mountains: number[] = []): Edge[] {
  const out: Edge[] = [];
  for (let d = 0; d < 6; d++) out.push(land(mountains.includes(d)));
  return out;
}

function buildBag(): BagTileSpec[] {
  const bag: BagTileSpec[] = [];
  let cityIdx = 0;
  const nextCity = () => ({ name: CITY_NAMES[cityIdx++ % CITY_NAMES.length] });
  let n = 0;
  const add = (edges: Edge[], resources: Resource[], city = false) => {
    bag.push({ id: `bag${n++}`, edges, resources, ...(city ? { city: nextCity() } : {}) });
  };
  // 24 open sea tiles (4 with fish)
  for (let i = 0; i < 24; i++) add(Array.from({ length: 6 }, sea), i % 6 === 0 ? ['fish'] : []);
  // 6 islands with cities
  for (let i = 0; i < 6; i++) add(Array.from({ length: 6 }, sea), i % 2 === 0 ? ['wheat', 'fish'] : ['fish'], true);
  // 30 coastal tiles: 1, 2 or 3 contiguous sea edges
  const coastalResources: Resource[][] = [['wheat'], ['wheat', 'fish'], ['wood'], ['stone'], ['wheat', 'wood'], ['fish'], [], ['iron'], ['wheat', 'stone'], ['wood', 'fish']];
  for (let i = 0; i < 30; i++) {
    const seaEdges = 1 + (i % 3);
    const city = i % 5 === 0 || i % 5 === 2; // 12 coastal cities
    const mountains = i % 7 === 3 ? [4] : [];
    add(coast(seaEdges, mountains), city ? (i % 2 ? ['wheat'] : []) : coastalResources[i % coastalResources.length], city);
  }
  // 30 land tiles
  const landResources: Resource[][] = [['wheat'], ['wheat', 'wood'], ['wood'], ['stone'], ['iron'], ['wheat'], ['wheat', 'iron'], [], ['stone', 'wood'], ['wheat']];
  for (let i = 0; i < 30; i++) {
    const city = i % 3 === 0; // 10 land cities
    const mountains = i % 4 === 1 ? [0, 1] : i % 4 === 3 ? [3] : [];
    add(landTile(mountains), city ? (i % 2 ? ['wheat'] : []) : landResources[i % landResources.length], city);
  }
  return bag;
}

export const TILE_BAG: BagTileSpec[] = buildBag();

const BY_ID: Record<string, BagTileSpec> = Object.fromEntries(TILE_BAG.map((t) => [t.id, t]));

export function tileSpecById(id: string): BagTileSpec | undefined {
  return BY_ID[id];
}

/** The starting sea tile placed in the centre of the Full Game board (ruling 40). */
export const CENTER_SEA_TILE: BagTileSpec = { id: 'center', edges: Array.from({ length: 6 }, sea), resources: [] };

export function rotatedEdges(edges: Edge[], rotation: number): Edge[] {
  const out: Edge[] = [];
  for (let d = 0; d < 6; d++) out.push(edges[(d - rotation + 6) % 6]);
  return out;
}
