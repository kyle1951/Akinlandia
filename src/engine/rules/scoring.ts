import type { GameState, PlayerId, ScoreLine } from '../types';
import { GENERAL_BONUS, cityPoints, handValue, isGeneral } from '../query';

export function computeScores(state: GameState): ScoreLine[] {
  return state.seatOrder.map((pid) => {
    const cp = cityPoints(state, pid);
    const g = isGeneral(state, pid);
    return {
      playerId: pid,
      cityPoints: cp,
      generalBonus: g ? GENERAL_BONUS : 0,
      total: cp + (g ? GENERAL_BONUS : 0),
      cardValue: handValue(state, pid),
      isGeneral: g,
    };
  });
}

/**
 * Compare two score lines for ranking (ruling 39): total, then Generalship,
 * then value of cards in hand. Returns negative when a ranks ahead of b, 0
 * when fully tied (a Sing-Off is needed to separate them at the top).
 */
export function compareScoreLines(a: ScoreLine, b: ScoreLine): number {
  if (a.total !== b.total) return b.total - a.total;
  if (a.isGeneral !== b.isGeneral) return a.isGeneral ? -1 : 1;
  if (a.cardValue !== b.cardValue) return b.cardValue - a.cardValue;
  return 0;
}

/** Ranking best-first; fully tied players keep seat order (stable sort). */
export function rankScoreLines(lines: ScoreLine[]): ScoreLine[] {
  return [...lines].sort(compareScoreLines);
}

/** Players fully tied with the leader after all numeric tiebreakers. */
export function tiedAtTop(lines: ScoreLine[]): PlayerId[] {
  const ranked = rankScoreLines(lines);
  const top = ranked[0];
  return ranked.filter((l) => compareScoreLines(l, top) === 0).map((l) => l.playerId);
}
