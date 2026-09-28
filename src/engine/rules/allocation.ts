import type { Allocation, GameState, PlayerId } from '../types';
import { COSTS, capacityOf } from '../query';

export interface AllocationCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  capacity: number;
  capacityUsed: number;
  rawCost: number;
  foodCost: number;
}

export function emptyAllocation(): Allocation {
  return { farmers: 0, soldiers: 0, politicians: 0, ships: 0, levelUps: 0, temples: 0, universities: 0, walls: 0 };
}

export function rawCostOf(a: Allocation): number {
  return a.soldiers * COSTS.soldierRaw + a.ships * COSTS.ship + a.levelUps * COSTS.levelUp + a.temples * COSTS.temple + a.universities * COSTS.university + a.walls * COSTS.walls;
}

/** House rule (decision 99): each new soldier also costs food at allocation. */
export function foodCostOf(a: Allocation): number {
  return a.soldiers * COSTS.soldierFood;
}

/**
 * Validate an allocation (ruling 8 and 9): capacity spent exactly on farmers,
 * soldiers and politicians; raw material purchases must be affordable.
 * Warnings flag purchases that cannot be placed (they would be lost).
 */
export function checkAllocation(state: GameState, playerId: PlayerId, a: Allocation): AllocationCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const p = state.players[playerId];
  const capacity = capacityOf(state, playerId);
  const fields: (keyof Allocation)[] = ['farmers', 'soldiers', 'politicians', 'ships', 'levelUps', 'temples', 'universities', 'walls'];
  for (const f of fields) {
    const v = a[f];
    if (!Number.isInteger(v) || v < 0) errors.push(`${f} must be a non-negative whole number`);
  }
  const capacityUsed = a.farmers + a.soldiers + a.politicians;
  if (capacityUsed !== capacity) errors.push(`Productive capacity must be spent in full: ${capacityUsed} of ${capacity} allocated`);
  const rawCost = rawCostOf(a);
  if (rawCost > p.raw) errors.push(`Raw materials: purchases cost ${rawCost} (soldiers ${a.soldiers * COSTS.soldierRaw}, ships and buildings ${rawCost - a.soldiers * COSTS.soldierRaw}) but only ${p.raw} in stock`);
  const foodCost = foodCostOf(a);
  if (foodCost > p.food) errors.push(`Food: raising ${a.soldiers} soldier(s) costs ${foodCost} food but only ${p.food} in stock`);

  // Placement warnings (decision 50): count what could legally be placed.
  const cities = Object.values(state.tiles).filter((t) => t.city && t.city.ownerId === playerId);
  const coastalCities = cities.filter((t) => t.edges.some((e) => e.type === 'sea'));
  if (a.ships > 0 && coastalCities.length === 0) warnings.push('You control no coastal city: ships cannot be placed and would be lost.');
  if (a.soldiers > 0 && cities.length === 0) warnings.push('You control no city: soldiers cannot be placed and would be lost.');
  const levelUpRoom = cities.reduce((n, t) => n + (3 - t.city!.level), 0);
  if (a.levelUps > levelUpRoom) warnings.push(`Only ${levelUpRoom} city level improvement(s) can be placed; the rest would be lost.`);
  const wallRoom = cities.filter((t) => !t.city!.walls).length;
  if (a.walls > wallRoom) warnings.push(`Only ${wallRoom} set(s) of Walls can be placed; the rest would be lost.`);
  // temples/universities need an L3 city, possibly after this turn's level-ups
  const l3Possible = cities.filter((t) => t.city!.level === 3).length + Math.min(a.levelUps, levelUpRoom);
  const templeRoom = cities.filter((t) => !t.city!.temple).length;
  const uniRoom = cities.filter((t) => !t.city!.university).length;
  if (a.temples > Math.min(templeRoom, l3Possible)) warnings.push('Temples require a Level 3 city (max one per city); some would be lost.');
  if (a.universities > Math.min(uniRoom, l3Possible)) warnings.push('Universities require a Level 3 city (max one per city); some would be lost.');

  return { ok: errors.length === 0, errors, warnings, capacity, capacityUsed, rawCost, foodCost };
}
