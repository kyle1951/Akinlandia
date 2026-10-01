/**
 * Generator for the Claremont Colleges preset map (decision 113). Writes src/data/claremontMap.ts.
 *
 * usage: npx vite-node scripts/genClaremont.ts [--write]
 *
 * Nine nations in three teams of three, traced from the campus map and its
 * neighbourhood (the Villages to the west, the Botanic Garden to the north):
 *   Black = CMS: CMC (royal), Harvey Mudd, Scripps
 *
 * As on campus: Mudd across the north; Scripps (west) and Pitzer (east) below it,
 * north of 9th Street; CMC in the band south of both, the eastern-most nation;
 * the Consortium and Pomona North to CMC's west; Pomona South along the south;
 * KGI and the School of Theology south-east, below CMC's fields.
 *   White = the Sagehens: Pomona North Campus (royal), Pomona South Campus, Pitzer
 *   Green = the Grad Schools: CGU (royal), KGI with the School of Theology, the Consortium
 *
 * Every nation starts with two cities. Of the eighteen open cities, nine are
 * first-turn grabs (next to one nation's starting city, at least three hexes
 * from every other nation's) and nine are contested (equally far from two
 * nations of different teams, farther from everyone else: three for each pair
 * of teams, two for each nation). The generator places the open cities by
 * those rules and fails loudly when it cannot. Every nation has three wheat and
 * three raw-material tiles that only its own farmers can reach; other ground is
 * barren apart from the fields each open city needs.
 *
 * TERRAIN is an offset grid (x = column west->east, y = row north->south;
 * flat-top hexes, odd columns sit half a hex lower). Letters mark each nation's
 * ground (for its tint); n is neutral ground, v the Villages, . off the board.
 * Claremont is landlocked and flat: no sea, no mountains. Four streets run as
 * navigable rivers one hex wide (decision 117): Foothill Blvd along the north
 * (the Botanic Garden beyond it), Claremont Blvd down the east side, Dartmouth
 * Ave from Foothill past Honnold Library to 6th St, and 6th St between Pomona
 * and the colleges to its north (digits in TERRAIN, named in STREETS). No open
 * field lies on a street; Honnold Library stands on Dartmouth, and a contested city
 * may stand on one where two nations meet across it.
 */
import { writeFileSync } from 'fs';
import { hexDistance, tileId } from '../src/engine/hex';

const TERRAIN = [
  '......nnnnnn.......',
  '....111111111111111',
  '....GGGG3MMMMMMMZZ2',
  '....GGGG3MMMMMMMZZ2',
  '....GGGG3SSSSZZZZZ2',
  '....GGGG3SSSSZZZZZ2',
  '....GGGG3SSSSZZZZZ2',
  '..vv..GG3SSSSZZZZZ2',
  '.vvv..UU3UCCCCCCCC2',
  'vvvvNNUU3NCCCCCCCC2',
  'vvvvNNNN3NnCCCCCCC2',
  'vvvv666666666666666',
  'vvvvNNNNNNnnnCCCCC.',
  'vvvvPPPPPPnnKKKKC..',
  'vvvvPPPPPPPPKKKK...',
  '.vvvPPPPPPPPKKKK...',
  '..vvPPPPPPPPPP.....',
  '....P.P.P.P.P.P....',
];

/** the streets, as navigable rivers one hex wide (decision 117): digit in TERRAIN -> name */
const STREETS: Record<string, string> = { '1': 'Foothill Blvd', '2': 'Claremont Blvd', '3': 'Dartmouth Ave', '6': '6th St' };
const STREET_TINT = '#c9cdd1';

type Nation = 'C' | 'M' | 'S' | 'N' | 'P' | 'Z' | 'G' | 'K' | 'U';
type Cls = Nation | 'n' | 'v' | '1' | '2' | '3' | '6';

interface NationDef {
  slot: string;
  team: 'black' | 'white' | 'green';
  college: string;
  name: string;
  color: string;
  tint: string;
  royal: boolean;
  /** two starting cities: [x, y, name] */
  starts: [number, number, string][];
  /** the open city next door it can take on the first turn */
  grab: string;
}

