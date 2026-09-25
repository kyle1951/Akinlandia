import { ALLIANCE_TIEBREAK } from '../types';
import type { AllianceId, GameState, PlayerId } from '../types';
import { alliancePoints, membersOf, orderedMembers } from '../query';

/**
 * Alliance order (ruling 6): fewest total city points first; ties broken
 * Black, then White, then Green. Alliances with no members are omitted.
 */
export function computeAllianceOrder(state: GameState): AllianceId[] {
  const active = ALLIANCE_TIEBREAK.filter((a) => membersOf(state, a).length > 0);
  return [...active].sort((a, b) => {
    const pa = alliancePoints(state, a);
    const pb = alliancePoints(state, b);
    if (pa !== pb) return pa - pb;
    return ALLIANCE_TIEBREAK.indexOf(a) - ALLIANCE_TIEBREAK.indexOf(b);
  });
}

/**
 * Interleaved player order (ruling 7, footnotes 8 and 12): A's 1st, B's 1st,
 * C's 1st, A's 2nd, ... using each alliance's in-alliance order.
 */
export function interleavedOrder(state: GameState): PlayerId[] {
  const lists = state.allianceOrder.map((a) => orderedMembers(state, a));
  const longest = Math.max(0, ...lists.map((l) => l.length));
  const out: PlayerId[] = [];
  for (let k = 0; k < longest; k++) {
    for (const l of lists) if (l[k]) out.push(l[k]);
  }
  return out;
}

/** Alliance order then in-alliance order, without interleaving (feeding, politics resolution). */
export function sequentialOrder(state: GameState): PlayerId[] {
  const out: PlayerId[] = [];
  for (const a of state.allianceOrder) out.push(...orderedMembers(state, a));
  return out;
}
