/**
 * Military movement and combat flow (milestone 3) plus the reaction windows
 * (Rage of Achilles, Trojan Horse, Zeus) and the Trojan Horse effect.
 */
import type { TileId } from './hex';
import { SUB_PHASES } from './types';
import type { Action, AllianceId, CardType, CombatRecord, CombatSide, GameState, PendingDecision, PlayerId, Task, Unit, UnitId, UnitSnapshot } from './types';
import { cardName, createUnit, discardFromHand, enemyShipsOnTile, label, log, moveUnit, popTask, pushFront, reactionCandidates, removeUnit, require, sinkUnmannedShipsAtSea, tLabel } from './core';
import { allianceName, allianceOf, cityCount, farmersOnTile, generalOf, membersOf, shipsOnTile, soldiersOnTile, tile, unitsOnTile, unmannedShipsOfAlliance } from './query';
import { hasSeaEdge } from './map';
import { destinationsFrom, movableUnitsAt, orderableSourceTiles, validateOrder } from './rules/movement';
import { enemySoldiersOnTile, finalControl, retreatOptions, rollSide, shipsLostWithSoldiers } from './rules/combat';
import { sequentialOrder } from './rules/turnOrder';

// ---------------------------------------------------------------------------
// Sub-phases and orders
// ---------------------------------------------------------------------------

function taskMilitaryStart(state: GameState): void {
  popTask(state);
  state.phase = 'military';
  log(state, 'turn', 'The military phase begins. "War is too serious a matter to leave to soldiers."', { banner: true });
  pushFront(state, { kind: 'military', subIdx: 0, allianceIdx: 0, started: false });
}

function taskMilitary(state: GameState, task: Extract<Task, { kind: 'military' }>): void {
  if (task.subIdx >= SUB_PHASES.length) {
    popTask(state);
    state.turnData.subPhase = null;
    return;
  }
  const sub = SUB_PHASES[task.subIdx];
  if (!task.started) {
    for (const u of Object.values(state.units)) {
      u.moved = false;
      u.spent = false;
    }
    state.turnData.subPhase = sub;
    task.started = true;
    log(state, 'turn', `Movement sub-phase ${subPhaseName(sub)} begins.`);
  }
  if (task.allianceIdx >= state.allianceOrder.length) {
    task.subIdx += 1;
    task.allianceIdx = 0;
    task.started = false;
    return;
  }
  const a = state.allianceOrder[task.allianceIdx];
  const general = generalOf(state, a);
  const sources = orderableSourceTiles(state, a, sub);
  if (sources.length === 0) {
    task.allianceIdx += 1;
    return;
  }
  state.pending = {
    kind: 'issueOrder',
    playerId: general,
    allianceId: a,
    subPhase: sub,
    sourceTileIds: sources,
    scuttleableShipIds: unmannedShipsOfAlliance(state, a).map((s) => s.id),
  };
}

export function subPhaseName(sub: string): string {
  return { ships1: 'Ships 1', ships2: 'Ships 2', full1: 'Full 1', full2: 'Full 2' }[sub] ?? sub;
}

function actionPass(state: GameState, action: Extract<Action, { kind: 'pass' }>): void {
  const task = state.tasks[0] as Extract<Task, { kind: 'military' }>;
  log(state, 'order', `${label(state, action.playerId)} issues no further orders this sub-phase.`);
  task.allianceIdx += 1;
}

function actionScuttle(state: GameState, action: Extract<Action, { kind: 'scuttle' }>, pending: Extract<PendingDecision, { kind: 'issueOrder' }>): void {
  require(action.unitIds.length > 0, 'Choose at least one ship to scuttle');
  for (const id of action.unitIds) require(pending.scuttleableShipIds.includes(id), `${id} is not an unmanned ship of your alliance`);
  for (const id of action.unitIds) {
    const u = removeUnit(state, id)!;
    log(state, 'order', `${label(state, action.playerId)} orders the unmanned ship of ${label(state, u.ownerId)} on ${tLabel(state, u.tileId)} destroyed.`);
  }
}

function describeGroup(state: GameState, unitIds: UnitId[]): string {
  const soldiers = unitIds.filter((id) => state.units[id]?.kind === 'soldier').length;
  const ships = unitIds.filter((id) => state.units[id]?.kind === 'ship').length;
  const parts: string[] = [];
  if (soldiers) parts.push(`${soldiers} SOLDIER${soldiers === 1 ? '' : 'S'}`);
  if (ships) parts.push(`${ships} SHIP${ships === 1 ? '' : 'S'}`);
  return parts.join(' AND ');
}

