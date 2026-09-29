import { buildTiles } from '../src/engine/map';
import { hexDistance, neighbor, oppositeDir, tileId } from '../src/engine/hex';
import { MAPS } from '../src/data/quickstartMap';
import type { Tile } from '../src/engine/types';
const mapId = process.argv[2] ?? 'table2026';
const MINEX = Number(process.argv[3] ?? 3), MAXPAIR = Number(process.argv[4] ?? 4);
const tiles = buildTiles(MAPS[mapId].spec, {});
const cities = Object.values(tiles).filter((t) => t.city);
function reach(start: string): Set<string> {
  const best = new Map([[start, 0]]); const q = [start];
  while (q.length) { const id = q.shift()!; const d = best.get(id)!; if (d === 2) continue; const t = tiles[id];
    for (let dir = 0; dir < 6; dir++) { const n = neighbor(t, dir); const nid = tileId(n.q, n.r); const nt = tiles[nid]; if (!nt) continue;
      if (t.edges[dir].type !== 'land' || t.edges[dir].mountain || nt.edges[oppositeDir(dir)].mountain) continue;
      if (!best.has(nid)) { best.set(nid, d + 1); q.push(nid); } } }
  return new Set(best.keys());
}
const isRes = (id: string) => tiles[id].resources.some((r) => r === 'wheat' || r === 'wood' || r === 'stone' || r === 'iron');
const R = new Map(cities.map((c) => [c.id, reach(c.id)]));
// candidate pairs: two cities within distance 4
const pairs: [Tile, Tile][] = [];
for (let i = 0; i < cities.length; i++) for (let j = i + 1; j < cities.length; j++) if (hexDistance(cities[i], cities[j]) <= MAXPAIR) pairs.push([cities[i], cities[j]]);
let best: { slots: [Tile, Tile][]; score: number } | null = null;
function exclusive(slots: [Tile, Tile][], k: number): number {
  const mine = new Set([...R.get(slots[k][0].id)!, ...R.get(slots[k][1].id)!]);
  const others = new Set<string>();
  slots.forEach((s, i) => { if (i !== k) for (const c of s) for (const t of R.get(c.id)!) others.add(t); });
  return [...mine].filter((t) => isRes(t) && !others.has(t) && !(tiles[t].city && !slots[k].some((c) => c.id === t))).length;
}
function ok(slots: [Tile, Tile][]): boolean {
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) for (const a of slots[i]) for (const b of slots[j]) if (hexDistance(a, b) < 2) return false;
  return true;
}
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (let attempt = 0; attempt < 4000; attempt++) {
  const order = [...pairs].sort(() => rnd() - 0.5);
  const slots: [Tile, Tile][] = []; const used = new Set<string>();
  for (const p of order) {
    if (slots.length === 9) break;
    if (used.has(p[0].id) || used.has(p[1].id)) continue;
    const trial = [...slots, p];
    if (!ok(trial)) continue;
    slots.push(p); used.add(p[0].id); used.add(p[1].id);
  }
  if (slots.length < 9) continue;
  const ex = slots.map((_, k) => exclusive(slots, k));
  if (Math.min(...ex) < MINEX) continue;
  const minDist = Math.min(...slots.flatMap((s, i) => slots.slice(i + 1).flatMap((t) => s.flatMap((a) => t.map((b) => hexDistance(a, b))))));
  const score = minDist * 100 + Math.min(...ex) * 10 + ex.reduce((a, b) => a + b, 0);
  if (!best || score > best.score) best = { slots, score };
}
if (!best) { console.log('no assignment found'); process.exit(1); }
// group slots into 3 alliances by geography (greedy k-means on pair centroids)
const cent = best.slots.map((s) => ({ q: (s[0].q + s[1].q) / 2, r: (s[0].r + s[1].r) / 2 }));
let groups = [[0, 1, 2], [3, 4, 5], [6, 7, 8]];
const spread = (g: number[]) => g.flatMap((a) => g.map((b) => hexDistance(cent[a], cent[b]))).reduce((x, y) => x + y, 0);
for (let it = 0; it < 2000; it++) {
  const gi = Math.floor(rnd() * 3), gj = Math.floor(rnd() * 3); if (gi === gj) continue;
  const i = Math.floor(rnd() * 3), j = Math.floor(rnd() * 3);
  const before = spread(groups[gi]) + spread(groups[gj]);
  const ng = groups.map((g) => [...g]); [ng[gi][i], ng[gj][j]] = [ng[gj][j], ng[gi][i]];
  if (spread(ng[gi]) + spread(ng[gj]) < before) groups = ng;
}
const names = ['white', 'black', 'green'];
const out: string[] = [];
groups.forEach((g, ai) => g.forEach((si, k) => { const s = best!.slots[si]; const slot = `${names[ai]}-${['purple', 'second', 'third'][k]}`; for (const c of s) out.push(`  '${c.id}': '${slot}', // ${c.city!.name}`); }));
console.log('score', best.score, 'exclusive', best.slots.map((_, k) => exclusive(best!.slots, k)).join(','));
console.log(out.join('\n'));
