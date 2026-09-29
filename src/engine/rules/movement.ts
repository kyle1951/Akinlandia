import { oppositeDir } from '../hex';
import type { TileId } from '../hex';
import { RulesError } from '../types';
import type { AllianceId, GameState, MoveGroup, SubPhase, Unit } from '../types';
import { allianceOf, neighborsOf, tile, unitsOnTile } from '../query';

export function isShipPhase(sub: SubPhase): boolean {
  return sub === 'ships1' || sub === 'ships2' || sub === 'ships';
}

/** Units of the alliance on the tile that may still be ordered this sub-phase. */
export function movableUnitsAt(state: GameState, allianceId: AllianceId, tileId: TileId): Unit[] {
  return unitsOnTile(state, tileId).filter((u) => u.kind !== 'farmer' && allianceOf(state, u.ownerId) === allianceId && !u.moved && !u.spent);
}

export interface Destination {
  tileId: TileId;
  via: 'land' | 'sea';
}

/** Adjacent tiles reachable from a tile, with the crossing type (mountains excluded). */
export function destinationsFrom(state: GameState, tileId: TileId): Destination[] {
  const t = tile(state, tileId);
  const out: Destination[] = [];
  for (const { dir, tile: n } of neighborsOf(state, tileId)) {
    const e = t.edges[dir];
    if (e.type === 'sea') out.push({ tileId: n.id, via: 'sea' });
    else if (!e.mountain && !n.edges[oppositeDir(dir)].mountain) out.push({ tileId: n.id, via: 'land' });
  }
  return out;
}

/** Destinations legal for the given sub-phase given the movable units present. */
export function legalDestinations(state: GameState, allianceId: AllianceId, tileId: TileId, sub: SubPhase): Destination[] {
  const units = movableUnitsAt(state, allianceId, tileId);
  const soldiers = units.filter((u) => u.kind === 'soldier').length;
  const ships = units.filter((u) => u.kind === 'ship').length;
  if (soldiers === 0) return [];
  return destinationsFrom(state, tileId).filter((d) => {
    if (d.via === 'sea') return ships > 0;
    return !isShipPhase(sub);
  });
}

/** Tiles from which the General could issue at least one legal move. */
export function orderableSourceTiles(state: GameState, allianceId: AllianceId, sub: SubPhase): TileId[] {
  const seen = new Set<TileId>();
  for (const u of Object.values(state.units)) {
    if (u.kind !== 'soldier' || u.moved || u.spent) continue;
    if (allianceOf(state, u.ownerId) !== allianceId) continue;
    if (seen.has(u.tileId)) continue;
    if (legalDestinations(state, allianceId, u.tileId, sub).length > 0) seen.add(u.tileId);
  }
  return [...seen].sort();
}

/**
 * Validate an order (rulings 15-17). Throws RulesError when illegal.
 */
export function validateOrder(state: GameState, allianceId: AllianceId, sub: SubPhase, sourceTileId: TileId, groups: MoveGroup[]): void {
  if (!state.tiles[sourceTileId]) throw new RulesError(`Unknown source tile ${sourceTileId}`);
  if (groups.length === 0) throw new RulesError('An order must move at least one unit (use pass otherwise)');
  const movable = new Map(movableUnitsAt(state, allianceId, sourceTileId).map((u) => [u.id, u]));
  const used = new Set<string>();
  const dests = new Map(destinationsFrom(state, sourceTileId).map((d) => [d.tileId, d]));
  const seenDest = new Set<TileId>();
  for (const g of groups) {
    const d = dests.get(g.destTileId);
    if (!d) throw new RulesError(`${g.destTileId} is not reachable from ${sourceTileId}`);
    if (seenDest.has(g.destTileId)) throw new RulesError(`Destination ${g.destTileId} listed twice`);
    seenDest.add(g.destTileId);
    if (g.unitIds.length === 0) throw new RulesError(`No units assigned to ${g.destTileId}`);
    let soldiers = 0;
    let ships = 0;
    for (const id of g.unitIds) {
      const u = movable.get(id);
      if (!u) throw new RulesError(`Unit ${id} cannot be ordered from ${sourceTileId} (not there, already moved, spent, or not yours)`);
      if (used.has(id)) throw new RulesError(`Unit ${id} assigned twice`);
      used.add(id);
      if (u.kind === 'soldier') soldiers++;
      else ships++;
    }
    if (d.via === 'sea') {
      if (soldiers !== ships) throw new RulesError(`Crossing a sea edge to ${g.destTileId}: every ship must carry exactly one soldier (${soldiers} soldiers, ${ships} ships)`);
      if (soldiers === 0) throw new RulesError(`Nothing manned is moving to ${g.destTileId}`);
    } else {
      if (isShipPhase(sub)) throw new RulesError(`Only manned ships may move during ${sub}; ${g.destTileId} is reached over land`);
      if (ships > 0) throw new RulesError(`Ships cannot cross a land edge to ${g.destTileId}`);
      if (soldiers === 0) throw new RulesError(`No soldiers moving to ${g.destTileId}`);
    }
  }
}