function actionOrder(state: GameState, action: Extract<Action, { kind: 'order' }>, pending: Extract<PendingDecision, { kind: 'issueOrder' }>): void {
  require(pending.sourceTileIds.includes(action.sourceTileId), `${action.sourceTileId} holds no units you can order now`);
  validateOrder(state, pending.allianceId, pending.subPhase, action.sourceTileId, action.groups);
  const id = `o${state.nextOrderId++}`;
  const order = {
    id,
    generalId: action.playerId,
    allianceId: pending.allianceId,
    sourceTileId: action.sourceTileId,
    subPhase: pending.subPhase,
    groups: action.groups.map((g) => ({ destTileId: g.destTileId, unitIds: [...g.unitIds] })),
    refusedUnitIds: [],
  };
  state.turnData.orders[id] = order;
  // Every unit in the tile is disposed of by this order (footnote 20): none may be ordered again this sub-phase.
  for (const u of movableUnitsAt(state, pending.allianceId, action.sourceTileId)) u.moved = true;
  const text = order.groups.map((g) => `${describeGroup(state, g.unitIds)} TO ${tLabel(state, g.destTileId).toUpperCase()}`).join(', ');
  log(state, 'order', `I, ${state.players[action.playerId].leaderName.toUpperCase()}, ISSUE A FINAL ORDER. ${text}.`, {
    banner: true,
    orderId: id,
    sourceTileId: action.sourceTileId,
    groups: order.groups,
  });
  // Rage of Achilles window (ruling 32): other players whose units were ordered from this tile.
  const owners = new Set<PlayerId>();
  for (const g of order.groups) for (const uid of g.unitIds) owners.add(state.units[uid].ownerId);
  owners.delete(action.playerId);
  const candidates = reactionCandidates(
    state,
    state.seatOrder.filter((p) => owners.has(p)),
    'rage',
    true,
  );
  pushFront(state, { kind: 'rageWindow', orderId: id, remaining: candidates }, { kind: 'executeOrder', orderId: id }, { kind: 'afterOrder', orderId: id });
}

function taskRageWindow(state: GameState, task: Extract<Task, { kind: 'rageWindow' }>): void {
  if (task.remaining.length === 0) {
    popTask(state);
    return;
  }
  const pid = task.remaining[0];
  const order = state.turnData.orders[task.orderId];
  const unitIds: UnitId[] = [];
  for (const g of order.groups) for (const uid of g.unitIds) if (state.units[uid]?.ownerId === pid) unitIds.push(uid);
  state.pending = {
    kind: 'reaction',
    playerId: pid,
    window: 'rageOfAchilles',
    cardType: 'rage',
    holdsCard: state.players[pid].hand.some((c) => state.cards[c].type === 'rage'),
    orderId: task.orderId,
    unitIds,
    description: `${label(state, order.generalId)} has ordered ${unitIds.length} of your unit(s) out of ${tLabel(state, order.sourceTileId)}. Play Rage of Achilles to keep them there?`,
  };
}

function findCard(state: GameState, pid: PlayerId, type: CardType): string | null {
  for (const uid of state.players[pid].hand) if (state.cards[uid].type === type) return uid;
  return null;
}

