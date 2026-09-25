/**
 * Full Game tile-placement setup (ruling 40, decisions 77-82).
 *
 * The board starts as one sea tile in the centre of a bounded hex play area.
 * In reverse role-selection order players draw a random tile from their own
 * supply and place it, rotated, where every shared edge matches. Spots that
 * touch more existing tiles take priority (3+ before 2 before 1).
 */
import { hexDistance, hexesWithinRadius, neighbor, oppositeDir, parseTileId, tileId } from './hex';
import type { TileId } from './hex';
import { shuffle } from './rng';
import type { Action, Edge, GameState, PendingDecision, PlayerId, Task, Tile } from './types';
import { label, log, popTask, pushFront, require, tLabel } from './core';
import { citiesOf } from './query';
import { CENTER_SEA_TILE, TILE_BAG, rotatedEdges, tileSpecById } from '../data/tileBag';
import type { BagTileSpec } from '../data/tileBag';

export const FULL_GAME_RADIUS = 6;
export const MAX_CLAIMS = 2;

export interface Placement {
  tileId: TileId;
  rotation: number;
  touching: number;
}

function specToTile(spec: BagTileSpec, q: number, r: number, rotation: number, ownerId: PlayerId | null): Tile {
  return {
    id: tileId(q, r),
    q,
    r,
    edges: rotatedEdges(spec.edges, rotation).map((e) => ({ ...e })),
    city: spec.city ? { name: spec.city.name, slot: null, level: 1, ownerId, walls: false, temple: false, university: false } : null,
    resources: [...spec.resources],
  };
}

/** Does `edges` (already rotated) fit at (q, r) given the current board? Returns the touching count or -1. */
function fitAt(state: GameState, q: number, r: number, edges: Edge[]): number {
  let touching = 0;
  for (let d = 0; d < 6; d++) {
    const n = neighbor({ q, r }, d);
    const nt = state.tiles[tileId(n.q, n.r)];
    if (!nt) continue;
    if (nt.edges[oppositeDir(d)].type !== edges[d].type) return -1;
    touching++;
  }
  return touching;
}

/** All legal placements for a bag tile, filtered to the highest touching class (decision 79). */
export function legalPlacements(state: GameState, spec: BagTileSpec, radius = FULL_GAME_RADIUS): Placement[] {
  const all: Placement[] = [];
  const candidates = new Set<TileId>();
  for (const t of Object.values(state.tiles)) {
    for (let d = 0; d < 6; d++) {
      const n = neighbor({ q: t.q, r: t.r }, d);
      const id = tileId(n.q, n.r);
      if (state.tiles[id]) continue;
      if (hexDistance({ q: 0, r: 0 }, n) > radius) continue;
      candidates.add(id);
    }
  }
  for (const id of candidates) {
    const { q, r } = parseTileId(id);
    for (let rot = 0; rot < 6; rot++) {
      const edges = rotatedEdges(spec.edges, rot);
      const touching = fitAt(state, q, r, edges);
      if (touching > 0) all.push({ tileId: id, rotation: rot, touching });
    }
  }
  if (all.length === 0) return [];
  const best = Math.max(...all.map((p) => Math.min(3, p.touching)));
  return all.filter((p) => Math.min(3, p.touching) === best).sort((a, b) => (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : a.rotation - b.rotation));
}

function initFullSetup(state: GameState): void {
  const n = state.seatOrder.length;
  const bag = [...TILE_BAG];
  const cityTiles = shuffle(state.rng, bag.filter((t) => t.city));
  const plain = shuffle(state.rng, bag.filter((t) => !t.city));
  const supplies: Record<PlayerId, string[]> = {};
  for (const pid of state.seatOrder) supplies[pid] = [];
  // every supply gets at least two city tiles (ruling 40)
  for (let k = 0; k < 2; k++) for (const pid of state.seatOrder) supplies[pid].push(cityTiles.pop()!.id);
  const rest = shuffle(state.rng, [...cityTiles, ...plain]);
  const per = Math.floor(rest.length / n);
  for (const pid of state.seatOrder) for (let i = 0; i < per; i++) supplies[pid].push(rest.pop()!.id);
  for (const pid of state.seatOrder) shuffle(state.rng, supplies[pid]);
  state.tiles = { [tileId(0, 0)]: specToTile(CENTER_SEA_TILE, 0, 0, 0, null) };
  state.fullSetup = {
    radius: FULL_GAME_RADIUS,
    supplies,
    claimed: Object.fromEntries(state.seatOrder.map((p) => [p, 0])),
    currentTileSpecId: null,
    discarded: [],
    lastPlaced: Object.fromEntries(state.seatOrder.map((p) => [p, null])),
  };
  log(state, 'setup', `The board is built tile by tile. Each leader holds ${2 + per} tiles; placement runs in reverse role order: ${[...state.roleOrder].reverse().map((p) => state.players[p].leaderName).join(', ')}.`);
}

