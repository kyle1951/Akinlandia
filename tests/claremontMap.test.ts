import { describe, expect, it } from 'vitest';
import { buildTiles } from '../src/engine/map';
import { hexDistance } from '../src/engine/hex';
import { createGame } from '../src/engine/setup';
import { MAPS } from '../src/data/quickstartMap';
import { botConfig, runBotGame } from '../src/bots/runner';

describe('the Claremont Colleges map (decision 113)', () => {
  const m = MAPS.claremont;
  const tiles = buildTiles(m.spec, {});
  const cities = Object.values(tiles).filter((t) => t.city);
  const starts = cities.filter((t) => t.city!.slot);
  const open = cities.filter((t) => !t.city!.slot);
  const nations = [...new Set(starts.map((t) => t.city!.slot!))];
  const teamOf = (slot: string) => slot.split('-')[0];
  const dNation = (slot: string, t: (typeof cities)[number]) => Math.min(...starts.filter((s) => s.city!.slot === slot).map((s) => hexDistance(s, t)));

  it('is landlocked, with two starting cities for each of nine nations and eighteen open cities', () => {
    expect(Object.values(tiles).some((t) => t.edges.some((e) => e.type === 'sea'))).toBe(false);
    expect(nations).toHaveLength(9);
    for (const n of nations) expect(starts.filter((t) => t.city!.slot === n)).toHaveLength(2);
    expect(open).toHaveLength(18);
  });

  it('gives every nation one open city to take within a turn and two contested ones, three per pair of teams', () => {
    const grabs: Record<string, string[]> = {};
    const contested: Record<string, string[]> = {};
    const pairs: Record<string, number> = {};
    for (const t of open) {
      const d = Object.fromEntries(nations.map((n) => [n, dNation(n, t)]));
      const best = Math.min(...Object.values(d));
      const nearest = nations.filter((n) => d[n] === best);
      const rest = Math.min(...nations.filter((n) => !nearest.includes(n)).map((n) => d[n]));
      if (nearest.length === 1) {
        expect(best, `${t.city!.name}: more than a turn's march away`).toBeLessThanOrEqual(2);
        expect(rest, `${t.city!.name}: another nation within reach on the first turn`).toBeGreaterThanOrEqual(3);
        (grabs[nearest[0]] ??= []).push(t.city!.name);
      } else {
        expect(nearest, `${t.city!.name} is not shared by exactly two nations`).toHaveLength(2);
        expect(teamOf(nearest[0]), `${t.city!.name} is shared by allies`).not.toBe(teamOf(nearest[1]));
        expect(rest, t.city!.name).toBeGreaterThan(best);
        for (const n of nearest) (contested[n] ??= []).push(t.city!.name);
        const key = [teamOf(nearest[0]), teamOf(nearest[1])].sort().join('-');
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
    }
    for (const n of nations) {
      expect(grabs[n], n).toHaveLength(1);
      expect(contested[n], n).toHaveLength(2);
    }
    expect(pairs).toEqual({ 'black-green': 3, 'black-white': 3, 'green-white': 3 });
  });

  it('names the nations and groups them in three teams of three', () => {
    const s = createGame(botConfig(9, { mapId: 'claremont' }), 1);
    const names = (a: string) => Object.values(s.factions).filter((f) => f.allianceId === a).map((f) => `${f.name}${f.royal ? '*' : ''}`);
    expect(names('black')).toEqual(['North Quad Networkers*', 'Grinders of Galileo', 'Feelers of Fowler']);
    expect(names('white')).toEqual(['The Frary Feast*', 'Monologuers of Marston', 'Munchers of Mound']);
    expect(names('green')).toEqual(['Dissertators of Drucker*', 'Pipette Priests of Kresge', 'Hushers of Honnold']);
  });

  it('follows the real map: who is north of Foothill and which side of 6th St each campus lies on (decision 118)', () => {
    const row = (name: string) => {
      const t = cities.find((c) => c.city!.name === name)!;
      return t.r + (t.q - (t.q & 1)) / 2;
    };
    const street = (name: string) => Object.values(tiles).filter((t) => t.river === name).map((t) => t.r + (t.q - (t.q & 1)) / 2);
    const foothill = Math.max(...street('Foothill Blvd'));
    const sixth = Math.min(...street('6th St'));
    for (const n of ['Kresge Chapel', 'Botanic Garden', 'The Tropical Lei']) expect(row(n), n).toBeLessThan(foothill);
    for (const n of ['Frary', 'Walker Beach', 'Collins', 'North Quad', 'Honnold Library', 'Galileo Hall', 'Grove House']) expect(row(n), n).toBeGreaterThan(foothill);
    for (const n of ['Frary', 'Walker Beach', 'Collins', 'Honnold Library']) expect(row(n), n).toBeLessThan(sixth);
    for (const n of ['Frank', 'Oldenborg', 'Marston Quad', 'The Old Village', 'The New Village', 'Riggs School']) expect(row(n), n).toBeGreaterThan(sixth);
  });

  it('plays complete bot games with three to nine leaders in both military modes', () => {
    for (const [seed, players, militaryMode] of [
      [31, 3, 'simultaneous'],
      [32, 6, 'sequential'],
      [33, 9, 'simultaneous'],
      [34, 9, 'sequential'],
    ] as const) {
      const s = runBotGame(seed, players, { config: { mapId: 'claremont', militaryMode }, checkInvariants: true });
      expect(s.phase).toBe('gameOver');
    }
  });
});
