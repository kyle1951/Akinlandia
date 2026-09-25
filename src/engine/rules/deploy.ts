import { oppositeDir } from '../hex';
import type { TileId } from '../hex';
import { hasLandEdge, hasSeaEdge } from '../map';
import type { BuildingPlacement, FarmerLegalTile, GameState, PlayerId, Tile } from '../types';
import { allianceOf, citiesOf, farmersOnTile, isShipManned, neighborsOf, shipsOnTile, tile, unitsOnTile } from '../query';

/** Whether a tile is blocked for a farmer of `playerId` (ruling 11). */
export function farmerTileBlocked(state: GameState, playerId: PlayerId, t: Tile): boolean {
  const alliance = allianceOf(state, playerId);
  if (!hasLandEdge(t)) return true; // decision 48: no farmers at sea
  if (t.city && t.city.ownerId && t.city.ownerId !== playerId) return true; // another leader's city
  for (const u of unitsOnTile(state, t.id)) {
    if (u.kind === 'farmer') return true; // one farmer per tile (own or anyone's)
    if (allianceOf(state, u.ownerId) !== alliance) return true; // enemy unit
  }
  return false;
}

/** Tiles within land-path distance 2 of a city of the player (ruling 11a). */
export function farmerLandReach(state: GameState, playerId: PlayerId): Set<TileId> {
  const reach = new Set<TileId>();
  const frontier: { id: TileId; d: number }[] = citiesOf(state, playerId).map((c) => ({ id: c.id, d: 0 }));
  const best = new Map<TileId, number>();
  while (frontier.length) {
    const cur = frontier.shift()!;
    const prev = best.get(cur.id);
    if (prev !== undefined && prev <= cur.d) continue;
    best.set(cur.id, cur.d);
    reach.add(cur.id);
    if (cur.d === 2) continue;
    const t = tile(state, cur.id);
    for (const { dir, tile: n } of neighborsOf(state, cur.id)) {
      const e = t.edges[dir];
      const back = n.edges[oppositeDir(dir)];
      if (e.type !== 'land' || e.mountain || back.mountain) continue;
      frontier.push({ id: n.id, d: cur.d + 1 });
    }
  }
  return reach;
}

/**
 * Tiles reachable through a chain of manned ships (ruling 11b, footnote 14).
 * Chain tiles hold at least one manned ship of the player's alliance and are
 * linked by sea edges; the first is the player's city or sea-adjacent to it.
 * Legal farmer tiles are chain tiles and any tile sea-adjacent to one.
 */
export function farmerSeaReach(state: GameState, playerId: PlayerId): Set<TileId> {
  const alliance = allianceOf(state, playerId);
  const hasMannedShip = (id: TileId) => shipsOnTile(state, id).some((s) => allianceOf(state, s.ownerId) === alliance && isShipManned(state, s));
  const seaNeighbors = (id: TileId): TileId[] => {
    const t = tile(state, id);
    return neighborsOf(state, id)
      .filter(({ dir }) => t.edges[dir].type === 'sea')
      .map(({ tile: n }) => n.id);
  };
  const chain = new Set<TileId>();
  const queue: TileId[] = [];
  for (const c of citiesOf(state, playerId)) {
    if (hasMannedShip(c.id)) queue.push(c.id);
    for (const n of seaNeighbors(c.id)) if (hasMannedShip(n)) queue.push(n);
  }
  while (queue.length) {
    const id = queue.shift()!;
    if (chain.has(id)) continue;
    chain.add(id);
    for (const n of seaNeighbors(id)) if (hasMannedShip(n) && !chain.has(n)) queue.push(n);
  }
  const reach = new Set<TileId>(chain);
  for (const id of chain) for (const n of seaNeighbors(id)) reach.add(n);
  return reach;
}

export function legalFarmerTiles(state: GameState, playerId: PlayerId): FarmerLegalTile[] {
  const land = farmerLandReach(state, playerId);
  const sea = farmerSeaReach(state, playerId);
  const out: FarmerLegalTile[] = [];
  const seen = new Set<TileId>();
  for (const id of land) {
    if (farmerTileBlocked(state, playerId, state.tiles[id])) continue;
    seen.add(id);
    out.push({ tileId: id, via: 'land' });
  }
  for (const id of sea) {
    if (seen.has(id)) continue;
    if (farmerTileBlocked(state, playerId, state.tiles[id])) continue;
    seen.add(id);
    out.push({ tileId: id, via: 'sea' });
  }
  out.sort((a, b) => (a.tileId < b.tileId ? -1 : 1));
  return out;
}

/** Coastal or island city tiles controlled by the player (ruling 13). */
export function legalShipTiles(state: GameState, playerId: PlayerId): TileId[] {
  return citiesOf(state, playerId)
    .filter((t) => hasSeaEdge(t))
    .map((t) => t.id)
    .sort();
}

/** Any city tile controlled by the player (ruling 13). */
export function legalSoldierTiles(state: GameState, playerId: PlayerId): TileId[] {
  return citiesOf(state, playerId)
    .map((t) => t.id)
    .sort();
}

/**
 * Validate and simulate a sequence of building placements (ruling 9, decision 50).
 * Returns the error for the first illegal placement, or null when all are legal.
 */
export function checkBuildingPlacements(
  state: GameState,
  playerId: PlayerId,
  purchases: { levelUps: number; temples: number; universities: number; walls: number },
  placements: BuildingPlacement[],
): string | null {
  const remaining = { ...purchases };
  const cities = new Map<TileId, { level: number; walls: boolean; temple: boolean; university: boolean }>();
  for (const t of citiesOf(state, playerId)) cities.set(t.id, { level: t.city!.level, walls: t.city!.walls, temple: t.city!.temple, university: t.city!.university });
  for (const pl of placements) {
    const c = cities.get(pl.tileId);
    if (!c) return `${pl.tileId} is not a city you control`;
    switch (pl.kind) {
      case 'levelUp':
        if (remaining.levelUps <= 0) return 'No city level improvement left to place';
        if (c.level >= 3) return `${pl.tileId} is already Level 3`;
        c.level += 1;
        remaining.levelUps -= 1;
        break;
      case 'temple':
        if (remaining.temples <= 0) return 'No Temple left to place';
        if (c.level < 3) return `A Temple requires a Level 3 city (${pl.tileId})`;
        if (c.temple) return `${pl.tileId} already has a Temple`;
        c.temple = true;
        remaining.temples -= 1;
        break;
      case 'university':
        if (remaining.universities <= 0) return 'No University left to place';
        if (c.level < 3) return `A University requires a Level 3 city (${pl.tileId})`;
        if (c.university) return `${pl.tileId} already has a University`;
        c.university = true;
        remaining.universities -= 1;
        break;
      case 'walls':
        if (remaining.walls <= 0) return 'No Walls left to place';
        if (c.walls) return `${pl.tileId} already has Walls`;
        c.walls = true;
        remaining.walls -= 1;
        break;
    }
  }
  return null;
}

export { farmersOnTile };
