/**
 * Generator for the Claremont Colleges preset map (decision 110). Writes src/data/claremontMap.ts.
 *
 * usage: npx vite-node scripts/genClaremont.ts [--write]
 *
 * A six-player, landlocked board of the 5Cs traced from the campus map: each
 * college is one faction. The three alliances are the athletic conferences:
 * Black = the Stags (CMC, royal, and Harvey Mudd), White = the Sagehens
 * (Pomona, royal, and Pitzer), Green = Scripps (royal) and CGU.
 *
 * TERRAIN is drawn on an offset grid (x = column west->east, y = row north->south;
 * flat-top hexes, odd columns sit half a hex lower). Letters mark each college's
 * home ground; n is neutral ground (the Claremont University Consortium, north
 * Pomona, the athletic fields); . is off the board. There is no water and no
 * mountain: Claremont is flat and a long way from the sea.
 */
import { writeFileSync } from 'fs';
import { hexDistance, tileId } from '../src/engine/hex';

const TERRAIN = [
  '..GGMMMMMMZZZZ',
  '..GGMMMMMMZZZZ',
  '..GGSSSSSSZZZZ',
  '..GGSSSSSSZZZn',
  '..GGnSSSSSZZnn',
  '..GGnnCCCCCCnn',
  '..nnnnnCCCCCnn',
  'nnnnnnnCCCCnnn',
  'nnnnnnnnCnnnnn',
  'nnnnnnnnnnnnnn',
  'nPPPPPnnnnn.n.',
  'nPPPPPnnnn....',
  'nPPPPnnnnn....',
  'nnPPPnnnnn....',
  'n.n.n.n.n.n...',
];

type Cls = 'G' | 'M' | 'S' | 'Z' | 'C' | 'P' | 'n';
/** each college's home letter and the faction slot it plays */
const COLLEGES: Record<Exclude<Cls, 'n'>, { slot: string; name: string }> = {
  C: { slot: 'black-purple', name: 'CMC' },
  M: { slot: 'black-orange', name: 'Harvey Mudd' },
  P: { slot: 'white-purple', name: 'Pomona' },
  Z: { slot: 'white-crimson', name: 'Pitzer' },
  S: { slot: 'green-purple', name: 'Scripps' },
  G: { slot: 'green-rose', name: 'CGU' },
};

// [x, y, name, college letter for a starting city]
const CITIES: [number, number, string, Cls?][] = [
  // starting cities, two per college
  [7, 6, 'The Ath', 'C'], [10, 6, 'Collins', 'C'],
  [5, 0, 'Hoch-Shanahan', 'M'], [8, 0, 'Platt', 'M'],
  [2, 11, 'Frary', 'P'], [4, 13, 'Frank', 'P'],
  [11, 1, 'McConnell', 'Z'], [12, 3, 'Mead Hall', 'Z'],
  [6, 4, 'Malott Commons', 'S'], [8, 4, 'Denison Library', 'S'],
  [2, 1, 'Harper Hall', 'G'], [3, 4, 'Burkle', 'G'],
  // neutral ground
  [4, 6, 'Honnold Library'], [2, 7, 'Huntley Bookstore'], [5, 9, 'Bridges Auditorium'], [2, 3, 'Stauffer'],
  [12, 6, 'Keck Science'], [12, 9, 'Roberts Pavilion'], [10, 9, 'Zinda Field'], [13, 4, 'Grove House'],
  [7, 12, 'Merritt Field'],
];

/** starting cities that begin behind walls (+1 per defender), to offset a college's exposed position */
const WALLED = new Set((process.env.WALLED ?? '').split(',').filter(Boolean));

