/**
 * A heuristic bot that can answer every pending decision. It only needs to be
 * sensible, not strong. Randomness is derived deterministically from the game
 * state (seed, RNG position, action count) so bot games replay exactly without
 * the bot ever touching the game's RNG stream.
 */
import type { Action, Allocation, AllianceId, BuildingPlacement, GameState, MoveGroup, PendingDecision, PlayerId, Tile, Unit } from '../engine/types';
import { createRng, nextFloat, nextInt } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { allianceOf, capacityOf, citiesOf, cityCount, isGeneral, membersOf, shipsOnTile, soldierCount, soldiersOnTile, tile, unitsOnTile } from '../engine/query';
import { checkAllocation, emptyAllocation } from '../engine/rules/allocation';
import { legalFarmerTiles, legalShipTiles } from '../engine/rules/deploy';
import { legalDestinations, movableUnitsAt, validateOrder } from '../engine/rules/movement';
import { defenderBonusPerSoldier } from '../engine/rules/combat';
import { CARD_BY_TYPE } from '../data/cards';
import { hasSeaEdge } from '../engine/map';
import { neighbor, tileId as mkTileId } from '../engine/hex';

function botRng(state: GameState, pid: PlayerId): RngState {
  const seed = (state.rng.s ^ (state.actionLog.length * 2654435761) ^ (pid.length * 97)) >>> 0;
  return createRng(seed || 1);
}

function resourceScore(t: Tile): number {
  let s = 0;
  if (t.resources.includes('wheat')) s += 2;
  if (t.resources.some((r) => r === 'wood' || r === 'stone' || r === 'iron')) s += 1;
  return s;
}

/** Enemy soldiers within `radius` hexes of a tile (by hex distance, ignoring terrain). */
function enemySoldiersNear(state: GameState, t: Tile, alliance: AllianceId, radius: number): number {
  let n = 0;
  for (const u of Object.values(state.units)) {
    if (u.kind !== 'soldier' || allianceOf(state, u.ownerId) === alliance) continue;
    const ut = state.tiles[u.tileId];
    const d = Math.max(Math.abs(ut.q - t.q), Math.abs(ut.r - t.r), Math.abs(-ut.q - ut.r + t.q + t.r));
    if (d <= radius) n++;
  }
  return n;
}

function allianceSoldiersOn(state: GameState, tileId: string, alliance: AllianceId): Unit[] {
  return soldiersOnTile(state, tileId).filter((u) => allianceOf(state, u.ownerId) === alliance);
}

