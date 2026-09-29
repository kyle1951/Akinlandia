/**
 * Explain a starting-slot layout: per faction, its cities, private and shared fields,
 * coast access, and every spacing rule it breaks.
 * usage: npx vite-node scripts/slotcheck.ts <mapId> <file with lines like  '5,-1': 'black-purple',>
 *        (omit the file to check the map's own slots)
 */
import { readFileSync } from 'fs';
import { buildTiles } from '../src/engine/map';
import { hexDistance, neighbor, oppositeDir, tileId } from '../src/engine/hex';
import { MAPS } from '../src/data/quickstartMap';

const mapId = process.argv[2] ?? 'table2026';
const tiles = buildTiles(MAPS[mapId].spec, {});
const slots: Record<string, string> = {};
if (process.argv[3]) {
  for (const m of readFileSync(process.argv[3], 'utf-8').matchAll(/'(-?\d+,-?\d+)': '([a-z]+-[a-z]+)'/g)) slots[m[1]] = m[2];
} else {
  for (const t of Object.values(tiles)) if (t.city?.slot) slots[t.id] = t.city.slot;
}
const RAW = new Set(['wood', 'stone', 'iron']);
function reach(start: string): Set<string> {
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
const bySlot: Record<string, string[]> = {};
for (const [id, s] of Object.entries(slots)) (bySlot[s] ??= []).push(id);
const names = Object.keys(bySlot).sort();
const area: Record<string, Set<string>> = {};
for (const s of names) area[s] = new Set(bySlot[s].flatMap((c) => [...reach(c)]));
const cityIds = new Set(Object.keys(slots));
for (const s of names) {
  const cs = bySlot[s];
  let pw = 0, pr = 0, sw = 0, sr = 0;
  const privateTiles: string[] = [];
  for (const t of area[s]) {
    if (cityIds.has(t) && !cs.includes(t)) continue;
    const tt = tiles[t];
    const shared = names.some((o) => o !== s && area[o].has(t));
    if (!shared) privateTiles.push(`${t}[${tt.resources.join('+') || '-'}${tt.city ? ' city' : ''}]`);
    if (tt.resources.includes('wheat')) {
      if (shared) sw++;
      else pw++;
    }
    if (tt.resources.some((r) => RAW.has(r))) {
      if (shared) sr++;
      else pr++;
    }
  }
  const coast = cs.some((c) => tiles[c].edges.some((e) => e.type === 'sea'));
  const pairD = cs.length === 2 ? hexDistance(tiles[cs[0]], tiles[cs[1]]) : -1;
  const near = names.filter((o) => o !== s).flatMap((o) => bySlot[o].flatMap((x) => cs.filter((c) => hexDistance(tiles[c], tiles[x]) < 2).map((c) => `${tiles[c].city!.name}~${tiles[x].city!.name}(${o})`)));
  const probs = [pw < 2 ? `private wheat ${pw}<2` : '', pr < 1 ? `private raw ${pr}<1` : '', !coast ? 'no coast' : '', pairD > 4 ? `pair ${pairD} apart` : '', near.length ? `adjacent rivals: ${near.join(' ')}` : ''].filter(Boolean);
  console.log(`${s.padEnd(13)} ${cs.map((c) => tiles[c].city!.name + ' (' + c + ')').join(' + ').padEnd(40)} private W${pw} R${pr}  shared W${sw} R${sr}  ${probs.length ? '!! ' + probs.join('; ') : 'ok'}`);
  if (probs.length && process.env.SHOW_PRIVATE) console.log(`    private tiles: ${privateTiles.join(' ')}`);
}
