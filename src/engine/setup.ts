import { createRng, shuffle } from './rng';
import type { AllianceId, AllianceState, CardInstance, GameConfig, GameState, Player, PlayerId } from './types';
import { ALLIANCE_TIEBREAK } from './types';
import { buildTiles } from './map';
import { advance } from './machine';
import { log } from './core';
import { CARD_DEFS } from '../data/cards';
import { FACTION_MAP } from '../data/factions';
import { MAPS } from '../data/quickstartMap';

export const STATE_VERSION = 1;

/**
 * Alliance seat counts (decision 41): floor(N/3) each, the remainder going to
 * Black, then White, then Green.
 */
export function allianceSeatCounts(n: number): Record<AllianceId, number> {
  const base = Math.floor(n / 3);
  const extra = n % 3;
  const out: Record<AllianceId, number> = { white: base, black: base, green: base };
  for (let i = 0; i < extra; i++) out[ALLIANCE_TIEBREAK[i]] += 1;
  return out;
}

export function createGame(config: GameConfig, seed: number): GameState {
  const n = config.seats.length;
  if (n < 3 || n > 9) throw new Error('Akinlandia is played by 3 to 9 leaders');
  const rng = createRng(seed);
  const players: Record<PlayerId, Player> = {};
  const seatOrder: PlayerId[] = [];
  config.seats.forEach((s, i) => {
    const id = `p${i}`;
    seatOrder.push(id);
    players[id] = {
      id,
      seat: i,
      name: s.name || `Player ${i + 1}`,
      leaderName: s.leaderName || `${s.name || `Player ${i + 1}`} the Adequate`,
      isBot: s.isBot,
      allianceId: null,
      factionId: null,
      food: 2,
      raw: 0,
      hand: [],
    };
  });
  const roleOrder = shuffle(rng, [...seatOrder]);

  const cards: Record<string, CardInstance> = {};
  const deck: string[] = [];
  let k = 0;
  for (const def of CARD_DEFS) {
    for (let i = 0; i < def.count; i++) {
      const uid = `c${k++}`;
      cards[uid] = { uid, type: def.type };
      deck.push(uid);
    }
  }
  shuffle(rng, deck);

  const alliances: Record<AllianceId, AllianceState> = {
    white: { id: 'white', generalId: null, factionOrder: [] },
    black: { id: 'black', generalId: null, factionOrder: [] },
    green: { id: 'green', generalId: null, factionOrder: [] },
  };

  const mapId = config.mapId || 'quickstart';
  const map = MAPS[mapId];
  if (!map && config.setupMode === 'quick') throw new Error(`Unknown map ${mapId}`);
  const tiles = config.setupMode === 'quick' ? buildTiles(map.spec, {}) : {};
  // On preset maps starting cities are keyed by faction slot; translate slot ids to faction ids.
  if (config.setupMode === 'quick') {
    for (const t of Object.values(tiles)) {
      if (t.city && t.city.slot) t.city.slot = map.slots[t.city.slot] ?? t.city.slot;
    }
  }

  const state: GameState = {
    version: STATE_VERSION,
    config: { ...config, seats: config.seats.map((s) => ({ ...s })), mapId },
    rng,
    phase: 'setup',
    turn: 0,
    players,
    seatOrder,
    roleOrder,
    alliances,
    allianceOrder: [],
    allianceSeats: allianceSeatCounts(n),
    factions: { ...FACTION_MAP },
    tiles,
    units: {},
    nextUnitId: 1,
    nextOrderId: 1,
    nextCombatId: 1,
    cards,
    deck,
    discard: [],
    turnData: { allocations: {}, toDeploy: {}, subPhase: null, orders: {}, combats: {}, politics: null, lastReveal: null },
    endTotal: 0,
    tasks: [{ kind: 'roleSelection', order: roleOrder, idx: 0 }],
    pending: null,
    log: [],
    actionLog: [],
    fullSetup: null,
    result: null,
    lastActingPlayerId: null,
  };
  log(state, 'setup', `Akinlandia begins (seed ${seed >>> 0}). Role selection order: ${roleOrder.map((p) => players[p].leaderName).join(', ')}.`, { seed });
  advance(state);
  return state;
}