export function botAction(state: GameState, pending: PendingDecision): Action {
  const pid = pending.playerId;
  const rng = botRng(state, pid);
  switch (pending.kind) {
    case 'chooseRole': {
      // fewest members first; Purple first within (options already enforce that)
      const opts = [...pending.options].sort((a, b) => membersOf(state, a.allianceId).length - membersOf(state, b.allianceId).length);
      return { kind: 'chooseRole', playerId: pid, allianceId: opts[0].allianceId, factionId: opts[0].factionId };
    }
    case 'placeTile': {
      const best = pending.placements[nextInt(rng, Math.min(pending.placements.length, 4))] ?? pending.placements[0];
      return { kind: 'placeTile', playerId: pid, tileId: best.tileId, rotation: best.rotation, claim: pending.hasCity && pending.canClaim };
    }
    case 'allocate':
      return { kind: 'allocate', playerId: pid, allocation: chooseAllocation(state, pid, rng) };
    case 'setFactionOrder': {
      const me = pending.members.filter((m) => m === pid);
      const rest = pending.members.filter((m) => m !== pid);
      return { kind: 'setFactionOrder', playerId: pid, order: [...me, ...rest] };
    }
    case 'placeFarmers': {
      const ranked = [...pending.legalTiles].sort((a, b) => {
        const d = resourceScore(state.tiles[b.tileId]) - resourceScore(state.tiles[a.tileId]);
        if (d !== 0) return d;
        return a.tileId < b.tileId ? -1 : 1;
      });
      return { kind: 'placeFarmers', playerId: pid, tileIds: ranked.slice(0, pending.count).map((t) => t.tileId) };
    }
    case 'placeBuildings':
      return { kind: 'placeBuildings', playerId: pid, placements: chooseBuildings(state, pid, pending.purchases) };
    case 'placeShips': {
      const counts: Record<string, number> = {};
      const ranked = [...pending.legalTiles].sort((a, b) => soldiersOnTile(state, b).length - soldiersOnTile(state, a).length);
      counts[ranked[0]] = pending.count;
      return { kind: 'placeShips', playerId: pid, counts };
    }
    case 'placeSoldiers': {
      const counts: Record<string, number> = {};
      const alliance = allianceOf(state, pid);
      const tiles = pending.legalTiles.map((id) => ({
        id,
        garrison: allianceSoldiersOn(state, id, alliance).length,
        threat: enemySoldiersNear(state, state.tiles[id], alliance, 2),
        ships: shipsOnTile(state, id).length,
      }));
      for (const id of pending.legalTiles) counts[id] = 0;
      for (let i = 0; i < pending.count; i++) {
        tiles.sort((a, b) => b.threat + b.ships - b.garrison - (a.threat + a.ships - a.garrison));
        counts[tiles[0].id] += 1;
        tiles[0].garrison += 1;
      }
      return { kind: 'placeSoldiers', playerId: pid, counts };
    }
    case 'issueOrder':
      return chooseOrder(state, pending, rng);
    case 'reaction':
      return { kind: 'react', playerId: pid, play: chooseReaction(state, pending, rng) };
    case 'assignCasualties': {
      const ranked = [...pending.candidates].sort((a, b) => {
        const ua = state.units[a];
        const ub = state.units[b];
        const sa = (ua.spent ? 0 : 2) + (ua.ownerId === pid ? 1 : 0);
        const sb = (ub.spent ? 0 : 2) + (ub.ownerId === pid ? 1 : 0);
        return sa - sb;
      });
      return { kind: 'assignCasualties', playerId: pid, unitIds: ranked.slice(0, pending.hits) };
    }
    case 'retreat': {
      const alliance = allianceOf(state, pid);
      let shipsLeft = pending.shipsAvailable;
      const moves: { unitId: string; tileId: string }[] = [];
      for (const u of pending.units) {
        const ranked = [...u.destinations]
          .filter((d) => !d.byShip || shipsLeft > 0)
          .sort((a, b) => {
            const ta = state.tiles[a.tileId];
            const tb = state.tiles[b.tileId];
            const va = (ta.city && ta.city.ownerId && allianceOf(state, ta.city.ownerId) === alliance ? 3 : 0) + (a.byShip ? -1 : 0) + (allianceSoldiersOn(state, a.tileId, alliance).length > 0 ? 1 : 0);
            const vb = (tb.city && tb.city.ownerId && allianceOf(state, tb.city.ownerId) === alliance ? 3 : 0) + (b.byShip ? -1 : 0) + (allianceSoldiersOn(state, b.tileId, alliance).length > 0 ? 1 : 0);
            return vb - va;
          });
        const pick = ranked[0] ?? u.destinations[0];
        if (pick.byShip) shipsLeft--;
        moves.push({ unitId: u.unitId, tileId: pick.tileId });
      }
      return { kind: 'retreat', playerId: pid, moves };
    }
    case 'assignOwnership': {
      // a General looks after himself first; occasionally rewards the poorest partner
      const self = pending.candidates.includes(pid) ? pid : null;
      const poorest = [...pending.candidates].sort((a, b) => cityCount(state, a) - cityCount(state, b))[0];
      const owner = self && nextFloat(rng) < 0.7 ? self : poorest;
      return { kind: 'assignOwnership', playerId: pid, ownerId: owner };
    }
    case 'reflagShips':
      return { kind: 'reflagShips', playerId: pid, ownerId: pending.candidates.includes(pid) ? pid : pending.candidates[0] };
    case 'disband': {
      const ranked = [...pending.candidates].sort((a, b) => {
        const ta = state.tiles[state.units[a].tileId];
        const tb = state.tiles[state.units[b].tileId];
        return (ta.city ? 1 : 0) - (tb.city ? 1 : 0);
      });
      return { kind: 'disband', playerId: pid, unitId: ranked[0] };
    }
    case 'playCards':
      return { kind: 'playCards', playerId: pid, cardUids: choosePlay(state, pid, pending.hand, rng) };
    case 'invokeApple': {
      const round = state.turnData.politics!;
      const a = allianceOf(state, pid);
      const mine = round.scores[pid] ?? 0;
      const best = Math.max(...membersOf(state, a).map((m) => round.scores[m] ?? 0));
      return { kind: 'invokeApple', playerId: pid, invoke: mine < best && state.players[pid].hand.length > 0 };
    }
    case 'philosophersTarget': {
      const t = [...pending.targets].sort((a, b) => b.cityTileIds.length - a.cityTileIds.length)[0];
      const city = [...t.cityTileIds].sort((a, b) => state.tiles[b].city!.level - state.tiles[a].city!.level)[0];
      return { kind: 'philosophersTarget', playerId: pid, partnerId: t.partnerId, cityTileId: city };
    }
    case 'singOffVote': {
      const options = pending.tiedPlayerIds.filter((p) => p !== pid);
      return { kind: 'singOffVote', playerId: pid, votedFor: options[nextInt(rng, options.length)] };
    }
  }
}

