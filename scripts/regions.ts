/**
 * Split a preset map into three homelands of equal expansion potential and
 * report what each holds. Used to place alliances fairly (decision 104).
 * usage: npx vite-node scripts/regions.ts <mapId>
 * Prints each homeland's land, fields and cities, then a proposed SLOTS block
 * (and any faction short of private fields, with its private tiles).
 */
import { buildTiles } from '../src/engine/map';
import { hexDistance, neighbor, oppositeDir, tileId } from '../src/engine/hex';
import { MAPS } from '../src/data/quickstartMap';
import type { Tile } from '../src/engine/types';

const mapId = process.argv[2] ?? 'table2026';
const tiles = buildTiles(MAPS[mapId].spec, {});
const RAW = new Set(['wood', 'stone', 'iron']);
const land = Object.values(tiles).filter((t) => t.city || t.edges.some((e) => e.type === 'land'));
const worth = (t: Tile) => 1 + (t.resources.includes('wheat') ? 2 : 0) + (t.resources.some((r) => RAW.has(r)) ? 1 : 0) + (t.city ? 3 : 0);

// seeds: the three land tiles farthest apart (greedy), then weighted k-means with a balance term
let seeds = [land[0]];
while (seeds.length < 3) seeds.push(land.reduce((b, t) => (Math.min(...seeds.map((s) => hexDistance(s, t))) > Math.min(...seeds.map((s) => hexDistance(s, b))) ? t : b)));
let assign = new Map<string, number>();
const total = land.reduce((s, t) => s + worth(t), 0);
for (let it = 0; it < 60; it++) {
  const load = [0, 0, 0];
  const order = [...land].sort((a, b) => Math.min(...seeds.map((s) => hexDistance(s, a))) - Math.min(...seeds.map((s) => hexDistance(s, b))));
  assign = new Map();
  for (const t of order) {
    // nearest seed, penalising regions that already hold more than a third
    const k = [0, 1, 2].reduce((b, i) => {
      const cost = (i: number) => hexDistance(seeds[i], t) + 4 * Math.max(0, load[i] - total / 3) / 10;
      return cost(i) < cost(b) ? i : b;
    }, 0);
    assign.set(t.id, k);
    load[k] += worth(t);
  }
  // move each seed to the member tile minimising total distance to its region
  seeds = [0, 1, 2].map((k) => {
    const members = land.filter((t) => assign.get(t.id) === k);
    return members.reduce((b, c) => (members.reduce((s, m) => s + hexDistance(c, m), 0) < members.reduce((s, m) => s + hexDistance(b, m), 0) ? c : b));
  });
}
// contiguity check: count land-connected components per region
const summary = [0, 1, 2].map((k) => {
  const members = land.filter((t) => assign.get(t.id) === k);
  const ids = new Set(members.map((t) => t.id));
  let comps = 0;
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.id)) continue;
    comps++;
    const st = [m.id];
    while (st.length) {
      const id = st.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (let d = 0; d < 6; d++) {
        const n = neighbor(tiles[id], d);
        const nid = tileId(n.q, n.r);
        if (ids.has(nid) && !seen.has(nid)) st.push(nid);
      }
    }
  }
  const cities = members.filter((t) => t.city);
  return {
    region: k,
    seed: seeds[k].id,
    landTiles: members.length,
    wheat: members.filter((t) => t.resources.includes('wheat')).length,
    raw: members.filter((t) => t.resources.some((r) => RAW.has(r))).length,
    cities: cities.length,
    coastalCities: cities.filter((t) => t.edges.some((e) => e.type === 'sea')).length,
    worth: members.reduce((s, t) => s + worth(t), 0),
    pieces: comps,
    cityList: cities.map((c) => `${c.city!.name}(${c.id})`).join(' '),
  };
});
for (const s of summary) console.log(JSON.stringify(s));

