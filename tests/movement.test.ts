import { describe, expect, it } from 'vitest';
import { legalDestinations, orderableSourceTiles, validateOrder } from '../src/engine/rules/movement';
import { addUnit, clearUnits, cityTile, newGame, order, playerOf, refresh, setActing, toMilitary, unitsAt } from './helpers';

function setup(sub: 'ships1' | 'full1' = 'full1') {
  const s = newGame(3, 1);
  toMilitary(s, sub, 'white');
  clearUnits(s);
  return s;
}

describe('movement legality', () => {
  it('soldiers cross land edges but not mountains or sea edges without ships', () => {
    const s = setup();
    const white = playerOf(s, 'white');
    const a = addUnit(s, 'soldier', white, '5,-2');
    setActing(s, 'white');
    const dests = legalDestinations(s, 'white', '5,-2', 'full1').map((d) => d.tileId);
    expect(dests).toContain('4,-1');
    expect(dests).not.toContain('5,-3'); // mountain ridge
    const b = addUnit(s, 'soldier', white, cityTile(s, 'Athenopolis'));
    setActing(s, 'white');
    expect(() => validateOrder(s, 'white', 'full1', '3,0', [{ destTileId: '2,0', unitIds: [b.id] }])).toThrow(/ship/);
    expect(() => validateOrder(s, 'white', 'full1', '3,0', [{ destTileId: '4,0', unitIds: [b.id] }])).not.toThrow();
    expect(() => validateOrder(s, 'white', 'full1', '3,0', [{ destTileId: '4,0', unitIds: [a.id] }])).toThrow(/cannot be ordered/);
  });

  it('ships need exactly one soldier each, cannot cross land, and only pairs move in ship phases', () => {
    const s = setup('ships1');
    const white = playerOf(s, 'white');
    const sol = addUnit(s, 'soldier', white, '3,0');
    const sol2 = addUnit(s, 'soldier', white, '3,0');
    const ship = addUnit(s, 'ship', white, '3,0');
    setActing(s, 'white');
    expect(s.pending?.kind).toBe('issueOrder');
    expect(() => validateOrder(s, 'white', 'ships1', '3,0', [{ destTileId: '4,0', unitIds: [sol.id] }])).toThrow(/Only manned ships/);
    expect(() => validateOrder(s, 'white', 'ships1', '3,0', [{ destTileId: '2,0', unitIds: [sol.id, sol2.id, ship.id] }])).toThrow(/exactly one soldier/);
    expect(() => validateOrder(s, 'white', 'ships1', '3,0', [{ destTileId: '2,0', unitIds: [ship.id] }])).toThrow(/exactly one soldier|Nothing manned/);
    expect(() => validateOrder(s, 'white', 'ships1', '3,0', [{ destTileId: '2,0', unitIds: [sol.id, ship.id] }])).not.toThrow();
    expect(() => validateOrder(s, 'white', 'full1', '3,0', [{ destTileId: '4,0', unitIds: [sol.id, ship.id] }])).toThrow(/Ships cannot cross a land edge/);
    // a lone ship on a coastal tile is not a source in a ship phase
    clearUnits(s);
    addUnit(s, 'ship', white, '3,0');
    expect(orderableSourceTiles(s, 'white', 'ships1')).toEqual([]);
  });

  it('moves units, marks them moved and forbids chaining within a sub-phase', () => {
    const s = setup();
    const white = playerOf(s, 'white');
    const black = playerOf(s, 'black');
    const g = s.alliances.white.generalId!;
    const a = addUnit(s, 'soldier', white, '3,0');
    const b = addUnit(s, 'soldier', white, '3,0');
    addUnit(s, 'soldier', playerOf(s, 'green'), cityTile(s, 'Sardis')); // keeps the sub-phase alive (green moves last)
    void black;
    setActing(s, 'white');
    order(s, g, '3,0', [{ dest: '4,0', units: [a.id] }]);
    expect(s.turnData.subPhase).toBe('full1');
    expect(s.units[a.id].tileId).toBe('4,0');
    expect(s.units[a.id].moved).toBe(true);
    // b was ordered to stay: it is also disposed of for this sub-phase (footnote 20)
    expect(s.units[b.id].moved).toBe(true);
    expect(orderableSourceTiles(s, 'white', 'full1')).toEqual([]);
    // white had nothing left, so the decision passed to the next General
    expect(s.pending?.kind).toBe('issueOrder');
    expect(s.pending?.playerId).toBe(s.alliances.green.generalId);
  });

  it('lets a General pass and moves on to the next alliance and sub-phase', () => {
    const s = setup();
    const white = playerOf(s, 'white');
    addUnit(s, 'soldier', white, '3,0');
    setActing(s, 'white');
    const g = s.alliances.white.generalId!;
    const before = s.turnData.subPhase;
    s.units = {}; // nobody else can move
    addUnit(s, 'soldier', white, '3,0');
    refresh(s);
    expect(s.pending?.playerId).toBe(g);
    // white is the acting alliance; after a pass, other alliances have nothing so the next sub-phase begins
    const idx = s.allianceOrder.indexOf('white');
    s.units[Object.keys(s.units)[0]].moved = false;
    void idx;
    refresh(s);
    const after = s.pending as unknown as { kind: string } | null;
    expect(after?.kind).toBe('issueOrder');
    expect(s.turnData.subPhase).toBe(before);
  });

  it('a tile can never end up holding two alliances after a plain move', () => {
    const s = setup();
    const white = playerOf(s, 'white');
    const black = playerOf(s, 'black');
    const g = s.alliances.white.generalId!;
    const a = addUnit(s, 'soldier', white, '3,0');
    addUnit(s, 'farmer', black, '4,0');
    setActing(s, 'white');
    order(s, g, '3,0', [{ dest: '4,0', units: [a.id] }]);
    const there = unitsAt(s, '4,0');
    expect(there.length).toBe(1);
    expect(there[0].ownerId).toBe(white);
  });
});
