/**
 * Runs all-bot games to completion. Used by the simulation harness, the
 * replay test and the UI's "run to end" button.
 */
import type { Action, GameConfig, GameState } from '../engine/types';
import { createGame } from '../engine/setup';
import { applyActionInPlace, isGameOver } from '../engine/machine';
import { checkInvariants } from '../engine/invariants';
import { botAction } from './heuristic';
import { botSays } from './talk';

export interface RunOptions {
  maxActions?: number;
  /** return quietly instead of throwing when maxActions is reached */
  stopAtMax?: boolean;
  checkInvariants?: boolean;
  onAction?: (state: GameState, action: Action, index: number) => void;
  /** stop as soon as this predicate is true (checked before each bot action) */
  until?: (state: GameState) => boolean;
}

export class SimulationError extends Error {
  constructor(
    message: string,
    public readonly seed: number,
    public readonly actionIndex: number,
    public readonly action: Action | null,
  ) {
    super(`[seed ${seed}, action ${actionIndex}] ${message}`);
    this.name = 'SimulationError';
  }
}

export function botConfig(n: number, opts: Partial<GameConfig> = {}): GameConfig {
  const names = ['Sinclair', 'Akin', 'Hobbes', 'Herodotus', 'Clemenceau', 'Pericles', 'Xerxes', 'Leonidas', 'Solon'];
  const epithets = ['the Great', 'the Adequate', 'the Unready', 'the Magnificent', 'the Verbose', 'the Bald', 'the Younger', 'the Pious', 'the Tardy'];
  return {
    seats: Array.from({ length: n }, (_, i) => ({ name: names[i], leaderName: `${names[i]} ${epithets[i]}`, isBot: true })),
    setupMode: 'quick',
    alwaysPromptReactions: false,
    mapId: 'quickstart',
    maxTurns: 40,
    ...opts,
  };
}

/** Advance a game by letting bots answer decisions until a human must decide or the game ends. */
export function runBots(state: GameState, opts: RunOptions = {}): GameState {
  const max = opts.maxActions ?? 200000;
  let i = state.actionLog.length;
  while (!isGameOver(state) && state.pending && state.players[state.pending.playerId].isBot) {
    if (opts.until && opts.until(state)) return state;
    if (i >= max) {
      if (opts.stopAtMax) return state;
      throw new SimulationError(`exceeded ${max} actions`, state.rng.seed, i, null);
    }
    for (const action of botTurnActions(state)) {
      try {
        applyActionInPlace(state, action);
      } catch (e) {
        throw new SimulationError(`${(e as Error).message}\naction: ${JSON.stringify(action)}\npending: ${JSON.stringify(state.pending)}`, state.rng.seed, i, action);
      }
      if (opts.checkInvariants) {
        const errors = checkInvariants(state);
        if (errors.length) throw new SimulationError(`invariant violation: ${errors.join('; ')}`, state.rng.seed, i, action);
      }
      opts.onAction?.(state, action, i);
      i++;
    }
  }
  return state;
}

/**
 * The actions of one bot turn, chosen lazily: whatever the bot has to say
 * first (decision 112), each message applied before the next is chosen, then
 * its answer to the pending decision. Apply each action before asking for the
 * next one.
 */
export function* botTurnActions(state: GameState): Generator<Action> {
  const pid = state.pending!.playerId;
  for (let k = 0; k < 6; k++) {
    const say = botSays(state, pid);
    if (!say) break;
    yield say;
  }
  yield botAction(state, state.pending!);
}

/** Play one bot turn in place (messages, then the decision); returns the actions applied. */
export function playBotTurn(state: GameState): Action[] {
  const done: Action[] = [];
  for (const action of botTurnActions(state)) {
    applyActionInPlace(state, action);
    done.push(action);
  }
  return done;
}

export function runBotGame(seed: number, players: number, opts: RunOptions & { config?: Partial<GameConfig> } = {}): GameState {
  const state = createGame(botConfig(players, opts.config), seed);
  return runBots(state, opts);
}

/** Replay an action log from the same seed and config. */
export function replay(config: GameConfig, seed: number, actions: Action[]): GameState {
  const state = createGame(config, seed);
  for (const a of actions) applyActionInPlace(state, a);
  return state;
}
