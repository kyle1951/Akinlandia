import type { RngState } from './rng';
import type { TileId } from './hex';

export type { TileId };

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type AllianceId = 'white' | 'black' | 'green';
export const ALLIANCE_IDS: readonly AllianceId[] = ['white', 'black', 'green'];
/** Tiebreak priority for alliance order: Black, then White, then Green. */
export const ALLIANCE_TIEBREAK: readonly AllianceId[] = ['black', 'white', 'green'];

export type PlayerId = string; // "p0", "p1", ...
export type UnitId = string;
export type CardUid = string;

export interface FactionDef {
  id: string; // e.g. "white-purple"
  allianceId: AllianceId;
  name: string; // "Purple", "Crimson"...
  color: string; // hex colour
  royal: boolean;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export type EdgeType = 'sea' | 'land';
export interface Edge {
  type: EdgeType;
  mountain?: boolean;
}

export type Resource = 'wheat' | 'wood' | 'stone' | 'iron' | 'fish';
export const RAW_MATERIALS: readonly Resource[] = ['wood', 'stone', 'iron'];

export type CityLevel = 1 | 2 | 3;

export interface City {
  name: string;
  /** starting faction slot on preset maps (e.g. "white-purple"), or null */
  slot: string | null;
  level: CityLevel;
  ownerId: PlayerId | null;
  walls: boolean;
  temple: boolean;
  university: boolean;
}

export interface Tile {
  id: TileId;
  q: number;
  r: number;
  edges: Edge[]; // exactly 6, index = direction
  city: City | null;
  resources: Resource[];
}

export type TileType = 'sea' | 'land' | 'coastal';

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export type UnitKind = 'soldier' | 'ship' | 'farmer';

export interface Unit {
  id: UnitId;
  kind: UnitKind;
  ownerId: PlayerId;
  tileId: TileId;
  moved: boolean; // has moved this sub-phase
  spent: boolean; // retreated this sub-phase; no combat value
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type CardType =
  | 'rage' // Rage of Achilles
  | 'apple' // Apple of Discord
  | 'philosophers' // Attacked by Philosophers
  | 'trojan' // Trojan Horse
  | 'citizen'
  | 'clever'
  | 'orator'
  | 'zeus'; // Lightning Bolt of Zeus

export interface CardDef {
  type: CardType;
  name: string;
  value: number;
  count: number;
  text: string;
}

export interface CardInstance {
  uid: CardUid;
  type: CardType;
}

// ---------------------------------------------------------------------------
// Players and alliances
// ---------------------------------------------------------------------------

export interface Player {
  id: PlayerId;
  seat: number;
  name: string;
  leaderName: string;
  isBot: boolean;
  allianceId: AllianceId | null; // null until role chosen
  factionId: string | null;
  food: number;
  raw: number;
  hand: CardUid[];
}

export interface AllianceState {
  id: AllianceId;
  generalId: PlayerId | null;
  /** In-alliance order for the current turn, set by the General after allocation. */
  factionOrder: PlayerId[];
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export interface Allocation {
  farmers: number;
  soldiers: number;
  politicians: number;
  ships: number;
  levelUps: number;
  temples: number;
  universities: number;
  walls: number;
}

export type BuildingKind = 'levelUp' | 'temple' | 'university' | 'walls';

export interface BuildingPlacement {
  kind: BuildingKind;
  tileId: TileId;
}

// ---------------------------------------------------------------------------
// Movement and combat records
// ---------------------------------------------------------------------------

export type SubPhase = 'ships1' | 'ships2' | 'full1' | 'full2';
export const SUB_PHASES: readonly SubPhase[] = ['ships1', 'ships2', 'full1', 'full2'];

export interface MoveGroup {
  destTileId: TileId;
  unitIds: UnitId[];
}

export interface OrderRecord {
  id: string;
  generalId: PlayerId;
  allianceId: AllianceId;
  sourceTileId: TileId;
  subPhase: SubPhase;
  groups: MoveGroup[];
  /** Units whose owners played Rage of Achilles; they stay put. */
  refusedUnitIds: UnitId[];
}

export interface UnitSnapshot {
  id: UnitId;
  kind: UnitKind;
  ownerId: PlayerId;
  spent: boolean;
}

export interface CombatSide {
  allianceId: AllianceId;
  generalId: PlayerId;
  /** soldiers taking part (ids) */
  soldierIds: UnitId[];
  shipIds: UnitId[];
  dice: number[];
  diceTotal: number;
  bonus: number;
  score: number;
  hitsTaken: number;
  casualties: UnitSnapshot[];
}

export interface CombatRecord {
  id: string;
  orderId: string;
  subPhase: SubPhase;
  tileId: TileId;
  originTileId: TileId;
  attacker: CombatSide;
  defender: CombatSide;
  /** true when the defenders were all spent and were destroyed without a fight */
  spentOnly: boolean;
  winner: 'attacker' | 'defender' | null;
  cityOwnerBefore: PlayerId | null;
  resolved: boolean;
  trojanPlayed: boolean;
}

// ---------------------------------------------------------------------------
// Pending decisions (what the engine is waiting for)
// ---------------------------------------------------------------------------

export interface RoleOption {
  allianceId: AllianceId;
  factionId: string;
}

export interface FarmerLegalTile {
  tileId: TileId;
  via: 'land' | 'sea';
}

export type PendingDecision =
  | { kind: 'chooseRole'; playerId: PlayerId; options: RoleOption[] }
  | {
      kind: 'placeTile';
      playerId: PlayerId;
      tileSpecId: string;
      hasCity: boolean;
      canClaim: boolean;
      placements: { tileId: TileId; rotation: number; touching: number }[];
      supplyRemaining: number;
    }
  | {
      kind: 'allocate';
      playerId: PlayerId;
      capacity: number;
      food: number;
      raw: number;
      cityTileIds: TileId[];
    }
  | { kind: 'setFactionOrder'; playerId: PlayerId; allianceId: AllianceId; members: PlayerId[] }
  | {
      kind: 'placeFarmers';
      playerId: PlayerId;
      remaining: number;
      count: number; // how many must be placed in this decision
      legalTiles: FarmerLegalTile[];
    }
  | {
      kind: 'placeBuildings';
      playerId: PlayerId;
      purchases: { levelUps: number; temples: number; universities: number; walls: number };
      cityTileIds: TileId[];
    }
  | { kind: 'placeShips'; playerId: PlayerId; count: number; legalTiles: TileId[] }
  | { kind: 'placeSoldiers'; playerId: PlayerId; count: number; legalTiles: TileId[] }
  | {
      kind: 'issueOrder';
      playerId: PlayerId;
      allianceId: AllianceId;
      subPhase: SubPhase;
      /** tiles holding at least one unit of the alliance that may still move */
      sourceTileIds: TileId[];
      /** unmanned ships of the alliance the General may scuttle */
      scuttleableShipIds: UnitId[];
    }
  | {
      kind: 'reaction';
      playerId: PlayerId;
      window: 'rageOfAchilles' | 'trojanHorse' | 'zeus';
      cardType: CardType;
      /** whether the player actually holds the card (false only when "always prompt" is on) */
      holdsCard: boolean;
      orderId?: string;
      combatId?: string;
      /** units of this player affected (rage window) */
      unitIds?: UnitId[];
      /** for zeus: what is being cancelled */
      target?: 'philosophers' | 'trojan';
      targetPlayerId?: PlayerId;
      description: string;
    }
  | {
      kind: 'assignCasualties';
      playerId: PlayerId;
      combatId: string;
      side: 'attacker' | 'defender';
      hits: number;
      candidates: UnitId[];
    }
  | {
      kind: 'retreat';
      playerId: PlayerId;
      combatId: string | null;
      tileId: TileId;
      units: { unitId: UnitId; destinations: { tileId: TileId; byShip: boolean }[] }[];
      shipsAvailable: number;
    }
  | {
      kind: 'assignOwnership';
      playerId: PlayerId;
      tileId: TileId;
      candidates: PlayerId[];
      reason: 'conquest' | 'neutral' | 'trojan';
    }
  | { kind: 'reflagShips'; playerId: PlayerId; tileId: TileId; unitIds: UnitId[]; candidates: PlayerId[] }
  | { kind: 'disband'; playerId: PlayerId; shortfall: number; candidates: UnitId[] }
  | { kind: 'playCards'; playerId: PlayerId; hand: CardUid[]; round: number }
  | { kind: 'invokeApple'; playerId: PlayerId }
  | {
      kind: 'philosophersTarget';
      playerId: PlayerId;
      targets: { partnerId: PlayerId; cityTileIds: TileId[] }[];
    }
  | {
      kind: 'singOffVote';
      playerId: PlayerId;
      tiedPlayerIds: PlayerId[];
    };

export type DecisionKind = PendingDecision['kind'];

// ---------------------------------------------------------------------------
// Actions (what players submit)
// ---------------------------------------------------------------------------

export type Action =
  | { kind: 'chooseRole'; playerId: PlayerId; allianceId: AllianceId; factionId: string }
  | { kind: 'placeTile'; playerId: PlayerId; tileId: TileId; rotation: number; claim: boolean }
  | { kind: 'allocate'; playerId: PlayerId; allocation: Allocation }
  | { kind: 'setFactionOrder'; playerId: PlayerId; order: PlayerId[] }
  | { kind: 'placeFarmers'; playerId: PlayerId; tileIds: TileId[] }
  | { kind: 'placeBuildings'; playerId: PlayerId; placements: BuildingPlacement[] }
  | { kind: 'placeShips'; playerId: PlayerId; counts: Record<TileId, number> }
  | { kind: 'placeSoldiers'; playerId: PlayerId; counts: Record<TileId, number> }
  | { kind: 'order'; playerId: PlayerId; sourceTileId: TileId; groups: MoveGroup[] }
  | { kind: 'scuttle'; playerId: PlayerId; unitIds: UnitId[] }
  | { kind: 'pass'; playerId: PlayerId }
  | { kind: 'react'; playerId: PlayerId; play: boolean }
  | { kind: 'assignCasualties'; playerId: PlayerId; unitIds: UnitId[] }
  | { kind: 'retreat'; playerId: PlayerId; moves: { unitId: UnitId; tileId: TileId }[] }
  | { kind: 'assignOwnership'; playerId: PlayerId; ownerId: PlayerId }
  | { kind: 'reflagShips'; playerId: PlayerId; ownerId: PlayerId }
  | { kind: 'disband'; playerId: PlayerId; unitId: UnitId }
  | { kind: 'playCards'; playerId: PlayerId; cardUids: CardUid[] }
  | { kind: 'invokeApple'; playerId: PlayerId; invoke: boolean }
  | { kind: 'philosophersTarget'; playerId: PlayerId; partnerId: PlayerId; cityTileId: TileId }
  | { kind: 'singOffVote'; playerId: PlayerId; votedFor: PlayerId };

export type ActionKind = Action['kind'];

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

export type LogCategory =
  | 'setup'
  | 'turn'
  | 'allocation'
  | 'deploy'
  | 'order'
  | 'combat'
  | 'card'
  | 'reconcile'
  | 'politics'
  | 'election'
  | 'endgame'
  | 'system';

export interface LogEntry {
  seq: number;
  turn: number;
  category: LogCategory;
  text: string;
  /** structured payload for the UI (dice, banners) */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Task queue (internal continuation records; serialisable)
// ---------------------------------------------------------------------------

export type DeployType = 'farmers' | 'buildings' | 'ships' | 'soldiers';

export type Task =
  | { kind: 'roleSelection'; order: PlayerId[]; idx: number }
  | { kind: 'fullGameSetup'; order: PlayerId[]; idx: number; passesWithoutPlacement: number }
  | { kind: 'startTurn' }
  | { kind: 'collectAllocations'; remaining: PlayerId[] }
  | { kind: 'setFactionOrders'; remaining: AllianceId[] }
  | { kind: 'deploy'; type: DeployType; order: PlayerId[]; idx: number; roundsWithoutWork: number }
  | { kind: 'drawPoliticians' }
  | { kind: 'militaryStart' }
  | { kind: 'military'; subIdx: number; allianceIdx: number; started: boolean }
  | { kind: 'rageWindow'; orderId: string; remaining: PlayerId[] }
  | { kind: 'executeOrder'; orderId: string }
  | { kind: 'combat'; combatId: string }
  | { kind: 'casualties'; combatId: string; side: 'attacker' | 'defender' }
  | { kind: 'combatOutcome'; combatId: string }
  | { kind: 'retreatUnits'; tileId: TileId; allianceId: AllianceId; generalId: PlayerId; unitIds: UnitId[]; combatId: string | null }
  | { kind: 'attackerTakesTile'; combatId: string }
  | { kind: 'trojanWindow'; combatId: string; remaining: PlayerId[] }
  | { kind: 'zeusWindow'; target: 'philosophers' | 'trojan'; cardPlayerId: PlayerId; remaining: PlayerId[]; cancelled: boolean; effect: Task }
  | { kind: 'applyTrojan'; combatId: string; cardPlayerId: PlayerId }
  | { kind: 'trojanEnter'; combatId: string }
  | { kind: 'trojanAssign'; combatId: string; cardPlayerId: PlayerId }
  | { kind: 'enterTile'; tileId: TileId; allianceId: AllianceId; generalId: PlayerId; unitIds: UnitId[]; fromTileId: TileId }
  | { kind: 'assignOwnership'; tileId: TileId; generalId: PlayerId; reason: 'conquest' | 'neutral' | 'trojan' }
  | { kind: 'captureShips'; tileId: TileId; generalId: PlayerId; unitIds: UnitId[] }
  | { kind: 'afterOrder'; orderId: string }
  | { kind: 'reconcile' }
  | { kind: 'feeding'; order: PlayerId[]; idx: number }
  | { kind: 'politicsPlay'; remaining: PlayerId[]; round: number }
  | { kind: 'politicsReveal'; round: number }
  | { kind: 'appleWindow'; remaining: PlayerId[]; round: number }
  | { kind: 'philosophers'; remaining: PlayerId[] }
  | { kind: 'philosophersRoll'; cardPlayerId: PlayerId; partnerId: PlayerId; cityTileId: TileId }
  | { kind: 'elect' }
  | { kind: 'endTurn' }
  | { kind: 'gameOver' }
  | { kind: 'singOff'; tiedPlayerIds: PlayerId[]; voters: PlayerId[]; idx: number; votes: Record<PlayerId, PlayerId> };

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type SetupMode = 'quick' | 'full';
export type Phase = 'setup' | 'allocation' | 'deployment' | 'military' | 'reconciliation' | 'politics' | 'gameOver';

export interface GameConfig {
  seats: { name: string; leaderName: string; isBot: boolean }[];
  setupMode: SetupMode;
  alwaysPromptReactions: boolean;
  mapId: string;
  /** safety cap for simulations; 0 = none */
  maxTurns?: number;
}

export interface PoliticsRound {
  round: number;
  /** PLAY cards per player (revealed together) */
  played: Record<PlayerId, CardUid[]>;
  revealed: boolean;
  scores: Record<PlayerId, number>;
  appleInvokedBy: PlayerId | null;
}

export interface ScoreLine {
  playerId: PlayerId;
  cityPoints: number;
  generalBonus: number;
  total: number;
  cardValue: number;
  isGeneral: boolean;
}

export interface FinalResult {
  ranking: PlayerId[]; // best first, after all tiebreakers
  scores: ScoreLine[];
  winnerId: PlayerId;
  loserId: PlayerId;
  singOff: { tiedPlayerIds: PlayerId[]; votes: Record<PlayerId, PlayerId>; winnerId: PlayerId; random: boolean } | null;
  tiebreakNote: string;
}

export interface FullGameSetupState {
  radius: number;
  supplies: Record<PlayerId, string[]>; // tile spec ids remaining per player
  claimed: Record<PlayerId, number>;
  currentTileSpecId: string | null;
  discarded: string[];
  lastPlaced: Record<PlayerId, TileId | null>;
}

export interface GameState {
  version: number;
  config: GameConfig;
  rng: RngState;
  phase: Phase;
  turn: number;
  players: Record<PlayerId, Player>;
  seatOrder: PlayerId[];
  roleOrder: PlayerId[];
  alliances: Record<AllianceId, AllianceState>;
  allianceOrder: AllianceId[];
  allianceSeats: Record<AllianceId, number>;
  factions: Record<string, FactionDef>;
  tiles: Record<TileId, Tile>;
  units: Record<UnitId, Unit>;
  nextUnitId: number;
  nextOrderId: number;
  nextCombatId: number;
  cards: Record<CardUid, CardInstance>;
  deck: CardUid[];
  discard: CardUid[];
  /** current turn's data */
  turnData: {
    allocations: Record<PlayerId, Allocation>;
    /** remaining items to deploy */
    toDeploy: Record<PlayerId, { farmers: number; ships: number; soldiers: number; buildings: { levelUps: number; temples: number; universities: number; walls: number }; politicians: number }>;
    subPhase: SubPhase | null;
    orders: Record<string, OrderRecord>;
    combats: Record<string, CombatRecord>;
    /** pending combats per order */
    politics: PoliticsRound | null;
    lastReveal: PoliticsRound | null;
  };
  endTotal: number;
  tasks: Task[];
  pending: PendingDecision | null;
  log: LogEntry[];
  actionLog: Action[];
  fullSetup: FullGameSetupState | null;
  result: FinalResult | null;
  /** player who currently "holds the device" for privacy screens */
  lastActingPlayerId: PlayerId | null;
}

export class RulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RulesError';
  }
}