function chooseAllocation(state: GameState, pid: PlayerId, rng: RngState): Allocation {
  const p = state.players[pid];
  const cap = capacityOf(state, pid);
  const a: Allocation = emptyAllocation();
  if (cap > 0) {
    const soldiers = soldierCount(state, pid);
    const farmableTiles = legalFarmerTiles(state, pid).map((t) => state.tiles[t.tileId]);
    const wheatTiles = farmableTiles.filter((t) => t.resources.includes('wheat')).length;
    const rawTiles = farmableTiles.filter((t) => resourceScore(t) > 0).length;
    // Feed the army with margin: aim to end the turn with food >= soldiers + 1.
    const plannedSoldiers = soldiers + Math.max(1, Math.floor(cap / 3));
    const foodNeed = Math.max(0, plannedSoldiers + 1 - p.food);
    let farmers = Math.min(cap, wheatTiles, foodNeed + 1);
    // keep a few farmers on raw materials to save for city levels
    farmers = Math.min(cap, rawTiles, Math.max(farmers, Math.ceil(cap * 0.4)));
    const rest = cap - farmers;
    // soldiers only when they can be fed next turn
    const affordable = Math.max(0, p.food + Math.min(farmers, wheatTiles) - soldiers);
    let newSoldiers = Math.min(rest, affordable, Math.ceil(rest * 0.7));
    if (nextFloat(rng) < 0.2) newSoldiers = Math.min(rest, newSoldiers + 1);
    a.farmers = farmers;
    a.soldiers = newSoldiers;
    a.politicians = rest - newSoldiers;
  }
  // raw materials: save for city levels, then L3 improvements, walls, ships
  let raw = p.raw;
  const cities = citiesOf(state, pid);
  const upgradable = cities.filter((t) => t.city!.level < 3).length;
  while (raw >= 7 && a.levelUps < upgradable) {
    a.levelUps++;
    raw -= 7;
  }
  const l3 = cities.filter((t) => t.city!.level === 3);
  const templeRoom = l3.filter((t) => !t.city!.temple).length;
  const uniRoom = l3.filter((t) => !t.city!.university).length;
  while (raw >= 3 && a.temples < templeRoom) {
    a.temples++;
    raw -= 3;
  }
  while (raw >= 3 && a.universities < uniRoom) {
    a.universities++;
    raw -= 3;
  }
  const wallRoom = cities.filter((t) => !t.city!.walls).length;
  if (raw >= 2 && raw < 7 && a.walls < wallRoom && nextFloat(rng) < 0.5) {
    a.walls++;
    raw -= 2;
  }
  const coastal = legalShipTiles(state, pid).length > 0;
  const ships = Object.values(state.units).filter((u) => u.kind === 'ship' && u.ownerId === pid).length;
  if (coastal && raw >= 1 && ships < 2 && a.soldiers + soldierCount(state, pid) >= 2 && nextFloat(rng) < 0.6) {
    a.ships++;
    raw -= 1;
  }
  const check = checkAllocation(state, pid, a);
  if (!check.ok) {
    const fallback = emptyAllocation();
    fallback.politicians = cap;
    return fallback;
  }
  return a;
}

