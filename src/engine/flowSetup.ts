/**
 * Setup, turn start, allocation and deployment flow (milestone 2).
 */
import type { TileId } from './hex';
import { RulesError } from './types';
import type { Action, AllianceId, DeployType, GameState, PendingDecision, PlayerId, RoleOption, Task } from './types';
import { createUnit, drawCard, label, log, popTask, pushFront, require, tLabel } from './core';
import { capacityOf, citiesOf, membersOf, orderedMembers, tile } from './query';
import { computeAllianceOrder, interleavedOrder } from './rules/turnOrder';
import { checkAllocation } from './rules/allocation';
import { checkBuildingPlacements, legalFarmerTiles, legalShipTiles, legalSoldierTiles } from './rules/deploy';
import { allianceName } from './query';

// ---------------------------------------------------------------------------
// Role selection
// ---------------------------------------------------------------------------

export function roleOptions(state: GameState, _playerId: PlayerId): RoleOption[] {
  const out: RoleOption[] = [];
  for (const a of ['white', 'black', 'green'] as AllianceId[]) {
    const taken = membersOf(state, a);
    if (taken.length >= state.allianceSeats[a]) continue;
    const factions = Object.values(state.factions).filter((f) => f.allianceId === a);
    const takenFactions = new Set(taken.map((pid) => state.players[pid].factionId));
    const royal = factions.find((f) => f.royal)!;
    if (!takenFactions.has(royal.id)) {
      out.push({ allianceId: a, factionId: royal.id });
    } else {
      for (const f of factions) if (!f.royal && !takenFactions.has(f.id)) out.push({ allianceId: a, factionId: f.id });
    }
  }
  return out;
}

function taskRoleSelection(state: GameState, task: Extract<Task, { kind: 'roleSelection' }>): void {
  if (task.idx >= task.order.length) {
    popTask(state);
    finishRoles(state);
    return;
  }
  const pid = task.order[task.idx];
  state.pending = { kind: 'chooseRole', playerId: pid, options: roleOptions(state, pid) };
}

function finishRoles(state: GameState): void {
  // announce the alliances
  for (const a of ['white', 'black', 'green'] as AllianceId[]) {
    const members = membersOf(state, a);
    if (members.length === 0) continue;
    const g = state.alliances[a].generalId;
    log(state, 'setup', `The ${allianceName(a)} alliance: ${members.map((m) => label(state, m)).join(', ')}. General: ${g ? label(state, g) : 'none'}.`);
  }
  if (state.config.setupMode === 'quick') {
    // assign starting cities by faction slot; unused slots stay neutral (ruling 4)
    const byFaction: Record<string, PlayerId> = {};
    for (const pid of state.seatOrder) {
      const f = state.players[pid].factionId;
      if (f) byFaction[f] = pid;
    }
    for (const t of Object.values(state.tiles)) {
      if (!t.city || !t.city.slot) continue;
      const owner = byFaction[t.city.slot];
      t.city.ownerId = owner ?? null;
      if (owner) log(state, 'setup', `${label(state, owner)} begins in control of ${t.city.name}.`);
    }
    pushFront(state, { kind: 'startTurn' });
  } else {
    pushFront(state, { kind: 'fullGameSetup', order: [...state.roleOrder].reverse(), idx: 0, passesWithoutPlacement: 0 });
  }
}

function actionChooseRole(state: GameState, action: Extract<Action, { kind: 'chooseRole' }>, pending: Extract<PendingDecision, { kind: 'chooseRole' }>): void {
  const opt = pending.options.find((o) => o.allianceId === action.allianceId && o.factionId === action.factionId);
  require(opt, `${action.factionId} in ${action.allianceId} is not an available role`);
  const p = state.players[action.playerId];
  p.allianceId = action.allianceId;
  p.factionId = action.factionId;
  const f = state.factions[action.factionId];
  if (f.royal) state.alliances[action.allianceId].generalId = action.playerId;
  log(state, 'setup', `${p.leaderName} takes up the ${f.name} banner of the ${allianceName(action.allianceId)} alliance${f.royal ? ' and the office of General' : ''}.`);
  const task = state.tasks[0] as Extract<Task, { kind: 'roleSelection' }>;
  task.idx += 1;
}

// ---------------------------------------------------------------------------
// Turn start and allocation
// ---------------------------------------------------------------------------

