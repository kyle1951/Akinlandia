import { describe, expect, it } from 'vitest';
import { act, addUnit, clearUnits, cityTile, giveCard, handTypes, logHas, newGame, order, playerOf, setActing, setRolls, toMilitary, unitsAt } from './helpers';
import { allianceOf } from '../src/engine/query';
import type { GameState } from '../src/engine/types';

function clearHands(s: GameState): void {
  for (const pid of s.seatOrder) {
    s.discard.push(...s.players[pid].hand);
    s.players[pid].hand = [];
  }
}

describe('Rage of Achilles', () => {
  function setup() {
    const s = newGame(6, 2);
    toMilitary(s, 'full1', 'white');
    clearUnits(s);
    clearHands(s);
    const g = s.alliances.white.generalId!;
    const other = s.seatOrder.find((p) => p !== g && allianceOf(s, p) === 'white')!;
    addUnit(s, 'soldier', playerOf(s, 'green'), cityTile(s, 'Sardis')); // sentinel keeps the sub-phase alive (green moves last)
    const mine = addUnit(s, 'soldier', g, '3,0');
    const theirs = addUnit(s, 'soldier', other, '3,0');
    return { s, g, other, mine, theirs };
  }

  it('lets the owner keep their units home while the rest of the order proceeds', () => {
    const { s, g, other, mine, theirs } = setup();
    giveCard(s, other, 'rage');
    giveCard(s, other, 'citizen');
    setActing(s, 'white');
    order(s, g, '3,0', [{ dest: '4,0', units: [mine.id, theirs.id] }]);
    expect(s.pending).toMatchObject({ kind: 'reaction', playerId: other, window: 'rageOfAchilles', holdsCard: true });
    act(s, { kind: 'react', playerId: other, play: true });
    expect(s.units[theirs.id].tileId).toBe('3,0');
    expect(s.units[theirs.id].moved).toBe(true); // disposed of by the order all the same
    expect(s.units[mine.id].tileId).toBe('4,0');
    expect(handTypes(s, other)).toEqual(['citizen']);
    expect(s.discard.map((u) => s.cards[u].type)).toContain('rage');
    expect(logHas(s, 'plays Rage of Achilles')).toBe(true);
  });

  it('never prompts a player who cannot legally play, and enforces the last-card rule', () => {
    const { s, g, other, mine, theirs } = setup();
    giveCard(s, other, 'rage'); // their only card
    setActing(s, 'white');
    order(s, g, '3,0', [{ dest: '4,0', units: [mine.id, theirs.id] }]);
    expect(s.pending?.kind).not.toBe('reaction');
    expect(s.units[theirs.id].tileId).toBe('4,0');
    // with "always prompt" a human is asked anyway, but the play is rejected
    const t = setup();
    t.s.config.alwaysPromptReactions = true;
    t.s.players[t.other].isBot = false;
    giveCard(t.s, t.other, 'rage');
    setActing(t.s, 'white');
    order(t.s, t.g, '3,0', [{ dest: '4,0', units: [t.mine.id, t.theirs.id] }]);
    expect(t.s.pending).toMatchObject({ kind: 'reaction', playerId: t.other });
    expect(() => act(t.s, { kind: 'react', playerId: t.other, play: true })).toThrow(/last card/);
    act(t.s, { kind: 'react', playerId: t.other, play: false });
    expect(t.s.units[t.theirs.id].tileId).toBe('4,0');
    // a human without the card is prompted under "always prompt" but cannot play it
    const u = setup();
    u.s.config.alwaysPromptReactions = true;
    u.s.players[u.other].isBot = false;
    giveCard(u.s, u.other, 'citizen');
    giveCard(u.s, u.other, 'citizen');
    setActing(u.s, 'white');
    order(u.s, u.g, '3,0', [{ dest: '4,0', units: [u.mine.id, u.theirs.id] }]);
    expect(u.s.pending).toMatchObject({ kind: 'reaction', playerId: u.other, holdsCard: false });
    expect(() => act(u.s, { kind: 'react', playerId: u.other, play: true })).toThrow(/do not hold/);
  });

  it('re-pairs a sea crossing after a refusal so no ship sails empty', () => {
    const { s, g, other, mine, theirs } = setup();
    const s1 = addUnit(s, 'ship', g, '3,0');
    const s2 = addUnit(s, 'ship', g, '3,0');
    giveCard(s, other, 'rage');
    giveCard(s, other, 'citizen');
    setActing(s, 'white');
    order(s, g, '3,0', [{ dest: '2,0', units: [mine.id, theirs.id, s1.id, s2.id] }]);
    act(s, { kind: 'react', playerId: other, play: true });
    expect(unitsAt(s, '2,0').length).toBe(2); // one soldier, one ship
    expect(unitsAt(s, '3,0').length).toBe(2); // the refusing soldier and the spare ship
    expect(logHas(s, 'Only 1 manned ship pair')).toBe(true);
  });
});