// ---- grid -> axial
const axial = (x: number, y: number) => ({ q: x, r: y - (x - (x & 1)) / 2 });
const cellAt = new Map<string, { x: number; y: number; cls: Cls }>();
TERRAIN.forEach((row, y) =>
  [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const a = axial(x, y);
    cellAt.set(tileId(a.q, a.r), { x, y, cls: ch as Cls });
  }),
);
const ids = [...cellAt.keys()];
const qr = (id: string) => ({ q: Number(id.split(',')[0]), r: Number(id.split(',')[1]) });
const clsOf = (id: string) => cellAt.get(id)!.cls;

// ---- cities
const problems: string[] = [];
const cityAt = new Map<string, string>();
const startOf = new Map<string, Cls>();
for (const [x, y, name, college] of CITIES) {
  const a = axial(x, y);
  const id = tileId(a.q, a.r);
  if (!cellAt.has(id)) problems.push(`${name} at (${x},${y}) is off the board`);
  cityAt.set(id, name);
  if (college) startOf.set(id, college);
}
const cityIds = [...cityAt.keys()];
for (let i = 0; i < cityIds.length; i++)
  for (let j = i + 1; j < cityIds.length; j++)
    if (hexDistance(qr(cityIds[i]), qr(cityIds[j])) < 2) problems.push(`${cityAt.get(cityIds[i])} and ${cityAt.get(cityIds[j])} are adjacent`);

// ---- land reach (distance 2; no water, no mountains)
function reach(start: string): Set<string> {
  const out = new Set<string>();
  for (const id of ids) if (hexDistance(qr(start), qr(id)) <= 2) out.add(id);
  return out;
}
const colleges = Object.keys(COLLEGES) as Exclude<Cls, 'n'>[];
const startsOf = (c: Cls) => cityIds.filter((id) => startOf.get(id) === c);
const areaOf = (c: Cls) => new Set(startsOf(c).flatMap((s) => [...reach(s)]));
const AREA = new Map(colleges.map((c) => [c, areaOf(c)]));
const starting = new Set(startOf.keys());
/** tiles only this college's farmers can reach (decision 104) */
const privateOf = (c: Exclude<Cls, 'n'>) =>
  [...AREA.get(c)!].filter((t) => !(starting.has(t) && startOf.get(t) !== c) && !colleges.some((o) => o !== c && AREA.get(o)!.has(t)));

// ---- resources
const resources = new Map<string, Set<'wheat' | 'wood' | 'stone' | 'iron'>>();
for (const id of ids) resources.set(id, new Set());
const hasWheat = (id: string) => resources.get(id)!.has('wheat');
const hasRaw = (id: string) => [...resources.get(id)!].some((r) => r !== 'wheat');
const raws = ['wood', 'stone', 'iron'] as const;
let rawK = 0;
const addRaw = (id: string) => resources.get(id)!.add(raws[rawK++ % 3]);
const far = (from: string) => (a: string, b: string) => hexDistance(qr(from), qr(b)) - hexDistance(qr(from), qr(a));

