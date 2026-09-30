/**
 * Simultaneous military rounds (decision 109), the alternative to the
 * sequential sub-phases of the rules document.
 *
 * Each turn has two rounds, Ships and Full. In each, every General writes a
 * secret order sheet for the whole alliance; the sheets are revealed together,
 * Rage of Achilles may be played against any order, and then everything
 * resolves at once:
 *
 * 1. Opposing forces that swap tiles across the same edge clash at the border
 *    (no defensive bonus). The loser's survivors fall back to where they
 *    started; on a tie both fall back.
 * 2. Tiles are then settled one at a time, each after the forces leaving it have
 *    been settled, so units that march out are not there to defend it and
 *    forces that fall back help defend their own tile. Friendly forces join the
 *    tile's holders. Enemy alliances assault the holders one after another in
 *    alliance order (ordinary combat with defensive bonuses; the winner holds
 *    the tile against the next). Several alliances entering an empty tile
 *    fight contests without bonuses until one remains, which enters.
 * 3. A ring of attacks in which every tile is emptied rotates at once; any
 *    other ring is broken by settling its first tile with whoever is still in it.
 */
import type { TileId } from './hex';
import { SIM_ROUNDS } from './types';
import type { Action, AllianceId, CombatRecord, CombatSide, GameState, PendingDecision, PlayerId, ResolutionReport, SimForce, SimRoundState, Task, Unit } from './types';
import { label, log, moveUnit, popTask, pushFront, reactionCandidates, removeUnit, require, sinkUnmannedShipsAtSea, tLabel } from './core';
import { allianceName, allianceOf, generalOf, shipsOnTile, soldiersOnTile, tile, unmannedShipsOfAlliance } from './query';
import { destinationsFrom, orderableSourceTiles, validateOrder } from './rules/movement';
import { rollSide } from './rules/combat';
import { describeGroup, destroyEnemyFarmers, pairForSea, seizeShips, subPhaseName } from './flowMilitary';

function sim(state: GameState): SimRoundState {
  const s = state.turnData.sim;
  if (!s) throw new Error('no simultaneous round in progress');
  return s;
}

// ---------------------------------------------------------------------------
// Rounds and secret order sheets
// ---------------------------------------------------------------------------

function taskSimRound(state: GameState, task: Extract<Task, { kind: 'simRound' }>): void {
  if (task.idx >= SIM_ROUNDS.length) {
    popTask(state);
    state.turnData.subPhase = null;
    state.turnData.sim = null;
    return;
  }
  if (task.started) {
    task.idx += 1;
    task.started = false;
    return;
  }
  const round = SIM_ROUNDS[task.idx];
  task.started = true;
  for (const u of Object.values(state.units)) {
    u.moved = false;
    u.spent = false;
  }
  state.turnData.subPhase = round;
  state.turnData.sim = { round, stage: 'collect', submitted: {}, forces: [] };
  log(state, 'turn', `${subPhaseName(round)} round: each General writes the alliance's orders in secret.`, { banner: true });
  pushFront(state, { kind: 'simCollect', remaining: [...state.allianceOrder] }, { kind: 'simReveal' }, { kind: 'simPrepare' }, { kind: 'simBorders' }, { kind: 'simTiles' }, { kind: 'simFinish' });
}

function taskSimCollect(state: GameState, task: Extract<Task, { kind: 'simCollect' }>): void {
  const round = sim(state).round;
  while (task.remaining.length > 0) {
    const a = task.remaining[0];
    const sources = orderableSourceTiles(state, a, round);
    const scuttle = unmannedShipsOfAlliance(state, a).map((s) => s.id);
    if (sources.length === 0 && scuttle.length === 0) {
      task.remaining.shift();
      continue;
    }
    state.pending = { kind: 'submitOrders', playerId: generalOf(state, a), allianceId: a, subPhase: round, sourceTileIds: sources, scuttleableShipIds: scuttle };
    return;
  }
  popTask(state);
}