function taskExecuteOrder(state: GameState, task: Extract<Task, { kind: 'executeOrder' }>): void {
  popTask(state);
  const order = state.turnData.orders[task.orderId];
  const alliance = order.allianceId;
  const refused = new Set(order.refusedUnitIds);
  const follow: Task[] = [];
  const combats: Task[] = [];
  const dests = new Map(destinationsFrom(state, order.sourceTileId).map((d) => [d.tileId, d]));
  for (const g of order.groups) {
    const units = g.unitIds.filter((id) => !refused.has(id) && state.units[id] && state.units[id].tileId === order.sourceTileId);
    const via = dests.get(g.destTileId)!.via;
    let moving: Unit[] = units.map((id) => state.units[id]);
    if (via === 'sea') {
      // Re-pair after refusals (decision 83): only as many pairs as both soldiers and ships allow.
      const soldiers = moving.filter((u) => u.kind === 'soldier');
      const ships = moving.filter((u) => u.kind === 'ship');
      const n = Math.min(soldiers.length, ships.length);
      const movingSoldiers = soldiers.slice(0, n);
      const owners = movingSoldiers.map((s) => s.ownerId);
      const chosenShips: Unit[] = [];
      const pool = [...ships];
      for (const o of owners) {
        const idx = pool.findIndex((s) => s.ownerId === o);
        if (idx >= 0) chosenShips.push(pool.splice(idx, 1)[0]);
      }
      while (chosenShips.length < n) chosenShips.push(pool.shift()!);
      moving = [...movingSoldiers, ...chosenShips];
      if (n < soldiers.length || n < ships.length) {
        log(state, 'order', `Only ${n} manned ship pair(s) can sail to ${tLabel(state, g.destTileId)}; the rest stay in ${tLabel(state, order.sourceTileId)}.`);
      }
    }
    if (moving.filter((u) => u.kind === 'soldier').length === 0) {
      log(state, 'order', `No units move to ${tLabel(state, g.destTileId)}.`);
      continue;
    }
    const enemies = enemySoldiersOnTile(state, g.destTileId, alliance);
    if (enemies.length > 0) {
      const defAlliance = allianceOf(state, enemies[0].ownerId);
      const cid = `c${state.nextCombatId++}`;
      const mk = (aid: AllianceId, gid: PlayerId, soldierIds: UnitId[], shipIds: UnitId[]): CombatSide => ({
        allianceId: aid,
        generalId: gid,
        soldierIds,
        shipIds,
        dice: [],
        diceTotal: 0,
        bonus: 0,
        score: 0,
        hitsTaken: 0,
        casualties: [],
      });
      const combat: CombatRecord = {
        id: cid,
        orderId: order.id,
        subPhase: order.subPhase,
        tileId: g.destTileId,
        originTileId: order.sourceTileId,
        attacker: mk(
          alliance,
          order.generalId,
          moving.filter((u) => u.kind === 'soldier').map((u) => u.id),
          moving.filter((u) => u.kind === 'ship').map((u) => u.id),
        ),
        defender: mk(
          defAlliance,
          generalOf(state, defAlliance),
          enemies.map((u) => u.id),
          shipsOnTile(state, g.destTileId)
            .filter((s) => allianceOf(state, s.ownerId) === defAlliance)
            .map((s) => s.id),
        ),
        spentOnly: false,
        winner: null,
        cityOwnerBefore: tile(state, g.destTileId).city?.ownerId ?? null,
        resolved: false,
        trojanPlayed: false,
      };
      state.turnData.combats[cid] = combat;
      combats.push({ kind: 'combat', combatId: cid });
      continue;
    }
    // No enemy soldiers: the move happens now.
    for (const u of moving) {
      moveUnit(state, u.id, g.destTileId);
      u.moved = true;
    }
    destroyEnemyFarmers(state, g.destTileId, alliance);
    log(state, 'order', `${describeGroup(state, moving.map((u) => u.id))} of the ${allianceName(alliance)} alliance move${moving.length === 1 ? 's' : ''} into ${tLabel(state, g.destTileId)}.`);
    follow.push({ kind: 'enterTile', tileId: g.destTileId, allianceId: alliance, generalId: order.generalId, unitIds: moving.map((u) => u.id), fromTileId: order.sourceTileId });
  }
  pushFront(state, ...follow, ...combats);
}

function destroyEnemyFarmers(state: GameState, tileId: TileId, allianceId: AllianceId): void {
  for (const f of farmersOnTile(state, tileId)) {
    if (allianceOf(state, f.ownerId) === allianceId) continue;
    removeUnit(state, f.id);
    log(state, 'combat', `The farmer of ${label(state, f.ownerId)} on ${tLabel(state, tileId)} is put to the sword.`);
  }
}

/** After units of an alliance arrive on a tile with no enemy soldiers: captures and conquests. */
function taskEnterTile(state: GameState, task: Extract<Task, { kind: 'enterTile' }>): void {
  popTask(state);
  const follow: Task[] = [];
  const seize = seizeShips(state, task.tileId, task.allianceId, task.generalId);
  if (seize) follow.push(seize);
  const t = tile(state, task.tileId);
  if (t.city && (t.city.ownerId === null || allianceOf(state, t.city.ownerId) !== task.allianceId)) {
    follow.push({ kind: 'assignOwnership', tileId: task.tileId, generalId: task.generalId, reason: t.city.ownerId === null ? 'neutral' : 'conquest' });
  }
  pushFront(state, ...follow);
}

/**
 * Unmanned enemy ships on a tile entered by `allianceId` are captured at once
 * (ruling 18): they pass to the General immediately so the tile never holds two
 * alliances, and the General then chooses which faction flies its flag.
 */
function seizeShips(state: GameState, tileId: TileId, allianceId: AllianceId, generalId: PlayerId): Task | null {
  const ships = enemyShipsOnTile(state, tileId, allianceId);
  if (ships.length === 0) return null;
  for (const s of ships) {
    log(state, 'combat', `The unmanned ship of ${label(state, s.ownerId)} on ${tLabel(state, tileId)} is captured by the ${allianceName(allianceId)} alliance.`);
    s.ownerId = generalId;
    s.moved = true;
  }
  const candidates = membersOf(state, allianceId);
  if (candidates.length === 1) return null;
  return { kind: 'captureShips', tileId, generalId, unitIds: ships.map((s) => s.id) };
}

function taskCaptureShips(state: GameState, task: Extract<Task, { kind: 'captureShips' }>): void {
  const alive = task.unitIds.filter((id) => state.units[id]);
  if (alive.length === 0) {
    popTask(state);
    return;
  }
  const alliance = allianceOf(state, task.generalId);
  const candidates = membersOf(state, alliance);
  state.pending = { kind: 'reflagShips', playerId: task.generalId, tileId: task.tileId, unitIds: alive, candidates };
}