function chooseBuildings(state: GameState, pid: PlayerId, purchases: { levelUps: number; temples: number; universities: number; walls: number }): BuildingPlacement[] {
  const out: BuildingPlacement[] = [];
  const cities = citiesOf(state, pid).map((t) => ({ id: t.id, level: t.city!.level as number, walls: t.city!.walls, temple: t.city!.temple, university: t.city!.university }));
  for (let i = 0; i < purchases.levelUps; i++) {
    const c = cities.filter((x) => x.level < 3).sort((a, b) => b.level - a.level)[0];
    if (!c) break;
    c.level++;
    out.push({ kind: 'levelUp', tileId: c.id });
  }
  for (let i = 0; i < purchases.temples; i++) {
    const c = cities.find((x) => x.level === 3 && !x.temple);
    if (!c) break;
    c.temple = true;
    out.push({ kind: 'temple', tileId: c.id });
  }
  for (let i = 0; i < purchases.universities; i++) {
    const c = cities.find((x) => x.level === 3 && !x.university);
    if (!c) break;
    c.university = true;
    out.push({ kind: 'university', tileId: c.id });
  }
  for (let i = 0; i < purchases.walls; i++) {
    const c = cities.filter((x) => !x.walls).sort((a, b) => b.level - a.level)[0];
    if (!c) break;
    c.walls = true;
    out.push({ kind: 'walls', tileId: c.id });
  }
  return out;
}

interface Plan {
  score: number;
  groups: MoveGroup[];
}

function chooseOrder(state: GameState, pending: Extract<PendingDecision, { kind: 'issueOrder' }>, rng: RngState): Action {
  const pid = pending.playerId;
  const alliance = pending.allianceId;
  let best: { tileId: string; plan: Plan } | null = null;
  for (const src of pending.sourceTileIds) {
    const plan = planFromTile(state, alliance, src, pending.subPhase, rng);
    if (plan && (!best || plan.score > best.plan.score)) best = { tileId: src, plan };
  }
  if (best && best.plan.score > 0) {
    try {
      validateOrder(state, alliance, pending.subPhase, best.tileId, best.plan.groups);
      return { kind: 'order', playerId: pid, sourceTileId: best.tileId, groups: best.plan.groups };
    } catch {
      // fall through to pass
    }
  }
  return { kind: 'pass', playerId: pid };
}

