import { describe, expect, it } from 'vitest';
import { botConfig, replay, runBotGame } from '../src/bots/runner';
import { applyAction, createGame } from '../src/engine';
import { botAction } from '../src/bots/heuristic';

describe('replay', () => {
  it('the same seed and action log reproduce an identical final state', () => {
    const seed = 4242;
    const players = 6;
    const a = runBotGame(seed, players);
    const b = replay(botConfig(players), seed, a.actionLog);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('the pure applyAction never mutates its input and matches the in-place engine', () => {
    const config = botConfig(4);
    let pure = createGame(config, 99);
    const snapshot = JSON.stringify(pure);
    for (let i = 0; i < 40 && pure.pending; i++) {
      const action = botAction(pure, pure.pending);
      const before = JSON.stringify(pure);
      const res = applyAction(pure, action);
      expect(JSON.stringify(pure)).toBe(before);
      expect(res.events.length).toBeGreaterThanOrEqual(0);
      pure = res.state;
    }
    expect(JSON.stringify(createGame(config, 99))).toBe(snapshot);
    const inPlace = replay(config, 99, pure.actionLog);
    expect(JSON.stringify(inPlace)).toBe(JSON.stringify(pure));
  });
});
