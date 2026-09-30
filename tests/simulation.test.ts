import { describe, expect, it } from 'vitest';
import { runBotGame, SimulationError } from '../src/bots/runner';

/**
 * 200 all-bot games with different seeds and player counts (3-9), invariants
 * checked after every action. A failure prints the seed and action index so
 * it can be replayed with `npx vite-node scripts/debug.ts <seed>`. Odd seeds use
 * simultaneous military orders (decision 109), even seeds the sequential rules;
 * seeds divisible by three kill on 4, 5 or 6 (decision 115), the others only on 6.
 * Split into chunks so the vitest worker can report progress between them.
 */
const GAMES = Number(process.env.SIM_GAMES ?? 200);
const START = Number(process.env.SIM_START ?? 1);
const CHUNK = 20;

describe('simulation harness', () => {
  const chunks = Math.ceil(GAMES / CHUNK);
  const summary = { turns: 0, actions: 0, capped: 0, games: 0 };
  for (let c = 0; c < chunks; c++) {
    const from = START + c * CHUNK;
    const to = Math.min(START + GAMES, from + CHUNK);
    it(`games ${from}-${to - 1} run to completion with all invariants holding`, async () => {
      const failures: string[] = [];
      for (let seed = from; seed < to; seed++) {
        // yield so the vitest worker can answer the runner's RPC between games
        await new Promise((r) => setTimeout(r, 0));
        const players = 3 + ((seed - START) % 7);
        try {
          const s = runBotGame(seed, players, { checkInvariants: true, config: { militaryMode: seed % 2 ? 'simultaneous' : 'sequential', ...(seed % 3 === 0 ? { hitOn: 4 } : {}) } });
          expect(s.phase).toBe('gameOver');
          expect(s.result).not.toBeNull();
          expect(s.pending).toBeNull();
          summary.turns += s.turn;
          summary.actions += s.actionLog.length;
          summary.games += 1;
          if (s.log.some((l) => l.text.includes('Safety cap'))) summary.capped++;
        } catch (e) {
          failures.push(e instanceof SimulationError ? e.message : `[seed ${seed}] ${(e as Error).stack}`);
        }
      }
      if (failures.length) console.error(failures.join('\n\n'));
      expect(failures).toEqual([]);
      if (c === chunks - 1 && summary.games > 0) {
        console.log(`simulation: ${summary.games} games, avg ${(summary.turns / summary.games).toFixed(1)} turns, ${Math.round(summary.actions / summary.games)} actions per game, ${summary.capped} hit the turn cap`);
      }
    }, 300000);
  }
});