function reflag(state: GameState, unitIds: UnitId[], ownerId: PlayerId): void {
  for (const id of unitIds) {
    const u = state.units[id];
    if (!u) continue;
    u.ownerId = ownerId;
    u.moved = true;
  }
  if (unitIds.length) log(state, 'combat', `${unitIds.length} captured ship(s) on ${tLabel(state, state.units[unitIds[0]]?.tileId ?? '')} now sail for ${label(state, ownerId)}.`);
}

function actionReflagShips(state: GameState, action: Extract<Action, { kind: 'reflagShips' }>, pending: Extract<PendingDecision, { kind: 'reflagShips' }>): void {
  require(pending.candidates.includes(action.ownerId), `${action.ownerId} is not a member of your alliance`);
  reflag(state, pending.unitIds, action.ownerId);
  popTask(state);
}

function taskAssignOwnership(state: GameState, task: Extract<Task, { kind: 'assignOwnership' }>): void {
  const alliance = allianceOf(state, task.generalId);
  const candidates = membersOf(state, alliance);
  if (candidates.length === 1) {
    assignCity(state, task.tileId, candidates[0], task.reason);
    popTask(state);
    return;
  }
  state.pending = { kind: 'assignOwnership', playerId: task.generalId, tileId: task.tileId, candidates, reason: task.reason };
}

function assignCity(state: GameState, tileId: TileId, ownerId: PlayerId, reason: 'conquest' | 'neutral' | 'trojan'): void {
  const c = tile(state, tileId).city!;
  const prev = c.ownerId;
  c.ownerId = ownerId;
  if (reason === 'neutral') log(state, 'combat', `${c.name} is taken and assigned to ${label(state, ownerId)}.`);
  else if (reason === 'trojan') log(state, 'card', `By the Trojan Horse, ${c.name} now belongs to ${label(state, ownerId)}.`);
  else log(state, 'combat', `${c.name} is conquered from ${prev ? label(state, prev) : 'no one'} and assigned to ${label(state, ownerId)}.`);
}

function actionAssignOwnership(state: GameState, action: Extract<Action, { kind: 'assignOwnership' }>, pending: Extract<PendingDecision, { kind: 'assignOwnership' }>): void {
  require(pending.candidates.includes(action.ownerId), `${action.ownerId} is not eligible to own ${pending.tileId}`);
  assignCity(state, pending.tileId, action.ownerId, pending.reason);
  popTask(state);
}

