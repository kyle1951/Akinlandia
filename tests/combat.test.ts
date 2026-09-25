import { describe, expect, it } from 'vitest';
import { finalControl } from '../src/engine/rules/combat';
import type { CombatRecord, CombatSide } from '../src/engine/types';
import { act, addUnit, clearUnits, cityTile, lastLog, logHas, newGame, order, playerOf, setActing, setRolls, toMilitary, unitsAt } from './helpers';

/**
 * Every scenario keeps a green "sentinel" soldier far away in Sardis so the
 * sub-phase does not end (and reset moved/spent flags) the moment white's
 * order resolves. Green acts after White in the alliance order.
 */
function setup(seed = 1) {
  const s = newGame(3, seed);
  toMilitary(s, 'full1', 'white');
  clearUnits(s);
  const white = playerOf(s, 'white');
  const black = playerOf(s, 'black');
  const green = playerOf(s, 'green');
  const g = s.alliances.white.generalId!;
  const sentinel = addUnit(s, 'soldier', green, cityTile(s, 'Sardis'));
  return { s, white, black, g, sentinel };
}

describe('combat resolution', () => {
  it('scores dice plus defender bonuses, each 6 is a hit, and logs the calculation', () => {
    const { s, white, black, g, sentinel } = setup();
    const a1 = addUnit(s, 'soldier', white, '3,0');
    const a2 = addUnit(s, 'soldier', white, '3,0');
    addUnit(s, 'soldier', black, '4,0');
    setActing(s, 'white');
    setRolls(s, [6, 6, 3]);
    order(s, g, '3,0', [{ dest: '4,0', units: [a1.id, a2.id] }]);
    expect(lastLog(s, 'Attacker:')).toMatch(/\[6, 6\] = 12/);
    expect(lastLog(s, 'Defender:')).toMatch(/\[3\] = 3 \+ 1 x \(\+2 defending\) = 2 -> score 5/);
    expect(logHas(s, 'Attacker casualties: none')).toBe(true);
    expect(unitsAt(s, '4,0').map((u) => u.ownerId)).toEqual([white, white]);
    expect(Object.values(s.units).filter((u) => u.ownerId === black).length).toBe(0);
    expect(s.units[sentinel.id]).toBeDefined();
    expect(s.units[a1.id].moved).toBe(true);
    expect(s.turnData.subPhase).toBe('full1');
  });

  it('adds +1 per defender in a city and +1 more behind Walls', () => {
    const { s, white, black, g } = setup();
    const delphi = cityTile(s, 'Delphi');
    const a = addUnit(s, 'soldier', white, '3,1'); // adjacent to Delphi (4,1)
    addUnit(s, 'soldier', black, delphi);
    s.tiles[delphi].city!.walls = true;
    setActing(s, 'white');
    setRolls(s, [2, 2]);
    order(s, g, '3,1', [{ dest: delphi, units: [a.id] }]);
    expect(lastLog(s, 'Defender:')).toMatch(/\+2 defending \+1 city \+1 walls\) = 4 -> score 6/);
    expect(lastLog(s, 'Final control')).toMatch(/Defender 6 beats attacker 2/);
    expect(s.units[a.id].tileId).toBe('3,1');
    expect(s.units[a.id].moved).toBe(true);
    expect(s.units[a.id].spent).toBe(false);
  });

  it('a tie goes to the defender and the attacker returns home unspent', () => {
    const { s, white, black, g } = setup();
    const a = addUnit(s, 'soldier', white, '3,0');
    addUnit(s, 'soldier', black, '4,0');
    setActing(s, 'white');
    setRolls(s, [3, 1]); // 3 vs 1+2
    order(s, g, '3,0', [{ dest: '4,0', units: [a.id] }]);
    expect(lastLog(s, 'Final control')).toMatch(/Tied at 3/);
    expect(s.units[a.id].tileId).toBe('3,0');
    expect(s.units[a.id].spent).toBe(false);
  });

  it('when both sides are obliterated the defender retains the tile', () => {
    const { s, white, black, g, sentinel } = setup();
    const a = addUnit(s, 'soldier', white, '3,0');
    addUnit(s, 'soldier', black, '4,0');
    setActing(s, 'white');
    setRolls(s, [6, 6]);
    order(s, g, '3,0', [{ dest: '4,0', units: [a.id] }]);
    expect(lastLog(s, 'Final control')).toMatch(/Both sides were obliterated/);
    expect(Object.keys(s.units)).toEqual([sentinel.id]);
  });

  it('a defender who scores higher but has only spent survivors loses them and the tile', () => {
    const { s, white, black, g } = setup();
    const delphi = cityTile(s, 'Delphi');
    const a1 = addUnit(s, 'soldier', white, '3,1');
    const a2 = addUnit(s, 'soldier', white, '3,1');
    const active = addUnit(s, 'soldier', black, delphi);
    setActing(s, 'white');
    addUnit(s, 'soldier', black, delphi, { spent: true });
    setRolls(s, [1, 6, 5]); // attacker 7 with one hit; defender active rolls 5 -> 5+3 = 8 (higher) but dies
    order(s, g, '3,1', [{ dest: delphi, units: [a1.id, a2.id] }]);
    expect(s.pending?.kind).toBe('assignCasualties');
    act(s, { kind: 'assignCasualties', playerId: s.alliances.black.generalId!, unitIds: [active.id] });
    expect(lastLog(s, 'Final control')).toMatch(/Defender scored 8 to 7 but has no non-spent survivors/);
    expect(unitsAt(s, delphi).every((u) => u.ownerId === white)).toBe(true);
    expect(unitsAt(s, delphi).length).toBe(2);
    expect(s.tiles[delphi].city!.ownerId).toBe(white);
  });

  it('finalControl handles the unreachable "attacker higher but dead" case', () => {
    const { s } = setup();
    const side = (a: 'white' | 'black', ids: string[], score: number): CombatSide => ({ allianceId: a, generalId: 'p0', soldierIds: ids, shipIds: [], dice: [], diceTotal: score, bonus: 0, score, hitsTaken: 0, casualties: [] });
    const c: CombatRecord = { id: 'x', orderId: 'o', subPhase: 'full1', tileId: '4,0', originTileId: '3,0', attacker: side('white', ['dead'], 20), defender: side('black', [], 5), spentOnly: false, winner: null, cityOwnerBefore: null, resolved: false, trojanPlayed: false };
    addUnit(s, 'soldier', playerOf(s, 'black'), '4,0', { id: 'alive' });
    c.defender.soldierIds = ['alive'];
    expect(finalControl(s, c).winner).toBe('defender');
    expect(finalControl(s, c).reason).toMatch(/no survivors/);
  });

  it('a tile held only by spent units cannot defend and is lost without a roll', () => {
    const { s, white, black, g } = setup();
    const a = addUnit(s, 'soldier', white, '3,0');
    setActing(s, 'white');
    addUnit(s, 'soldier', black, '4,0', { spent: true });
    addUnit(s, 'soldier', black, '4,0', { spent: true });
    order(s, g, '3,0', [{ dest: '4,0', units: [a.id] }]);
    expect(logHas(s, 'all spent and cannot mount a defense')).toBe(true);
    expect(unitsAt(s, '4,0').map((u) => u.id)).toEqual([a.id]);
  });
});