describe('Trojan Horse and Zeus', () => {
  function failedCityAttack() {
    const s = newGame(3, 1);
    toMilitary(s, 'full1', 'white');
    clearUnits(s);
    clearHands(s);
    const white = playerOf(s, 'white');
    const black = playerOf(s, 'black');
    const green = playerOf(s, 'green');
    const g = s.alliances.white.generalId!;
    const gyth = cityTile(s, 'Gytheion'); // black purple coastal city
    addUnit(s, 'soldier', green, cityTile(s, 'Sardis')); // sentinel
    // a land neighbour of Gytheion for the attackers
    const src = Object.values(s.tiles).find((t) => !t.city && Math.max(Math.abs(t.q - s.tiles[gyth].q), Math.abs(t.r - s.tiles[gyth].r), Math.abs(t.q + t.r - s.tiles[gyth].q - s.tiles[gyth].r)) === 1 && t.edges.every((e) => e.type === 'land'))!;
    const a1 = addUnit(s, 'soldier', white, src.id);
    const d = addUnit(s, 'soldier', black, gyth);
    setActing(s, 'white');
    return { s, white, black, green, g, gyth, src: src.id, a1, d };
  }

  it('swaps the armies, restores casualties and hands the city to the attacking alliance', () => {
    const { s, white, green, g, gyth, src, a1, d } = failedCityAttack();
    giveCard(s, green, 'trojan');
    giveCard(s, green, 'citizen');
    setRolls(s, [1, 6]); // attacker 1, defender 6+3 = 9 and a hit: the lone attacker dies
    order(s, g, src, [{ dest: gyth, units: [a1.id] }]);
    expect(s.pending).toMatchObject({ kind: 'reaction', playerId: green, window: 'trojanHorse', holdsCard: true });
    expect(s.units[a1.id]).toBeUndefined();
    act(s, { kind: 'react', playerId: green, play: true });
    expect(s.tiles[gyth].city!.ownerId).toBe(white);
    expect(unitsAt(s, gyth).map((u) => u.id)).toEqual([a1.id]); // restored and marched in
    expect(s.units[a1.id].moved).toBe(true);
    expect(s.units[d.id].tileId).toBe(src);
    expect(s.units[d.id].spent).toBe(false);
    expect(handTypes(s, green)).toEqual(['citizen']);
    expect(logHas(s, 'By the Trojan Horse')).toBe(true);
    expect(logHas(s, '1 fallen unit(s) rise again')).toBe(true);
  });

  it('can be cancelled by a Lightning Bolt of Zeus, which is then discarded', () => {
    const { s, black, green, g, gyth, src, a1 } = failedCityAttack();
    giveCard(s, green, 'trojan');
    giveCard(s, green, 'citizen');
    giveCard(s, black, 'zeus');
    giveCard(s, black, 'citizen');
    setRolls(s, [1, 6]);
    order(s, g, src, [{ dest: gyth, units: [a1.id] }]);
    act(s, { kind: 'react', playerId: green, play: true });
    expect(s.pending).toMatchObject({ kind: 'reaction', playerId: black, window: 'zeus', target: 'trojan' });
    act(s, { kind: 'react', playerId: black, play: true });
    expect(s.tiles[gyth].city!.ownerId).toBe(black);
    expect(s.units[a1.id]).toBeUndefined();
    expect(handTypes(s, black)).toEqual(['citizen']);
    expect(logHas(s, 'is cancelled')).toBe(true);
  });

  it('cannot be Zeus-cancelled by a player holding only the Zeus card during the military phase', () => {
    const { s, black, green, g, gyth, src, a1 } = failedCityAttack();
    giveCard(s, green, 'trojan');
    giveCard(s, green, 'citizen');
    giveCard(s, black, 'zeus');
    setRolls(s, [1, 6]);
    order(s, g, src, [{ dest: gyth, units: [a1.id] }]);
    act(s, { kind: 'react', playerId: green, play: true });
    expect(s.pending?.kind).not.toBe('reaction'); // black is not even asked
    expect(s.tiles[gyth].city!.ownerId).toBe(playerOf(s, 'white'));
  });

  it('is not offered when the defending owner has only one city', () => {
    const { s, black, green, g, gyth, src, a1 } = failedCityAttack();
    giveCard(s, green, 'trojan');
    giveCard(s, green, 'citizen');
    for (const t of Object.values(s.tiles)) if (t.city?.ownerId === black && t.id !== gyth) t.city.ownerId = null;
    setRolls(s, [1, 6]);
    order(s, g, src, [{ dest: gyth, units: [a1.id] }]);
    expect(s.pending?.kind).not.toBe('reaction');
    expect(s.tiles[gyth].city!.ownerId).toBe(black);
  });

  it('makes the defenders retreat when the origin still holds attacking units', () => {
    const { s, white, green, g, gyth, src, a1, d } = failedCityAttack();
    const stay = addUnit(s, 'soldier', white, src);
    giveCard(s, green, 'trojan');
    giveCard(s, green, 'citizen');
    setActing(s, 'white');
    setRolls(s, [1, 6]);
    order(s, g, src, [{ dest: gyth, units: [a1.id] }]);
    act(s, { kind: 'react', playerId: green, play: true });
    expect(s.pending?.kind).toBe('retreat');
    const r = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'retreat' }>;
    expect(r.units[0].destinations.map((x) => x.tileId)).not.toContain(src);
    act(s, { kind: 'retreat', playerId: r.playerId, moves: [{ unitId: d.id, tileId: r.units[0].destinations[0].tileId }] });
    expect(s.tiles[gyth].city!.ownerId).toBe(white);
    expect(s.units[stay.id].tileId).toBe(src);
    expect(s.units[a1.id].tileId).toBe(gyth);
    expect(s.units[d.id].spent).toBe(true);
  });
});