// ---- place three starting pairs per homeland (decision 104)
function landReach(start: string): Set<string> {
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
      if (!nt || t.edges[dir].type !== 'land' || t.edges[dir].mountain || nt.edges[oppositeDir(dir)].mountain) continue;
      if (!best.has(nid)) {
        best.set(nid, d + 1);
        q.push(nid);
      }
    }
  }
  return new Set(best.keys());
}
const coastal = (t: Tile) => t.edges.some((e) => e.type === 'sea');
type P = { a: Tile; b: Tile; area: Set<string> };
const allianceOfRegion = ['green', 'white', 'black']; // region 0 archipelago, 1 west, 2 centre/south-east
const chosenAll: { alliance: string; pairs: P[] }[] = [];
for (const alliance of ['white', 'black', 'green']) {
  const k = allianceOfRegion.indexOf(alliance);
  const cs = land.filter((t) => t.city && assign.get(t.id) === k);
  const pairs: P[] = [];
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++)
      if (hexDistance(cs[i], cs[j]) <= 4 && (coastal(cs[i]) || coastal(cs[j]))) pairs.push({ a: cs[i], b: cs[j], area: new Set([...landReach(cs[i].id), ...landReach(cs[j].id)]) });
  let best: { trio: P[]; score: number } | null = null;
  for (let x = 0; x < pairs.length; x++)
    for (let y = x + 1; y < pairs.length; y++)
      for (let z = y + 1; z < pairs.length; z++) {
        const trio = [pairs[x], pairs[y], pairs[z]];
        const ids = trio.flatMap((p) => [p.a, p.b]);
        if (new Set(ids.map((t) => t.id)).size !== 6) continue;
        let bad = false;
        for (let u = 0; u < 3 && !bad; u++) for (let w = u + 1; w < 3 && !bad; w++) for (const m of [trio[u].a, trio[u].b]) for (const n of [trio[w].a, trio[w].b]) if (hexDistance(m, n) < 2) bad = true;
        if (bad) continue;
        const priv = trio.map((p, u) => {
          let wh = 0, rw = 0;
          for (const t of p.area) {
            if (ids.some((c) => c.id === t) && t !== p.a.id && t !== p.b.id) continue;
            if (trio.some((o, v) => v !== u && o.area.has(t))) continue;
            if (tiles[t].resources.includes('wheat')) wh++;
            if (tiles[t].resources.some((r) => RAW.has(r))) rw++;
          }
          return { wh, rw, val: 2 * wh + rw };
        });
        const deficit = priv.reduce((d, p) => d + Math.max(0, 2 - p.wh) + Math.max(0, 1 - p.rw), 0);
        const vals = priv.map((p) => p.val);
        const score = -100 * deficit + Math.min(...vals) * 3 - (Math.max(...vals) - Math.min(...vals)) * 2;
        if (!best || score > best.score) best = { trio, score };
      }
  if (!best) {
    console.log(`${alliance}: no layout meets the rules in its homeland`);
    continue;
  }
  chosenAll.push({ alliance, pairs: best.trio });
  if (best.score < -50) {
    // report what each pair is short of
    const ids = best.trio.flatMap((p) => [p.a, p.b]);
    best.trio.forEach((p, u) => {
      let wh = 0, rw = 0;
      const privTiles: string[] = [];
      for (const t of p.area) {
        if (ids.some((c) => c.id === t) && t !== p.a.id && t !== p.b.id) continue;
        if (best!.trio.some((o, v) => v !== u && o.area.has(t))) continue;
        privTiles.push(`${t}[${tiles[t].resources.join('+') || '-'}${tiles[t].city ? ' city' : ''}]`);
        if (tiles[t].resources.includes('wheat')) wh++;
        if (tiles[t].resources.some((r) => RAW.has(r))) rw++;
      }
      console.log(`SHORT ${alliance} ${p.a.city!.name}+${p.b.city!.name}: private wheat ${wh} raw ${rw}; private tiles ${privTiles.join(' ')}`);
    });
  }
}
// purple (starts as General) takes the pair with the least private land in its alliance
const lines: string[] = [];
for (const { alliance, pairs } of chosenAll) {
  const scored = pairs.map((p) => ({ p, v: [...p.area].reduce((s, t) => s + (tiles[t].resources.includes('wheat') ? 2 : 0) + (tiles[t].resources.some((r) => RAW.has(r)) ? 1 : 0), 0) }));
  scored.sort((x, y) => x.v - y.v);
  scored.forEach(({ p }, role) => {
    const slot = `${alliance}-${['purple', 'second', 'third'][role]}`;
    lines.push(`  '${p.a.id}': '${slot}', // ${p.a.city!.name}`, `  '${p.b.id}': '${slot}', // ${p.b.city!.name}`);
  });
}
console.log('SLOTS\n' + lines.join('\n'));