describe('casualties, retreats and captures', () => {
  it('lets the General choose casualties, including spent ones, and retreats the rest spent', () => {
    const { s, white, black, g } = setup();
    const bg = s.alliances.black.generalId!;
    const a = [addUnit(s, 'soldier', white, '3,0'), addUnit(s, 'soldier', white, '3,0'), addUnit(s, 'soldier', white, '3,0')];
    const d1 = addUnit(s, 'soldier', black, '4,0');
    setActing(s, 'white');
    const d2 = addUnit(s, 'soldier', black, '4,0', { spent: true });
    setRolls(s, [6, 5, 5, 1]); // attacker 16, one hit; defender active 1 die -> 1+2 = 3
    order(s, g, '3,0', [{ dest: '4,0', units: a.map((u) => u.id) }]);
    expect(s.pending?.kind).toBe('assignCasualties');
    expect(s.pending?.playerId).toBe(bg);
    const p = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'assignCasualties' }>;
    expect(p.candidates.sort()).toEqual([d1.id, d2.id].sort());
    expect(() => act(s, { kind: 'assignCasualties', playerId: bg, unitIds: [] })).toThrow(/exactly 1/);
    act(s, { kind: 'assignCasualties', playerId: bg, unitIds: [d2.id] }); // sacrifice the spent one
    expect(s.pending?.kind).toBe('retreat');
    const r = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'retreat' }>;
    expect(r.units.map((u) => u.unitId)).toEqual([d1.id]);
    const dest = r.units[0].destinations.find((d) => !d.byShip)!;
    expect(r.units[0].destinations.map((d) => d.tileId)).not.toContain('3,0'); // enemy-held
    expect(() => act(s, { kind: 'retreat', playerId: bg, moves: [] })).toThrow(/must be given a retreat/);
    act(s, { kind: 'retreat', playerId: bg, moves: [{ unitId: d1.id, tileId: dest.tileId }] });
    expect(s.units[d1.id].tileId).toBe(dest.tileId);
    expect(s.units[d1.id].spent).toBe(true);
    expect(s.units[d1.id].moved).toBe(true);
    expect(unitsAt(s, '4,0').length).toBe(3);
  });

  it('destroys survivors with no line of retreat', () => {
    const { s, white, black, g } = setup();
    const a = [addUnit(s, 'soldier', white, '3,0'), addUnit(s, 'soldier', white, '3,0')];
    const d = addUnit(s, 'soldier', black, '4,0');
    // surround (4,0): neighbours 5,0 5,-1 4,-1 3,0 3,1 4,1 all white-held
    for (const t of ['5,0', '5,-1', '4,-1', '3,1', '4,1']) addUnit(s, 'soldier', white, t);
    setActing(s, 'white');
    setRolls(s, [5, 5, 1]);
    order(s, g, '3,0', [{ dest: '4,0', units: a.map((u) => u.id) }]);
    expect(s.units[d.id]).toBeUndefined();
    expect(logHas(s, 'no line of retreat')).toBe(true);
  });

  it('at sea a removed soldier takes its ship; excess ships are captured; unmanned ships at sea sink', () => {
    const { s, white, black, g } = setup();
    const a = addUnit(s, 'soldier', white, '2,0');
    const as = addUnit(s, 'ship', white, '2,0');
    const d = addUnit(s, 'soldier', black, '1,0');
    const ds1 = addUnit(s, 'ship', black, '1,0');
    const ds2 = addUnit(s, 'ship', black, '1,0');
    setActing(s, 'white');
    setRolls(s, [6, 1]);
    order(s, g, '2,0', [{ dest: '1,0', units: [a.id, as.id] }]);
    expect(s.units[d.id]).toBeUndefined();
    const remainingBlackShips = [ds1.id, ds2.id].filter((id) => s.units[id]);
    expect(remainingBlackShips.length).toBe(1); // one went down with the soldier
    expect(s.units[remainingBlackShips[0]].ownerId).toBe(white); // captured and reflagged
    expect(logHas(s, 'captured by the White alliance')).toBe(true);
    // mutual annihilation leaves a black ship alone on open sea: it sinks
    const t = setup(2);
    const a2 = addUnit(t.s, 'soldier', t.white, '2,0');
    const as2 = addUnit(t.s, 'ship', t.white, '2,0');
    addUnit(t.s, 'soldier', t.black, '1,0');
    addUnit(t.s, 'ship', t.black, '1,0');
    const extra = addUnit(t.s, 'ship', t.black, '1,0');
    setActing(t.s, 'white');
    setRolls(t.s, [6, 6]);
    order(t.s, t.g, '2,0', [{ dest: '1,0', units: [a2.id, as2.id] }]);
    expect(t.s.units[extra.id]).toBeUndefined();
    expect(logHas(t.s, 'lost at sea')).toBe(true);
  });

  it('in a coastal fight loose soldiers are removed before ship pairs', () => {
    const { s, white, black, g } = setup();
    const a1 = addUnit(s, 'soldier', white, '4,-1');
    const a2 = addUnit(s, 'soldier', white, '4,-1');
    addUnit(s, 'soldier', black, '3,-1');
    addUnit(s, 'soldier', black, '3,-1');
    const ship = addUnit(s, 'ship', black, '3,-1');
    setActing(s, 'white');
    setRolls(s, [6, 1, 1, 1]); // one hit on the defenders
    order(s, g, '4,-1', [{ dest: '3,-1', units: [a1.id, a2.id] }]);
    expect(s.pending?.kind).toBe('assignCasualties');
    const p = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'assignCasualties' }>;
    act(s, { kind: 'assignCasualties', playerId: p.playerId, unitIds: [p.candidates[0]] });
    expect(s.units[ship.id]).toBeDefined(); // the loose soldier went first
    expect(s.units[ship.id].ownerId).toBe(black);
  });
});

