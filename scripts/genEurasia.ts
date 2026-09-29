/**
 * Generator for the Eurasia preset map (decision 106). Writes src/data/eurasiaMap.ts.
 *
 * usage: npx vite-node scripts/genEurasia.ts [--write]
 *
 * TERRAIN is drawn on an offset grid (x = column west->east, y = row north->south;
 * flat-top hexes, odd columns sit half a hex lower). Letters mark homelands:
 *   E Europe (White)   M Middle East and India (Black)   A East Asia (Green)
 *   n the shared northern frontier (Siberia and the steppe)   . sea
 * The generator gives every homeland identical numbers of wheat and raw tiles,
 * spread as evenly as possible, runs mountain ridges with passes along every
 * border between different regions, and picks three starting pairs per
 * homeland under the slot rules of decision 104.
 */
import { writeFileSync } from 'fs';
import { hexDistance, neighbor, tileId } from '../src/engine/hex';

const TERRAIN = [
  '..........................',
  '....EE....nnnnnnnnnn......',
  '.E..EE.EEnnnnnnnnnnnnn..A.',
  '.EE..EEEEEnnnnnnnnnnnn..A.',
  '..EEEEEEE.nnnnnnnnAAAA..A.',
  '..EEEEEE...MM.nnnnAAAAA.A.',
  '.EE.E.EE.MMMMMMMnnAAAAA.A.',
  '.EE.E..E.MMMMMMMM.AAAAA...',
  '........MMMM.MMMM.AAAAA...',
  '.........MMM.MMM..AAAA....',
  '..........MM.MMM...AAA....',
  '..........................',
];

// [x, y, name] — real cities at their rough places on the grid
const CITIES: [number, number, string][] = [
  // Europe
  [2, 3, 'London'], [5, 2, 'Stockholm'], [3, 4, 'Paris'], [6, 4, 'Berlin'], [9, 3, 'Moscow'],
  [2, 6, 'Madrid'], [4, 7, 'Rome'], [7, 7, 'Athens'],
  // Middle East and India
  [9, 6, 'Constantinople'], [12, 7, 'Baghdad'], [14, 6, 'Tehran'], [10, 10, 'Mecca'],
  [11, 8, 'Damascus'], [13, 9, 'Bombay'], [16, 8, 'Calcutta'], [15, 10, 'Madras'],
  // East Asia
  [19, 4, 'Peking'], [18, 6, "Xi'an"], [22, 5, 'Seoul'], [22, 7, 'Shanghai'],
  [20, 10, 'Canton'], [18, 8, 'Chengdu'], [24, 3, 'Edo'], [24, 6, 'Nagasaki'],
  // northern frontier (neutral)
  [10, 1, 'Perm'], [11, 4, 'Kazan'], [11, 2, 'Tobolsk'], [14, 2, 'Novosibirsk'], [17, 1, 'Irkutsk'],
  [15, 4, 'Samarkand'], [16, 3, 'Kashgar'],
];

const HOMELANDS = { E: 'white', M: 'black', A: 'green' } as const;
type Cls = 'E' | 'M' | 'A' | 'n';

// ---- grid -> axial
const axial = (x: number, y: number) => ({ q: x, r: y - (x - (x & 1)) / 2 });
const cellAt = new Map<string, { x: number; y: number; cls: Cls | '.' }>();
TERRAIN.forEach((row, y) => [...row].forEach((ch, x) => {
  const a = axial(x, y);
  cellAt.set(tileId(a.q, a.r), { x, y, cls: ch as Cls | '.' });
}));
const isLand = (id: string) => { const c = cellAt.get(id); return !!c && c.cls !== '.'; };
const landIds = [...cellAt.keys()].filter(isLand);
// keep sea cells within 2 of land so the board follows the coastline
const keep = new Set(landIds);
for (const [id, c] of cellAt) {
  if (c.cls !== '.') continue;
  const a = { q: Number(id.split(',')[0]), r: Number(id.split(',')[1]) };
  if (landIds.some((l) => hexDistance(a, { q: Number(l.split(',')[0]), r: Number(l.split(',')[1]) }) <= 1)) keep.add(id);
}
const qr = (id: string) => ({ q: Number(id.split(',')[0]), r: Number(id.split(',')[1]) });
const clsOf = (id: string) => cellAt.get(id)!.cls;

