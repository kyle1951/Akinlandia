import { describe, expect, it } from 'vitest';
import { buildTiles } from '../src/engine/map';
import { hexDistance, neighbor, oppositeDir, tileId } from '../src/engine/hex';
import { MAPS } from '../src/data/quickstartMap';
import type { Tile } from '../src/engine/types';

/**
 * Starting-slot rules (decision 104): no rival starting cities adjacent, a
 * faction's two cities within 4 of each other, at least one coastal city per
 * faction, and at least two wheat tiles and one raw-material tile that only
 * that faction's farmers can reach, so the deployment order cannot starve it.
 */
function landReach(tiles: Record<string, Tile>, start: string): Set<string> {
  const best = new Map([[start, 0]]);
  const q = [start];
  while (q.length) {
    const id = q.shift()!;
    const d = best.get(id)!;
    if (d === 2) continue;
    const t = tiles[id];
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbor(t, dir);
      const nid = tileId(n.q, n.r);
      const nt = tiles[nid];
      if (!nt) continue;
      if (t.edges[dir].type !== 'land' || t.edges[dir].mountain || nt.edges[oppositeDir(dir)].mountain) continue;
      if (!best.has(nid)) {
        best.set(nid, d + 1);
        q.push(nid);
      }
    }
  }
  return new Set(best.keys());
}

describe('starting slots are equitable', () => {
  for (const mapId of ['table2026']) {
    it(`${mapId}: every faction has room of its own`, () => {
      const tiles = buildTiles(MAPS[mapId].spec, {});
      const bySlot: Record<string, Tile[]> = {};
      for (const t of Object.values(tiles)) if (t.city?.slot) (bySlot[t.city.slot] ??= []).push(t);
      const slots = Object.keys(bySlot);
      expect(slots.length).toBe(9);
      const area = Object.fromEntries(slots.map((s) => [s, new Set(bySlot[s].flatMap((c) => [...landReach(tiles, c.id)]))]));
      const starting = new Set(Object.values(bySlot).flat().map((t) => t.id));
      const problems: string[] = [];
      for (const s of slots) {
        const cs = bySlot[s];
        if (cs.length !== 2) problems.push(`${s} has ${cs.length} cities`);
        if (hexDistance(cs[0], cs[1]) > 4) problems.push(`${s} cities are ${hexDistance(cs[0], cs[1])} apart`);
        if (!cs.some((c) => c.edges.some((e) => e.type === 'sea'))) problems.push(`${s} has no coastal city`);
        for (const o of slots) if (o !== s) for (const a of cs) for (const b of bySlot[o]) if (hexDistance(a, b) < 2) problems.push(`${a.city!.name} (${s}) is adjacent to ${b.city!.name} (${o})`);
        let wheat = 0, raw = 0;
        for (const t of area[s]) {
          if (starting.has(t) && !cs.some((c) => c.id === t)) continue;
          if (slots.some((o) => o !== s && area[o].has(t))) continue;
          if (tiles[t].resources.includes('wheat')) wheat++;
          if (tiles[t].resources.some((r) => r === 'wood' || r === 'stone' || r === 'iron')) raw++;
        }
        if (wheat < 2) problems.push(`${s} has only ${wheat} private wheat`);
        if (raw < 1) problems.push(`${s} has no private raw material`);
      }
      expect(problems).toEqual([]);
    });
  }
});
