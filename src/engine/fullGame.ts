/**
 * Full Game tile-placement setup (milestone 7). Implemented later; the
 * handlers below keep the dispatcher complete until then.
 */
import type { Action, GameState, PendingDecision, Task } from './types';

export function handleFullGameTask(state: GameState, task: Task): boolean {
  if (task.kind !== 'fullGameSetup') return false;
  void state;
  throw new Error('Full Game setup is not implemented yet');
}

export function handleFullGameAction(_state: GameState, action: Action, _pending: PendingDecision): boolean {
  if (action.kind !== 'placeTile') return false;
  throw new Error('Full Game setup is not implemented yet');
}
