import { neighbor, oppositeDir, tileId } from './hex';
import type { TileId } from './hex';
import { hasSeaEdge, isPureSea, tileType } from './map';
import type { AllianceId, CardUid, GameState, Player, PlayerId, Tile, Unit, UnitId } from './types';
import { CARD_BY_TYPE } from '../data/cards';

export const CITY_CAPACITY: Record<number, number> = { 1: 3, 2: 5, 3: 6 };
export const CITY_POINTS: Record<number, number> = { 1: 3, 2: 5, 3: 6 };
export const COSTS = { ship: 1, levelUp: 7, temple: 3, university: 3, walls: 2 } as const;
export const GENERAL_BONUS = 2;
export const END_GAME_TOTAL = 35;

export function player(state: GameState, id: PlayerId): Player {
  const p = state.players[id];
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function allianceOf(state: GameState, playerId: PlayerId): AllianceId {
  const a = state.players[playerId]?.allianceId;
  if (!a) throw new Error(`Player ${playerId} has no alliance`);
  return a;
}

export function membersOf(state: GameState, allianceId: AllianceId): PlayerId[] {
  return state.seatOrder.filter((pid) => state.players[pid].allianceId === allianceId);
}

/** Members in the General's in-alliance order (falls back to seat order). */
export function orderedMembers(state: GameState, allianceId: AllianceId): PlayerId[] {
  const order = state.alliances[allianceId].factionOrder;
  const members = membersOf(state, allianceId);
  if (order.length === members.length && order.every((p) => members.includes(p))) return [...order];
  return members;
}

export function generalOf(state: GameState, allianceId: AllianceId): PlayerId {
  const g = state.alliances[allianceId].generalId;
  if (!g) throw new Error(`Alliance ${allianceId} has no General`);
  return g;
}

export function isGeneral(state: GameState, playerId: PlayerId): boolean {
  const a = state.players[playerId].allianceId;
  return !!a && state.alliances[a].generalId === playerId;
}

export function unitsOnTile(state: GameState, tileId: TileId): Unit[] {
  const out: Unit[] = [];
  for (const u of Object.values(state.units)) if (u.tileId === tileId) out.push(u);
  return out;
}

export function soldiersOnTile(state: GameState, tileId: TileId): Unit[] {
  return unitsOnTile(state, tileId).filter((u) => u.kind === 'soldier');
}

export function shipsOnTile(state: GameState, tileId: TileId): Unit[] {
  return unitsOnTile(state, tileId).filter((u) => u.kind === 'ship');
}

export function farmersOnTile(state: GameState, tileId: TileId): Unit[] {
  return unitsOnTile(state, tileId).filter((u) => u.kind === 'farmer');
}

/** The alliance whose pieces occupy the tile, or null when empty. */
export function occupyingAlliance(state: GameState, tileId: TileId): AllianceId | null {
  for (const u of Object.values(state.units)) {
    if (u.tileId === tileId) return allianceOf(state, u.ownerId);
  }
  return null;
}

export function unitsOfPlayer(state: GameState, playerId: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.ownerId === playerId);
}

export function unitsOfAlliance(state: GameState, allianceId: AllianceId): Unit[] {
  return Object.values(state.units).filter((u) => state.players[u.ownerId].allianceId === allianceId);
}

export function citiesOf(state: GameState, playerId: PlayerId): Tile[] {
  return Object.values(state.tiles).filter((t) => t.city && t.city.ownerId === playerId);
}

export function cityCount(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const t of Object.values(state.tiles)) if (t.city && t.city.ownerId === playerId) n++;
  return n;
}

export function capacityOf(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const t of citiesOf(state, playerId)) n += CITY_CAPACITY[t.city!.level];
  return n;
}

export function cityPoints(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const t of citiesOf(state, playerId)) {
    const c = t.city!;
    n += CITY_POINTS[c.level];
    if (c.level === 3) {
      if (c.temple) n += 1;
      if (c.university) n += 1;
    }
  }
  return n;
}

export function alliancePoints(state: GameState, allianceId: AllianceId): number {
  let n = 0;
  for (const pid of membersOf(state, allianceId)) n += cityPoints(state, pid);
  return n;
}

export function scoreOf(state: GameState, playerId: PlayerId): number {
  return cityPoints(state, playerId) + (isGeneral(state, playerId) ? GENERAL_BONUS : 0);
}

export function handValue(state: GameState, playerId: PlayerId): number {
  let v = 0;
  for (const uid of state.players[playerId].hand) v += CARD_BY_TYPE[state.cards[uid].type].value;
  return v;
}

export function cardType(state: GameState, uid: CardUid) {
  return state.cards[uid].type;
}

export function holdsCard(state: GameState, playerId: PlayerId, type: string): boolean {
  return state.players[playerId].hand.some((uid) => state.cards[uid].type === type);
}

export function tile(state: GameState, id: TileId): Tile {
  const t = state.tiles[id];
  if (!t) throw new Error(`Unknown tile ${id}`);
  return t;
}

export function neighborsOf(state: GameState, id: TileId): { dir: number; tile: Tile }[] {
  const t = tile(state, id);
  const out: { dir: number; tile: Tile }[] = [];
  for (let d = 0; d < 6; d++) {
    const n = neighbor({ q: t.q, r: t.r }, d);
    const nt = state.tiles[tileId(n.q, n.r)];
    if (nt) out.push({ dir: d, tile: nt });
  }
  return out;
}

/** Can a soldier walk from a to b? Requires adjacency across a non-mountain land edge. */
export function landPassable(state: GameState, from: TileId, to: TileId): boolean {
  const a = tile(state, from);
  for (const { dir, tile: n } of neighborsOf(state, from)) {
    if (n.id !== to) continue;
    const e = a.edges[dir];
    const back = n.edges[oppositeDir(dir)];
    return e.type === 'land' && !e.mountain && !back.mountain;
  }
  return false;
}

/** Can a ship sail from a to b? Requires adjacency across a sea edge. */
export function seaPassable(state: GameState, from: TileId, to: TileId): boolean {
  const a = tile(state, from);
  for (const { dir, tile: n } of neighborsOf(state, from)) {
    if (n.id !== to) continue;
    return a.edges[dir].type === 'sea';
  }
  return false;
}

/** A ship is manned when at least one soldier of its alliance shares the tile (decision 49). */
export function isShipManned(state: GameState, ship: Unit): boolean {
  const alliance = allianceOf(state, ship.ownerId);
  return soldiersOnTile(state, ship.tileId).some((s) => allianceOf(state, s.ownerId) === alliance);
}

export function unmannedShipsOfAlliance(state: GameState, allianceId: AllianceId): Unit[] {
  return unitsOfAlliance(state, allianceId).filter((u) => u.kind === 'ship' && !isShipManned(state, u));
}

export function isCoastalOrIslandTile(t: Tile): boolean {
  return hasSeaEdge(t);
}

export { isPureSea, tileType };

export function unit(state: GameState, id: UnitId): Unit {
  const u = state.units[id];
  if (!u) throw new Error(`Unknown unit ${id}`);
  return u;
}

export function soldierCount(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const u of Object.values(state.units)) if (u.ownerId === playerId && u.kind === 'soldier') n++;
  return n;
}

export function playerLabel(state: GameState, playerId: PlayerId): string {
  const p = state.players[playerId];
  const f = p.factionId ? state.factions[p.factionId] : null;
  return f ? `${p.leaderName} (${allianceName(f.allianceId)} ${f.name})` : p.leaderName;
}

export function allianceName(a: AllianceId): string {
  return a.charAt(0).toUpperCase() + a.slice(1);
}