// Balance by private ground (decision 110): bot games showed that what decides this map is how
// many fields each college's farmers can reach without competition, so every college gets
// exactly the same number of private wheat and raw tiles, and ground that no college holds
// alone stays barren apart from the fields each neutral city needs.
const PRIVATE_WHEAT = Number(process.env.WHEAT ?? 5);
const PRIVATE_RAW = Number(process.env.RAW ?? 3);
const privateSet = new Set(colleges.flatMap((c) => privateOf(c)));
function spread(pool: string[], count: number, kind: 'wheat' | 'raw') {
  const has = kind === 'wheat' ? hasWheat : hasRaw;
  while (pool.filter(has).length < count) {
    const chosen = pool.filter(has);
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of pool) {
      if (has(id) || cityAt.has(id)) continue;
      const dmin = chosen.length ? Math.min(...chosen.map((x) => hexDistance(qr(x), qr(id)))) : 9;
      const near = Math.min(...cityIds.map((c) => hexDistance(qr(c), qr(id))));
      const score = dmin * 10 - near;
      if (score > bestScore || (score === bestScore && best !== null && id < best)) {
        bestScore = score;
        best = id;
      }
    }
    if (!best) break;
    if (kind === 'wheat') resources.get(best)!.add('wheat');
    else addRaw(best);
  }
}
// 1. each neutral city gets two wheat and one raw (decision 101), from ground no college holds alone
for (const city of cityIds.filter((id) => !startOf.has(id))) {
  const area = [...reach(city)].filter((t) => t !== city && !cityAt.has(t) && !privateSet.has(t)).sort(far(city));
  for (const t of area) if (area.filter(hasWheat).length < 2 && !hasWheat(t)) resources.get(t)!.add('wheat');
  for (const t of area) if (area.filter(hasRaw).length < 1 && !hasRaw(t)) addRaw(t);
}
// 2. each college: two wheat and one raw by each starting city, then its private ground topped up
for (const c of colleges) {
  const priv = privateOf(c).filter((t) => !cityAt.has(t));
  for (const city of startsOf(c)) spread(priv.filter((t) => hexDistance(qr(t), qr(city)) <= 2), 2, 'wheat');
  for (const city of startsOf(c)) spread(priv.filter((t) => hexDistance(qr(t), qr(city)) <= 2), 1, 'raw');
  spread(priv, PRIVATE_WHEAT, 'wheat');
  spread(priv, PRIVATE_RAW, 'raw');
  if (priv.length < PRIVATE_WHEAT) problems.push(`${COLLEGES[c].name} has only ${priv.length} private tiles`);
}
const home = (c: Cls) => ids.filter((id) => clsOf(id) === c);
const neutral = home('n');

// ---- report
const slotRules: string[] = [];
for (const c of colleges) {
  const [a, b] = startsOf(c);
  const d = hexDistance(qr(a), qr(b));
  const priv = privateOf(c);
  const pw = priv.filter(hasWheat).length;
  const pr = priv.filter(hasRaw).length;
  const clash = colleges.filter((o) => o !== c).flatMap((o) => startsOf(o).filter((x) => startsOf(c).some((y) => hexDistance(qr(x), qr(y)) < 2)));
  const bad = [d > 4 ? `cities ${d} apart` : '', pw < 2 ? 'wheat' : '', pr < 1 ? 'raw' : '', clash.length ? `adjacent to ${clash.map((x) => cityAt.get(x)).join(', ')}` : ''].filter(Boolean);
  const h = home(c);
  slotRules.push(
    `${COLLEGES[c].name.padEnd(12)} ${COLLEGES[c].slot.padEnd(14)} ${startsOf(c).map((x) => cityAt.get(x)).join(' + ').padEnd(34)} home ${h.length} tiles, wheat ${h.filter(hasWheat).length}, raw ${h.filter(hasRaw).length}; private wheat ${pw} raw ${pr}${bad.length ? '  !! ' + bad.join('; ') : ''}`,
  );
}
// neutral cities by the nearest starting college (ties listed together)
const nearest: Record<string, string[]> = {};
for (const city of cityIds.filter((id) => !startOf.has(id))) {
  const d = Object.fromEntries(colleges.map((c) => [c, Math.min(...startsOf(c).map((s) => hexDistance(qr(s), qr(city))))]));
  const m = Math.min(...Object.values(d));
  const key = colleges.filter((c) => d[c] === m).map((c) => COLLEGES[c].name).join('/');
  (nearest[key] ??= []).push(`${cityAt.get(city)} (${m})`);
}
console.log(slotRules.join('\n'));
console.log(`neutral: ${neutral.length} tiles, wheat ${neutral.filter(hasWheat).length}, raw ${neutral.filter(hasRaw).length}; ${ids.length} tiles, ${cityIds.length} cities`);
console.log('nearest neutral cities:', JSON.stringify(nearest, null, 1));
if (problems.length) console.log('PROBLEMS\n' + problems.join('\n'));

