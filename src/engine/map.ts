import { DIRECTIONS, neighbor, oppositeDir, parseTileId, rotate120, tileId } from './hex';
import type { TileId } from './hex';
import type { CityLevel, Edge, Resource, Tile, TileType } from './types';

/**
 * Compact, hand-authored description of a tile. `base` gives the default edge
 * type; `seaEdges` / `landEdges` override single directions (used for coastal
 * tiles). When `base` is 'auto' the edge types are derived from neighbours:
 * sea toward sea tiles, land toward land tiles, land toward other 'auto'
 * tiles unless listed in `seaEdges`.
 */
export interface TileSpec {
  q: number;
  r: number;
  base: 'sea' | 'land' | 'auto';
  seaEdges?: number[];
  landEdges?: number[];
  city?: { name: string; level?: CityLevel; slot: string | 'neutral'; walls?: boolean };
  resources?: Resource[];
  /** optional ground colour for the board (purely visual) */
  tint?: string;
  /** a land tile a navigable river runs through, by the river's name (decision 117) */
  river?: string;
}

export interface MountainSpec {
  a: [number, number];
  b: [number, number];
}

export interface MapSpec {
  id: string;
  name: string;
  tiles: TileSpec[];
  mountains: MountainSpec[];
}

export function tileType(tile: Pick<Tile, 'edges'>): TileType {
  const seas = tile.edges.filter((e) => e.type === 'sea').length;
  if (seas === 6) return 'sea';
  if (seas === 0) return 'land';
  return 'coastal';
}

export function isPureSea(tile: Pick<Tile, 'edges'>): boolean {
  return tileType(tile) === 'sea';
}

export function hasSeaEdge(tile: Pick<Tile, 'edges'>): boolean {
  return tile.edges.some((e) => e.type === 'sea');
}

export function hasLandEdge(tile: Pick<Tile, 'edges'>): boolean {
  return tile.edges.some((e) => e.type === 'land');
}

/** Rotate a whole map spec by 120 degrees about the origin. */
export function rotateSpec(spec: TileSpec, times: number): TileSpec {
  let out: TileSpec = { ...spec, seaEdges: spec.seaEdges ? [...spec.seaEdges] : undefined, landEdges: spec.landEdges ? [...spec.landEdges] : undefined };
  for (let i = 0; i < times; i++) {
    const p = rotate120({ q: out.q, r: out.r });
    out = {
      ...out,
      q: p.q,
      r: p.r,
      seaEdges: out.seaEdges?.map((d) => (d + 4) % 6),
      landEdges: out.landEdges?.map((d) => (d + 4) % 6),
    };
  }
  return out;
}

export function rotateMountain(m: MountainSpec, times: number): MountainSpec {
  let a = { q: m.a[0], r: m.a[1] };
  let b = { q: m.b[0], r: m.b[1] };
  for (let i = 0; i < times; i++) {
    a = rotate120(a);
    b = rotate120(b);
  }
  return { a: [a.q, a.r], b: [b.q, b.r] };
}

/**
 * Build the Tile record from a MapSpec. Throws when neighbouring edges disagree.
 * `slotOwners` maps faction slot ids to player ids for starting cities; slots
 * with no owner become neutral cities.
 */