function taskStartTurn(state: GameState): void {
  popTask(state);
  state.turn += 1;
  state.phase = 'allocation';
  state.allianceOrder = computeAllianceOrder(state);
  for (const a of state.allianceOrder) {
    // default order until the General sets it (single-member alliances keep this)
    state.alliances[a].factionOrder = membersOf(state, a);
  }
  state.turnData = {
    allocations: {},
    toDeploy: {},
    subPhase: null,
    orders: {},
    combats: {},
    politics: null,
    lastReveal: state.turnData?.lastReveal ?? null,
  };
  for (const u of Object.values(state.units)) {
    u.moved = false;
    u.spent = false;
  }
  log(state, 'turn', `Turn ${state.turn} begins. Alliance order: ${state.allianceOrder.map((a) => allianceName(a)).join(', ')}.`, {
    banner: true,
    allianceOrder: state.allianceOrder,
  });
  pushFront(
    state,
    { kind: 'collectAllocations', remaining: [...state.seatOrder] },
    { kind: 'setFactionOrders', remaining: [...state.allianceOrder] },
    { kind: 'deploy', type: 'farmers', order: [], idx: 0, roundsWithoutWork: 0 },
    { kind: 'deploy', type: 'buildings', order: [], idx: 0, roundsWithoutWork: 0 },
    { kind: 'deploy', type: 'ships', order: [], idx: 0, roundsWithoutWork: 0 },
    { kind: 'deploy', type: 'soldiers', order: [], idx: 0, roundsWithoutWork: 0 },
    { kind: 'drawPoliticians' },
    { kind: 'militaryStart' },
    { kind: 'reconcile' },
    { kind: 'politicsPlay', remaining: [...state.seatOrder], round: 1 },
  );
}

function taskCollectAllocations(state: GameState, task: Extract<Task, { kind: 'collectAllocations' }>): void {
  if (task.remaining.length === 0) {
    popTask(state);
    // reveal (ruling 28 keeps hands hidden; allocations become public through deployment)
    for (const pid of state.seatOrder) {
      const a = state.turnData.allocations[pid];
      log(
        state,
        'allocation',
        `${label(state, pid)} allocated: ${a.farmers} farmers, ${a.soldiers} soldiers, ${a.politicians} politicians (+1 free), ${a.ships} ships, ${a.levelUps} city level improvements, ${a.temples} temples, ${a.universities} universities, ${a.walls} walls.`,
      );
    }
    return;
  }
  const pid = task.remaining[0];
  const p = state.players[pid];
  state.pending = {
    kind: 'allocate',
    playerId: pid,
    capacity: capacityOf(state, pid),
    food: p.food,
    raw: p.raw,
    cityTileIds: citiesOf(state, pid).map((t) => t.id),
  };
}

function actionAllocate(state: GameState, action: Extract<Action, { kind: 'allocate' }>): void {
  const check = checkAllocation(state, action.playerId, action.allocation);
  if (!check.ok) throw new RulesError(check.errors.join('; '));
  const a = { ...action.allocation };
  const p = state.players[action.playerId];
  p.raw -= check.rawCost;
  state.turnData.allocations[action.playerId] = a;
  state.turnData.toDeploy[action.playerId] = {
    farmers: a.farmers,
    ships: a.ships,
    soldiers: a.soldiers,
    buildings: { levelUps: a.levelUps, temples: a.temples, universities: a.universities, walls: a.walls },
    politicians: a.politicians + 1,
  };
  log(state, 'allocation', `${label(state, action.playerId)} has sealed their allocation sheet.`);
  const task = state.tasks[0] as Extract<Task, { kind: 'collectAllocations' }>;
  task.remaining.shift();
}

// ---------------------------------------------------------------------------
// Faction order
// ---------------------------------------------------------------------------

function taskSetFactionOrders(state: GameState, task: Extract<Task, { kind: 'setFactionOrders' }>): void {
  while (task.remaining.length > 0) {
    const a = task.remaining[0];
    const members = membersOf(state, a);
    if (members.length <= 1) {
      state.alliances[a].factionOrder = members;
      task.remaining.shift();
      continue;
    }
    const general = state.alliances[a].generalId!;
    state.pending = { kind: 'setFactionOrder', playerId: general, allianceId: a, members };
    return;
  }
  popTask(state);
  state.phase = 'deployment';
  log(state, 'deploy', `Deployment begins. Order of play: ${interleavedOrder(state).map((p) => label(state, p)).join(', ')}.`);
}

function actionSetFactionOrder(state: GameState, action: Extract<Action, { kind: 'setFactionOrder' }>, pending: Extract<PendingDecision, { kind: 'setFactionOrder' }>): void {
  const members = pending.members;
  require(action.order.length === members.length && members.every((m) => action.order.includes(m)) && new Set(action.order).size === members.length, 'Order must list every member of the alliance exactly once');
  state.alliances[pending.allianceId].factionOrder = [...action.order];
  log(state, 'deploy', `${label(state, action.playerId)} sets the ${allianceName(pending.allianceId)} order for the turn: ${action.order.map((p) => state.players[p].leaderName).join(', ')}.`);
  const task = state.tasks[0] as Extract<Task, { kind: 'setFactionOrders' }>;
  task.remaining.shift();
}

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

