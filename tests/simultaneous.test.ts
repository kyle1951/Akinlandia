import { describe, expect, it } from 'vitest';
import { advance } from '../src/engine/machine';
import { destinationsFrom } from '../src/engine/rules/movement';
import { viewForPlayer } from '../src/engine/view';
import { botConfig, replay, runBotGame, runBots } from '../src/bots/runner';
import { act, addUnit, clearUnits, newGame, playerOf, setRolls, unitsAt } from './helpers';
import type { AllianceId, CombatRecord, GameState, PlayerId, SheetOrder } from '../src/engine/types';

/** Three mutually adjacent land tiles without cities, joined by land edges. */
function triangle(s: GameState): [string, string, string] {
  const land = (id: string) => destinationsFrom(s, id).filter((d) => d.via === 'land' && !s.tiles[d.tileId].city).map((d) => d.tileId);
  for (const t of Object.values(s.tiles)) {
    if (t.city) continue;
    const ns = land(t.id);
    for (const a of ns) for (const b of ns) if (a < b && land(a).includes(b)) return [t.id, a, b];
  }
  throw new Error('no triangle');
}

/** A fresh simultaneous game at the start of the Full round with an empty board. */
function fullRound(): { s: GameState; p: Record<AllianceId, PlayerId>; tri: [string, string, string] } {
  const s = newGame(3, 1, { militaryMode: 'simultaneous' });
  runBots(s, { until: (st) => st.pending?.kind === 'submitOrders' });
  clearUnits(s);
  s.tasks = [{ kind: 'simRound', idx: 1, started: false }];
  s.pending = null;
  const p = { white: playerOf(s, 'white'), black: playerOf(s, 'black'), green: playerOf(s, 'green') };
  return { s, p, tri: triangle(s) };
}

/** Collect sheets in alliance order (alliances without a sheet submit nothing), then let bots answer the rest. */
function submit(s: GameState, sheets: Partial<Record<AllianceId, SheetOrder[]>>, rolls?: number[]): void {
  advance(s);
  while (s.pending?.kind === 'submitOrders') {
    const a = s.pending.allianceId;
    const last = !s.allianceOrder.slice(s.allianceOrder.indexOf(a) + 1).some((x) => sheets[x]);
    if (last && rolls) setRolls(s, rolls);
    act(s, { kind: 'submitOrders', playerId: s.pending.playerId, orders: sheets[a] ?? [], scuttle: [] });
  }
  runBots(s);
}

const move = (from: string, to: string, unitIds: string[]): SheetOrder => ({ sourceTileId: from, groups: [{ destTileId: to, unitIds }] });
const combats = (s: GameState): CombatRecord[] => Object.values(s.turnData.combats);
const alliancesAt = (s: GameState, t: string) => [...new Set(unitsAt(s, t).map((u) => s.players[u.ownerId].allianceId))];