function planFromTile(state: GameState, alliance: AllianceId, src: string, sub: 'ships1' | 'ships2' | 'full1' | 'full2', rng: RngState): Plan | null {
  const units = movableUnitsAt(state, alliance, src);
  const soldiers = units.filter((u) => u.kind === 'soldier');
  const ships = units.filter((u) => u.kind === 'ship');
  if (soldiers.length === 0) return null;
  const srcTile = tile(state, src);
  const ownCity = !!srcTile.city && !!srcTile.city.ownerId && allianceOf(state, srcTile.city.ownerId) === alliance;
  const threat = enemySoldiersNear(state, srcTile, alliance, 2);
  // garrison to leave behind
  let keep = ownCity ? Math.min(soldiers.length, Math.max(1, threat)) : 0;
  if (ownCity && threat === 0 && soldiers.length >= 2 && nextFloat(rng) < 0.5) keep = 1;
  const spare = soldiers.length - keep;
  if (spare <= 0) return null;
  const dests = legalDestinations(state, alliance, src, sub);
  let best: { score: number; dest: string; via: 'land' | 'sea'; count: number } | null = null;
  for (const d of dests) {
    const dt = tile(state, d.tileId);
    const enemies = soldiersOnTile(state, d.tileId).filter((u) => allianceOf(state, u.ownerId) !== alliance);
    const enemyFarmers = unitsOnTile(state, d.tileId).some((u) => u.kind === 'farmer' && allianceOf(state, u.ownerId) !== alliance);
    const maxCount = d.via === 'sea' ? Math.min(spare, ships.length) : spare;
    if (maxCount <= 0) continue;
    let score = 0;
    let count = 1;
    if (enemies.length > 0) {
      const active = enemies.filter((e) => !e.spent).length;
      const bonus = defenderBonusPerSoldier(state, d.tileId).perSoldier;
      const defExp = active * (3.5 + bonus);
      const attExp = maxCount * 3.5;
      if (active === 0) {
        score = 30 + (dt.city ? 20 : 0);
        count = Math.min(maxCount, Math.max(1, enemies.length));
      } else if (attExp > defExp * 0.9 && maxCount >= 2) {
        score = 20 + (dt.city ? 25 : 0) + (attExp - defExp);
        count = maxCount;
      } else continue;
    } else if (dt.city && (dt.city.ownerId === null || allianceOf(state, dt.city.ownerId) !== alliance)) {
      score = dt.city.ownerId === null ? 40 : 50;
      count = Math.min(maxCount, 2);
    } else if (enemyFarmers) {
      score = 25;
      count = 1;
    } else {
      // wander toward the nearest foreign city when nothing else is happening
      const target = nearestForeignCity(state, dt, alliance);
      const here = nearestForeignCity(state, srcTile, alliance);
      if (target !== null && here !== null && target < here) {
        score = 5 + nextFloat(rng) * 3;
        count = Math.min(maxCount, Math.max(1, Math.ceil(spare * 0.75)));
      } else if (nextFloat(rng) < 0.1) {
        score = 1;
        count = 1;
      } else continue;
    }
    if (d.via === 'sea') score += 2; // ships are fun
    if (!best || score > best.score) best = { score, dest: d.tileId, via: d.via, count };
  }
  if (!best) return null;
  const movingSoldiers = soldiers.slice(0, best.count);
  const unitIds = movingSoldiers.map((u) => u.id);
  if (best.via === 'sea') {
    const pool = [...ships];
    for (const s of movingSoldiers) {
      let idx = pool.findIndex((x) => x.ownerId === s.ownerId);
      if (idx < 0) idx = 0;
      unitIds.push(pool.splice(idx, 1)[0].id);
    }
  }
  return { score: best.score, groups: [{ destTileId: best.dest, unitIds }] };
}

function nearestForeignCity(state: GameState, from: Tile, alliance: AllianceId): number | null {
  let best: number | null = null;
  for (const t of Object.values(state.tiles)) {
    if (!t.city) continue;
    if (t.city.ownerId && allianceOf(state, t.city.ownerId) === alliance) continue;
    const d = Math.max(Math.abs(t.q - from.q), Math.abs(t.r - from.r), Math.abs(-t.q - t.r + from.q + from.r));
    if (best === null || d < best) best = d;
  }
  return best;
}