describe('non-combat entries', () => {
  it('destroys lone enemy farmers, conquers undefended enemy cities and takes neutral ones', () => {
    const { s, white, black, g } = setup();
    const a = addUnit(s, 'soldier', white, '3,1');
    const b = addUnit(s, 'soldier', white, '3,1');
    const delphi = cityTile(s, 'Delphi'); // neutral (4,1)
    addUnit(s, 'farmer', black, '4,0');
    setActing(s, 'white');
    order(s, g, '3,1', [
      { dest: delphi, units: [a.id] },
      { dest: '4,0', units: [b.id] },
    ]);
    expect(s.tiles[delphi].city!.ownerId).toBe(white);
    expect(logHas(s, 'is taken and assigned')).toBe(true);
    expect(Object.values(s.units).filter((u) => u.kind === 'farmer').length).toBe(0);
    expect(logHas(s, 'put to the sword')).toBe(true);
    // conquest of an undefended black city
    const c = addUnit(s, 'soldier', white, '3,-1');
    s.tiles['4,-1'].city = { name: 'Testopolis', slot: null, level: 1, ownerId: black, walls: false, temple: false, university: false };
    setActing(s, 'white');
    order(s, g, '3,-1', [{ dest: '4,-1', units: [c.id] }]);
    expect(s.tiles['4,-1'].city!.ownerId).toBe(white);
    expect(logHas(s, 'is conquered from')).toBe(true);
  });

  it('asks the General which faction receives a conquered city when the alliance has several', () => {
    const s = newGame(6, 2);
    toMilitary(s, 'full1', 'white');
    clearUnits(s);
    const w1 = playerOf(s, 'white', 'Purple');
    const g = s.alliances.white.generalId!;
    const a = addUnit(s, 'soldier', w1, '3,1');
    setActing(s, 'white');
    const delphi = cityTile(s, 'Delphi');
    order(s, g, '3,1', [{ dest: delphi, units: [a.id] }]);
    expect(s.pending?.kind).toBe('assignOwnership');
    const p = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'assignOwnership' }>;
    expect(p.candidates.length).toBe(2);
    const other = p.candidates.find((c) => c !== g)!;
    act(s, { kind: 'assignOwnership', playerId: g, ownerId: other });
    expect(s.tiles[delphi].city!.ownerId).toBe(other);
  });
});
