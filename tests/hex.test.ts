import { describe, expect, it } from 'vitest';
import { DIRECTIONS, directionBetween, hexDistance, neighbor, oppositeDir, parseTileId, rotate120, rotateDir120, tileId } from '../src/engine/hex';
import { buildTiles, tileType, validateTiles } from '../src/engine/map';
import type { MapSpec } from '../src/engine/map';
import { QUICK_START_MAP, QUICK_START_SLOTS } from '../src/data/quickstartMap';

describe('hex model', () => {
  it('neighbours are symmetric through opposite edges', () => {
    const a = { q: 2, r: -1 };
    for (let d = 0; d < 6; d++) {
      const n = neighbor(a, d);
      expect(neighbor(n, oppositeDir(d))).toEqual(a);
      expect(directionBetween(a, n)).toBe(d);
      expect(directionBetween(n, a)).toBe(oppositeDir(d));
    }
  });

  it('rotation by 120 degrees has period three and preserves adjacency', () => {
    const a = { q: 3, r: -2 };
    const r1 = rotate120(a);
    const r3 = rotate120(rotate120(r1));
    expect(r3).toEqual(a);
    for (let d = 0; d < 6; d++) {
      const n = neighbor(a, d);
      expect(directionBetween(rotate120(a), rotate120(n))).toBe(rotateDir120(d));
    }
  });

  it('tile ids round trip and distances are cube distances', () => {
    expect(parseTileId(tileId(-3, 5))).toEqual({ q: -3, r: 5 });
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, DIRECTIONS[4])).toBe(1);
  });
});

describe('map builder', () => {
  it('derives tile types from edges and rejects mismatched edges', () => {
    const spec: MapSpec = {
      id: 't',
      name: 't',
      tiles: [
        { q: 0, r: 0, base: 'sea' },
        { q: 1, r: 0, base: 'auto' },
        { q: 2, r: 0, base: 'land' },
      ],
      mountains: [{ a: [1, 0], b: [2, 0] }],
    };
    const tiles = buildTiles(spec, {});
    expect(tileType(tiles['0,0'])).toBe('sea');
    expect(tileType(tiles['1,0'])).toBe('coastal');
    expect(tileType(tiles['2,0'])).toBe('land');
    expect(tiles['1,0'].edges[3].type).toBe('sea'); // toward 0,0
    expect(tiles['1,0'].edges[0].type).toBe('land'); // toward 2,0
    expect(tiles['1,0'].edges[0].mountain).toBe(true);
    expect(tiles['2,0'].edges[3].mountain).toBe(true);
    const bad: MapSpec = { id: 'b', name: 'b', tiles: [{ q: 0, r: 0, base: 'sea' }, { q: 1, r: 0, base: 'land' }], mountains: [] };
    expect(() => buildTiles(bad, {})).toThrow(/mismatch/);
  });

  it('validateTiles accepts the quick start map', () => {
    const tiles = buildTiles(QUICK_START_MAP, {});
    expect(() => validateTiles(tiles)).not.toThrow();
  });
});

describe('quick start map', () => {
  const tiles = buildTiles(QUICK_START_MAP, {});
  it('has 91 tiles, 18 slot cities, 6 neutral cities and 3 islands', () => {
    expect(Object.keys(tiles).length).toBe(91);
    const cities = Object.values(tiles).filter((t) => t.city);
    expect(cities.length).toBe(24);
    const slots = cities.filter((t) => t.city!.slot);
    expect(slots.length).toBe(18);
    expect(new Set(slots.map((t) => t.city!.slot)).size).toBe(9);
    for (const slot of Object.keys(QUICK_START_SLOTS)) expect(slots.filter((t) => t.city!.slot === slot).length).toBe(2);
    const islands = cities.filter((t) => tileType(t) === 'sea');
    expect(islands.length).toBe(3);
  });

  it('gives every faction slot at least one coastal city and nearby wheat and raw materials', () => {
    for (const slot of Object.keys(QUICK_START_SLOTS)) {
      const mine = Object.values(tiles).filter((t) => t.city?.slot === slot);
      expect(mine.some((t) => tileType(t) === 'coastal')).toBe(true);
      // within distance 2 by hex distance there is wheat and a raw material
      const near = Object.values(tiles).filter((t) => mine.some((c) => Math.max(Math.abs(c.q - t.q), Math.abs(c.r - t.r), Math.abs(c.q + c.r - t.q - t.r)) <= 2));
      expect(near.some((t) => t.resources.includes('wheat'))).toBe(true);
      expect(near.some((t) => t.resources.some((r) => r === 'wood' || r === 'stone' || r === 'iron'))).toBe(true);
    }
  });

  it('is three-fold symmetric and has mountains, sea, coastal and land regions', () => {
    let mountains = 0;
    const types = { sea: 0, land: 0, coastal: 0 };
    for (const t of Object.values(tiles)) {
      types[tileType(t)]++;
      for (const e of t.edges) if (e.mountain) mountains++;
      const r = rotate120({ q: t.q, r: t.r });
      const rt = tiles[tileId(r.q, r.r)];
      expect(rt).toBeDefined();
      expect(tileType(rt)).toBe(tileType(t));
      expect(rt.resources).toEqual(t.resources);
      expect(!!rt.city).toBe(!!t.city);
    }
    expect(mountains).toBeGreaterThan(0);
    expect(types.sea).toBeGreaterThan(10);
    expect(types.coastal).toBe(18);
    expect(types.land).toBe(54);
  });
});