describe('simultaneous orders (decision 109)', () => {
  it('units that march out do not defend: an attack on an emptied tile walks in', () => {
    const { s, p, tri: [a, b, c] } = fullRound();
    const w = addUnit(s, 'soldier', p.white, a);
    const k = addUnit(s, 'soldier', p.black, c);
    submit(s, { white: [move(a, b, [w.id])], black: [move(c, a, [k.id])] });
    expect(combats(s)).toHaveLength(0);
    expect(s.units[w.id].tileId).toBe(b);
    expect(s.units[k.id].tileId).toBe(a);
    expect(s.lastResolution?.forces.map((f) => f.outcome)).toEqual(['arrived', 'arrived']);
  });

  it('forces swapping tiles clash at the border; the winner marches on', () => {
    const { s, p, tri: [a, b] } = fullRound();
    const w = addUnit(s, 'soldier', p.white, a);
    const k = addUnit(s, 'soldier', p.black, b);
    const first = s.allianceOrder.indexOf('white') < s.allianceOrder.indexOf('black') ? w : k;
    const second = first === w ? k : w;
    submit(s, { white: [move(a, b, [w.id])], black: [move(b, a, [k.id])] }, [6, 1]);
    const c = combats(s);
    expect(c).toHaveLength(1);
    expect(c[0].mode).toBe('border');
    expect(c[0].winner).toBe('attacker');
    expect(s.units[second.id]).toBeUndefined();
    expect(s.units[first.id].tileId).toBe(first === w ? b : a);
  });

  it('two alliances entering the same empty tile fight a contest without bonuses; the loser stays home', () => {
    const { s, p, tri: [a, b, c] } = fullRound();
    const w = addUnit(s, 'soldier', p.white, a);
    const k = addUnit(s, 'soldier', p.black, c);
    submit(s, { white: [move(a, b, [w.id])], black: [move(c, b, [k.id])] }, [5, 2]);
    const cs = combats(s);
    expect(cs).toHaveLength(1);
    expect(cs[0].mode).toBe('contest');
    expect(cs[0].attacker.bonus + cs[0].defender.bonus).toBe(0);
    const firstWhite = s.allianceOrder.indexOf('white') < s.allianceOrder.indexOf('black');
    const [winner, loser, loserHome] = firstWhite ? [w, k, c] : [k, w, a];
    expect(s.units[winner.id].tileId).toBe(b);
    expect(s.units[loser.id].tileId).toBe(loserHome);
  });

  it('forces of one alliance from several tiles assault together', () => {
    const { s, p, tri: [a, b, c] } = fullRound();
    const w1 = addUnit(s, 'soldier', p.white, a);
    const w2 = addUnit(s, 'soldier', p.white, c);
    const k = addUnit(s, 'soldier', p.black, b);
    submit(s, { white: [move(a, b, [w1.id]), move(c, b, [w2.id])] }, [6, 6, 1]);
    const cs = combats(s);
    expect(cs).toHaveLength(1);
    expect(cs[0].mode).toBe('assault');
    expect(cs[0].attacker.soldierIds.sort()).toEqual([w1.id, w2.id].sort());
    expect(cs[0].defender.bonus).toBe(2);
    expect(s.units[k.id]).toBeUndefined();
    expect(alliancesAt(s, b)).toEqual(['white']);
  });

  it('a ring of marches into emptied tiles rotates at once', () => {
    const { s, p, tri: [a, b, c] } = fullRound();
    const w = addUnit(s, 'soldier', p.white, a);
    const k = addUnit(s, 'soldier', p.black, b);
    const g = addUnit(s, 'soldier', p.green, c);
    submit(s, { white: [move(a, b, [w.id])], black: [move(b, c, [k.id])], green: [move(c, a, [g.id])] });
    expect(combats(s)).toHaveLength(0);
    expect([s.units[w.id].tileId, s.units[k.id].tileId, s.units[g.id].tileId]).toEqual([b, c, a]);
  });

  it('a repulsed force falls back and defends the tile it left', () => {
    const { s, p, tri: [a, b, c] } = fullRound();
    const w = addUnit(s, 'soldier', p.white, a);
    for (let i = 0; i < 3; i++) addUnit(s, 'soldier', p.black, b);
    const g = addUnit(s, 'soldier', p.green, c);
    submit(s, { white: [move(a, b, [w.id])], green: [move(c, a, [g.id])] }, [1, 1, 1, 1, 1, 1]);
    const cs = combats(s);
    expect(cs.map((x) => [x.tileId, x.attacker.allianceId, x.defender.allianceId, x.winner])).toEqual([
      [b, 'white', 'black', 'defender'],
      [a, 'green', 'white', 'defender'],
    ]);
    expect(s.units[w.id].tileId).toBe(a);
    expect(s.units[g.id].tileId).toBe(c);
  });

  it('keeps other alliances’ sealed orders out of a player’s view until the reveal', () => {
    const s = newGame(3, 2, { militaryMode: 'simultaneous' });
    runBots(s, { until: (st) => st.pending?.kind === 'submitOrders' && Object.keys(st.turnData.sim?.submitted ?? {}).length > 0 });
    const sealed = Object.keys(s.turnData.sim!.submitted) as AllianceId[];
    const outsider = s.seatOrder.find((pid) => !sealed.includes(s.players[pid].allianceId!))!;
    const insider = s.seatOrder.find((pid) => s.players[pid].allianceId === sealed[0])!;
    expect(Object.keys(viewForPlayer(s, outsider).turnData.sim!.submitted)).toEqual([]);
    expect(Object.keys(viewForPlayer(s, insider).turnData.sim!.submitted)).toEqual([sealed[0]]);
  });

  it('bot games finish with every invariant holding and replay exactly', () => {
    for (const [seed, players] of [
      [21, 3],
      [22, 6],
      [23, 9],
    ]) {
      const end = runBotGame(seed, players, { config: { militaryMode: 'simultaneous' }, checkInvariants: true });
      expect(end.phase).toBe('gameOver');
      expect(end.lastResolution).toBeTruthy();
      const again = replay(botConfig(players, { militaryMode: 'simultaneous' }), seed, end.actionLog);
      expect(again.result).toEqual(end.result);
    }
  });
});
