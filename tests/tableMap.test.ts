import { describe, expect, it } from 'vitest';
import { buildTiles, validateTiles, tileType } from '../src/engine/map';
import { TABLE_MAP, TABLE_SLOTS } from '../src/data/tableMap';
import { runBotGame } from '../src/bots/runner';

describe('the Table of 2026 map', () => {
  const tiles = buildTiles(TABLE_MAP, {});

  it('builds with consistent edges and the expected structure', () => {
    expect(() => validateTiles(tiles, 'table2026')).not.toThrow();
    const cities = Object.values(tiles).filter((t) => t.city);
    expect(Object.keys(tiles).length).toBeGreaterThan(85);
    expect(cities.length).toBeGreaterThanOrEqual(28);
    const slots = cities.filter((t) => t.city!.slot);
    expect(slots.length).toBe(18);
    for (const slot of Object.keys(TABLE_SLOTS)) expect(slots.filter((t) => t.city!.slot === slot).length).toBe(2);
    const types = { sea: 0, land: 0, coastal: 0 };
    for (const t of Object.values(tiles)) types[tileType(t)]++;
    expect(types.sea).toBeGreaterThan(8);
    expect(types.coastal).toBeGreaterThan(20);
    expect(types.land).toBeGreaterThan(20);
    expect(Object.values(tiles).some((t) => t.edges.some((e) => e.mountain))).toBe(true);
  });

  it('plays complete bot games with every player count', () => {
    for (const [seed, players] of [[301, 3], [302, 6], [303, 9]] as const) {
      const s = runBotGame(seed, players, { checkInvariants: true, config: { mapId: 'table2026' } });
      expect(s.phase).toBe('gameOver');
      expect(s.result).not.toBeNull();
    }
  });
});
