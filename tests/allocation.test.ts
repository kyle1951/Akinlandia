import { describe, expect, it } from 'vitest';
import { checkAllocation, emptyAllocation } from '../src/engine/rules/allocation';
import { capacityOf, citiesOf } from '../src/engine/query';
import { act, newGame } from './helpers';

describe('allocation', () => {
  it('requires capacity to be spent exactly and raw materials to cover purchases', () => {
    const s = newGame(3, 1);
    const pid = s.pending!.playerId;
    expect(capacityOf(s, pid)).toBe(6);
    // house rules: each soldier also costs 1 food and 1 raw material
    const a = { ...emptyAllocation(), farmers: 3, soldiers: 2, politicians: 1 };
    s.players[pid].raw = 2;
    expect(checkAllocation(s, pid, a).ok).toBe(true);
    expect(checkAllocation(s, pid, a).foodCost).toBe(2);
    s.players[pid].raw = 0;
    expect(checkAllocation(s, pid, a).errors[0]).toMatch(/Raw materials/);
    expect(checkAllocation(s, pid, { ...emptyAllocation(), farmers: 3, politicians: 3 }).ok).toBe(true);
    expect(checkAllocation(s, pid, { ...a, soldiers: 1 }).errors[0]).toMatch(/spent in full/);
    s.players[pid].raw = 2;
    s.players[pid].food = 1;
    expect(checkAllocation(s, pid, a).errors[0]).toMatch(/Food: raising 2 soldier/);
    s.players[pid].food = 2;
    expect(checkAllocation(s, pid, { ...a, ships: 1 }).errors[0]).toMatch(/Raw materials/);
    s.players[pid].raw = 10;
    expect(checkAllocation(s, pid, { ...a, ships: 1, levelUps: 1 }).ok).toBe(true);
    expect(checkAllocation(s, pid, { ...a, ships: 2, levelUps: 1 }).ok).toBe(false);
    expect(checkAllocation(s, pid, { ...a, farmers: -1, soldiers: 6 }).ok).toBe(false);
  });

  it('capacity follows city levels (3/5/6) and improvements beyond L3 add nothing', () => {
    const s = newGame(3, 1);
    const pid = s.pending!.playerId;
    const cities = citiesOf(s, pid);
    cities[0].city!.level = 2;
    expect(capacityOf(s, pid)).toBe(8);
    cities[1].city!.level = 3;
    cities[1].city!.temple = true;
    expect(capacityOf(s, pid)).toBe(11);
  });

  it('deducts raw materials, records the free politician and warns about unplaceable buildings', () => {
    const s = newGame(3, 1);
    const pid = s.pending!.playerId;
    s.players[pid].raw = 5;
    const warn = checkAllocation(s, pid, { ...emptyAllocation(), politicians: 6, temples: 1 });
    expect(warn.ok).toBe(true);
    expect(warn.warnings.join(' ')).toMatch(/Temples require a Level 3 city/);
    act(s, { kind: 'allocate', playerId: pid, allocation: { ...emptyAllocation(), farmers: 4, soldiers: 1, politicians: 1, ships: 2 } });
    expect(s.players[pid].raw).toBe(2); // 2 ships + 1 soldier
    expect(s.players[pid].food).toBe(1); // 1 soldier raised
    expect(s.turnData.toDeploy[pid].politicians).toBe(2);
    expect(s.turnData.toDeploy[pid].ships).toBe(2);
  });

  it('rejects an illegal allocation with a clear error and keeps the decision pending', () => {
    const s = newGame(3, 1);
    const pid = s.pending!.playerId;
    expect(() => act(s, { kind: 'allocate', playerId: pid, allocation: { ...emptyAllocation(), farmers: 1 } })).toThrow(/spent in full/);
    expect(s.pending?.kind).toBe('allocate');
    expect(s.pending?.playerId).toBe(pid);
  });
});