function hasWork(state: GameState, pid: PlayerId, type: DeployType): boolean {
  const d = state.turnData.toDeploy[pid];
  if (!d) return false;
  switch (type) {
    case 'farmers':
      return d.farmers > 0;
    case 'buildings':
      return d.buildings.levelUps + d.buildings.temples + d.buildings.universities + d.buildings.walls > 0;
    case 'ships':
      return d.ships > 0;
    case 'soldiers':
      return d.soldiers > 0;
    default:
      return false;
  }
}

function taskDeploy(state: GameState, task: Extract<Task, { kind: 'deploy' }>): void {
  if (task.order.length === 0) task.order = interleavedOrder(state);
  const n = task.order.length;
  for (let step = 0; step < n; step++) {
    const i = (task.idx + step) % n;
    const pid = task.order[i];
    if (!hasWork(state, pid, task.type)) continue;
    const d = state.turnData.toDeploy[pid];
    switch (task.type) {
      case 'farmers': {
        const legal = legalFarmerTiles(state, pid);
        if (legal.length === 0) {
          log(state, 'deploy', `${label(state, pid)} has ${d.farmers} farmer(s) with nowhere to go; they are lost.`);
          d.farmers = 0;
          continue;
        }
        task.idx = i;
        state.pending = { kind: 'placeFarmers', playerId: pid, remaining: d.farmers, count: Math.min(3, d.farmers, legal.length), legalTiles: legal };
        return;
      }
      case 'buildings': {
        const cities = citiesOf(state, pid).map((t) => t.id);
        if (cities.length === 0) {
          log(state, 'deploy', `${label(state, pid)} controls no city; their buildings are lost.`);
          d.buildings = { levelUps: 0, temples: 0, universities: 0, walls: 0 };
          continue;
        }
        task.idx = i;
        state.pending = { kind: 'placeBuildings', playerId: pid, purchases: { ...d.buildings }, cityTileIds: cities };
        return;
      }
      case 'ships': {
        const legal = legalShipTiles(state, pid);
        if (legal.length === 0) {
          log(state, 'deploy', `${label(state, pid)} controls no coastal city; ${d.ships} ship(s) are lost.`);
          d.ships = 0;
          continue;
        }
        task.idx = i;
        state.pending = { kind: 'placeShips', playerId: pid, count: d.ships, legalTiles: legal };
        return;
      }
      case 'soldiers': {
        const legal = legalSoldierTiles(state, pid);
        if (legal.length === 0) {
          log(state, 'deploy', `${label(state, pid)} controls no city; ${d.soldiers} soldier(s) are lost.`);
          d.soldiers = 0;
          continue;
        }
        task.idx = i;
        state.pending = { kind: 'placeSoldiers', playerId: pid, count: d.soldiers, legalTiles: legal };
        return;
      }
    }
  }
  popTask(state);
}

function advanceDeployCursor(state: GameState): void {
  const task = state.tasks[0] as Extract<Task, { kind: 'deploy' }>;
  task.idx = (task.idx + 1) % Math.max(1, task.order.length);
}

function actionPlaceFarmers(state: GameState, action: Extract<Action, { kind: 'placeFarmers' }>, pending: Extract<PendingDecision, { kind: 'placeFarmers' }>): void {
  require(action.tileIds.length === pending.count, `You must place exactly ${pending.count} farmer(s) now`);
  require(new Set(action.tileIds).size === action.tileIds.length, 'Each farmer needs its own tile');
  const legal = new Set(pending.legalTiles.map((t) => t.tileId));
  for (const id of action.tileIds) require(legal.has(id), `${id} is not a legal farmer placement`);
  for (const id of action.tileIds) createUnit(state, 'farmer', action.playerId, id);
  state.turnData.toDeploy[action.playerId].farmers -= action.tileIds.length;
  log(state, 'deploy', `${label(state, action.playerId)} sends farmers to ${action.tileIds.map((id) => tLabel(state, id)).join(', ')}.`);
  advanceDeployCursor(state);
}