function taskFullGameSetup(state: GameState, task: Extract<Task, { kind: 'fullGameSetup' }>): void {
  if (!state.fullSetup) initFullSetup(state);
  const fs = state.fullSetup!;
  const n = task.order.length;
  for (let step = 0; step < n; step++) {
    const pid = task.order[(task.idx + step) % n];
    const supply = fs.supplies[pid];
    while (supply.length > 0) {
      const specId = fs.currentTileSpecId ?? supply.pop()!;
      fs.currentTileSpecId = specId;
      const spec = tileSpecById(specId)!;
      const placements = legalPlacements(state, spec, fs.radius);
      if (placements.length === 0) {
        fs.discarded.push(specId);
        fs.currentTileSpecId = null;
        log(state, 'setup', `${label(state, pid)} draws a tile that fits nowhere; it is discarded.`);
        continue;
      }
      task.idx = (task.idx + step) % n;
      state.pending = {
        kind: 'placeTile',
        playerId: pid,
        tileSpecId: specId,
        hasCity: !!spec.city,
        canClaim: fs.claimed[pid] < MAX_CLAIMS,
        placements,
        supplyRemaining: supply.length,
      };
      return;
    }
  }
  // every supply is exhausted
  popTask(state);
  finishFullSetup(state);
}

function actionPlaceTile(state: GameState, action: Extract<Action, { kind: 'placeTile' }>, pending: Extract<PendingDecision, { kind: 'placeTile' }>): void {
  const pl = pending.placements.find((p) => p.tileId === action.tileId && p.rotation === action.rotation);
  require(pl, `${action.tileId} at rotation ${action.rotation} is not a legal placement`);
  const fs = state.fullSetup!;
  const spec = tileSpecById(pending.tileSpecId)!;
  const claim = action.claim && !!spec.city && fs.claimed[action.playerId] < MAX_CLAIMS;
  const { q, r } = parseTileId(action.tileId);
  const tile = specToTile(spec, q, r, action.rotation, claim ? action.playerId : null);
  state.tiles[tile.id] = tile;
  // mountains: a flag on either side makes the edge impassable; keep both sides in step (decision 45)
  for (let d = 0; d < 6; d++) {
    const nb = neighbor({ q, r }, d);
    const nt = state.tiles[tileId(nb.q, nb.r)];
    if (!nt) continue;
    const mine = tile.edges[d];
    const theirs = nt.edges[oppositeDir(d)];
    if (mine.type === 'land' && (mine.mountain || theirs.mountain)) {
      mine.mountain = true;
      theirs.mountain = true;
    }
  }
  if (claim) fs.claimed[action.playerId] += 1;
  fs.lastPlaced[action.playerId] = tile.id;
  fs.currentTileSpecId = null;
  log(state, 'setup', `${label(state, action.playerId)} places ${spec.city ? `the city of ${spec.city.name}` : 'a tile'} at ${tLabel(state, tile.id)}${claim ? ' and claims it' : ''}.`);
  const task = state.tasks[0] as Extract<Task, { kind: 'fullGameSetup' }>;
  task.idx = (task.idx + 1) % task.order.length;
}

function finishFullSetup(state: GameState): void {
  const fs = state.fullSetup!;
  for (const pid of state.seatOrder) {
    if (citiesOf(state, pid).length > 0) continue;
    // fallback (decision 82): nearest unclaimed city to the last tile placed
    const from = fs.lastPlaced[pid] ? parseTileId(fs.lastPlaced[pid]!) : { q: 0, r: 0 };
    const free = Object.values(state.tiles)
      .filter((t) => t.city && !t.city.ownerId)
      .sort((a, b) => hexDistance(from, a) - hexDistance(from, b) || (a.id < b.id ? -1 : 1));
    if (free.length === 0) {
      log(state, 'setup', `${label(state, pid)} ends setup with no city and no unclaimed city remains; they begin with nothing but politics.`);
      continue;
    }
    free[0].city!.ownerId = pid;
    log(state, 'setup', `${label(state, pid)} claimed no city; ${free[0].city!.name} is granted to them.`);
  }
  const placed = Object.keys(state.tiles).length;
  log(state, 'setup', `The board is complete: ${placed} tiles, ${Object.values(state.tiles).filter((t) => t.city).length} cities, ${fs.discarded.length} tile(s) discarded.`);
  pushFront(state, { kind: 'startTurn' });
}

export function handleFullGameTask(state: GameState, task: Task): boolean {
  if (task.kind !== 'fullGameSetup') return false;
  taskFullGameSetup(state, task);
  return true;
}

export function handleFullGameAction(state: GameState, action: Action, pending: PendingDecision): boolean {
  if (action.kind !== 'placeTile') return false;
  actionPlaceTile(state, action, pending as Extract<PendingDecision, { kind: 'placeTile' }>);
  return true;
}

export { hexesWithinRadius };
