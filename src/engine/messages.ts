/**
 * Messages and diplomacy (decision 112).
 *
 * Any leader may speak at any time: a message is a free action that never
 * answers a decision, so it is recorded in the action log and replays exactly.
 * Messages go to everyone, to one's own alliance, or to one other alliance
 * (diplomacy). Some carry an intent the bots act on: a General's target for
 * the turn, or a proposal of a pact (a truce, or a joint attack on a third
 * alliance) and its answer. Pacts are never enforced by the rules; the bots
 * honour them, and a truce is marked broken when one side attacks the other.
 */
import type { TileId } from './hex';
import { RulesError } from './types';
import type { Action, AllianceId, GameState, Message, MessageAudience, Pact, PlayerId, Proposal } from './types';
import { allianceName } from './query';
import { log } from './core';

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

/** Pacts in force this turn (not broken), optionally only those involving one alliance. */
export function activePacts(state: GameState, allianceId?: AllianceId): Pact[] {
  return (state.pacts ?? []).filter((p) => !p.broken && p.untilTurn >= state.turn && (!allianceId || p.allianceIds.includes(allianceId)));
}

/** Alliances this one has a truce with this turn. */
export function trucePartners(state: GameState, allianceId: AllianceId): AllianceId[] {
  return activePacts(state, allianceId)
    .filter((p) => p.kind === 'truce')
    .map((p) => (p.allianceIds[0] === allianceId ? p.allianceIds[1] : p.allianceIds[0]));
}

/** Alliances this one has agreed to attack together with someone this turn. */
export function jointTargets(state: GameState, allianceId: AllianceId): AllianceId[] {
  return activePacts(state, allianceId)
    .filter((p) => p.kind === 'joint' && p.targetAllianceId)
    .map((p) => p.targetAllianceId!);
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

/** Proposals still awaiting an answer: made this turn or last, not yet answered. */
export function openProposals(state: GameState, toAllianceId?: AllianceId): Proposal[] {
  return (state.proposals ?? []).filter((p) => p.status === 'open' && p.turn >= state.turn - 1 && (!toAllianceId || p.to === toAllianceId));
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
  if (intent) {
    const general = isGeneralOf(state, action.playerId);
    if (intent.kind === 'target') {
      if (to.kind !== 'alliance') fail('A target is announced to your own alliance');
      if (!state.tiles[intent.tileId]) fail(`Unknown tile ${intent.tileId}`);
    } else if (intent.kind === 'propose') {
      if (!general) fail('Only a General may propose a pact');
      if (to.kind !== 'diplomacy') fail('A pact is proposed to another alliance');
      const other = to.allianceIds[0] === general ? to.allianceIds[1] : to.allianceIds[0];
      if (!Number.isInteger(intent.turns) || intent.turns < 1 || intent.turns > 3) fail('A pact lasts one to three turns');
      if (intent.pact === 'joint' && (!intent.targetAllianceId || intent.targetAllianceId === general || intent.targetAllianceId === other)) fail('A joint attack names a third alliance');
      if ((state.proposals ?? []).some((x) => x.id === intent.proposalId)) fail('That proposal already exists');
      (state.proposals ??= []).push({ id: intent.proposalId, pact: intent.pact, from: general, to: other, targetAllianceId: intent.targetAllianceId, turns: intent.turns, turn: state.turn, status: 'open' });
    } else if (intent.kind === 'reply') {
      const prop = openProposals(state).find((x) => x.id === intent.proposalId);
      if (!prop) fail('That proposal is no longer open');
      if (general !== prop.to) fail('Only the General who received a proposal may answer it');
      if (to.kind !== 'diplomacy' || !to.allianceIds.includes(prop.from)) fail('Answer a proposal to the alliance that made it');
      prop.status = intent.accept ? 'accepted' : 'declined';
      if (intent.accept) {
        (state.pacts ??= []).push({ id: prop.id, kind: prop.pact, allianceIds: [prop.from, prop.to], targetAllianceId: prop.targetAllianceId, untilTurn: state.turn + prop.turns });
      }
    }
  }
  const msg: Message = { seq: (state.messages?.length ?? 0) + 1, turn: state.turn, fromId: action.playerId, to, text, ...(intent ? { intent } : {}) };
  (state.messages ??= []).push(msg);
}

/**
 * Called when two alliances come to blows: a truce between them is broken.
 * The attacker is blamed when there is one (null when both marched at once).
 */
export function noteHostility(state: GameState, a: AllianceId, b: AllianceId, attacker: AllianceId | null): void {
  for (const p of activePacts(state)) {
    if (p.kind !== 'truce' || !p.allianceIds.includes(a) || !p.allianceIds.includes(b)) continue;
    p.broken = { turn: state.turn, byAllianceId: attacker };
    log(state, 'order', attacker ? `The ${allianceName(attacker)} alliance breaks its truce with the ${allianceName(attacker === a ? b : a)} alliance!` : `The truce between the ${allianceName(a)} and ${allianceName(b)} alliances collapses in battle!`, { banner: true });
  }
}
