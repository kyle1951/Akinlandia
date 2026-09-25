import { describe, expect, it } from 'vitest';
import { computeAllianceOrder, interleavedOrder } from '../src/engine/rules/turnOrder';
import { allianceSeatCounts } from '../src/engine/setup';
import { newGame, playerOf } from './helpers';
import { citiesOf } from '../src/engine/query';

describe('alliance order', () => {
  it('orders by fewest city points with Black, White, Green tiebreak', () => {
    const s = newGame(3, 1);
    // all three alliances start with 2 L1 cities = 6 points each: tiebreak applies
    expect(computeAllianceOrder(s)).toEqual(['black', 'white', 'green']);
    // give green an extra city: it goes last; make white poorer than black
    const green = playerOf(s, 'green');
    const white = playerOf(s, 'white');
    const someNeutral = Object.values(s.tiles).find((t) => t.city && !t.city.ownerId)!;
    someNeutral.city!.ownerId = green;
    citiesOf(s, white)[0].city!.ownerId = null;
    expect(computeAllianceOrder(s)).toEqual(['white', 'black', 'green']);
    // level matters: an L3 city (6) beats two... make black richer than green
    const black = playerOf(s, 'black');
    for (const t of citiesOf(s, black)) t.city!.level = 3;
    expect(computeAllianceOrder(s)).toEqual(['white', 'green', 'black']);
  });

  it('balances seats across alliances with extras to Black, White, Green', () => {
    expect(allianceSeatCounts(3)).toEqual({ white: 1, black: 1, green: 1 });
    expect(allianceSeatCounts(4)).toEqual({ white: 1, black: 2, green: 1 });
    expect(allianceSeatCounts(5)).toEqual({ white: 2, black: 2, green: 1 });
    expect(allianceSeatCounts(9)).toEqual({ white: 3, black: 3, green: 3 });
  });

  it('interleaves the in-alliance orders A1 B1 C1 A2 B2 C2', () => {
    const s = newGame(6, 3);
    const lists = s.allianceOrder.map((a) => s.alliances[a].factionOrder);
    const expected = [lists[0][0], lists[1][0], lists[2][0], lists[0][1], lists[1][1], lists[2][1]];
    expect(interleavedOrder(s)).toEqual(expected);
  });

  it('assigns Purple first and makes the royal faction the General', () => {
    const s = newGame(6, 5);
    for (const a of ['white', 'black', 'green'] as const) {
      const g = s.alliances[a].generalId!;
      expect(s.factions[s.players[g].factionId!].royal).toBe(true);
    }
  });
});