function chooseReaction(state: GameState, pending: Extract<PendingDecision, { kind: 'reaction' }>, rng: RngState): boolean {
  const pid = pending.playerId;
  const p = state.players[pid];
  const holds = p.hand.some((c) => state.cards[c].type === pending.cardType);
  if (!holds) return false;
  if (state.phase === 'military' && p.hand.length <= 1) return false;
  switch (pending.window) {
    case 'rageOfAchilles': {
      const order = pending.orderId ? state.turnData.orders[pending.orderId] : null;
      if (!order) return false;
      const alliance = allianceOf(state, pid);
      // refuse when my units are sent into a fight with bad odds, or out of my own city
      for (const g of order.groups) {
        const mine = g.unitIds.filter((u) => state.units[u]?.ownerId === pid).length;
        if (mine === 0) continue;
        const enemies = soldiersOnTile(state, g.destTileId).filter((u) => allianceOf(state, u.ownerId) !== alliance);
        const attackers = g.unitIds.filter((u) => state.units[u]?.kind === 'soldier').length;
        const bonus = enemies.length ? defenderBonusPerSoldier(state, g.destTileId).perSoldier : 0;
        if (enemies.length > 0 && attackers * 3.5 < enemies.length * (3.5 + bonus)) return true;
        const src = tile(state, order.sourceTileId);
        if (src.city && src.city.ownerId === pid && enemySoldiersNear(state, src, alliance, 2) > 0 && nextFloat(rng) < 0.5) return true;
      }
      return false;
    }
    case 'trojanHorse':
      return true;
    case 'zeus': {
      if (pending.target === 'philosophers') return pending.targetPlayerId !== pid && isPhilosopherTarget(state, pid);
      // trojan: cancel when it hurts my alliance (I defend the city)
      const c = pending.combatId ? state.turnData.combats[pending.combatId] : null;
      if (!c) return false;
      return allianceOf(state, pid) === c.defender.allianceId;
    }
  }
}

function isPhilosopherTarget(state: GameState, pid: PlayerId): boolean {
  // the zeus window for philosophers prompts the target first; if we are asked at all and hold cities, cancel
  return cityCount(state, pid) >= 2;
}

function choosePlay(state: GameState, pid: PlayerId, hand: string[], rng: RngState): string[] {
  const a = allianceOf(state, pid);
  const members = membersOf(state, a);
  const value = (uid: string) => CARD_BY_TYPE[state.cards[uid].type].value;
  const type = (uid: string) => state.cards[uid].type;
  const valueCards = hand.filter((u) => ['citizen', 'clever', 'orator'].includes(type(u))).sort((x, y) => value(y) - value(x));
  const zeus = hand.filter((u) => type(u) === 'zeus');
  const specials = hand.filter((u) => ['rage', 'apple', 'philosophers', 'trojan'].includes(type(u)));
  const play: string[] = [];
  if (members.length === 1) {
    // no contest: play the least useful card
    const cheapest = [...hand].sort((x, y) => value(x) - value(y) + (type(x) === 'rage' ? -0.5 : 0))[0];
    return [cheapest];
  }
  // philosophers is worth a try when a partner has two cities
  const philosophers = hand.find((u) => type(u) === 'philosophers');
  if (philosophers && members.some((m) => m !== pid && cityCount(state, m) >= 2) && nextFloat(rng) < 0.6) play.push(philosophers);
  const rivalHands = members.filter((m) => m !== pid).map((m) => state.players[m].hand.length);
  const target = isGeneral(state, pid) ? 2 + Math.max(...rivalHands) : 3 + Math.max(...rivalHands) * 1.5;
  let sum = 0;
  for (const u of valueCards) {
    if (sum >= target) break;
    play.push(u);
    sum += value(u);
  }
  if (sum < target && zeus.length > 1) {
    play.push(zeus[0]);
    sum += 4;
  }
  if (play.length === 0) {
    const apple = hand.find((u) => type(u) === 'apple');
    if (apple && nextFloat(rng) < 0.5) play.push(apple);
    else if (specials.length > 0) play.push(specials.sort((x, y) => (type(x) === 'rage' ? -1 : 1) - (type(y) === 'rage' ? -1 : 1))[0]);
    else play.push(hand[0]);
  }
  return play;
}

export function isBotTurn(state: GameState): boolean {
  return !!state.pending && state.players[state.pending.playerId].isBot;
}

export { hasSeaEdge, neighbor, mkTileId };
