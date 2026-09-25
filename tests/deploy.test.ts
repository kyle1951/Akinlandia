import { describe, expect, it } from 'vitest';
import { farmerLandReach, legalFarmerTiles, legalShipTiles, legalSoldierTiles, checkBuildingPlacements } from '../src/engine/rules/deploy';
import { runBots } from '../src/bots/runner';
import { act, addUnit, clearUnits, cityTile, newGame, playerOf, runUntil } from './helpers';
import { allianceOf } from '../src/engine/query';

describe('farmer placement legality', () => {
  it('reaches land tiles within distance 2 of own cities but not across mountains or sea edges', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    clearUnits(s);
    const reach = farmerLandReach(s, white);
    expect(reach.has(cityTile(s, 'Athenopolis'))).toBe(true); // distance 0
    expect(reach.has('4,0')).toBe(true); // distance 1
    expect(reach.has('5,0')).toBe(true); // distance 2
    expect(reach.has('2,0')).toBe(false); // sea edge from Athenopolis
    expect(reach.has('5,-2')).toBe(true); // distance 1 from Marathon
    expect(reach.has('5,-3')).toBe(false); // behind the mountain ridge (would be distance 2)
    const legal = legalFarmerTiles(s, white).map((t) => t.tileId);
    expect(legal).toContain('4,1'); // neutral Delphi is fine
    expect(legal).not.toContain('2,0'); // open sea never
  });

  it('is blocked by other leaders\' farmers and cities and by enemy units, but not by allied soldiers', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    const black = playerOf(s, 'black');
    clearUnits(s);
    addUnit(s, 'soldier', black, '4,0');
    addUnit(s, 'farmer', black, '4,-1');
    s.tiles['4,1'].city!.ownerId = black; // Delphi becomes another leader's city
    const legal = legalFarmerTiles(s, white).map((t) => t.tileId);
    expect(legal).not.toContain('4,0');
    expect(legal).not.toContain('4,-1');
    expect(legal).not.toContain('4,1');
    expect(legal).toContain('3,1');
    // own farmer occupies a tile: no second farmer
    addUnit(s, 'farmer', white, '3,1');
    expect(legalFarmerTiles(s, white).map((t) => t.tileId)).not.toContain('3,1');
    // allied soldiers (same alliance, 6 player game) guard a field
    const s6 = newGame(6, 2);
    const w1 = playerOf(s6, 'white', 'Purple');
    const w2 = s6.seatOrder.find((p) => p !== w1 && allianceOf(s6, p) === 'white')!;
    clearUnits(s6);
    addUnit(s6, 'soldier', w2, '4,0');
    expect(legalFarmerTiles(s6, w1).map((t) => t.tileId)).toContain('4,0');
  });

  it('reaches tiles through a chain of manned ships (footnote 14)', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    clearUnits(s);
    const aegina = cityTile(s, 'Aegina');
    expect(legalFarmerTiles(s, white).map((t) => t.tileId)).not.toContain(aegina);
    // an unmanned ship does not make a chain
    const ship = addUnit(s, 'ship', white, '2,0');
    expect(legalFarmerTiles(s, white).map((t) => t.tileId)).not.toContain(aegina);
    addUnit(s, 'soldier', white, '2,0');
    const legal = legalFarmerTiles(s, white);
    expect(legal.find((t) => t.tileId === aegina)?.via).toBe('sea');
    // extend the chain one sea tile further: (1,1) then Salamis' neighbour (0,2) is sea, but (1,2) Salamis is reachable
    addUnit(s, 'ship', white, '1,1');
    addUnit(s, 'soldier', white, '1,1');
    expect(legalFarmerTiles(s, white).map((t) => t.tileId)).toContain('1,2');
    // a chain must start next to (or on) the leader's city
    clearUnits(s);
    addUnit(s, 'ship', white, '1,1', { id: ship.id });
    addUnit(s, 'soldier', white, '1,1');
    expect(legalFarmerTiles(s, white).map((t) => t.tileId)).not.toContain('0,2');
  });
});

describe('ship and soldier placement', () => {
  it('ships go only on coastal or island cities, soldiers on any owned city', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    expect(legalShipTiles(s, white)).toEqual([cityTile(s, 'Athenopolis')]);
    expect(legalSoldierTiles(s, white).sort()).toEqual([cityTile(s, 'Athenopolis'), cityTile(s, 'Marathon')].sort());
    s.tiles[cityTile(s, 'Aegina')].city!.ownerId = white;
    expect(legalShipTiles(s, white)).toContain(cityTile(s, 'Aegina'));
  });
});