function actionPlaceBuildings(state: GameState, action: Extract<Action, { kind: 'placeBuildings' }>, pending: Extract<PendingDecision, { kind: 'placeBuildings' }>): void {
  const err = checkBuildingPlacements(state, action.playerId, pending.purchases, action.placements);
  if (err) throw new RulesError(err);
  const d = state.turnData.toDeploy[action.playerId];
  for (const pl of action.placements) {
    const c = tile(state, pl.tileId).city!;
    switch (pl.kind) {
      case 'levelUp':
        c.level = (c.level + 1) as 1 | 2 | 3;
        d.buildings.levelUps -= 1;
        log(state, 'deploy', `${c.name} rises to Level ${c.level}.`);
        break;
      case 'temple':
        c.temple = true;
        d.buildings.temples -= 1;
        log(state, 'deploy', `A Temple is raised in ${c.name}.`);
        break;
      case 'university':
        c.university = true;
        d.buildings.universities -= 1;
        log(state, 'deploy', `A University is founded in ${c.name}.`);
        break;
      case 'walls':
        c.walls = true;
        d.buildings.walls -= 1;
        log(state, 'deploy', `Walls now ring ${c.name}.`);
        break;
    }
  }
  const lost = d.buildings.levelUps + d.buildings.temples + d.buildings.universities + d.buildings.walls;
  if (lost > 0) log(state, 'deploy', `${label(state, action.playerId)} could not place ${lost} building(s); the materials are lost.`);
  d.buildings = { levelUps: 0, temples: 0, universities: 0, walls: 0 };
  advanceDeployCursor(state);
}

function placeCounted(state: GameState, kind: 'ship' | 'soldier', playerId: PlayerId, counts: Record<TileId, number>, legal: TileId[], total: number): void {
  let sum = 0;
  for (const [id, n] of Object.entries(counts)) {
    require(Number.isInteger(n) && n >= 0, `Bad count for ${id}`);
    require(legal.includes(id), `${id} is not a legal placement`);
    sum += n;
  }
  require(sum === total, `You must place all ${total} ${kind}(s) at once (got ${sum})`);
  const parts: string[] = [];
  for (const [id, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) createUnit(state, kind, playerId, id);
    if (n > 0) parts.push(`${n} in ${tLabel(state, id)}`);
  }
  log(state, 'deploy', `${label(state, playerId)} places ${kind}s: ${parts.join(', ') || 'none'}.`);
}

function actionPlaceShips(state: GameState, action: Extract<Action, { kind: 'placeShips' }>, pending: Extract<PendingDecision, { kind: 'placeShips' }>): void {
  placeCounted(state, 'ship', action.playerId, action.counts, pending.legalTiles, pending.count);
  state.turnData.toDeploy[action.playerId].ships = 0;
  advanceDeployCursor(state);
}

function actionPlaceSoldiers(state: GameState, action: Extract<Action, { kind: 'placeSoldiers' }>, pending: Extract<PendingDecision, { kind: 'placeSoldiers' }>): void {
  placeCounted(state, 'soldier', action.playerId, action.counts, pending.legalTiles, pending.count);
  state.turnData.toDeploy[action.playerId].soldiers = 0;
  advanceDeployCursor(state);
}

function taskDrawPoliticians(state: GameState): void {
  popTask(state);
  for (const pid of interleavedOrder(state)) {
    const n = state.turnData.toDeploy[pid]?.politicians ?? 1;
    let drawn = 0;
    for (let i = 0; i < n; i++) if (drawCard(state, pid)) drawn++;
    state.turnData.toDeploy[pid].politicians = 0;
    log(state, 'deploy', `${label(state, pid)} draws ${drawn} politician card(s); hand size ${state.players[pid].hand.length}.`);
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function handleSetupTask(state: GameState, task: Task): boolean {
  switch (task.kind) {
    case 'roleSelection':
      taskRoleSelection(state, task);
      return true;
    case 'startTurn':
      taskStartTurn(state);
      return true;
    case 'collectAllocations':
      taskCollectAllocations(state, task);
      return true;
    case 'setFactionOrders':
      taskSetFactionOrders(state, task);
      return true;
    case 'deploy':
      taskDeploy(state, task);
      return true;
    case 'drawPoliticians':
      taskDrawPoliticians(state);
      return true;
    default:
      return false;
  }
}

export function handleSetupAction(state: GameState, action: Action, pending: PendingDecision): boolean {
  switch (action.kind) {
    case 'chooseRole':
      actionChooseRole(state, action, pending as Extract<PendingDecision, { kind: 'chooseRole' }>);
      return true;
    case 'allocate':
      actionAllocate(state, action);
      return true;
    case 'setFactionOrder':
      actionSetFactionOrder(state, action, pending as Extract<PendingDecision, { kind: 'setFactionOrder' }>);
      return true;
    case 'placeFarmers':
      actionPlaceFarmers(state, action, pending as Extract<PendingDecision, { kind: 'placeFarmers' }>);
      return true;
    case 'placeBuildings':
      actionPlaceBuildings(state, action, pending as Extract<PendingDecision, { kind: 'placeBuildings' }>);
      return true;
    case 'placeShips':
      actionPlaceShips(state, action, pending as Extract<PendingDecision, { kind: 'placeShips' }>);
      return true;
    case 'placeSoldiers':
      actionPlaceSoldiers(state, action, pending as Extract<PendingDecision, { kind: 'placeSoldiers' }>);
      return true;
    default:
      return false;
  }
}

export { orderedMembers };