// ---- cities
const cityAt = new Map<string, string>();
const problems: string[] = [];
for (const [x, y, name] of CITIES) {
  const a = axial(x, y);
  const id = tileId(a.q, a.r);
  if (!isLand(id)) problems.push(`${name} at (${x},${y}) is not on land`);
  cityAt.set(id, name);
}
const cityIds = [...cityAt.keys()];
for (let i = 0; i < cityIds.length; i++)
  for (let j = i + 1; j < cityIds.length; j++)
    if (hexDistance(qr(cityIds[i]), qr(cityIds[j])) < 2) problems.push(`${cityAt.get(cityIds[i])} and ${cityAt.get(cityIds[j])} are adjacent`);

// ---- edges: sea toward sea or off-board
const seaEdges = (id: string) => {
  const out: number[] = [];
  for (let d = 0; d < 6; d++) {
    const n = neighbor(qr(id), d);
    const nid = tileId(n.q, n.r);
    if (!isLand(nid) || !keep.has(nid)) out.push(d);
  }
  return out;
};
const isCoastal = (id: string) => isLand(id) && seaEdges(id).length > 0;

// ---- mountains: every land edge between two different regions, leaving every third one as a pass
const borderEdges: Record<string, [string, number][]> = {};
for (const id of landIds) {
  for (let d = 0; d < 3; d++) {
    const n = neighbor(qr(id), d);
    const nid = tileId(n.q, n.r);
    if (!isLand(nid)) continue;
    const a = clsOf(id), b = clsOf(nid);
    if (a === b) continue;
    const key = [a, b].sort().join('');
    (borderEdges[key] ??= []).push([id, d]);
  }
}
const mountains: [string, number][] = [];
for (const key of Object.keys(borderEdges).sort()) {
  const edges = borderEdges[key].sort((u, v) => (u[0] < v[0] ? -1 : u[0] > v[0] ? 1 : u[1] - v[1]));
  edges.forEach((e, i) => { if (i % 3 !== 1) mountains.push(e); });
}
const mountainSet = new Set<string>();
for (const [id, d] of mountains) {
  const n = neighbor(qr(id), d);
  mountainSet.add(`${id}|${tileId(n.q, n.r)}`);
  mountainSet.add(`${tileId(n.q, n.r)}|${id}`);
}

// ---- land reach (distance 2, no mountains, land edges only)
function reach(start: string): Set<string> {
  const best = new Map([[start, 0]]);
  const q = [start];
  while (q.length) {
    const id = q.shift()!;
    const dd = best.get(id)!;
    if (dd === 2) continue;
    for (let d = 0; d < 6; d++) {
      const n = neighbor(qr(id), d);
      const nid = tileId(n.q, n.r);
      if (!isLand(nid) || mountainSet.has(`${id}|${nid}`)) continue;
      if (!best.has(nid)) { best.set(nid, dd + 1); q.push(nid); }
    }
  }
  return new Set(best.keys());
}

// ---- resources: identical counts per homeland, spread by farthest-point sampling
const resources = new Map<string, Set<'wheat' | 'wood' | 'stone' | 'iron'>>();
for (const id of landIds) resources.set(id, new Set());
function spread(ids: string[], count: number, kind: 'wheat' | 'raw', seedIds: string[]) {
  const chosen: string[] = ids.filter((id) => (kind === 'wheat' ? resources.get(id)!.has('wheat') : [...resources.get(id)!].some((r) => r !== 'wheat')));
  const anchors = [...seedIds];
  const pool = ids.filter((id) => !(kind === 'raw' && cityAt.has(id)));
  while (chosen.length < count && chosen.length < pool.length) {
    let best: string | null = null, bestD = -1;
    for (const id of pool) {
      if (chosen.includes(id)) continue;
      const all = [...anchors, ...chosen];
      const dmin = all.length ? Math.min(...all.map((a) => hexDistance(qr(a), qr(id)))) : 99;
      // prefer spreading out, break ties toward the tile nearest a city (so fields feed cities)
      const near = Math.min(...cityIds.map((c) => hexDistance(qr(c), qr(id))));
      const score = dmin * 10 - near;
      if (score > bestD || (score === bestD && id < best!)) { bestD = score; best = id; }
    }
    chosen.push(best!);
  }
  const raws = ['wood', 'stone', 'iron'] as const;
  chosen.forEach((id, i) => {
    const set = resources.get(id)!;
    if (kind === 'wheat') set.add('wheat');
    else if (![...set].some((r) => r !== 'wheat')) set.add(raws[i % 3]);
  });
}
/** every city first gets two wheat and one raw tile within its land reach, inside its own region */
function guaranteeCities(c: Cls) {
  const raws = ['wood', 'stone', 'iron'] as const;
  let k = 0;
  for (const city of cityIds.filter((id) => clsOf(id) === c)) {
    const area = [...reach(city)].filter((t) => clsOf(t) === c).sort((a, b) => hexDistance(qr(city), qr(b)) - hexDistance(qr(city), qr(a)));
    const wheat = () => area.filter((t) => resources.get(t)!.has('wheat')).length;
    const raw = () => area.filter((t) => [...resources.get(t)!].some((r) => r !== 'wheat')).length;
    for (const t of area) if (wheat() < 2 && !resources.get(t)!.has('wheat')) resources.get(t)!.add('wheat');
    for (const t of area) if (raw() < 1 && !cityAt.has(t)) resources.get(t)!.add(raws[k++ % 3]);
  }
}
const regionIds = (c: Cls) => landIds.filter((id) => clsOf(id) === c);
const WHEAT_PER_HOMELAND = Number(process.env.WHEAT ?? 20);
const RAW_PER_HOMELAND = Number(process.env.RAW ?? 11);
for (const c of ['E', 'M', 'A', 'n'] as Cls[]) guaranteeCities(c);
for (const c of ['E', 'M', 'A'] as Cls[]) {
  spread(regionIds(c), WHEAT_PER_HOMELAND, 'wheat', []);
  spread(regionIds(c), RAW_PER_HOMELAND, 'raw', []);
}
const nIds = regionIds('n');
spread(nIds, Math.round(nIds.length * 0.35), 'wheat', []);
spread(nIds, Math.round(nIds.length * 0.35), 'raw', []);