// names from the table (2026-09-30); the Grad Schools' in the same spirit
const NATIONS: Record<Nation, NationDef> = {
  C: { slot: 'black-purple', team: 'black', college: 'CMC', name: 'North Quad Networkers', color: '#8a1538', tint: '#cfa3a8', royal: true, starts: [[15, 8, 'North Quad'], [12, 9, 'Collins']], grab: 'The Athenaeum' },
  M: { slot: 'black-orange', team: 'black', college: 'Harvey Mudd', name: 'Grinders of Galileo', color: '#e0a100', tint: '#e9d596', royal: false, starts: [[9, 2, 'Galileo Hall'], [13, 2, 'Hixon Court']], grab: 'The Mall' },
  S: { slot: 'black-gold', team: 'black', college: 'Scripps', name: 'Feelers of Fowler', color: '#3f7f5f', tint: '#a9ccb4', royal: false, starts: [[11, 6, 'Seal Court'], [9, 5, 'Denison Library']], grab: 'Fowler Garden' },
  N: { slot: 'white-purple', team: 'white', college: 'Pomona North Campus', name: 'The Frary Feast', color: '#1f4e9c', tint: '#a8bfdf', royal: true, starts: [[7, 12, 'Frary'], [10, 12, 'Walker Beach']], grab: 'Smith Campus Center' },
  P: { slot: 'white-crimson', team: 'white', college: 'Pomona South Campus', name: 'Monologuers of Marston', color: '#4aa3df', tint: '#c9dbf0', royal: false, starts: [[6, 15, 'Frank'], [10, 15, 'Oldenborg']], grab: 'Marston Quad' },
  Z: { slot: 'white-azure', team: 'white', college: 'Pitzer', name: 'Munchers of Mound', color: '#f47b20', tint: '#f3c49a', royal: false, starts: [[16, 4, 'Grove House'], [14, 6, 'Mead Hall']], grab: 'The Mounds' },
  G: { slot: 'green-purple', team: 'green', college: 'CGU', name: 'Dissertators of Drucker', color: '#c8102e', tint: '#e8aaa8', royal: true, starts: [[6, 3, 'Harper Hall'], [6, 6, 'Stauffer Hall']], grab: 'Drucker School' },
  K: { slot: 'green-rose', team: 'green', college: 'KGI and Claremont School of Theology', name: 'Pipette Priests of Kresge', color: '#1b8a84', tint: '#a9d6d3', royal: false, starts: [[14, 14, 'Riggs School'], [12, 14, 'Kresge Chapel']], grab: 'Theology Library' },
  U: { slot: 'green-teal', team: 'green', college: 'the Claremont University Consortium', name: 'Hushers of Honnold', color: '#6a3d9a', tint: '#cdb9e2', royal: false, starts: [[8, 8, 'Honnold Library'], [5, 10, 'Huntley Bookstore']], grab: 'The Old Village' },
};

/** contested open cities: [nation, nation, name]; two nations of different teams each */
const CONTESTED: [Nation, Nation, string][] = [
  ['S', 'Z', 'Keck Science'],
  ['M', 'Z', 'The Tropical Lei'],
  ['C', 'N', 'Big Bridges'],
  ['M', 'G', 'Botanic Garden'],
  ['S', 'G', 'The Motley'],
  ['C', 'K', 'Roberts Pavilion'],
  ['N', 'U', '21 Choices'],
  ['P', 'U', 'The New Village'],
  ['P', 'K', 'Strehle Track'],
];

const VILLAGE_TINT = '#d9d0bf';

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
const ids = [...cellAt.keys()].sort();
const qr = (id: string) => ({ q: Number(id.split(',')[0]), r: Number(id.split(',')[1]) });
const clsOf = (id: string) => cellAt.get(id)!.cls;
const onStreet = (id: string) => clsOf(id) in STREETS;
const dist = (a: string, b: string) => hexDistance(qr(a), qr(b));
const problems: string[] = [];