// ---- emit
if (process.argv.includes('--write')) {
  const sorted = [...ids].sort((a, b) => {
    const A = cellAt.get(a)!;
    const B = cellAt.get(b)!;
    return A.y - B.y || A.x - B.x;
  });
  const rows = sorted.map((id) => {
    const { q, r } = qr(id);
    const res = [...resources.get(id)!].map((x) => ({ wheat: 'w', wood: 't', stone: 's', iron: 'i' })[x]).join('');
    const city = cityAt.get(id);
    const college = startOf.get(id);
    const walled = city && WALLED.has(city) ? ', true' : '';
    return `  [${q}, ${r}, '${clsOf(id)}', '${res}'${city ? `, ${JSON.stringify(city)}` : ''}${college ? `, '${COLLEGES[college as Exclude<Cls, 'n'>].slot}'` : walled ? ', undefined' : ''}${walled}],`;
  });
  const file = `import type { MapSpec, TileSpec } from '../engine/map';
import type { FactionDef } from '../engine/types';

/**
 * The Claremont Colleges (decision 110), generated by scripts/genClaremont.ts
 * from the campus map: a landlocked six-player board where each college is a
 * faction. The alliances are the athletic conferences: Black = the Stags (CMC,
 * royal, and Harvey Mudd), White = the Sagehens (Pomona, royal, and Pitzer),
 * Green = Scripps (royal) and CGU. Neutral ground is the Consortium, north
 * Pomona and the athletic fields. Every college's home ground has the same
 * number of wheat and raw-material tiles.
 * Rows are [q, r, ground (college letter or n), resources (w wheat, t wood, s stone,
 * i iron), city?, starting faction?]. Each college's ground is tinted in its colours.
 */
type Row = [number, number, string, string, string?, string?, boolean?];

const TINTS: Record<string, string> = {
  C: '#cfa3a8', // CMC maroon
  M: '#e9d596', // Harvey Mudd gold
  P: '#a8bfdf', // Pomona blue
  Z: '#f3c49a', // Pitzer orange
  S: '#a9ccb4', // Scripps green
  G: '#e8aaa8', // CGU red
};

const ROWS: Row[] = [
${rows.join('\n')}
];

function build(): MapSpec {
  const tiles: TileSpec[] = ROWS.map(([q, r, ground, res, city, slot, walls]) => {
    const resources: NonNullable<TileSpec['resources']> = [];
    for (const ch of res) resources.push(({ w: 'wheat', t: 'wood', s: 'stone', i: 'iron' } as const)[ch as 'w']);
    const t: TileSpec = { q, r, base: 'auto', seaEdges: [], resources };
    if (TINTS[ground]) t.tint = TINTS[ground];
    if (city) t.city = { name: city, slot: slot ?? 'neutral', ...(walls ? { walls: true } : {}) };
    return t;
  });
  return { id: 'claremont', name: 'The Claremont Colleges', tiles, mountains: [] };
}

export const CLAREMONT_MAP: MapSpec = build();

/** starting cities are keyed by faction id already */
export const CLAREMONT_SLOTS: Record<string, string> = {};

/** the six colleges replace the usual faction names and colours on this map */
export const CLAREMONT_FACTIONS: FactionDef[] = [
  { id: 'black-purple', allianceId: 'black', name: 'CMC', color: '#8a1538', royal: true },
  { id: 'black-orange', allianceId: 'black', name: 'Harvey Mudd', color: '#e0a100', royal: false },
  { id: 'white-purple', allianceId: 'white', name: 'Pomona', color: '#1f4e9c', royal: true },
  { id: 'white-crimson', allianceId: 'white', name: 'Pitzer', color: '#f47b20', royal: false },
  { id: 'green-purple', allianceId: 'green', name: 'Scripps', color: '#3f7f5f', royal: true },
  { id: 'green-rose', allianceId: 'green', name: 'CGU', color: '#c8102e', royal: false },
];
`;
  writeFileSync('src/data/claremontMap.ts', file);
  console.log('wrote src/data/claremontMap.ts');
}