describe('building placement', () => {
  it('applies placements in the chosen order so a level-up enables an L3 improvement', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    const a = cityTile(s, 'Athenopolis');
    s.tiles[a].city!.level = 2;
    const purchases = { levelUps: 1, temples: 1, universities: 0, walls: 1 };
    expect(checkBuildingPlacements(s, white, purchases, [{ kind: 'temple', tileId: a }])).toMatch(/Level 3/);
    expect(
      checkBuildingPlacements(s, white, purchases, [
        { kind: 'levelUp', tileId: a },
        { kind: 'temple', tileId: a },
        { kind: 'walls', tileId: a },
      ]),
    ).toBeNull();
    expect(checkBuildingPlacements(s, white, purchases, [{ kind: 'walls', tileId: a }, { kind: 'walls', tileId: a }])).toMatch(/No Walls left|already has Walls/);
    expect(checkBuildingPlacements(s, white, purchases, [{ kind: 'levelUp', tileId: '4,0' }])).toMatch(/not a city you control/);
  });
});

describe('deployment flow', () => {
  it('interleaves players across alliances and places farmers up to three at a time', () => {
    const s = newGame(6, 3);
    const seen: { pid: string; count: number }[] = [];
    runBots(s, {
      until: (st) => st.pending?.kind === 'placeBuildings' || st.pending?.kind === 'placeShips' || st.pending?.kind === 'placeSoldiers' || st.phase === 'military',
      onAction: () => {},
    });
    // replay the farmer decisions by scanning the action log with pending reconstructed is complex; instead re-run and record
    const s2 = newGame(6, 3);
    runBots(s2, {
      until: (st) => {
        if (st.pending?.kind === 'placeFarmers') seen.push({ pid: st.pending.playerId, count: st.pending.count });
        return st.pending?.kind === 'placeBuildings' || st.pending?.kind === 'placeShips' || st.pending?.kind === 'placeSoldiers' || st.phase === 'military';
      },
    });
    expect(seen.length).toBeGreaterThan(3);
    for (const d of seen) expect(d.count).toBeLessThanOrEqual(3);
    const firsts = s2.allianceOrder.map((a) => s2.alliances[a].factionOrder[0]);
    // the first decision of each alliance's first player appears in alliance order
    const firstOfEach = s2.allianceOrder.map((a) => seen.find((d) => allianceOf(s2, d.pid) === a)!.pid);
    expect(firstOfEach).toEqual(firsts);
    // consecutive decisions by the same player only happen when other alliances have finished
    for (let i = 1; i < 3 && i < seen.length; i++) expect(seen[i].pid).not.toBe(seen[0].pid);
  });

  it('rejects wrong farmer counts and illegal tiles, then places farmers as units', () => {
    const s = newGame(3, 1);
    runUntil(s, (st) => st.pending?.kind === 'placeFarmers');
    const p = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'placeFarmers' }>;
    expect(() => act(s, { kind: 'placeFarmers', playerId: p.playerId, tileIds: [] })).toThrow(/exactly/);
    expect(() => act(s, { kind: 'placeFarmers', playerId: p.playerId, tileIds: Array(p.count).fill('0,0') })).toThrow(/own tile|not a legal/);
    const tiles = p.legalTiles.slice(0, p.count).map((t) => t.tileId);
    act(s, { kind: 'placeFarmers', playerId: p.playerId, tileIds: tiles });
    for (const t of tiles) expect(Object.values(s.units).some((u) => u.kind === 'farmer' && u.tileId === t && u.ownerId === p.playerId)).toBe(true);
  });

  it('loses farmers that cannot be placed and gives the free politician', () => {
    const s = newGame(3, 1);
    const pid = s.pending!.playerId;
    // strip this player's cities: capacity 0, nothing to place, but still one free card
    for (const t of Object.values(s.tiles)) if (t.city?.ownerId === pid) t.city.ownerId = null;
    act(s, { kind: 'allocate', playerId: pid, allocation: { farmers: 0, soldiers: 0, politicians: 0, ships: 0, levelUps: 0, temples: 0, universities: 0, walls: 0 } });
    runUntil(s, (st) => st.phase === 'military' || st.phase === 'reconciliation' || st.phase === 'politics');
    expect(s.players[pid].hand.length).toBe(1);
  });
});
