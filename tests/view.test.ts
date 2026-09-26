import { describe, expect, it } from 'vitest';
import { viewForPlayer } from '../src/engine/view';
import { giveCard, newGame, runUntil, toMilitary, clearUnits, addUnit, playerOf, setActing, order, cityTile } from './helpers';
import { allianceOf } from '../src/engine/query';

describe('per-player view redaction', () => {
  it('hides other hands, the deck, the RNG, the action log and the task queue', () => {
    const s = newGame(6, 2);
    runUntil(s, (st) => st.pending?.kind === 'playCards');
    const me = s.pending!.playerId;
    const other = s.seatOrder.find((p) => p !== me)!;
    const v = viewForPlayer(s, me);
    expect(v.viewerId).toBe(me);
    expect(v.rng).toEqual({ seed: 0, s: 0, calls: 0 });
    expect(v.actionLog).toEqual([]);
    expect(v.tasks).toEqual([]);
    expect(v.deck.length).toBe(s.deck.length);
    expect(v.deck.every((u) => u === 'hidden')).toBe(true);
    expect(v.players[me].hand).toEqual(s.players[me].hand);
    expect(v.players[other].hand.length).toBe(s.players[other].hand.length);
    expect(v.players[other].hand.every((u) => u === 'hidden')).toBe(true);
    for (const uid of s.players[me].hand) expect(v.cards[uid]).toBeDefined();
    for (const uid of s.players[other].hand) expect(v.cards[uid]).toBeUndefined();
    expect(v.pending).toEqual(s.pending);
    expect(v.waitingOn).toEqual({ playerId: me, kind: 'playCards' });
    // the board and the log are public
    expect(Object.keys(v.units).length).toBe(Object.keys(s.units).length);
    expect(v.log.length).toBe(s.log.length);
    // a spectator sees no hand at all
    const spectator = viewForPlayer(s, null);
    expect(spectator.players[me].hand.every((u) => u === 'hidden')).toBe(true);
    expect(spectator.pending).toBeNull();
    expect(spectator.waitingOn).toEqual({ playerId: me, kind: 'playCards' });
  });

  it('hides unrevealed PLAY envelopes and shows them after the reveal', () => {
    const s = newGame(6, 2);
    runUntil(s, (st) => st.pending?.kind === 'playCards');
    const first = s.pending!.playerId;
    runUntil(s, (st) => st.pending?.kind === 'playCards' && st.pending.playerId !== first);
    const second = s.pending!.playerId;
    const v = viewForPlayer(s, second);
    expect(v.turnData.politics!.played[first].every((u) => u === 'hidden')).toBe(true);
    expect(v.turnData.politics!.played[first].length).toBe(s.turnData.politics!.played[first].length);
    expect(v.turnData.politics!.scores).toEqual({});
    runUntil(s, (st) => st.turn === 2 || st.phase === 'gameOver');
    const after = viewForPlayer(s, second);
    expect(after.turnData.lastReveal!.played[first]).toEqual(s.turnData.lastReveal!.played[first]);
    for (const uid of s.turnData.lastReveal!.played[first]) expect(after.cards[uid]).toBeDefined();
  });

  it('never names the player being asked about a reaction card', () => {
    const s = newGame(6, 2);
    toMilitary(s, 'full1', 'white');
    clearUnits(s);
    const g = s.alliances.white.generalId!;
    const other = s.seatOrder.find((p) => p !== g && allianceOf(s, p) === 'white')!;
    addUnit(s, 'soldier', playerOf(s, 'green'), cityTile(s, 'Sardis'));
    const mine = addUnit(s, 'soldier', g, '3,0');
    const theirs = addUnit(s, 'soldier', other, '3,0');
    giveCard(s, other, 'rage');
    giveCard(s, other, 'citizen');
    setActing(s, 'white');
    order(s, g, '3,0', [{ dest: '4,0', units: [mine.id, theirs.id] }]);
    expect(s.pending?.kind).toBe('reaction');
    const asGeneral = viewForPlayer(s, g);
    expect(asGeneral.pending).toBeNull();
    expect(asGeneral.waitingOn).toEqual({ kind: 'reaction' });
    const asOther = viewForPlayer(s, other);
    expect(asOther.pending?.kind).toBe('reaction');
  });
});
