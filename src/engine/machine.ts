/**
 * The state machine: a task-queue interpreter with an explicit pending
 * decision. `advance` runs tasks until one needs a player decision (or the
 * game is over). `applyAction` validates an action against the pending
 * decision, applies it and advances again.
 */
import { RulesError } from './types';
import type { Action, DecisionKind, GameState, LogEntry, PendingDecision } from './types';
import { handleSetupAction, handleSetupTask } from './flowSetup';
import { handleMilitaryAction, handleMilitaryTask } from './flowMilitary';
import { handleSimAction, handleSimTask } from './flowSimultaneous';
import { handlePoliticsAction, handlePoliticsTask } from './flowPolitics';
import { handleFullGameAction, handleFullGameTask } from './fullGame';

/** Which action kinds answer which decision kinds. */
export const ACTIONS_FOR_DECISION: Record<DecisionKind, Action['kind'][]> = {
  chooseRole: ['chooseRole'],
  placeTile: ['placeTile'],
  allocate: ['allocate'],
  setFactionOrder: ['setFactionOrder'],
  placeFarmers: ['placeFarmers'],
  placeBuildings: ['placeBuildings'],
  placeShips: ['placeShips'],
  placeSoldiers: ['placeSoldiers'],
  issueOrder: ['order', 'scuttle', 'pass'],
  submitOrders: ['submitOrders'],
  reaction: ['react'],
  assignCasualties: ['assignCasualties'],
  retreat: ['retreat'],
  assignOwnership: ['assignOwnership'],
  reflagShips: ['reflagShips'],
  disband: ['disband'],
  playCards: ['playCards'],
  discardDown: ['discardDown'],
  invokeApple: ['invokeApple'],
  philosophersTarget: ['philosophersTarget'],
  singOffVote: ['singOffVote'],
};

const MAX_STEPS = 100000;

/** Run tasks until a decision is pending or nothing is left to do. */
export function advance(state: GameState): void {
  let steps = 0;
  while (state.pending === null && state.tasks.length > 0) {
    const task = state.tasks[0];
    const handled = handleSetupTask(state, task) || handleMilitaryTask(state, task) || handleSimTask(state, task) || handlePoliticsTask(state, task) || handleFullGameTask(state, task);
    if (!handled) throw new Error(`No handler for task ${task.kind}`);
    if (++steps > MAX_STEPS) throw new Error('advance: runaway task loop');
  }
}

export function getPendingDecision(state: GameState): PendingDecision | null {
  return state.pending;
}

export function isGameOver(state: GameState): boolean {
  return state.phase === 'gameOver' && state.result !== null;
}

/** Mutating variant used by the simulation harness and the bots' lookahead. */
export function applyActionInPlace(state: GameState, action: Action): LogEntry[] {
  const pending = state.pending;
  if (!pending) throw new RulesError('No decision is pending');
  if (action.playerId !== pending.playerId) throw new RulesError(`It is ${pending.playerId}'s decision, not ${action.playerId}'s`);
  if (!ACTIONS_FOR_DECISION[pending.kind].includes(action.kind)) throw new RulesError(`Action ${action.kind} does not answer a ${pending.kind} decision`);
  const logStart = state.log.length;
  // Validation happens inside the handlers; a RulesError leaves the state untouched only when thrown before mutation.
  // Callers wanting atomicity use applyAction (which clones first).
  state.pending = null;
  try {
    const handled = handleSetupAction(state, action, pending) || handleMilitaryAction(state, action, pending) || handleSimAction(state, action, pending) || handlePoliticsAction(state, action, pending) || handleFullGameAction(state, action, pending);
    if (!handled) throw new Error(`No handler for action ${action.kind}`);
  } catch (e) {
    state.pending = pending;
    throw e;
  }
  state.actionLog.push(action);
  state.lastActingPlayerId = action.playerId;
  advance(state);
  return state.log.slice(logStart);
}

/** Pure variant: never mutates its input. */
export function applyAction(state: GameState, action: Action): { state: GameState; events: LogEntry[] } {
  const next = cloneState(state);
  const events = applyActionInPlace(next, action);
  return { state: next, events };
}

export function cloneState(state: GameState): GameState {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as GameState;
}
