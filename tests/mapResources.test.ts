import { describe, expect, it } from 'vitest';
import { buildTiles } from '../src/engine/map';
import { neighbor, oppositeDir, tileId } from '../src/engine/hex';
import { MAPS } from '../src/data/quickstartMap';
import type { Tile } from '../src/engine/types';

/** Tiles a city's farmers can reach: land distance 2 without mountains, or one ship away (decision 101). */
function farmerReach(tiles: Record<string, Tile>, start: string): string[] {
  const best = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift()!;
    const d = best.get(id)!;
    if (d === 2) continue;
    const t = tiles[id];
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor(t, dir);
      const nid = tileId(n.q, n.r);
      const nt = tiles[nid];
      if (!nt) continue;
      const e = t.edges[dir];
      if (e.type !== 'land' || e.mountain || nt.edges[oppositeDir(dir)].mountain) continue;
      if (!best.has(nid) || best.get(nid)! > d + 1) {
        best.set(nid, d + 1);
        queue.push(nid);
      }
    }
  }
  const out = new Set(best.keys());
  const t = tiles[start];
  for (let dir = 0; dir < 6; dir++) {
    if (t.edges[dir].type !== 'sea') continue;
    const n = neighbor(t, dir);
    const nt = tiles[tileId(n.q, n.r)];
    if (nt && (nt.city || nt.edges.some((e) => e.type === 'land'))) out.add(nt.id);
  }
  return [...out];
}

describe('preset maps give every city a living', () => {
  for (const [id, m] of Object.entries(MAPS)) {
    it(`${id}: every city can reach at least two wheat fields and one raw material`, () => {
      const tiles = buildTiles(m.spec, {});
      const short: string[] = [];
      for (const t of Object.values(tiles)) {
        if (!t.city) continue;
        const r = farmerReach(tiles, t.id);
        const wheat = r.filter((x) => tiles[x].resources.includes('wheat')).length;
        const raw = r.filter((x) => tiles[x].resources.some((z) => z === 'wood' || z === 'stone' || z === 'iron')).length;
        if (wheat < 2 || raw < 1) short.push(`${t.city.name} (${t.id}) wheat=${wheat} raw=${raw}`);
      }
      expect(short).toEqual([]);
    });
  }
});
