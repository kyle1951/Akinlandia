import { describe, expect, it } from 'vitest';
import { buildTiles, validateTiles } from '../src/engine/map';
import { EURASIA_MAP } from '../src/data/eurasiaMap';
import { runBotGame } from '../src/bots/runner';

describe('the Eurasia map', () => {
  it('builds with consistent edges, 31 cities and 18 starting cities', () => {
    const tiles = buildTiles(EURASIA_MAP, {});
    expect(() => validateTiles(tiles, 'eurasia')).not.toThrow();
    const cities = Object.values(tiles).filter((t) => t.city);
    expect(cities.length).toBe(31);
    expect(cities.filter((t) => t.city!.slot).length).toBe(18);
    expect(Object.values(tiles).some((t) => t.edges.some((e) => e.mountain))).toBe(true);
  });

  it('plays complete bot games with 3, 6 and 9 players', () => {
    for (const [seed, players] of [[401, 3], [402, 6], [403, 9]] as const) {
      const s = runBotGame(seed, players, { checkInvariants: true, config: { mapId: 'eurasia' } });
      expect(s.phase).toBe('gameOver');
    }
  });
});