function actionSubmitOrders(state: GameState, action: Extract<Action, { kind: 'submitOrders' }>, pending: Extract<PendingDecision, { kind: 'submitOrders' }>): void {
  const seen = new Set<TileId>();
  for (const o of action.orders) {
    require(pending.sourceTileIds.includes(o.sourceTileId), `${o.sourceTileId} holds no units you can order now`);
    require(!seen.has(o.sourceTileId), `Only one order may be given to ${o.sourceTileId}`);
    seen.add(o.sourceTileId);
    validateOrder(state, pending.allianceId, pending.subPhase, o.sourceTileId, o.groups);
  }
  require(new Set(action.scuttle).size === action.scuttle.length, 'Each ship may be scuttled once');
  for (const id of action.scuttle) require(pending.scuttleableShipIds.includes(id), `${id} is not an unmanned ship of your alliance`);
  sim(state).submitted[pending.allianceId] = {
    orders: action.orders.map((o) => ({ sourceTileId: o.sourceTileId, groups: o.groups.map((g) => ({ destTileId: g.destTileId, unitIds: [...g.unitIds] })) })),
    scuttle: [...action.scuttle],
  };
  log(state, 'order', `${label(state, action.playerId)} seals the ${allianceName(pending.allianceId)} orders.`);
  const task = state.tasks[0] as Extract<Task, { kind: 'simCollect' }>;
  task.remaining.shift();
}

function taskSimReveal(state: GameState): void {
  popTask(state);
  const s = sim(state);
  s.stage = 'resolve';
  const count = Object.values(s.submitted).reduce((n, x) => n + (x?.orders.length ?? 0), 0);
  log(state, 'order', `The ${subPhaseName(s.round)} orders are revealed: ${count} order(s) in all.`, { banner: true });
  const rage: Task[] = [];
  for (const a of state.allianceOrder) {
    const sheet = s.submitted[a];
    if (!sheet) continue;
    const general = generalOf(state, a);
    for (const id of sheet.scuttle) {
      const u = removeUnit(state, id);
      if (u) log(state, 'order', `${label(state, general)} orders the unmanned ship of ${label(state, u.ownerId)} on ${tLabel(state, u.tileId)} destroyed.`);
    }
    if (sheet.orders.length === 0) log(state, 'order', `The ${allianceName(a)} General gives no orders.`);
    for (const o of sheet.orders) {
      const id = `o${state.nextOrderId++}`;
      state.turnData.orders[id] = { id, generalId: general, allianceId: a, sourceTileId: o.sourceTileId, subPhase: s.round, groups: o.groups, refusedUnitIds: [] };
      const text = o.groups.map((g) => `${describeGroup(state, g.unitIds)} TO ${tLabel(state, g.destTileId).toUpperCase()}`).join(', ');
      log(state, 'order', `${state.players[general].leaderName.toUpperCase()} ORDERS FROM ${tLabel(state, o.sourceTileId).toUpperCase()}: ${text}.`, { orderId: id, sourceTileId: o.sourceTileId, groups: o.groups });
      // Rage of Achilles (ruling 32): the other owners of the ordered units may refuse.
      const owners = new Set<PlayerId>();
      for (const g of o.groups) for (const uid of g.unitIds) if (state.units[uid]) owners.add(state.units[uid].ownerId);
      owners.delete(general);
      const candidates = reactionCandidates(state, state.seatOrder.filter((p) => owners.has(p)), 'rage', true);
      if (candidates.length) rage.push({ kind: 'rageWindow', orderId: id, remaining: candidates });
    }
  }
  pushFront(state, ...rage);
}

