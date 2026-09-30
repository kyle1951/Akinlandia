import { describe, expect, it } from 'vitest';
import { cityCount, citiesOf, foodCapOf } from '../src/engine/query';
import { applyAction, advance } from '../src/engine/machine';
import { runBotGame } from '../src/bots/runner';
import { rollDice } from '../src/engine/rules/combat';
import { act, addUnit, clearUnits, giveCard, logHas, newGame, playerOf, runUntil, setRolls } from './helpers';
import type { GameState } from '../src/engine/types';

function jumpToReconcile(s: GameState): void {
  s.tasks = [{ kind: 'reconcile' }, { kind: 'politicsPlay', remaining: [...s.seatOrder], round: 1 }];
  s.pending = null;
}

describe('house rule: food spoils above a cap per city (decision 107)', () => {
  it('trims stored food to the cap after the army is fed', () => {
    const s = newGame(3, 1, { foodCapPerCity: 2 });
    const white = playerOf(s, 'white');
    runUntil(s, (st) => st.phase === 'military' && st.pending?.kind === 'issueOrder');
    clearUnits(s);
    jumpToReconcile(s);
    addUnit(s, 'soldier', white, '3,0');
    s.players[white].food = 50;
    advance(s);
    runUntil(s, (st) => st.phase === 'politics');
    expect(s.players[white].food).toBe(2 * cityCount(s, white));
    expect(logHas(s, 'food spoils')).toBe(true);
  });

  it('adds 2 to the cap for each level a city has been upgraded', () => {
    const s = newGame(3, 1, { foodCapPerCity: 4 });
    const white = playerOf(s, 'white');
    runUntil(s, (st) => st.phase === 'military' && st.pending?.kind === 'issueOrder');
    const [a, b] = citiesOf(s, white);
    a.city!.level = 2;
    b.city!.level = 3;
    const cities = cityCount(s, white);
    expect(foodCapOf(s, white)).toBe(4 * cities + 2 + 4);
    clearUnits(s);
    jumpToReconcile(s);
    s.players[white].food = 50;
    advance(s);
    runUntil(s, (st) => st.phase === 'politics');
    expect(s.players[white].food).toBe(4 * cities + 6);
  });

  it('leaves food alone when the rule is off', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    runUntil(s, (st) => st.phase === 'military' && st.pending?.kind === 'issueOrder');
    clearUnits(s);
    jumpToReconcile(s);
    s.players[white].food = 50;
    advance(s);
    runUntil(s, (st) => st.phase === 'politics');
    expect(s.players[white].food).toBe(50);
  });
});

describe('house rule: hand limit (decision 108)', () => {
  function overLimit(): { s: GameState; white: string } {
    const s = newGame(3, 1, { handLimit: 7 });
    const white = playerOf(s, 'white');
    while (s.players[white].hand.length < 10) giveCard(s, white, 'citizen');
    s.tasks = [{ kind: 'handLimit', remaining: [...s.seatOrder] }];
    s.pending = null;
    advance(s);
    return { s, white };
  }

  it('asks a leader over the limit to discard down to it', () => {
    const { s, white } = overLimit();
    expect(s.pending).toMatchObject({ kind: 'discardDown', playerId: white, count: s.players[white].hand.length - 7, limit: 7 });
  });

  it('rejects the wrong number of discards and accepts the right one', () => {
    const { s, white } = overLimit();
    const hand = s.players[white].hand;
    const count = hand.length - 7;
    expect(() => applyAction(s, { kind: 'discardDown', playerId: white, cardUids: hand.slice(0, count - 1) })).toThrow();
    const out = hand.slice(0, count);
    act(s, { kind: 'discardDown', playerId: white, cardUids: out });
    expect(s.players[white].hand).toHaveLength(7);
    for (const uid of out) expect(s.discard).toContain(uid);
  });

  it('bot games with both rules finish and nobody starts a turn over the limit', () => {
    // play games until someone has had to discard, checking the limit in every one
    let discards = 0;
    for (let seed = 11; seed < 21 && discards === 0; seed++) {
      const end = runBotGame(seed, 6, {
        config: { foodCapPerCity: 3, handLimit: 7 },
        checkInvariants: true,
        onAction: (st, a) => {
          if (a.kind === 'discardDown') discards++;
          if (st.pending?.kind === 'allocate') for (const pid of st.seatOrder) expect(st.players[pid].hand.length).toBeLessThanOrEqual(7);
        },
      });
      expect(end.phase).toBe('gameOver');
    }
    expect(discards).toBeGreaterThan(0);
  });
});

describe('combat hits (decision 115)', () => {
  it('kills on 4, 5 or 6 when the game says so, and only on 6 otherwise', () => {
    const bloody = newGame(3, 1, { hitOn: 4 });
    setRolls(bloody, [4, 3, 6, 5, 1]);
    expect(rollDice(bloody, 5).hits).toBe(3);
    const classic = newGame(3, 1);
    setRolls(classic, [4, 3, 6, 5, 1]);
    expect(rollDice(classic, 5).hits).toBe(1);
  });

  it('bot games with bloody combat finish with every invariant holding', () => {
    for (const [seed, players, militaryMode] of [
      [41, 5, 'simultaneous'],
      [42, 9, 'sequential'],
    ] as const) {
      const end = runBotGame(seed, players, { config: { hitOn: 4, militaryMode }, checkInvariants: true });
      expect(end.phase).toBe('gameOver');
    }
  });
});