export function buildTiles(spec: MapSpec, slotOwners: Record<string, string | undefined>): Record<TileId, Tile> {
  const byId = new Map<TileId, TileSpec>();
  for (const t of spec.tiles) {
    const id = tileId(t.q, t.r);
    if (byId.has(id)) throw new Error(`Map ${spec.id}: duplicate tile ${id}`);
    byId.set(id, t);
  }
  const mountains = new Set<string>();
  for (const m of spec.mountains) {
    const a = tileId(m.a[0], m.a[1]);
    const b = tileId(m.b[0], m.b[1]);
    mountains.add(`${a}|${b}`);
    mountains.add(`${b}|${a}`);
  }

  const tiles: Record<TileId, Tile> = {};
  for (const t of spec.tiles) {
    const id = tileId(t.q, t.r);
    const edges: Edge[] = [];
    for (let d = 0; d < 6; d++) {
      const n = neighbor({ q: t.q, r: t.r }, d);
      const nid = tileId(n.q, n.r);
      const ns = byId.get(nid);
      let type: 'sea' | 'land';
      if (t.base === 'sea') type = 'sea';
      else if (t.base === 'land') type = 'land';
      else {
        // auto: derive from neighbour
        if (t.seaEdges?.includes(d)) type = 'sea';
        else if (t.landEdges?.includes(d)) type = 'land';
        else if (ns && ns.base === 'sea') type = 'sea';
        else if (ns && ns.base === 'land') type = 'land';
        else if (ns && ns.base === 'auto') {
          const other = oppositeDir(d);
          type = ns.seaEdges?.includes(other) ? 'sea' : 'land';
        } else type = 'land';
      }
      const edge: Edge = { type };
      if (type === 'land' && mountains.has(`${id}|${nid}`)) edge.mountain = true;
      edges.push(edge);
    }
    const tile: Tile = {
      id,
      q: t.q,
      r: t.r,
      edges,
      city: null,
      resources: [...(t.resources ?? [])],
      ...(t.tint ? { tint: t.tint } : {}),
      ...(t.river ? { river: t.river } : {}),
    };
    if (t.city) {
      const owner = t.city.slot === 'neutral' ? undefined : slotOwners[t.city.slot];
      tile.city = {
        name: t.city.name,
        slot: t.city.slot === 'neutral' ? null : t.city.slot,
        level: t.city.level ?? 1,
        ownerId: owner ?? null,
        walls: t.city.walls ?? false,
        temple: false,
        university: false,
      };
    }
    tiles[id] = tile;
  }
  // river edges (decision 117): land edges between two river tiles, or between a river and a city on its bank
  for (const tile of Object.values(tiles)) {
    for (let d = 0; d < 6; d++) {
      const n = neighbor({ q: tile.q, r: tile.r }, d);
      const other = tiles[tileId(n.q, n.r)];
      const e = tile.edges[d];
      if (!other || e.type !== 'land' || e.mountain) continue;
      if ((tile.river && (other.river || other.city)) || (tile.city && other.river)) e.river = true;
    }
  }

  validateTiles(tiles, spec.id);
  return tiles;
}

/** Ensure every shared edge agrees on type between the two tiles. */
export function validateTiles(tiles: Record<TileId, Tile>, label = 'map'): void {
  for (const tile of Object.values(tiles)) {
    for (let d = 0; d < 6; d++) {
      const n = neighbor({ q: tile.q, r: tile.r }, d);
      const other = tiles[tileId(n.q, n.r)];
      if (!other) continue;
      const mine = tile.edges[d];
      const theirs = other.edges[oppositeDir(d)];
      if (mine.type !== theirs.type) {
        throw new Error(`${label}: edge mismatch between ${tile.id} (dir ${d}: ${mine.type}) and ${other.id} (${theirs.type})`);
      }
      if (!!mine.mountain !== !!theirs.mountain) {
        throw new Error(`${label}: mountain mismatch between ${tile.id} and ${other.id}`);
      }
      if (!!mine.river !== !!theirs.river) {
        throw new Error(`${label}: river mismatch between ${tile.id} and ${other.id}`);
      }
    }
  }
}

export interface WedgeConfig {
  /** faction id prefix, e.g. "white" -> slot "purple" becomes "white-purple" */
  slotPrefix: string;
  /** maps the wedge's city name keys to real names */
  names: Record<string, string>;
}

/** Expand a wedge into a full 3-fold symmetric map. Tiles in `center` are not rotated. */
export function symmetricMap(id: string, name: string, center: TileSpec[], wedge: TileSpec[], wedgeMountains: MountainSpec[], wedges: [WedgeConfig, WedgeConfig, WedgeConfig]): MapSpec {
  const tiles: TileSpec[] = [...center];
  const mountains: MountainSpec[] = [];
  for (let k = 0; k < 3; k++) {
    const cfg = wedges[k];
    for (const t of wedge) {
      const rt = rotateSpec(t, k);
      if (rt.city) {
        const realName = cfg.names[rt.city.name] ?? `${rt.city.name} ${k + 1}`;
        const slot = rt.city.slot === 'neutral' ? 'neutral' : `${cfg.slotPrefix}-${rt.city.slot}`;
        rt.city = { ...rt.city, slot, name: realName };
      }
      tiles.push(rt);
    }
    for (const m of wedgeMountains) mountains.push(rotateMountain(m, k));
  }
  return { id, name, tiles, mountains };
}

/** Human-readable label for a tile: city name or coordinates. */
export function tileLabel(tile: Tile): string {
  return tile.city ? tile.city.name : `(${tile.q},${tile.r})`;
}

/** Directions in which two tile ids are adjacent (-1 if not adjacent). */
export function adjacentDir(a: TileId, b: TileId): number {
  const pa = parseTileId(a);
  const pb = parseTileId(b);
  for (let i = 0; i < 6; i++) {
    const d = DIRECTIONS[i];
    if (pa.q + d.q === pb.q && pa.r + d.r === pb.r) return i;
  }
  return -1;
}