function taskSimPrepare(state: GameState): void {
  popTask(state);
  const s = sim(state);
  let n = 0;
  for (const order of Object.values(state.turnData.orders)) {
    if (order.subPhase !== s.round) continue;
    const refused = new Set(order.refusedUnitIds);
    const dests = new Map(destinationsFrom(state, order.sourceTileId).map((d) => [d.tileId, d]));
    for (const g of order.groups) {
      const via = dests.get(g.destTileId)!.via;
      let moving: Unit[] = g.unitIds.filter((id) => !refused.has(id) && state.units[id]?.tileId === order.sourceTileId).map((id) => state.units[id]);
      if (via === 'sea') moving = pairForSea(state, moving, order.sourceTileId, g.destTileId);
      const soldiers = moving.filter((u) => u.kind === 'soldier').length;
      if (soldiers === 0) {
        log(state, 'order', `No units march from ${tLabel(state, order.sourceTileId)} to ${tLabel(state, g.destTileId)}.`);
        continue;
      }
      for (const u of moving) u.moved = true;
      s.forces.push({
        id: `f${++n}`,
        orderId: order.id,
        allianceId: order.allianceId,
        generalId: order.generalId,
        from: order.sourceTileId,
        to: g.destTileId,
        via,
        unitIds: moving.map((u) => u.id),
        soldiers,
        ships: moving.length - soldiers,
        status: 'marching',
        combatIds: [],
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Drop units that died or were pushed off their starting tile; a force with no soldiers left there is done. */
function refresh(state: GameState, f: SimForce): void {
  if (f.status !== 'marching') return;
  const here = f.unitIds.filter((id) => state.units[id] && state.units[id].tileId === f.from);
  if (here.some((id) => state.units[id].kind === 'soldier')) {
    f.unitIds = here;
    return;
  }
  f.status = f.unitIds.some((id) => state.units[id]?.kind === 'soldier') ? 'repulsed' : 'lost';
}

function marching(state: GameState): SimForce[] {
  const s = sim(state);
  for (const f of s.forces) refresh(state, f);
  return s.forces.filter((f) => f.status === 'marching');
}

const allianceRank = (state: GameState, a: AllianceId) => state.allianceOrder.indexOf(a);

function emptySide(allianceId: AllianceId, generalId: PlayerId, units: Unit[]): CombatSide {
  return {
    allianceId,
    generalId,
    soldierIds: units.filter((u) => u.kind === 'soldier').map((u) => u.id),
    shipIds: units.filter((u) => u.kind === 'ship').map((u) => u.id),
    dice: [],
    diceTotal: 0,
    bonus: 0,
    score: 0,
    hitsTaken: 0,
    casualties: [],
  };
}

function forceUnits(state: GameState, forces: SimForce[]): Unit[] {
  return forces.flatMap((f) => f.unitIds.map((id) => state.units[id]));
}

/** The force with the most soldiers speaks for a group of forces (its origin and order are recorded). */
function lead(forces: SimForce[]): SimForce {
  return [...forces].sort((a, b) => b.soldiers - a.soldiers || (a.from < b.from ? -1 : 1))[0];
}

function newCombat(state: GameState, mode: 'assault' | 'border' | 'contest', tileId: TileId, attackers: SimForce[], defender: CombatSide): CombatRecord {
  const s = sim(state);
  const l = lead(attackers);
  const id = `c${state.nextCombatId++}`;
  const c: CombatRecord = {
    id,
    orderId: l.orderId,
    subPhase: s.round,
    tileId,
    originTileId: l.from,
    attacker: emptySide(l.allianceId, l.generalId, forceUnits(state, attackers)),
    defender,
    spentOnly: false,
    winner: null,
    cityOwnerBefore: tile(state, tileId).city?.ownerId ?? null,
    resolved: false,
    trojanPlayed: false,
    mode,
  };
  state.turnData.combats[id] = c;
  for (const f of attackers) {
    f.status = 'engaged';
    f.combatIds.push(id);
  }
  return c;
}

/** Field battles (border clashes and contests): both sides march, so neither gets a defensive bonus. */
function startField(state: GameState, mode: 'border' | 'contest', tileId: TileId, first: SimForce[], second: SimForce[]): void {
  const l = lead(second);
  const def = emptySide(l.allianceId, l.generalId, forceUnits(state, second));
  const c = newCombat(state, mode, tileId, first, def);
  c.originTileId = lead(first).from;
  for (const f of second) {
    f.status = 'engaged';
    f.combatIds.push(c.id);
  }
  pushFront(state, { kind: 'fieldBattle', combatId: c.id });
}

function taskSimBorders(state: GameState): void {
  const live = marching(state);
  for (const f of live) {
    const g = live.find((x) => x.from === f.to && x.to === f.from && x.allianceId !== f.allianceId);
    if (!g) continue;
    const [first, second] = allianceRank(state, f.allianceId) < allianceRank(state, g.allianceId) ? [f, g] : [g, f];
    log(state, 'combat', `The ${allianceName(first.allianceId)} and ${allianceName(second.allianceId)} forces meet on the border between ${tLabel(state, first.from)} and ${tLabel(state, second.from)}.`, { banner: true });
    startField(state, 'border', second.from, [first], [second]);
    return;
  }
  popTask(state);
}

function taskFieldBattle(state: GameState, task: Extract<Task, { kind: 'fieldBattle' }>): void {
  popTask(state);
  const c = state.turnData.combats[task.combatId];
  const att = rollSide(state, c.attacker, false, c.tileId);
  const def = rollSide(state, c.defender, false, c.tileId);
  c.attacker.hitsTaken = def.hits;
  c.defender.hitsTaken = att.hits;
  const what = c.mode === 'border' ? 'Border clash' : `Contest for ${tLabel(state, c.tileId)}`;
  log(state, 'combat', `${what}: ${allianceName(c.attacker.allianceId)} ${att.explanation}.`, { combatId: c.id, side: 'attacker', dice: c.attacker.dice });
  log(state, 'combat', `${what}: ${allianceName(c.defender.allianceId)} ${def.explanation}.`, { combatId: c.id, side: 'defender', dice: c.defender.dice });
  pushFront(state, { kind: 'casualties', combatId: c.id, side: 'attacker' }, { kind: 'casualties', combatId: c.id, side: 'defender' }, { kind: 'fieldOutcome', combatId: c.id });
}

function taskFieldOutcome(state: GameState, task: Extract<Task, { kind: 'fieldOutcome' }>): void {
  popTask(state);
  const c = state.turnData.combats[task.combatId];
  const alive = (side: CombatSide) => side.soldierIds.filter((id) => state.units[id]).length;
  const a = alive(c.attacker);
  const d = alive(c.defender);
  let winner: 'attacker' | 'defender' | null;
  if (a === 0 && d === 0) winner = null;
  else if (d === 0) winner = 'attacker';
  else if (a === 0) winner = 'defender';
  else if (c.attacker.score > c.defender.score) winner = 'attacker';
  else if (c.defender.score > c.attacker.score) winner = 'defender';
  else winner = null;
  c.winner = winner;
  c.resolved = true;
  const name = (side: 'attacker' | 'defender') => allianceName(c[side].allianceId);
  if (winner) log(state, 'combat', `${name(winner)} wins (${c.attacker.score} to ${c.defender.score}) and marches on; the ${name(winner === 'attacker' ? 'defender' : 'attacker')} survivors fall back.`, { combatId: c.id, winner });
  else log(state, 'combat', `Neither side prevails (${c.attacker.score} to ${c.defender.score}); both fall back to where they started.`, { combatId: c.id, winner: null });
  for (const f of sim(state).forces) {
    if (f.status !== 'engaged' || !f.combatIds.includes(c.id)) continue;
    const side = f.allianceId === c.attacker.allianceId ? 'attacker' : 'defender';
    f.status = side === winner ? 'marching' : 'repulsed';
  }
}

/** Settle one tile: reinforcements join, then one assault, contest or entry at a time. */
function resolveTile(state: GameState, tileId: TileId): void {
  const incoming = marching(state).filter((f) => f.to === tileId);
  const holders = soldiersOnTile(state, tileId);
  const holder = holders.length ? allianceOf(state, holders[0].ownerId) : null;
  const byAlliance = new Map<AllianceId, SimForce[]>();
  for (const f of incoming) byAlliance.set(f.allianceId, [...(byAlliance.get(f.allianceId) ?? []), f]);
  const alliances = [...byAlliance.keys()].sort((x, y) => allianceRank(state, x) - allianceRank(state, y));

  if (holder && byAlliance.has(holder)) {
    const friends = byAlliance.get(holder)!;
    const moved = forceUnits(state, friends);
    for (const u of moved) moveUnit(state, u.id, tileId);
    for (const f of friends) f.status = 'arrived';
    log(state, 'order', `${describeGroup(state, moved.map((u) => u.id))} of the ${allianceName(holder)} alliance join the defenders of ${tLabel(state, tileId)}.`);
    return;
  }
  if (holder) {
    const enemy = alliances[0];
    const forces = byAlliance.get(enemy)!;
    const def = emptySide(holder, generalOf(state, holder), [...holders, ...shipsOnTile(state, tileId).filter((s) => allianceOf(state, s.ownerId) === holder)]);
    const c = newCombat(state, 'assault', tileId, forces, def);
    pushFront(state, { kind: 'combat', combatId: c.id });
    return;
  }
  if (alliances.length >= 2) {
    const [x, y] = alliances;
    startField(state, 'contest', tileId, byAlliance.get(x)!, byAlliance.get(y)!);
    return;
  }
  const forces = byAlliance.get(alliances[0])!;
  enter(state, tileId, forces);
}

function enter(state: GameState, tileId: TileId, forces: SimForce[]): void {
  const l = lead(forces);
  const units = forceUnits(state, forces);
  for (const u of units) moveUnit(state, u.id, tileId);
  for (const f of forces) f.status = 'arrived';
  destroyEnemyFarmers(state, tileId, l.allianceId);
  log(state, 'order', `${describeGroup(state, units.map((u) => u.id))} of the ${allianceName(l.allianceId)} alliance move${units.length === 1 ? 's' : ''} into ${tLabel(state, tileId)}.`);
  pushFront(state, { kind: 'enterTile', tileId, allianceId: l.allianceId, generalId: l.generalId, unitIds: units.map((u) => u.id), fromTileId: l.from });
}

/** A ring of forces in which every tile is emptied and entered by exactly one force rotates at once. */
function tryRotate(state: GameState, ring: SimForce[], live: SimForce[]): boolean {
  for (const f of ring) {
    const into = live.filter((x) => x.to === f.to);
    if (into.length !== 1) return false;
    const out = live.filter((x) => x.from === f.from);
    if (out.length !== 1) return false;
    if (soldiersOnTile(state, f.from).some((s) => !f.unitIds.includes(s.id))) return false;
  }
  const units = ring.map((f) => forceUnits(state, [f]));
  ring.forEach((f, i) => {
    for (const u of units[i]) moveUnit(state, u.id, f.to);
    f.status = 'arrived';
  });
  const follow: Task[] = [];
  for (const f of ring) {
    // seize and clear at once so no tile ever holds two alliances between decisions
    destroyEnemyFarmers(state, f.to, f.allianceId);
    const seize = seizeShips(state, f.to, f.allianceId, f.generalId);
    if (seize) follow.push(seize);
  }
  log(state, 'order', `A ring of ${ring.length} marches turns at once: ${ring.map((f) => `${allianceName(f.allianceId)} into ${tLabel(state, f.to)}`).join(', ')}.`);
  for (const f of ring) follow.push({ kind: 'enterTile', tileId: f.to, allianceId: f.allianceId, generalId: f.generalId, unitIds: [...f.unitIds], fromTileId: f.from });
  pushFront(state, ...follow);
  return true;
}

function findRing(live: SimForce[]): SimForce[] {
  const path: SimForce[] = [];
  let cur = live[0];
  while (!path.includes(cur)) {
    path.push(cur);
    const next = live.find((f) => f.from === cur.to);
    if (!next) return [];
    cur = next;
  }
  return path.slice(path.indexOf(cur));
}

function tileOrder(state: GameState, live: SimForce[], tiles: TileId[]): TileId[] {
  const rank = (t: TileId) => Math.min(...live.filter((f) => f.to === t).map((f) => allianceRank(state, f.allianceId)));
  return [...tiles].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

function taskSimTiles(state: GameState): void {
  const live = marching(state);
  if (live.length === 0) {
    popTask(state);
    return;
  }
  const targets = [...new Set(live.map((f) => f.to))];
  const ready = targets.filter((t) => !live.some((f) => f.from === t));
  if (ready.length > 0) {
    resolveTile(state, tileOrder(state, live, ready)[0]);
    return;
  }
  const ring = findRing(live);
  if (ring.length > 1 && tryRotate(state, ring, live)) return;
  const tiles = ring.length ? ring.map((f) => f.to) : targets;
  resolveTile(state, tileOrder(state, live, tiles)[0]);
}

function taskSimFinish(state: GameState): void {
  popTask(state);
  const s = sim(state);
  for (const f of s.forces) {
    if (f.status !== 'engaged') continue;
    const units = f.unitIds.filter((id) => state.units[id]);
    if (units.some((id) => state.units[id].tileId === f.to)) f.status = 'arrived';
    else f.status = units.some((id) => state.units[id].kind === 'soldier') ? 'repulsed' : 'lost';
  }
  for (const f of s.forces) if (f.status === 'repulsed' && !f.unitIds.some((id) => state.units[id])) f.status = 'lost';
  sinkUnmannedShipsAtSea(state);
  const battles: ResolutionReport['battles'] = Object.values(state.turnData.combats)
    .filter((c) => c.subPhase === s.round && c.mode)
    .map((c) => ({
      combatId: c.id,
      tileId: c.tileId,
      originTileId: c.originTileId,
      mode: c.mode!,
      attackerAllianceId: c.attacker.allianceId,
      defenderAllianceId: c.defender.allianceId,
      attackerScore: c.attacker.score,
      defenderScore: c.defender.score,
      attackerLosses: c.attacker.casualties.filter((u) => u.kind === 'soldier').length,
      defenderLosses: c.defender.casualties.filter((u) => u.kind === 'soldier').length,
      winner: c.winner,
    }));
  const cityOwners: Record<TileId, PlayerId | null> = {};
  for (const t of Object.values(state.tiles)) if (t.city) cityOwners[t.id] = t.city.ownerId;
  state.lastResolution = {
    turn: state.turn,
    round: s.round,
    forces: s.forces.map((f) => ({ from: f.from, to: f.to, allianceId: f.allianceId, soldiers: f.soldiers, ships: f.ships, outcome: f.status === 'arrived' ? 'arrived' : f.status === 'lost' ? 'lost' : 'repulsed' })),
    battles,
    units: Object.values(state.units).map((u) => ({ ...u })),
    cityOwners,
  };
  const arrived = s.forces.filter((f) => f.status === 'arrived').length;
  log(state, 'turn', `The ${subPhaseName(s.round)} round is resolved: ${arrived} of ${s.forces.length} march(es) arrived, ${battles.length} battle(s) fought.`, { resolution: true });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function handleSimTask(state: GameState, task: Task): boolean {
  switch (task.kind) {
    case 'simRound':
      taskSimRound(state, task);
      return true;
    case 'simCollect':
      taskSimCollect(state, task);
      return true;
    case 'simReveal':
      taskSimReveal(state);
      return true;
    case 'simPrepare':
      taskSimPrepare(state);
      return true;
    case 'simBorders':
      taskSimBorders(state);
      return true;
    case 'simTiles':
      taskSimTiles(state);
      return true;
    case 'simFinish':
      taskSimFinish(state);
      return true;
    case 'fieldBattle':
      taskFieldBattle(state, task);
      return true;
    case 'fieldOutcome':
      taskFieldOutcome(state, task);
      return true;
    default:
      return false;
  }
}

export function handleSimAction(state: GameState, action: Action, pending: PendingDecision): boolean {
  if (action.kind !== 'submitOrders') return false;
  actionSubmitOrders(state, action, pending as Extract<PendingDecision, { kind: 'submitOrders' }>);
  return true;
}

