import { MAPS } from '../data/quickstartMap';

const EPITHETS = ['the Great', 'the Adequate', 'the Unready', 'the Magnificent', 'the Verbose', 'the Bald', 'the Younger', 'the Pious', 'the Tardy'];

/** The silly leader name a seat starts with: the map's own suggestions if it has any, else "<name> the Epithet". */
export function suggestedLeaderName(mapId: string, seat: number, name: string): string {
  return MAPS[mapId]?.leaderNames?.[seat] ?? `${name} ${EPITHETS[seat % EPITHETS.length]}`;
}

/** Is this still an untouched suggestion (for any map), so switching maps may replace it? */
export function isSuggestedLeaderName(leaderName: string, seat: number, name: string): boolean {
  return Object.keys(MAPS).some((id) => suggestedLeaderName(id, seat, name) === leaderName);
}

/** Re-suggest leader names for a new map, leaving any name someone typed alone. */
export function resuggest<T extends { name: string; leaderName: string }>(seats: T[], mapId: string, keep: (i: number) => boolean = () => false): T[] {
  return seats.map((s, i) => (!keep(i) && isSuggestedLeaderName(s.leaderName, i, s.name) ? { ...s, leaderName: suggestedLeaderName(mapId, i, s.name) } : s));
}
