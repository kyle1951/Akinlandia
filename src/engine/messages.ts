/**
 * Messages (decisions 112 and 114).
 *
 * Any leader may speak at any time: a message is a free action that never
 * answers a decision, so it is recorded in the action log and replays exactly.
 * Messages go to everyone, to one's own alliance, or to one other alliance
 * (diplomacy). Diplomacy is by word only: the rules record no proposals, pacts
 * or truces, and nothing anyone says binds them. The one piece of structure is
 * a General's target, an order to their own alliance that bot allies follow.
 * Bot messages may carry a hidden note of what they meant (an offer or an
 * answer); it is only the bots' memory of their own words.
 */
import type { TileId } from './hex';
import { RulesError } from './types';
import type { Action, AllianceId, GameState, Message, MessageAudience, PlayerId } from './types';

export const MAX_MESSAGE_LENGTH = 280;

function fail(msg: string): never {
  throw new RulesError(msg);
}

/** Can this player read this message? Spectators (null) read only public messages. */
export function canRead(state: GameState, viewerId: PlayerId | null, to: MessageAudience): boolean {
  if (to.kind === 'all') return true;
  const a = viewerId ? state.players[viewerId]?.allianceId : null;
  if (!a) return false;
  return to.kind === 'alliance' ? to.allianceId === a : to.allianceIds.includes(a);
}

export function isGeneralOf(state: GameState, pid: PlayerId): AllianceId | null {
  const a = state.players[pid]?.allianceId;
  return a && state.alliances[a].generalId === pid ? a : null;
}

/** The alliance's objective this turn: the latest target named by its General (or, failing that, by any member). */
export function allianceTarget(state: GameState, allianceId: AllianceId): TileId | null {
  const general = state.alliances[allianceId].generalId;
  let fromAnyone: TileId | null = null;
  const msgs = state.messages ?? [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.turn !== state.turn) break;
    if (m.intent?.kind !== 'target' || m.to.kind !== 'alliance' || m.to.allianceId !== allianceId) continue;
    if (m.fromId === general) return m.intent.tileId;
    fromAnyone ??= m.intent.tileId;
  }
  return fromAnyone;
}

/** Apply a 'say' free action (validated here; throws RulesError when illegal). */
export function applySay(state: GameState, action: Extract<Action, { kind: 'say' }>): void {
  const p = state.players[action.playerId];
  if (!p) fail(`Unknown leader ${action.playerId}`);
  const text = action.text.trim().replace(/\s+/g, ' ');
  if (!text) fail('Say something');
  if (text.length > MAX_MESSAGE_LENGTH) fail(`Messages are at most ${MAX_MESSAGE_LENGTH} characters`);
  const mine = p.allianceId;
  const to = action.to;
  if (to.kind !== 'all') {
    if (!mine) fail('Choose an alliance before speaking privately');
    if (to.kind === 'alliance' && to.allianceId !== mine) fail('You may only speak privately to your own alliance');
    if (to.kind === 'diplomacy' && (!to.allianceIds.includes(mine) || to.allianceIds[0] === to.allianceIds[1])) fail('Diplomacy is between your alliance and one other');
  }
  const intent = action.intent;
  if (intent?.kind === 'target') {
    if (to.kind !== 'alliance') fail('A target is announced to your own alliance');
    if (!state.tiles[intent.tileId]) fail(`Unknown tile ${intent.tileId}`);
  } else if (intent && to.kind !== 'diplomacy') {
    fail('Offers and answers are made to another alliance');
  }
  const msg: Message = { seq: (state.messages?.length ?? 0) + 1, turn: state.turn, fromId: action.playerId, to, text, ...(intent ? { intent } : {}) };
  (state.messages ??= []).push(msg);
}
