import type { TileId } from '../hex';
import { rollD6 } from '../rng';
import type { AllianceId, CombatRecord, CombatSide, GameState, Unit, UnitId } from '../types';
import { allianceOf, shipsOnTile, soldiersOnTile, tile, unitsOnTile } from '../query';
import { destinationsFrom } from './movement';

export interface DiceResult {
  dice: number[];
  total: number;
  sixes: number;
}

export function rollDice(state: GameState, n: number): DiceResult {
  const dice: number[] = [];
  let total = 0;
  let sixes = 0;
  for (let i = 0; i < n; i++) {
    const d = rollD6(state.rng);
    dice.push(d);
    total += d;
    if (d === 6) sixes++;
  }
  return { dice, total, sixes };
}

/**
 * Defender bonus per non-spent defending soldier (ruling 21): +2, +1 more in a
 * city (owned or neutral), +1 more if that city has Walls.
 */
export function defenderBonusPerSoldier(state: GameState, tileId: TileId): { perSoldier: number; parts: string[] } {
  const t = tile(state, tileId);
  let per = 2;
  const parts = ['+2 defending'];
  if (t.city) {
    per += 1;
    parts.push('+1 city');
    if (t.city.walls) {
      per += 1;
      parts.push('+1 walls');
    }
  }
  return { perSoldier: per, parts };
}

/** Roll for one side. Spent soldiers roll nothing and add nothing. */
export function rollSide(state: GameState, side: CombatSide, isDefender: boolean, tileId: TileId): { sixes: number; explanation: string } {
  const active = side.soldierIds.filter((id) => !state.units[id].spent);
  const res = rollDice(state, active.length);
  side.dice = res.dice;
  side.diceTotal = res.total;
  let bonus = 0;
  let expl = `${active.length} die/dice [${res.dice.join(', ')}] = ${res.total}`;
  if (isDefender) {
    const b = defenderBonusPerSoldier(state, tileId);
    bonus = b.perSoldier * active.length;
    expl += ` + ${active.length} x (${b.parts.join(' ')}) = ${bonus}`;
  }
  side.bonus = bonus;
  side.score = res.total + bonus;
  expl += ` -> score ${side.score}, ${res.sixes} hit(s) inflicted`;
  return { sixes: res.sixes, explanation: expl };
}

/**
 * Which ships must go with removed soldiers (ruling 22, decision 55): loose
 * soldiers are removed first; once every remaining soldier has a ship, each
 * further removal takes a ship, preferring the removed soldier's own faction.
 */
export function shipsLostWithSoldiers(state: GameState, shipIds: UnitId[], soldiersBefore: number, removedSoldierIds: UnitId[]): UnitId[] {
  const remainingSoldiers = soldiersBefore - removedSoldierIds.length;
  const toRemove = Math.max(0, Math.min(shipIds.length, soldiersBefore) - remainingSoldiers);
  if (toRemove === 0) return [];
  const pool = [...shipIds];
  const chosen: UnitId[] = [];
  // prefer ships owned by the removed soldiers' owners
  for (const sid of removedSoldierIds) {
    if (chosen.length >= toRemove) break;
    const owner = state.units[sid]?.ownerId;
    const idx = pool.findIndex((shipId) => state.units[shipId]?.ownerId === owner);
    if (idx >= 0) chosen.push(pool.splice(idx, 1)[0]);
  }
  while (chosen.length < toRemove && pool.length) chosen.push(pool.shift()!);
  return chosen;
}

export type FinalControl = { winner: 'attacker' | 'defender'; reason: string; destroySpentDefenders: boolean };

/**
 * Final territorial control (ruling 23), evaluated after casualties.
 */
export function finalControl(state: GameState, c: CombatRecord): FinalControl {
  const attSurv = c.attacker.soldierIds.filter((id) => state.units[id]);
  const defSurv = c.defender.soldierIds.filter((id) => state.units[id]);
  const defActive = defSurv.filter((id) => !state.units[id].spent);
  if (attSurv.length === 0 && defSurv.length === 0) {
    return { winner: 'defender', reason: 'Both sides were obliterated; the defender retains control.', destroySpentDefenders: false };
  }
  if (attSurv.length === 0) {
    return { winner: 'defender', reason: 'The attacker has no survivors; the defender retains control.', destroySpentDefenders: false };
  }
  if (c.attacker.score > c.defender.score) {
    return { winner: 'attacker', reason: `Attacker ${c.attacker.score} beats defender ${c.defender.score}.`, destroySpentDefenders: false };
  }
  // defender score >= attacker score
  if (defActive.length === 0) {
    return {
      winner: 'attacker',
      reason: `Defender scored ${c.defender.score} to ${c.attacker.score} but has no non-spent survivors; spent defenders are destroyed and the attacker takes the tile.`,
      destroySpentDefenders: true,
    };
  }
  if (c.attacker.score === c.defender.score) {
    return { winner: 'defender', reason: `Tied at ${c.attacker.score}; the defender holds.`, destroySpentDefenders: false };
  }
  return { winner: 'defender', reason: `Defender ${c.defender.score} beats attacker ${c.attacker.score}.`, destroySpentDefenders: false };
}

export interface RetreatOption {
  unitId: UnitId;
  destinations: { tileId: TileId; byShip: boolean }[];
}

/** Is the tile available for a retreat of `allianceId` (decision 57)? */
export function retreatTileAvailable(state: GameState, tileId: TileId, allianceId: AllianceId): boolean {
  for (const u of unitsOnTile(state, tileId)) {
    if (allianceOf(state, u.ownerId) !== allianceId) return false;
  }
  return true;
}

/**
 * Retreat options for surviving soldiers of an alliance in a tile (ruling 24).
 * Land retreats cross non-mountain land edges; ship retreats need a ship of
 * the alliance in the tile (one per soldier) and cross a sea edge.
 */
export function retreatOptions(state: GameState, tileId: TileId, allianceId: AllianceId, soldiers: Unit[]): { units: RetreatOption[]; shipsAvailable: number } {
  const ships = shipsOnTile(state, tileId).filter((s) => allianceOf(state, s.ownerId) === allianceId);
  const dests = destinationsFrom(state, tileId).filter((d) => retreatTileAvailable(state, d.tileId, allianceId));
  const units: RetreatOption[] = soldiers.map((s) => ({
    unitId: s.id,
    destinations: dests
      .filter((d) => d.via === 'land' || ships.length > 0)
      .map((d) => ({ tileId: d.tileId, byShip: d.via === 'sea' })),
  }));
  return { units, shipsAvailable: ships.length };
}

export function enemySoldiersOnTile(state: GameState, tileId: TileId, allianceId: AllianceId): Unit[] {
  return soldiersOnTile(state, tileId).filter((u) => allianceOf(state, u.ownerId) !== allianceId);
}
