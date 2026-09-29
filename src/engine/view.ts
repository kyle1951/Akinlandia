/**
 * Per-player redaction for online play (decision 91).
 *
 * The server sends each player a view of the state in which everything they
 * are not entitled to know is removed: other hands (only sizes remain),
 * unrevealed PLAY envelopes, the deck order, the RNG and seed (which would
 * let a client reconstruct the shuffle), the action log, the task queue
 * (which names who is being asked about reaction cards) and other players'
 * pending decisions. Everything on the board and in the record of deeds is
 * public and stays.
 */
import type { AllianceId, GameState, PendingDecision, PlayerId } from './types';
import { cloneState } from './machine';

export interface WaitingOn {
  /** omitted for reaction windows so nobody learns who holds a card */
  playerId?: PlayerId;
  kind: PendingDecision['kind'];
}

export interface ClientView extends GameState {
  viewerId: PlayerId | null;
  waitingOn: WaitingOn | null;
}

const HIDDEN = 'hidden';

export function viewForPlayer(state: GameState, viewerId: PlayerId | null): ClientView {
  const v = cloneState(state) as ClientView;
  v.viewerId = viewerId;
  // secrets that would let a client reconstruct anything
  v.rng = { seed: 0, s: 0, calls: 0 };
  v.actionLog = [];
  v.tasks = [];
  v.deck = state.deck.map(() => HIDDEN);
  // sealed order sheets of other alliances stay secret until they are revealed (decision 109)
  const sim = v.turnData.sim;
  if (sim && sim.stage === 'collect') {
    const mine = viewerId ? v.players[viewerId]?.allianceId : null;
    for (const a of Object.keys(sim.submitted) as AllianceId[]) if (a !== mine) delete sim.submitted[a];
  }
  // hands: keep only the viewer's card identities
  const known = new Set<string>();
  for (const pid of state.seatOrder) {
    const p = v.players[pid];
    if (pid === viewerId) {
      for (const uid of p.hand) known.add(uid);
    } else {
      p.hand = p.hand.map(() => HIDDEN);
    }
  }
  // PLAY envelopes are secret until revealed
  const pol = v.turnData.politics;
  if (pol && !pol.revealed) {
    for (const pid of Object.keys(pol.played)) {
      if (pid !== viewerId) pol.played[pid] = pol.played[pid].map(() => HIDDEN);
      else for (const uid of pol.played[pid]) known.add(uid);
    }
    pol.scores = {};
  } else if (pol) {
    for (const uids of Object.values(pol.played)) for (const uid of uids) known.add(uid);
  }
  if (v.turnData.lastReveal) for (const uids of Object.values(v.turnData.lastReveal.played)) for (const uid of uids) known.add(uid);
  for (const uid of state.discard) known.add(uid);
  for (const uid of Object.keys(v.cards)) if (!known.has(uid)) delete v.cards[uid];
  // Full Game supplies: sizes only
  if (v.fullSetup) {
    for (const pid of Object.keys(v.fullSetup.supplies)) v.fullSetup.supplies[pid] = v.fullSetup.supplies[pid].map(() => HIDDEN);
    if (v.fullSetup.currentTileSpecId && state.pending?.playerId !== viewerId) v.fullSetup.currentTileSpecId = null;
  }
  // pending decision: full detail only for the viewer
  const pending = state.pending;
  if (pending && pending.playerId === viewerId) {
    v.pending = pending;
    v.waitingOn = { playerId: pending.playerId, kind: pending.kind };
  } else if (pending) {
    v.pending = null;
    v.waitingOn = pending.kind === 'reaction' ? { kind: 'reaction' } : { playerId: pending.playerId, kind: pending.kind };
  } else {
    v.pending = null;
    v.waitingOn = null;
  }
  return v;
}