// ---- starting pairs per homeland (decision 104 rules)
const hasWheat = (id: string) => resources.get(id)!.has('wheat');
const hasRaw = (id: string) => [...resources.get(id)!].some((r) => r !== 'wheat');
const REACH = new Map(cityIds.map((c) => [c, reach(c)]));
const slots: Record<string, string> = {};
const summary: string[] = [];
for (const [cls, alliance] of Object.entries(HOMELANDS)) {
  const cs = cityIds.filter((c) => clsOf(c) === cls);
  type P = { a: string; b: string; area: Set<string> };
  const pairs: P[] = [];
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++)
      if (hexDistance(qr(cs[i]), qr(cs[j])) <= 4 && (isCoastal(cs[i]) || isCoastal(cs[j])))
        pairs.push({ a: cs[i], b: cs[j], area: new Set([...REACH.get(cs[i])!, ...REACH.get(cs[j])!]) });
  let best: { trio: P[]; priv: { w: number; r: number }[]; score: number } | null = null;
  for (let x = 0; x < pairs.length; x++)
    for (let y = x + 1; y < pairs.length; y++)
      for (let z = y + 1; z < pairs.length; z++) {
        const trio = [pairs[x], pairs[y], pairs[z]];
        const ids = trio.flatMap((p) => [p.a, p.b]);
        if (new Set(ids).size !== 6) continue;
        let bad = false;
        for (let u = 0; u < 3; u++) for (let v = u + 1; v < 3; v++) for (const m of [trio[u].a, trio[u].b]) for (const n of [trio[v].a, trio[v].b]) if (hexDistance(qr(m), qr(n)) < 2) bad = true;
        if (bad) continue;
        const priv = trio.map((p, u) => {
          let w = 0, r = 0;
          for (const t of p.area) {
            if (cityAt.has(t) && ids.includes(t) && t !== p.a && t !== p.b) continue;
            if (trio.some((o, v) => v !== u && o.area.has(t))) continue;
            if (hasWheat(t)) w++;
            if (hasRaw(t)) r++;
          }
          return { w, r };
        });
        const deficit = priv.reduce((s, p) => s + Math.max(0, 2 - p.w) + Math.max(0, 1 - p.r), 0);
        const vals = priv.map((p) => 2 * p.w + p.r);
        const score = -100 * deficit + 3 * Math.min(...vals) - 2 * (Math.max(...vals) - Math.min(...vals));
        if (!best || score > best.score) best = { trio, priv, score };
      }
  if (!best) { problems.push(`${alliance}: no three starting pairs fit`); continue; }
  // purple (starts as General) takes the pair with the least private land
  const order = best.trio.map((p, i) => ({ p, v: 2 * best!.priv[i].w + best!.priv[i].r, i })).sort((a, b) => a.v - b.v);
  order.forEach(({ p, i }, role) => {
    const slot = `${alliance}-${['purple', 'second', 'third'][role]}`;
    slots[p.a] = slot;
    slots[p.b] = slot;
    const pr = best!.priv[i];
    summary.push(`${slot.padEnd(13)} ${cityAt.get(p.a)} + ${cityAt.get(p.b)}  private wheat ${pr.w} raw ${pr.r}${pr.w < 2 || pr.r < 1 ? '  !! SHORT' : ''}`);
  });
}