function taskAfterOrder(state: GameState): void {
  popTask(state);
  sinkUnmannedShipsAtSea(state);
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function snapshot(u: Unit): UnitSnapshot {
  return { id: u.id, kind: u.kind, ownerId: u.ownerId, spent: u.spent };
}

function taskCombat(state: GameState, task: Extract<Task, { kind: 'combat' }>): void {
  popTask(state);
  const c = state.turnData.combats[task.combatId];
  const defenders = c.defender.soldierIds.filter((id) => state.units[id]);
  const attackers = c.attacker.soldierIds.filter((id) => state.units[id]);
  const spent = defenders.filter((id) => state.units[id].spent).length;
  log(
    state,
    'combat',
    `Battle for ${tLabel(state, c.tileId)}: ${allianceName(c.attacker.allianceId)} attacks with ${attackers.length} soldier(s)${c.attacker.shipIds.length ? ` aboard ${c.attacker.shipIds.length} ship(s)` : ''} from ${tLabel(state, c.originTileId)}; ${allianceName(c.defender.allianceId)} defends with ${defenders.length} soldier(s)${spent ? ` (${spent} spent)` : ''}.`,
    { combatId: c.id, banner: true },
  );
  if (attackers.length === 0) {
    // cannot happen (validated), but keep the engine safe
    c.winner = 'defender';
    c.resolved = true;
    return;
  }
  if (defenders.length > 0 && spent === defenders.length) {
    c.spentOnly = true;
    for (const id of defenders) {
      const u = removeUnit(state, id)!;
      c.defender.casualties.push(snapshot(u));
    }
    log(state, 'combat', `The defenders of ${tLabel(state, c.tileId)} are all spent and cannot mount a defense; all are lost.`);
    c.winner = 'attacker';
    c.resolved = true;
    pushFront(state, { kind: 'attackerTakesTile', combatId: c.id });
    return;
  }
  const att = rollSide(state, c.attacker, false, c.tileId);
  const def = rollSide(state, c.defender, true, c.tileId);
  c.attacker.hitsTaken = def.sixes;
  c.defender.hitsTaken = att.sixes;
  log(state, 'combat', `Attacker: ${att.explanation}.`, { combatId: c.id, side: 'attacker', dice: c.attacker.dice });
  log(state, 'combat', `Defender: ${def.explanation}.`, { combatId: c.id, side: 'defender', dice: c.defender.dice });
  pushFront(state, { kind: 'casualties', combatId: c.id, side: 'attacker' }, { kind: 'casualties', combatId: c.id, side: 'defender' }, { kind: 'combatOutcome', combatId: c.id });
}

function applyCasualties(state: GameState, c: CombatRecord, sideKey: 'attacker' | 'defender', removedSoldierIds: UnitId[]): void {
  const side = c[sideKey];
  const shipsAlive = side.shipIds.filter((id) => state.units[id]);
  const soldiersBefore = side.soldierIds.filter((id) => state.units[id]).length;
  const shipsLost = shipsLostWithSoldiers(state, shipsAlive, soldiersBefore, removedSoldierIds);
  const names: string[] = [];
  for (const id of [...removedSoldierIds, ...shipsLost]) {
    const u = removeUnit(state, id);
    if (!u) continue;
    side.casualties.push(snapshot(u));
    names.push(`${u.kind} of ${state.players[u.ownerId].leaderName}`);
  }
  log(state, 'combat', `${sideKey === 'attacker' ? 'Attacker' : 'Defender'} casualties: ${names.join(', ') || 'none'}.`, { combatId: c.id, side: sideKey });
}

function taskCasualties(state: GameState, task: Extract<Task, { kind: 'casualties' }>): void {
  const c = state.turnData.combats[task.combatId];
  const side = c[task.side];
  const alive = side.soldierIds.filter((id) => state.units[id]);
  if (side.hitsTaken === 0 || alive.length === 0) {
    if (alive.length > 0) log(state, 'combat', `${task.side === 'attacker' ? 'Attacker' : 'Defender'} casualties: none.`, { combatId: c.id, side: task.side });
    popTask(state);
    return;
  }
  if (side.hitsTaken >= alive.length) {
    applyCasualties(state, c, task.side, alive);
    popTask(state);
    return;
  }
  state.pending = { kind: 'assignCasualties', playerId: side.generalId, combatId: c.id, side: task.side, hits: side.hitsTaken, candidates: alive };
}

function actionAssignCasualties(state: GameState, action: Extract<Action, { kind: 'assignCasualties' }>, pending: Extract<PendingDecision, { kind: 'assignCasualties' }>): void {
  require(action.unitIds.length === pending.hits, `You must remove exactly ${pending.hits} soldier(s)`);
  require(new Set(action.unitIds).size === action.unitIds.length, 'Each casualty may only be chosen once');
  for (const id of action.unitIds) require(pending.candidates.includes(id), `${id} is not a soldier in this combat`);
  const c = state.turnData.combats[pending.combatId];
  applyCasualties(state, c, pending.side, action.unitIds);
  popTask(state);
}

function taskCombatOutcome(state: GameState, task: Extract<Task, { kind: 'combatOutcome' }>): void {
  popTask(state);
  const c = state.turnData.combats[task.combatId];
  const fc = finalControl(state, c);
  c.winner = fc.winner;
  c.resolved = true;
  log(state, 'combat', `Final control of ${tLabel(state, c.tileId)}: ${fc.reason}`, { combatId: c.id, winner: fc.winner });
  if (fc.winner === 'attacker') {
    if (fc.destroySpentDefenders) {
      for (const id of c.defender.soldierIds) {
        const u = removeUnit(state, id);
        if (u) c.defender.casualties.push(snapshot(u));
      }
    }
    const survivors = c.defender.soldierIds.filter((id) => state.units[id]);
    const follow: Task[] = [];
    if (survivors.length > 0) follow.push({ kind: 'retreatUnits', tileId: c.tileId, allianceId: c.defender.allianceId, generalId: c.defender.generalId, unitIds: survivors, combatId: c.id });
    follow.push({ kind: 'attackerTakesTile', combatId: c.id });
    pushFront(state, ...follow);
    return;
  }
  // Attack repulsed: attackers remain where they came from (decision 54).
  const attSurv = c.attacker.soldierIds.filter((id) => state.units[id]).length;
  log(state, 'combat', `The attack on ${tLabel(state, c.tileId)} fails; ${attSurv} surviving attacker(s) return to ${tLabel(state, c.originTileId)}.`);
  // Trojan Horse window (ruling 33, decision 61)
  const t = tile(state, c.tileId);
  const owner = t.city?.ownerId ?? null;
  if (t.city && owner && allianceOf(state, owner) === c.defender.allianceId && cityCount(state, owner) >= 2) {
    const third = sequentialOrder(state).filter((p) => {
      const a = allianceOf(state, p);
      return a !== c.attacker.allianceId && a !== c.defender.allianceId;
    });
    const candidates = reactionCandidates(state, third, 'trojan', true);
    if (candidates.length > 0) pushFront(state, { kind: 'trojanWindow', combatId: c.id, remaining: candidates });
  }
}

/** Begin a retreat for the given soldiers (ruling 24). Units with no option are destroyed at once. */
function taskRetreatUnits(state: GameState, task: Extract<Task, { kind: 'retreatUnits' }>): void {
  const soldiers = task.unitIds.filter((id) => state.units[id]).map((id) => state.units[id]);
  if (soldiers.length === 0) {
    popTask(state);
    return;
  }
  const opts = retreatOptions(state, task.tileId, task.allianceId, soldiers);
  const withOptions = opts.units.filter((u) => u.destinations.length > 0);
  const without = opts.units.filter((u) => u.destinations.length === 0);
  for (const w of without) {
    const u = removeUnit(state, w.unitId)!;
    log(state, 'combat', `A soldier of ${label(state, u.ownerId)} has no line of retreat from ${tLabel(state, task.tileId)} and is destroyed.`);
  }
  if (withOptions.length === 0) {
    popTask(state);
    return;
  }
  task.unitIds = withOptions.map((u) => u.unitId);
  state.pending = { kind: 'retreat', playerId: task.generalId, combatId: task.combatId, tileId: task.tileId, units: withOptions, shipsAvailable: opts.shipsAvailable };
}

function actionRetreat(state: GameState, action: Extract<Action, { kind: 'retreat' }>, pending: Extract<PendingDecision, { kind: 'retreat' }>): void {
  const task = state.tasks[0] as Extract<Task, { kind: 'retreatUnits' }>;
  const moves = new Map(action.moves.map((m) => [m.unitId, m.tileId]));
  let byShip = 0;
  for (const u of pending.units) {
    const dest = moves.get(u.unitId);
    require(dest, `Soldier ${u.unitId} must be given a retreat destination`);
    const d = u.destinations.find((x) => x.tileId === dest);
    require(d, `${dest} is not a legal retreat for ${u.unitId}`);
    if (d.byShip) byShip++;
  }
  require(byShip <= pending.shipsAvailable, `Only ${pending.shipsAvailable} ship(s) are available for retreat by sea`);
  const shipPool = shipsOnTile(state, pending.tileId).filter((s) => allianceOf(state, s.ownerId) === task.allianceId);
  for (const u of pending.units) {
    const dest = moves.get(u.unitId)!;
    const d = u.destinations.find((x) => x.tileId === dest)!;
    const soldier = state.units[u.unitId];
    if (d.byShip) {
      let idx = shipPool.findIndex((s) => s.ownerId === soldier.ownerId);
      if (idx < 0) idx = 0;
      const ship = shipPool.splice(idx, 1)[0];
      moveUnit(state, ship.id, dest);
      ship.moved = true;
      ship.spent = true;
    }
    moveUnit(state, soldier.id, dest);
    soldier.moved = true;
    soldier.spent = true;
    log(state, 'combat', `A soldier of ${label(state, soldier.ownerId)} retreats ${d.byShip ? 'by sea ' : ''}to ${tLabel(state, dest)} (spent).`);
  }
  popTask(state);
}

function taskAttackerTakesTile(state: GameState, task: Extract<Task, { kind: 'attackerTakesTile' }>): void {
  popTask(state);
  const c = state.turnData.combats[task.combatId];
  const survivors = [...c.attacker.soldierIds, ...c.attacker.shipIds].filter((id) => state.units[id]);
  for (const id of survivors) {
    moveUnit(state, id, c.tileId);
    state.units[id].moved = true;
  }
  log(state, 'combat', `${allianceName(c.attacker.allianceId)} forces take ${tLabel(state, c.tileId)}.`);
  destroyEnemyFarmers(state, c.tileId, c.attacker.allianceId);
  pushFront(state, { kind: 'enterTile', tileId: c.tileId, allianceId: c.attacker.allianceId, generalId: c.attacker.generalId, unitIds: survivors, fromTileId: c.originTileId });
}

// ---------------------------------------------------------------------------
// Reactions: Rage, Trojan Horse, Zeus
// ---------------------------------------------------------------------------

function actionReact(state: GameState, action: Extract<Action, { kind: 'react' }>, pending: Extract<PendingDecision, { kind: 'reaction' }>): void {
  const task = state.tasks[0];
  const pid = action.playerId;
  if (!action.play) {
    if (task.kind === 'rageWindow' || task.kind === 'trojanWindow' || task.kind === 'zeusWindow') task.remaining.shift();
    return;
  }
  const uid = findCard(state, pid, pending.cardType);
  require(uid, `You do not hold ${cardName(pending.cardType)}`);
  const inMilitary = state.phase === 'military';
  require(!inMilitary || state.players[pid].hand.length > 1, 'You may never play your last card during the military phase (footnote 21)');
  discardFromHand(state, pid, uid);
  switch (pending.window) {
    case 'rageOfAchilles': {
      const t = task as Extract<Task, { kind: 'rageWindow' }>;
      const order = state.turnData.orders[t.orderId];
      order.refusedUnitIds.push(...(pending.unitIds ?? []));
      log(state, 'card', `${label(state, pid)} plays Rage of Achilles! Their ${pending.unitIds?.length ?? 0} unit(s) refuse to leave ${tLabel(state, order.sourceTileId)}.`, { card: 'rage' });
      t.remaining.shift();
      return;
    }
    case 'trojanHorse': {
      const t = task as Extract<Task, { kind: 'trojanWindow' }>;
      const c = state.turnData.combats[t.combatId];
      c.trojanPlayed = true;
      log(state, 'card', `${label(state, pid)} plays the Trojan Horse upon the battle for ${tLabel(state, c.tileId)}!`, { card: 'trojan' });
      popTask(state);
      const others = sequentialOrder(state).filter((p) => p !== pid);
      pushFront(state, {
        kind: 'zeusWindow',
        target: 'trojan',
        cardPlayerId: pid,
        remaining: reactionCandidates(state, others, 'zeus', true),
        cancelled: false,
        effect: { kind: 'applyTrojan', combatId: c.id, cardPlayerId: pid },
      });
      return;
    }
    case 'zeus': {
      const t = task as Extract<Task, { kind: 'zeusWindow' }>;
      t.cancelled = true;
      t.remaining = [];
      log(state, 'card', `${label(state, pid)} hurls the Lightning Bolt of Zeus! The ${t.target === 'trojan' ? 'Trojan Horse' : 'Attack by Philosophers'} of ${label(state, t.cardPlayerId)} is cancelled.`, { card: 'zeus' });
      return;
    }
  }
}

function taskTrojanWindow(state: GameState, task: Extract<Task, { kind: 'trojanWindow' }>): void {
  if (task.remaining.length === 0) {
    popTask(state);
    return;
  }
  const pid = task.remaining[0];
  const c = state.turnData.combats[task.combatId];
  state.pending = {
    kind: 'reaction',
    playerId: pid,
    window: 'trojanHorse',
    cardType: 'trojan',
    holdsCard: !!findCard(state, pid, 'trojan'),
    combatId: c.id,
    description: `The ${allianceName(c.attacker.allianceId)} attack on ${tLabel(state, c.tileId)} has failed. Play the Trojan Horse to reverse the battle?`,
  };
}

export function taskZeusWindow(state: GameState, task: Extract<Task, { kind: 'zeusWindow' }>): void {
  if (task.cancelled) {
    popTask(state);
    return;
  }
  if (task.remaining.length === 0) {
    popTask(state);
    pushFront(state, task.effect);
    return;
  }
  const pid = task.remaining[0];
  const what = task.target === 'trojan' ? 'Trojan Horse' : 'Attack by Philosophers';
  state.pending = {
    kind: 'reaction',
    playerId: pid,
    window: 'zeus',
    cardType: 'zeus',
    holdsCard: !!findCard(state, pid, 'zeus'),
    target: task.target,
    targetPlayerId: task.cardPlayerId,
    victimId: task.victimId,
    combatId: task.effect.kind === 'applyTrojan' ? task.effect.combatId : undefined,
    description: `${label(state, task.cardPlayerId)} has played ${what}. Hurl the Lightning Bolt of Zeus to cancel it?`,
  };
}

// ---------------------------------------------------------------------------
// Trojan Horse effect (ruling 33, decision 62)
// ---------------------------------------------------------------------------

function taskApplyTrojan(state: GameState, task: Extract<Task, { kind: 'applyTrojan' }>): void {
  popTask(state);
  const c = state.turnData.combats[task.combatId];
  // restore casualties
  for (const s of c.attacker.casualties) createUnit(state, s.kind, s.ownerId, c.originTileId, { id: s.id, moved: true });
  for (const s of c.defender.casualties) createUnit(state, s.kind, s.ownerId, c.tileId, { id: s.id });
  const restored = c.attacker.casualties.length + c.defender.casualties.length;
  log(state, 'card', `The Trojan Horse opens: ${restored} fallen unit(s) rise again and the armies exchange places.`);
  const attUnits = new Set([...c.attacker.soldierIds, ...c.attacker.shipIds]);
  const othersAtOrigin = unitsOnTile(state, c.originTileId).filter((u) => allianceOf(state, u.ownerId) === c.attacker.allianceId && !attUnits.has(u.id));
  const defSoldiers = c.defender.soldierIds.filter((id) => state.units[id]);
  const defShips = c.defender.shipIds.filter((id) => state.units[id]);
  if (othersAtOrigin.length === 0) {
    const origin = tile(state, c.originTileId);
    for (const id of defSoldiers) {
      moveUnit(state, id, c.originTileId);
      state.units[id].spent = false;
      state.units[id].moved = true;
    }
    if (hasSeaEdge(origin)) {
      for (const id of defShips) {
        moveUnit(state, id, c.originTileId);
        state.units[id].moved = true;
      }
    }
    log(state, 'card', `The ${allianceName(c.defender.allianceId)} defenders are carried to ${tLabel(state, c.originTileId)}, unspent.`);
    pushFront(state, { kind: 'trojanEnter', combatId: c.id }, { kind: 'trojanAssign', combatId: c.id, cardPlayerId: task.cardPlayerId });
  } else {
    log(state, 'card', `${tLabel(state, c.originTileId)} still holds ${allianceName(c.attacker.allianceId)} units, so the defenders must retreat instead.`);
    pushFront(
      state,
      { kind: 'retreatUnits', tileId: c.tileId, allianceId: c.defender.allianceId, generalId: c.defender.generalId, unitIds: defSoldiers, combatId: c.id },
      { kind: 'trojanEnter', combatId: c.id },
      { kind: 'trojanAssign', combatId: c.id, cardPlayerId: task.cardPlayerId },
    );
  }
}

function taskTrojanEnter(state: GameState, task: Extract<Task, { kind: 'trojanEnter' }>): void {
  popTask(state);
  const c = state.turnData.combats[task.combatId];
  // any defending soldiers still in the city (should be none) are destroyed
  for (const s of soldiersOnTile(state, c.tileId)) {
    if (allianceOf(state, s.ownerId) !== c.attacker.allianceId) removeUnit(state, s.id);
  }
  const units = [...c.attacker.soldierIds, ...c.attacker.shipIds].filter((id) => state.units[id]);
  for (const id of units) {
    moveUnit(state, id, c.tileId);
    state.units[id].moved = true;
    state.units[id].spent = false;
  }
  log(state, 'card', `The ${allianceName(c.attacker.allianceId)} army marches into ${tLabel(state, c.tileId)}.`);
  destroyEnemyFarmers(state, c.tileId, c.attacker.allianceId);
  const seize = seizeShips(state, c.tileId, c.attacker.allianceId, c.attacker.generalId);
  if (seize) pushFront(state, seize);
}

function taskTrojanAssign(state: GameState, task: Extract<Task, { kind: 'trojanAssign' }>): void {
  const c = state.turnData.combats[task.combatId];
  const candidates = membersOf(state, c.attacker.allianceId);
  if (candidates.length === 1) {
    assignCity(state, c.tileId, candidates[0], 'trojan');
    popTask(state);
    return;
  }
  state.pending = { kind: 'assignOwnership', playerId: task.cardPlayerId, tileId: c.tileId, candidates, reason: 'trojan' };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function handleMilitaryTask(state: GameState, task: Task): boolean {
  switch (task.kind) {
    case 'militaryStart':
      taskMilitaryStart(state);
      return true;
    case 'military':
      taskMilitary(state, task);
      return true;
    case 'rageWindow':
      taskRageWindow(state, task);
      return true;
    case 'executeOrder':
      taskExecuteOrder(state, task);
      return true;
    case 'enterTile':
      taskEnterTile(state, task);
      return true;
    case 'captureShips':
      taskCaptureShips(state, task);
      return true;
    case 'assignOwnership':
      taskAssignOwnership(state, task);
      return true;
    case 'afterOrder':
      taskAfterOrder(state);
      return true;
    case 'combat':
      taskCombat(state, task);
      return true;
    case 'casualties':
      taskCasualties(state, task);
      return true;
    case 'combatOutcome':
      taskCombatOutcome(state, task);
      return true;
    case 'retreatUnits':
      taskRetreatUnits(state, task);
      return true;
    case 'attackerTakesTile':
      taskAttackerTakesTile(state, task);
      return true;
    case 'trojanWindow':
      taskTrojanWindow(state, task);
      return true;
    case 'zeusWindow':
      taskZeusWindow(state, task);
      return true;
    case 'applyTrojan':
      taskApplyTrojan(state, task);
      return true;
    case 'trojanEnter':
      taskTrojanEnter(state, task);
      return true;
    case 'trojanAssign':
      taskTrojanAssign(state, task);
      return true;
    default:
      return false;
  }
}

export function handleMilitaryAction(state: GameState, action: Action, pending: PendingDecision): boolean {
  switch (action.kind) {
    case 'pass':
      actionPass(state, action);
      return true;
    case 'scuttle':
      actionScuttle(state, action, pending as Extract<PendingDecision, { kind: 'issueOrder' }>);
      return true;
    case 'order':
      actionOrder(state, action, pending as Extract<PendingDecision, { kind: 'issueOrder' }>);
      return true;
    case 'react':
      actionReact(state, action, pending as Extract<PendingDecision, { kind: 'reaction' }>);
      return true;
    case 'assignCasualties':
      actionAssignCasualties(state, action, pending as Extract<PendingDecision, { kind: 'assignCasualties' }>);
      return true;
    case 'retreat':
      actionRetreat(state, action, pending as Extract<PendingDecision, { kind: 'retreat' }>);
      return true;
    case 'assignOwnership':
      actionAssignOwnership(state, action, pending as Extract<PendingDecision, { kind: 'assignOwnership' }>);
      return true;
    case 'reflagShips':
      actionReflagShips(state, action, pending as Extract<PendingDecision, { kind: 'reflagShips' }>);
      return true;
    default:
      return false;
  }
}
