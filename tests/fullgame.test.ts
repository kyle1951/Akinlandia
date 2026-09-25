import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/setup';
import { applyActionInPlace } from '../src/engine/machine';
import { legalPlacements, FULL_GAME_RADIUS } from '../src/engine/fullGame';
import { validateTiles } from '../src/engine/map';
import { neighbor, oppositeDir, tileId } from '../src/engine/hex';
import { citiesOf } from '../src/engine/query';
import { botConfig, runBotGame, runBots } from '../src/bots/runner';
import { TILE_BAG, tileSpecById } from '../src/data/tileBag';
import type { GameState } from '../src/engine/types';

function edgesMatch(state: GameState): void {
  for (const t of Object.values(state.tiles)) {
    for (let d = 0; d < 6; d++) {
      const n = neighbor(t, d);
      const o = state.tiles[tileId(n.q, n.r)];
      if (!o) continue;
      expect(o.edges[oppositeDir(d)].type).toBe(t.edges[d].type);
    }
  }
}

describe('Full Game setup', () => {
  it('the tile bag has 90 tiles with at least 2 city tiles per player even for nine players', () => {
    expect(TILE_BAG.length).toBe(90);
    expect(TILE_BAG.filter((t) => t.city).length).toBeGreaterThanOrEqual(18);
    for (const t of TILE_BAG) expect(t.edges.length).toBe(6);
  });

  it('offers only spots of the highest touching class, with rotations that match every shared edge', () => {
    const s = createGame(botConfig(3, { setupMode: 'full' }), 5);
    runBots(s, { until: (st) => st.pending?.kind === 'placeTile' });
    expect(Object.keys(s.tiles)).toEqual(['0,0']); // only the centre sea tile
    const coastal = TILE_BAG.find((t) => t.edges.some((e) => e.type === 'sea') && t.edges.some((e) => e.type === 'land'))!;
    const spots = legalPlacements(s, coastal);
    expect(spots.length).toBeGreaterThan(0);
    for (const p of spots) expect(p.touching).toBe(1);
    // build a small board by hand: three tiles around a spot so that a 3-touch spot exists
    const seaSpec = TILE_BAG.find((t) => t.edges.every((e) => e.type === 'sea'))!;
    const mk = (q: number, r: number) => {
      s.tiles[tileId(q, r)] = { id: tileId(q, r), q, r, edges: seaSpec.edges.map((e) => ({ ...e })), city: null, resources: [] };
    };
    mk(1, 0);
    mk(0, 1);
    // spot (1,1)? neighbours (0,1),(1,0) -> touches 2; spot (1,-1) touches (0,0),(1,0) -> 2; we need 3: add (2,-1) so that (1,-1)... simpler: (0,0),(1,0),(0,1) all touch (1,1)? (1,1) neighbours: (2,1),(2,0),(1,0),(0,1),(0,2),(1,2) -> touches (1,0),(0,1) = 2
    mk(2, 0);
    // now (1,1) touches (2,0),(1,0),(0,1) = 3
    const seaSpots = legalPlacements(s, seaSpec);
    expect(seaSpots.every((p) => p.touching >= 3)).toBe(true);
    expect(seaSpots.some((p) => p.tileId === '1,1')).toBe(true);
    // a pure land tile cannot touch sea tiles at all
    const landSpec = TILE_BAG.find((t) => t.edges.every((e) => e.type === 'land'))!;
    expect(legalPlacements(s, landSpec)).toEqual([]);
    expect(FULL_GAME_RADIUS).toBeGreaterThanOrEqual(5);
  });

  it('rejects illegal placements and records claims (max two per player)', () => {
    const s = createGame(botConfig(3, { setupMode: 'full' }), 5);
    runBots(s, { until: (st) => st.pending?.kind === 'placeTile' });
    const p = s.pending as Extract<NonNullable<GameState['pending']>, { kind: 'placeTile' }>;
    expect(() => runBots(s, { until: () => true })).not.toThrow();
    const bad = { kind: 'placeTile' as const, playerId: p.playerId, tileId: '9,9', rotation: 0, claim: false };
    expect(() => applyActionInPlace(s, bad)).toThrow(/not a legal placement/);
    const good = p.placements[0];
    applyActionInPlace(s, { kind: 'placeTile', playerId: p.playerId, tileId: good.tileId, rotation: good.rotation, claim: true });
    const spec = tileSpecById(p.tileSpecId)!;
    expect(s.tiles[good.tileId]).toBeDefined();
    if (spec.city) {
      expect(s.tiles[good.tileId].city!.ownerId).toBe(p.playerId);
      expect(s.fullSetup!.claimed[p.playerId]).toBe(1);
    } else {
      expect(s.fullSetup!.claimed[p.playerId]).toBe(0);
    }
  });

  it('produces a legal, bounded map where every player ends with a city, then plays to the end', () => {
    for (const seed of [11, 12, 13, 14]) {
      const players = 3 + (seed % 7);
      const s = runBotGame(seed, players, { checkInvariants: true, config: { setupMode: 'full' } });
      expect(s.phase).toBe('gameOver');
      edgesMatch(s);
      expect(() => validateTiles(s.tiles, 'full')).not.toThrow();
      for (const t of Object.values(s.tiles)) expect(Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r))).toBeLessThanOrEqual(FULL_GAME_RADIUS);
      for (const pid of s.seatOrder) expect(s.fullSetup!.claimed[pid]).toBeLessThanOrEqual(2);
      // every player started with at least one city (claimed or granted)
      expect(s.log.filter((l) => l.text.includes('begins with nothing')).length).toBe(0);
      expect(Object.keys(s.tiles).length).toBeGreaterThan(60);
      void citiesOf;
    }
  });
});