// ---- starting cities
const nations = Object.keys(NATIONS) as Nation[];
const cityAt = new Map<string, string>();
const startOf = new Map<string, Nation>();
for (const n of nations) {
  for (const [x, y, name] of NATIONS[n].starts) {
    const a = axial(x, y);
    const id = tileId(a.q, a.r);
    if (!cellAt.has(id)) problems.push(`${name} at (${x},${y}) is off the board`);
    cityAt.set(id, name);
    startOf.set(id, n);
  }
}
const startsOf = (n: Nation) => [...startOf].filter(([, m]) => m === n).map(([id]) => id);
const dNation = (n: Nation, t: string) => Math.min(...startsOf(n).map((s) => dist(s, t)));
for (const n of nations) {
  const [a, b] = startsOf(n);
  if (dist(a, b) > 4) problems.push(`${NATIONS[n].college}: starting cities ${dist(a, b)} apart`);
  for (const m of nations) if (m !== n) for (const s of startsOf(m)) if (dNation(n, s) < 2) problems.push(`${NATIONS[n].college} is adjacent to ${NATIONS[m].college}`);
}

// ---- open cities, placed by rule
const openOf = new Map<string, { kind: 'grab'; nation: Nation } | { kind: 'contested'; pair: [Nation, Nation] }>();
const farFromCities = (t: string, except: string[] = []) => [...cityAt.keys()].every((c) => except.includes(c) || dist(c, t) >= 2);
for (const [x, y, name] of CONTESTED) {
  let best: { id: string; score: number } | null = null;
  for (const t of ids) {
    if (cityAt.has(t)) continue;
    const dx = dNation(x, t);
    if (dx !== dNation(y, t) || dx < 2 || dx > 4) continue;
    const others = Math.min(...nations.filter((m) => m !== x && m !== y).map((m) => dNation(m, t)));
    if (others <= dx || !farFromCities(t)) continue;
    // a contested city may stand on a street where two nations meet across it, but would rather not
    const score = -dx * 10 + Math.min(others - dx, 3) * 3 + (clsOf(t) === 'n' || clsOf(t) === 'v' ? 1 : 0) - (onStreet(t) ? 2 : 0);
    if (!best || score > best.score || (score === best.score && t < best.id)) best = { id: t, score };
  }
  if (!best) {
    // show the near misses: tiles equally far from both, with the nearest third nation's distance
    const near = ids
      .filter((t) => !cityAt.has(t) && dNation(x, t) === dNation(y, t) && dNation(x, t) <= 4)
      .map((t) => {
        const c = cellAt.get(t)!;
        const third = nations.filter((m) => m !== x && m !== y).sort((a, b) => dNation(a, t) - dNation(b, t))[0];
        return `(${c.x},${c.y}) d=${dNation(x, t)} ${NATIONS[third].college} ${dNation(third, t)}${farFromCities(t) ? '' : ' next to a city'}`;
      });
    problems.push(`no contested city fits between ${NATIONS[x].college} and ${NATIONS[y].college} (${name}); near misses: ${near.join('; ')}`);
  } else {
    cityAt.set(best.id, name);
    openOf.set(best.id, { kind: 'contested', pair: [x, y] });
  }
}
// first-turn cities last: they have far more room than contested ones
for (const n of nations) {
  let best: { id: string; score: number } | null = null;
  for (const t of ids) {
    if (cityAt.has(t) || onStreet(t) || dNation(n, t) !== 1) continue;
    const others = Math.min(...nations.filter((m) => m !== n).map((m) => dNation(m, t)));
    if (others < 3) continue;
    const near = startsOf(n).filter((s) => dist(s, t) === 1);
    if (!farFromCities(t, near)) continue;
    const score = others * 10 + (clsOf(t) === n ? 2 : 0);
    if (!best || score > best.score || (score === best.score && t < best.id)) best = { id: t, score };
  }
  if (!best) problems.push(`no first-turn city fits next to ${NATIONS[n].college}`);
  else {
    cityAt.set(best.id, NATIONS[n].grab);
    openOf.set(best.id, { kind: 'grab', nation: n });
  }
}
const cityIds = [...cityAt.keys()];

// ---- farmer reach (land distance 2; no water or mountains anywhere)
const reach = (start: string) => new Set(ids.filter((t) => dist(start, t) <= 2));
const AREA = new Map(nations.map((n) => [n, new Set(startsOf(n).flatMap((s) => [...reach(s)]))]));
const starting = new Set(startOf.keys());
/** tiles only this nation's farmers can reach (decision 104) */
const privateOf = (n: Nation) => [...AREA.get(n)!].filter((t) => !(starting.has(t) && startOf.get(t) !== n) && !nations.some((m) => m !== n && AREA.get(m)!.has(t)));
const privateSet = new Set(nations.flatMap((n) => privateOf(n)));

