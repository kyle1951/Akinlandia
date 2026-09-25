import type { TileId } from './hex';
import { shuffle } from './rng';
import { RulesError } from './types';
import type { AllianceId, CardType, CardUid, GameState, LogCategory, PlayerId, Task, Unit, UnitId, UnitKind } from './types';
import { allianceOf, isPureSea, isShipManned, membersOf, playerLabel, shipsOnTile, tile } from './query';
import { tileLabel } from './map';
import { CARD_BY_TYPE } from '../data/cards';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export function log(state: GameState, category: LogCategory, text: string, data?: Record<string, unknown>): void {
  state.log.push({ seq: state.log.length, turn: state.turn, category, text, data });
}

export function label(state: GameState, playerId: PlayerId): string {
  return playerLabel(state, playerId);
}

export function tLabel(state: GameState, tileId: TileId): string {
  return tileLabel(tile(state, tileId));
}

export function cardName(type: CardType): string {
  return CARD_BY_TYPE[type].name;
}

// ---------------------------------------------------------------------------
// Task queue
// ---------------------------------------------------------------------------

/** Insert tasks so that the first argument runs next. */
export function pushFront(state: GameState, ...tasks: Task[]): void {
  state.tasks.unshift(...tasks);
}

export function pushBack(state: GameState, ...tasks: Task[]): void {
  state.tasks.push(...tasks);
}

/** Remove the task at the head of the queue (the one currently executing). */
export function popTask(state: GameState): Task | undefined {
  return state.tasks.shift();
}

export function require(cond: unknown, message: string): asserts cond {
  if (!cond) throw new RulesError(message);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export function createUnit(state: GameState, kind: UnitKind, ownerId: PlayerId, tileId: TileId, opts: Partial<Unit> = {}): Unit {
  const id = opts.id ?? `u${state.nextUnitId++}`;
  const u: Unit = { id, kind, ownerId, tileId, moved: opts.moved ?? false, spent: opts.spent ?? false };
  state.units[id] = u;
  return u;
}

export function removeUnit(state: GameState, id: UnitId): Unit | undefined {
  const u = state.units[id];
  if (u) delete state.units[id];
  return u;
}

export function moveUnit(state: GameState, id: UnitId, tileId: TileId): void {
  const u = state.units[id];
  if (!u) throw new Error(`moveUnit: unknown unit ${id}`);
  u.tileId = tileId;
}

/** Destroy unmanned ships sitting on pure sea tiles (ruling 18). */
export function sinkUnmannedShipsAtSea(state: GameState): void {
  for (const u of Object.values(state.units)) {
    if (u.kind !== 'ship') continue;
    if (!isPureSea(tile(state, u.tileId))) continue;
    if (isShipManned(state, u)) continue;
    removeUnit(state, u.id);
    log(state, 'system', `An unmanned ship of ${label(state, u.ownerId)} is lost at sea on ${tLabel(state, u.tileId)}.`);
  }
}

/** Ships of alliances other than `allianceId` on a tile (used for captures). */
export function enemyShipsOnTile(state: GameState, tileId: TileId, allianceId: AllianceId): Unit[] {
  return shipsOnTile(state, tileId).filter((s) => allianceOf(state, s.ownerId) !== allianceId);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function drawCard(state: GameState, playerId: PlayerId): CardUid | null {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) {
      log(state, 'system', `The deck and the discard pile are both empty; ${label(state, playerId)} draws nothing.`);
      return null;
    }
    state.deck = shuffle(state.rng, [...state.discard]);
    state.discard = [];
    log(state, 'system', 'The discard pile is reshuffled into the deck.');
  }
  const uid = state.deck.pop()!;
  state.players[playerId].hand.push(uid);
  return uid;
}

export function discardFromHand(state: GameState, playerId: PlayerId, uid: CardUid): void {
  const hand = state.players[playerId].hand;
  const idx = hand.indexOf(uid);
  require(idx >= 0, `${label(state, playerId)} does not hold card ${uid}`);
  hand.splice(idx, 1);
  state.discard.push(uid);
}

export function findCardInHand(state: GameState, playerId: PlayerId, type: CardType): CardUid | null {
  for (const uid of state.players[playerId].hand) if (state.cards[uid].type === type) return uid;
  return null;
}

/**
 * Reaction candidates (ruling 35): bots and, by default, humans only when
 * they hold the card and could legally play it. With "always prompt" every
 * human meeting the conditions is asked, whether or not they hold the card.
 */
export function reactionCandidates(state: GameState, playerIds: PlayerId[], type: CardType, requireMoreThanOneCard: boolean): PlayerId[] {
  return playerIds.filter((pid) => {
    const p = state.players[pid];
    const holds = p.hand.some((uid) => state.cards[uid].type === type);
    const canPlay = holds && (!requireMoreThanOneCard || p.hand.length > 1);
    if (p.isBot) return canPlay;
    if (state.config.alwaysPromptReactions) return true;
    return canPlay;
  });
}

/** Members of an alliance, as ownership candidates; auto-resolves when there is one. */
export function ownershipCandidates(state: GameState, allianceId: AllianceId): PlayerId[] {
  return membersOf(state, allianceId);
}
