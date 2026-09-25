import type { AllianceId, GameState, PlayerId } from '../types';
import { CARD_BY_TYPE } from '../../data/cards';
import { orderedMembers } from '../query';

export function playedValue(state: GameState, uids: string[]): number {
  let v = 0;
  for (const uid of uids) v += CARD_BY_TYPE[state.cards[uid].type].value;
  return v;
}

/**
 * Elect the General of an alliance (ruling 28): highest politics score; tie
 * goes to the incumbent if tied, otherwise to the tied player earliest in the
 * current in-alliance order. Members who played nothing score nothing but are
 * still candidates only if at least one card was played by someone; when no
 * cards were played at all the incumbent stays (decision 72).
 */
export function electGeneral(state: GameState, allianceId: AllianceId, scores: Record<PlayerId, number>): { winner: PlayerId; reason: string } {
  const members = orderedMembers(state, allianceId);
  const incumbent = state.alliances[allianceId].generalId;
  const anyPlayed = members.some((m) => Object.prototype.hasOwnProperty.call(scores, m));
  if (!anyPlayed) {
    return { winner: incumbent ?? members[0], reason: 'no cards were played; the incumbent remains' };
  }
  let best = -Infinity;
  for (const m of members) best = Math.max(best, scores[m] ?? 0);
  const tied = members.filter((m) => (scores[m] ?? 0) === best);
  if (tied.length === 1) return { winner: tied[0], reason: `highest politics score ${best}` };
  if (incumbent && tied.includes(incumbent)) return { winner: incumbent, reason: `tied at ${best}; the incumbent General prevails` };
  return { winner: tied[0], reason: `tied at ${best}; earliest in the General's order prevails` };
}