// ---- resources
const resources = new Map<string, Set<'wheat' | 'wood' | 'stone' | 'iron'>>();
for (const id of ids) resources.set(id, new Set());
const hasWheat = (id: string) => resources.get(id)!.has('wheat');
const hasRaw = (id: string) => [...resources.get(id)!].some((r) => r !== 'wheat');
const raws = ['wood', 'stone', 'iron'] as const;
let rawK = 0;
const addRaw = (id: string) => resources.get(id)!.add(raws[rawK++ % 3]);
function spread(pool: string[], count: number, kind: 'wheat' | 'raw') {
  const has = kind === 'wheat' ? hasWheat : hasRaw;
  while (pool.filter(has).length < count) {
    const chosen = pool.filter(has);
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const id of pool) {
      if (has(id) || cityAt.has(id) || onStreet(id)) continue;
      const dmin = chosen.length ? Math.min(...chosen.map((x) => dist(x, id))) : 9;
      const near = Math.min(...cityIds.map((c) => dist(c, id)));
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
const PRIVATE_WHEAT = Number(process.env.WHEAT ?? 3);
const PRIVATE_RAW = Number(process.env.RAW ?? 3);
// 1. each open city gets two wheat and one raw (decision 101), from ground no nation holds alone
//    (failing that, from the private ground of the nation or nations it lies between, which counts toward their totals)
for (const city of cityIds.filter((id) => !startOf.has(id))) {
  const o = openOf.get(city)!;
  const own = new Set(o.kind === 'grab' ? privateOf(o.nation) : [...privateOf(o.pair[0]), ...privateOf(o.pair[1])]);
  const byDistance = (a: string, b: string) => dist(city, b) - dist(city, a) || (a < b ? -1 : 1);
  const shared = [...reach(city)].filter((t) => t !== city && !cityAt.has(t) && !onStreet(t) && !privateSet.has(t)).sort(byDistance);
  const area = [...shared, ...[...reach(city)].filter((t) => !cityAt.has(t) && !onStreet(t) && own.has(t)).sort(byDistance)];
  for (const t of area) if (area.filter(hasWheat).length < 2 && !hasWheat(t)) resources.get(t)!.add('wheat');
  for (const t of area) if (area.filter(hasRaw).length < 1 && !hasRaw(t)) addRaw(t);
  if (area.filter(hasWheat).length < 2 || area.filter(hasRaw).length < 1) problems.push(`${cityAt.get(city)} cannot be given fields outside private ground`);
}
// 2. each nation: two wheat and one raw by each starting city, then its private ground topped up
for (const n of nations) {
  const priv = privateOf(n).filter((t) => !cityAt.has(t) && !onStreet(t));
  for (const city of startsOf(n)) spread(priv.filter((t) => dist(t, city) <= 2), 2, 'wheat');
  for (const city of startsOf(n)) spread(priv.filter((t) => dist(t, city) <= 2), 1, 'raw');
  spread(priv, PRIVATE_WHEAT, 'wheat');
  spread(priv, PRIVATE_RAW, 'raw');
  if (priv.filter(hasWheat).length < PRIVATE_WHEAT || priv.filter(hasRaw).length < PRIVATE_RAW) problems.push(`${NATIONS[n].college} has only ${priv.length} private tiles`);
}

// ---- report
for (const n of nations) {
  const priv = privateOf(n);
  const grab = [...openOf].find(([, o]) => o.kind === 'grab' && o.nation === n)?.[0];
  const contested = [...openOf].filter(([, o]) => o.kind === 'contested' && o.pair.includes(n)).map(([id]) => cityAt.get(id));
  console.log(
    `${NATIONS[n].college.padEnd(22)} ${NATIONS[n].slot.padEnd(14)} ${startsOf(n).map((s) => cityAt.get(s)).join(' + ').padEnd(36)} grab ${grab ? cityAt.get(grab) : '-'}; contested ${contested.join(', ')}; private wheat ${priv.filter(hasWheat).length} raw ${priv.filter(hasRaw).length}`,
  );
}
const ports = cityIds.filter((c) => onStreet(c) || ids.some((t) => onStreet(t) && dist(t, c) === 1));
console.log(`riverside cities (ships can be built): ${ports.map((c) => cityAt.get(c)).join(', ')}`);
console.log(`${ids.length} tiles, ${cityIds.length} cities (${starting.size} starting, ${openOf.size} open)`);
if (problems.length) {
  console.log('PROBLEMS\n' + problems.join('\n'));
  process.exitCode = 1;
}

// ---- emit
if (process.argv.includes('--write') && problems.length === 0) {
  const sorted = [...ids].sort((a, b) => {
    const A = cellAt.get(a)!;
    const B = cellAt.get(b)!;
    return A.y - B.y || A.x - B.x;
  });
  const rows = sorted.map((id) => {
    const { q, r } = qr(id);
    const res = [...resources.get(id)!].map((x) => ({ wheat: 'w', wood: 't', stone: 's', iron: 'i' })[x]).join('');
    const city = cityAt.get(id);
    const start = startOf.get(id);
    return `  [${q}, ${r}, '${clsOf(id)}', '${res}'${city ? `, ${JSON.stringify(city)}` : ''}${start ? `, '${NATIONS[start].slot}'` : ''}],`;
  });
  const tints = Object.fromEntries([...nations.map((n) => [n, NATIONS[n].tint]), ['v', VILLAGE_TINT], ...Object.keys(STREETS).map((k) => [k, STREET_TINT])]);
  const factions = nations.map((n) => {
    const d = NATIONS[n];
    return `  { id: '${d.slot}', allianceId: '${d.team}', name: ${JSON.stringify(d.name)}, color: '${d.color}', royal: ${d.royal} }, // ${d.college}`;
  });
  const file = `import type { MapSpec, TileSpec } from '../engine/map';
import type { FactionDef } from '../engine/types';

/**
 * The Claremont Colleges (decision 113), generated by scripts/genClaremont.ts:
 * nine nations in three teams of three. Black = CMS (CMC, royal; Harvey Mudd;
 * Scripps), White = the Sagehens (Pomona North, royal; Pomona South; Pitzer),
 * Green = the Grad Schools (CGU, royal; KGI with the School of Theology; the
 * Consortium). Each nation starts with two cities, has one open city next door
 * to take on the first turn and two contested ones shared with a nation of
 * another team, and the same number of wheat and raw-material tiles that only
 * its own farmers can reach.
 * Four streets run as navigable rivers one hex wide (decision 117).
 * Rows are [q, r, ground (nation letter, v village, n neutral, a digit for a street),
 * resources (w wheat, t wood, s stone, i iron), city?, starting faction?].
 */
type Row = [number, number, string, string, string?, string?];

const TINTS: Record<string, string> = ${JSON.stringify(tints)};

const STREETS: Record<string, string> = ${JSON.stringify(STREETS)};

const ROWS: Row[] = [
${rows.join('\n')}
];

function build(): MapSpec {
  const tiles: TileSpec[] = ROWS.map(([q, r, ground, res, city, slot]) => {
    const resources: NonNullable<TileSpec['resources']> = [];
    for (const ch of res) resources.push(({ w: 'wheat', t: 'wood', s: 'stone', i: 'iron' } as const)[ch as 'w']);
    const t: TileSpec = { q, r, base: 'auto', seaEdges: [], resources };
    if (TINTS[ground]) t.tint = TINTS[ground];
    if (STREETS[ground]) t.river = STREETS[ground];
    if (city) t.city = { name: city, slot: slot ?? 'neutral' };
    return t;
  });
  return { id: 'claremont', name: 'The Claremont Colleges', tiles, mountains: [] };
}

export const CLAREMONT_MAP: MapSpec = build();

/** starting cities are keyed by faction id already */
export const CLAREMONT_SLOTS: Record<string, string> = {};

/** the nine nations replace the usual factions on this map */
export const CLAREMONT_FACTIONS: FactionDef[] = [
${factions.join('\n')}
];
`;
  writeFileSync('src/data/claremontMap.ts', file);
  console.log('wrote src/data/claremontMap.ts');
}
