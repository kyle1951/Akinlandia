/**
 * Invariants checked after every action by the simulation harness (and
 * available to the UI in debug mode). Returns a list of violations.
 */
import type { GameState } from './types';
import { allianceOf, capacityOf } from './query';
import { DECK_SIZE } from '../data/cards';

export function checkInvariants(state: GameState): string[] {
  const errors: string[] = [];
  const allianceByTile = new Map<string, string>();
  const farmerByTile = new Set<string>();
  for (const u of Object.values(state.units)) {
    if (!state.tiles[u.tileId]) errors.push(`unit ${u.id} on unknown tile ${u.tileId}`);
    if (!state.players[u.ownerId]) errors.push(`unit ${u.id} owned by unknown player ${u.ownerId}`);
    const a = allianceOf(state, u.ownerId);
    const prev = allianceByTile.get(u.tileId);
    if (prev && prev !== a) errors.push(`tile ${u.tileId} holds pieces of ${prev} and ${a}`);
    allianceByTile.set(u.tileId, a);
    if (u.kind === 'farmer') {
      if (farmerByTile.has(u.tileId)) errors.push(`tile ${u.tileId} holds two farmers`);
      farmerByTile.add(u.tileId);
    }
  }
  for (const p of Object.values(state.players)) {
    if (p.food < 0) errors.push(`${p.id} has negative food ${p.food}`);
    if (p.raw < 0) errors.push(`${p.id} has negative raw ${p.raw}`);
    if (!Number.isInteger(p.food) || !Number.isInteger(p.raw)) errors.push(`${p.id} has non-integer stocks`);
  }
  // card conservation
  const seen = new Set<string>();
  let total = 0;
  const count = (uids: string[], where: string) => {
    for (const uid of uids) {
      if (seen.has(uid)) errors.push(`card ${uid} appears twice (${where})`);
      seen.add(uid);
      total++;
    }
  };
  count(state.deck, 'deck');
  count(state.discard, 'discard');
  for (const p of Object.values(state.players)) count(p.hand, `hand of ${p.id}`);
  if (state.turnData.politics && !state.turnData.politics.revealed) {
    for (const [pid, uids] of Object.entries(state.turnData.politics.played)) count(uids, `PLAY of ${pid}`);
  }
  if (total !== DECK_SIZE) errors.push(`card count ${total} != ${DECK_SIZE}`);
  // cities
  for (const t of Object.values(state.tiles)) {
    if (t.city && t.city.ownerId && !state.players[t.city.ownerId]) errors.push(`city ${t.id} owned by unknown ${t.city.ownerId}`);
    if (t.city && (t.city.temple || t.city.university) && t.city.level !== 3) errors.push(`city ${t.id} has L3 improvements at level ${t.city.level}`);
  }
  // allocation spent exactly
  for (const [pid, a] of Object.entries(state.turnData.allocations)) {
    const cap = a.farmers + a.soldiers + a.politicians;
    // capacity may have changed since allocation (conquests); compare against the allocation-time capacity when still in allocation phase
    if (state.phase === 'allocation' && cap !== capacityOf(state, pid)) errors.push(`${pid} allocated ${cap} but capacity is ${capacityOf(state, pid)}`);
  }
  // pending decision non-null until the game ends
  if (state.phase !== 'gameOver' && state.pending === null) errors.push('no pending decision although the game is not over');
  if (state.phase === 'gameOver' && !state.result) errors.push('game over without a result');
  for (const a of Object.values(state.alliances)) {
    if (a.generalId && state.players[a.generalId].allianceId !== a.id) errors.push(`General ${a.generalId} of ${a.id} is not a member`);
  }
  return errors;
}
