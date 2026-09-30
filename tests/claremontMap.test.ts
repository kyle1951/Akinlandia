import { describe, expect, it } from 'vitest';
import { buildTiles } from '../src/engine/map';
import { createGame } from '../src/engine/setup';
import { MAPS } from '../src/data/quickstartMap';
import { botConfig, runBotGame } from '../src/bots/runner';

describe('the Claremont Colleges map (decisions 110-111)', () => {
  const m = MAPS.claremont;

  it('builds a landlocked board with two starting cities for each of the nine colleges', () => {
    const tiles = buildTiles(m.spec, {});
    expect(Object.values(tiles).some((t) => t.edges.some((e) => e.type === 'sea'))).toBe(false);
    const bySlot: Record<string, string[]> = {};
    for (const t of Object.values(tiles)) if (t.city?.slot && t.city.slot !== 'neutral') (bySlot[t.city.slot] ??= []).push(t.city.name);
    expect(Object.keys(bySlot).sort()).toEqual(['black-gold', 'black-orange', 'black-purple', 'green-purple', 'green-rose', 'green-teal', 'white-azure', 'white-crimson', 'white-purple']);
    for (const cities of Object.values(bySlot)) expect(cities).toHaveLength(2);
  });

  it('names the factions after the colleges and groups them by athletic conference', () => {
    const s = createGame(botConfig(9, { mapId: 'claremont' }), 1);
    const names = (a: string) => Object.values(s.factions).filter((f) => f.allianceId === a).map((f) => `${f.name}${f.royal ? '*' : ''}`);
    expect(names('black')).toEqual(['CMC*', 'Harvey Mudd', 'KGI']);
    expect(names('white')).toEqual(['Pomona*', 'Pitzer', 'Claremont School of Theology']);
    expect(names('green')).toEqual(['Scripps*', 'CGU', 'The Consortium']);
  });

  it('plays complete bot games with three to nine leaders in both military modes', () => {
    for (const [seed, players, militaryMode] of [
      [31, 3, 'simultaneous'],
      [32, 6, 'sequential'],
      [33, 6, 'simultaneous'],
      [34, 8, 'sequential'],
      [35, 9, 'simultaneous'],
    ] as const) {
      const s = runBotGame(seed, players, { config: { mapId: 'claremont', militaryMode }, checkInvariants: true });
      expect(s.phase).toBe('gameOver');
      expect(Object.values(s.units).some((u) => u.kind === 'ship')).toBe(false);
    }
  });
});
