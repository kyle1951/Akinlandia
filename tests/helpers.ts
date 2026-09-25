import { expect } from 'vitest';
import type { Action, AllianceId, CardType, GameState, PlayerId, SubPhase, Unit, UnitKind } from '../src/engine/types';
import { SUB_PHASES } from '../src/engine/types';
import { createGame } from '../src/engine/setup';
import { advance, applyActionInPlace } from '../src/engine/machine';
import { createRng, rollD6 } from '../src/engine/rng';
import { botConfig, runBots } from '../src/bots/runner';
import type { GameConfig } from '../src/engine/types';

export function newGame(n = 3, seed = 1, cfg: Partial<GameConfig> = {}): GameState {
  const state = createGame(botConfig(n, cfg), seed);
  // roles are chosen by bots; stop at the first allocation
  return runBots(state, { until: (s) => s.pending?.kind === 'allocate' });
}

export function act(state: GameState, action: Action): GameState {
  applyActionInPlace(state, action);
  return state;
}

export function refresh(state: GameState): GameState {
  state.pending = null;
  advance(state);
  return state;
}

export function clearUnits(state: GameState): void {
  state.units = {};
}

export function addUnit(state: GameState, kind: UnitKind, ownerId: PlayerId, tileId: string, opts: Partial<Unit> = {}): Unit {
  const id = opts.id ?? `t${state.nextUnitId++}`;
  const u: Unit = { id, kind, ownerId, tileId, moved: opts.moved ?? false, spent: opts.spent ?? false };
  state.units[id] = u;
  return u;
}

export function playerOf(state: GameState, alliance: AllianceId, factionName?: string): PlayerId {
  for (const pid of state.seatOrder) {
    const p = state.players[pid];
    if (p.allianceId !== alliance) continue;
    if (factionName && state.factions[p.factionId!].name !== factionName) continue;
    return pid;
  }
  throw new Error(`no player in ${alliance} ${factionName ?? ''}`);
}

export function generalOf(state: GameState, alliance: AllianceId): PlayerId {
  return state.alliances[alliance].generalId!;
}

/** Find an RNG internal state whose next rolls are exactly `rolls`. */
export function seedForRolls(rolls: number[]): number {
  for (let s = 1; s < 50_000_000; s++) {
    const rng = createRng(1);
    rng.s = s;
    let ok = true;
    for (const want of rolls) {
      if (rollD6(rng) !== want) {
        ok = false;
        break;
      }
    }
    if (ok) return s;
  }
  throw new Error('no seed found');
}

export function setRolls(state: GameState, rolls: number[]): void {
  state.rng.s = seedForRolls(rolls);
}

/** Move a card of the given type from the deck (or discard) into a player's hand. */
export function giveCard(state: GameState, pid: PlayerId, type: CardType): string {
  for (const pile of [state.deck, state.discard]) {
    const idx = pile.findIndex((uid) => state.cards[uid].type === type);
    if (idx >= 0) {
      const uid = pile.splice(idx, 1)[0];
      state.players[pid].hand.push(uid);
      return uid;
    }
  }
  throw new Error(`no ${type} available`);
}

export function handTypes(state: GameState, pid: PlayerId): CardType[] {
  return state.players[pid].hand.map((uid) => state.cards[uid].type);
}

/** Run bots until the military phase, then force a given sub-phase with the given alliance acting. */
export function toMilitary(state: GameState, sub: SubPhase = 'full1', alliance?: AllianceId): GameState {
  runBots(state, { until: (s) => s.phase === 'military' && s.pending?.kind === 'issueOrder' });
  expect(state.phase).toBe('military');
  const task = state.tasks.find((t) => t.kind === 'military');
  if (!task || task.kind !== 'military') throw new Error('no military task');
  // drop any tasks queued ahead of the military task (e.g. unresolved orders)
  state.tasks = state.tasks.slice(state.tasks.indexOf(task));
  task.subIdx = SUB_PHASES.indexOf(sub);
  task.allianceIdx = alliance ? state.allianceOrder.indexOf(alliance) : 0;
  task.started = false;
  state.turnData.orders = {};
  state.turnData.combats = {};
  return state;
}

/** Set the acting alliance for the current military sub-phase and recompute the pending decision. */
export function setActing(state: GameState, alliance: AllianceId): GameState {
  const task = state.tasks[0];
  if (task.kind !== 'military') throw new Error(`head task is ${task.kind}`);
  task.allianceIdx = state.allianceOrder.indexOf(alliance);
  return refresh(state);
}

export function cityTile(state: GameState, name: string): string {
  for (const t of Object.values(state.tiles)) if (t.city?.name === name) return t.id;
  throw new Error(`no city ${name}`);
}

export function order(state: GameState, general: PlayerId, source: string, groups: { dest: string; units: string[] }[]): GameState {
  return act(state, { kind: 'order', playerId: general, sourceTileId: source, groups: groups.map((g) => ({ destTileId: g.dest, unitIds: g.units })) });
}

export function unitsAt(state: GameState, tileId: string): Unit[] {
  return Object.values(state.units).filter((u) => u.tileId === tileId);
}

export function lastLog(state: GameState, includes: string): string | undefined {
  for (let i = state.log.length - 1; i >= 0; i--) if (state.log[i].text.includes(includes)) return state.log[i].text;
  return undefined;
}

export function logHas(state: GameState, includes: string): boolean {
  return state.log.some((l) => l.text.includes(includes));
}

/** Run bots until a predicate holds; throws if the game ends first. */
export function runUntil(state: GameState, pred: (s: GameState) => boolean): GameState {
  runBots(state, { until: pred });
  if (!pred(state)) throw new Error('predicate never held');
  return state;
}