// ---- report
const counts = (c: Cls) => { const ids = regionIds(c); return `${c}: land ${ids.length}, wheat ${ids.filter(hasWheat).length}, raw ${ids.filter(hasRaw).length}, cities ${ids.filter((i) => cityAt.has(i)).length}, coastal cities ${ids.filter((i) => cityAt.has(i) && isCoastal(i)).length}`; };
console.log(['E', 'M', 'A', 'n'].map((c) => counts(c as Cls)).join('\n'));
console.log(`tiles ${keep.size} (land ${landIds.length}), mountains ${mountains.length}, cities ${cityIds.length}`);
console.log(summary.join('\n'));
if (problems.length) console.log('PROBLEMS\n' + problems.join('\n'));

// ---- emit
if (process.argv.includes('--write')) {
  const rows: string[] = [];
  const ids = [...keep].sort((a, b) => { const A = cellAt.get(a)!, B = cellAt.get(b)!; return A.y - B.y || A.x - B.x; });
  for (const id of ids) {
    const { q, r } = qr(id);
    const c = cellAt.get(id)!;
    const sea = [0, 1, 2, 3, 4, 5].map((d) => (c.cls === '.' || seaEdges(id).includes(d) ? 'S' : 'L')).join('');
    const res = c.cls === '.' ? '' : [...resources.get(id)!].map((x) => ({ wheat: 'w', wood: 't', stone: 's', iron: 'i' })[x]).join('');
    const city = cityAt.get(id);
    rows.push(`  [${q}, ${r}, '${sea}', '${res}'${city ? `, ${JSON.stringify(city)}` : ''}],`);
  }
  const mts = mountains.map(([id, d]) => { const n = neighbor(qr(id), d); return `  [[${id}], [${n.q}, ${n.r}]],`; });
  const slotLines = Object.entries(slots).sort((a, b) => a[1].localeCompare(b[1])).map(([id, s]) => `  '${id}': '${s}', // ${cityAt.get(id)}`);
  const file = `import type { MapSpec, TileSpec } from '../engine/map';

/**
 * Eurasia (decision 106): the continent from Britain to Japan, generated by
 * scripts/genEurasia.ts. White holds Europe, Black the Middle East and India,
 * Green East Asia; Siberia and the steppe are a shared frontier of neutral
 * cities. Every homeland has the same number of wheat and raw-material tiles,
 * mountain ridges with passes run along every regional border, and the
 * starting pairs follow the slot rules of decision 104.
 * Rows are [q, r, sea edges (6 letters, S sea / L land, one per direction), resources, city?].
 * Resources: w wheat, t wood, s stone, i iron.
 */
type Row = [number, number, string, string, string?];

const ROWS: Row[] = [
${rows.join('\n')}
];

const MOUNTAINS: [[number, number], [number, number]][] = [
${mts.join('\n')}
];

const SLOTS: Record<string, string> = {
${slotLines.join('\n')}
};

function build(): MapSpec {
  const tiles: TileSpec[] = ROWS.map(([q, r, sea, res, city]) => {
    const seaEdges = [...sea].map((c, i) => (c === 'S' ? i : -1)).filter((d) => d >= 0);
    const resources: NonNullable<TileSpec['resources']> = [];
    for (const ch of res) resources.push(({ w: 'wheat', t: 'wood', s: 'stone', i: 'iron', f: 'fish' } as const)[ch as 'w']);
    const t: TileSpec = { q, r, base: seaEdges.length === 6 ? 'sea' : 'auto', seaEdges, resources };
    if (city) t.city = { name: city, slot: SLOTS[\`\${q},\${r}\`] ?? 'neutral' };
    return t;
  });
  return { id: 'eurasia', name: 'Eurasia', tiles, mountains: MOUNTAINS.map(([a, b]) => ({ a, b })) };
}

export const EURASIA_MAP: MapSpec = build();

export const EURASIA_SLOTS: Record<string, string> = {
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
`;
  writeFileSync('src/data/eurasiaMap.ts', file);
  console.log('wrote src/data/eurasiaMap.ts');
}
