/**
 * Pure room state machine: lobby, seat claims, starting the game, applying
 * actions, delegating seats to bots. No Cloudflare APIs here so it can be
 * unit-tested; the Durable Object in room.ts owns persistence and sockets.
 */
import type { Action, GameConfig, GameState, SetupMode } from '../src/engine/types';
import { RulesError } from '../src/engine/types';
import { createGame } from '../src/engine/setup';
import { applyActionInPlace, isGameOver } from '../src/engine/machine';
import { hashSeed } from '../src/engine/rng';
import { viewForPlayer } from '../src/engine/view';
import type { ClientView } from '../src/engine/view';
import { runBots } from '../src/bots/runner';
import { MAX_SEATS, MIN_SEATS } from './protocol';
import type { ClientMessage, LobbyInfo, LobbySeat, ServerMessage } from './protocol';

export interface SeatRecord {
  name: string;
  leaderName: string;
  isBot: boolean;
  token: string | null;
}

export interface RoomRecord {
  code: string;
  hostToken: string | null;
  status: 'lobby' | 'playing';
  seats: SeatRecord[];
  setupMode: SetupMode;
  alwaysPromptReactions: boolean;
  seedText: string;
  config: GameConfig | null;
  seed: number | null;
  createdAt: number;
}

export type LogRow = { type: 'action'; action: Action } | { type: 'delegate'; playerId: string; bot: boolean };

const DEFAULT_NAMES = ['Sinclair', 'Akin', 'Hobbes', 'Herodotus', 'Clemenceau', 'Pericles', 'Xerxes', 'Leonidas', 'Solon'];
const EPITHETS = ['the Great', 'the Adequate', 'the Unready', 'the Magnificent', 'the Verbose', 'the Bald', 'the Younger', 'the Pious', 'the Tardy'];

export function defaultSeats(n: number): SeatRecord[] {
  return Array.from({ length: n }, (_, i) => ({ name: DEFAULT_NAMES[i], leaderName: `${DEFAULT_NAMES[i]} ${EPITHETS[i]}`, isBot: true, token: null }));
}

export function newRoomRecord(code: string, now = Date.now()): RoomRecord {
  return { code, hostToken: null, status: 'lobby', seats: defaultSeats(5), setupMode: 'quick', alwaysPromptReactions: false, seedText: '', config: null, seed: null, createdAt: now };
}

export interface HandleResult {
  /** rows to append to the persistent log */
  rows: LogRow[];
  /** whether the room record changed and must be saved */
  recordChanged: boolean;
  /** a reply for the sender only (errors) */
  reply?: ServerMessage;
}

export class Room {
  state: GameState | null = null;

  constructor(
    public record: RoomRecord,
    rows: LogRow[] = [],
    private randomSeed: () => number = () => (Math.random() * 0xffffffff) >>> 0,
  ) {
    if (record.status === 'playing' && record.config && record.seed !== null) {
      this.state = createGame(record.config, record.seed);
      for (const row of rows) this.applyRow(row);
    }
  }

  private applyRow(row: LogRow): void {
    if (!this.state) return;
    if (row.type === 'action') applyActionInPlace(this.state, row.action);
    else this.state.players[row.playerId].isBot = row.bot;
  }

  seatOf(token: string | null): number {
    if (!token) return -1;
    return this.record.seats.findIndex((s) => s.token === token);
  }

  playerIdFor(token: string | null): string | null {
    const seat = this.seatOf(token);
    return seat >= 0 ? `p${seat}` : null;
  }

  /** First person to connect hosts the table. */
  touch(token: string): boolean {
    if (!this.record.hostToken) {
      this.record.hostToken = token;
      return true;
    }
    return false;
  }

  lobbyFor(token: string | null, playersOnline = 0): LobbyInfo {
    const seats: LobbySeat[] = this.record.seats.map((s) => ({ name: s.name, leaderName: s.leaderName, isBot: s.isBot, taken: !!s.token, isYou: !!token && s.token === token }));
    const mySeat = this.seatOf(token);
    return {
      code: this.record.code,
      status: this.record.status,
      seats,
      setupMode: this.record.setupMode,
      alwaysPromptReactions: this.record.alwaysPromptReactions,
      hostIsYou: !!token && this.record.hostToken === token,
      mySeat: mySeat >= 0 ? mySeat : null,
      playersOnline,
    };
  }

  viewFor(token: string | null): ClientView | null {
    if (!this.state) return null;
    return viewForPlayer(this.state, this.playerIdFor(token));
  }

  handle(token: string, msg: ClientMessage): HandleResult {
    try {
      switch (msg.type) {
        case 'claim':
          return this.claim(token, msg.seat, msg.name, msg.leaderName);
        case 'release':
          return this.release(token);
        case 'configure':
          return this.configure(token, msg);
        case 'start':
          return this.start(token);
        case 'action':
          return this.action(token, msg.action);
        case 'delegate':
          return this.delegate(token, msg.playerId, msg.bot);
        case 'ping':
          return { rows: [], recordChanged: false, reply: { type: 'pong' } };
      }
    } catch (e) {
      const message = e instanceof RulesError ? e.message : `Something went wrong: ${(e as Error).message}`;
      return { rows: [], recordChanged: false, reply: { type: 'error', message } };
    }
  }

  private fail(message: string): HandleResult {
    return { rows: [], recordChanged: false, reply: { type: 'error', message } };
  }

  private claim(token: string, seat: number, name: string, leaderName: string): HandleResult {
    if (this.record.status !== 'lobby') return this.fail('The game has already begun; seats can no longer be claimed.');
    const s = this.record.seats[seat];
    if (!s) return this.fail('No such seat.');
    if (s.token && s.token !== token) return this.fail('That seat is taken.');
    const prev = this.seatOf(token);
    if (prev >= 0 && prev !== seat) {
      this.record.seats[prev].token = null;
      this.record.seats[prev].isBot = true;
    }
    s.token = token;
    s.isBot = false;
    s.name = name.trim().slice(0, 30) || s.name;
    s.leaderName = leaderName.trim().slice(0, 60) || `${s.name} the Adequate`;
    return { rows: [], recordChanged: true };
  }

  private release(token: string): HandleResult {
    if (this.record.status !== 'lobby') return this.fail('The game has already begun.');
    const seat = this.seatOf(token);
    if (seat < 0) return { rows: [], recordChanged: false };
    this.record.seats[seat].token = null;
    this.record.seats[seat].isBot = true;
    return { rows: [], recordChanged: true };
  }

  private configure(token: string, msg: Extract<ClientMessage, { type: 'configure' }>): HandleResult {
    if (this.record.hostToken !== token) return this.fail('Only the host may change the table.');
    if (this.record.status !== 'lobby') return this.fail('The game has already begun.');
    if (msg.seats.length < MIN_SEATS || msg.seats.length > MAX_SEATS) return this.fail(`Akinlandia is played by ${MIN_SEATS} to ${MAX_SEATS} leaders.`);
    const seats: SeatRecord[] = msg.seats.map((s, i) => {
      const old = this.record.seats[i];
      const tokenKept = old?.token ?? null;
      return {
        name: (s.name || DEFAULT_NAMES[i]).trim().slice(0, 30),
        leaderName: (s.leaderName || `${s.name || DEFAULT_NAMES[i]} ${EPITHETS[i]}`).trim().slice(0, 60),
        isBot: tokenKept ? false : !!s.isBot,
        token: tokenKept,
      };
    });
    this.record.seats = seats;
    this.record.setupMode = msg.setupMode === 'full' ? 'full' : 'quick';
    this.record.alwaysPromptReactions = !!msg.alwaysPromptReactions;
    this.record.seedText = (msg.seed ?? '').slice(0, 64);
    return { rows: [], recordChanged: true };
  }

  private start(token: string): HandleResult {
    if (this.record.hostToken !== token) return this.fail('Only the host may begin the game.');
    if (this.record.status !== 'lobby') return this.fail('The game has already begun.');
    const humans = this.record.seats.filter((s) => s.token).length;
    if (humans === 0) return this.fail('Claim a seat before beginning.');
    const seedText = this.record.seedText.trim();
    const seed = seedText === '' ? this.randomSeed() : /^\d+$/.test(seedText) ? Number(seedText) >>> 0 : hashSeed(seedText);
    const config: GameConfig = {
      seats: this.record.seats.map((s) => ({ name: s.name, leaderName: s.leaderName, isBot: s.isBot || !s.token })),
      setupMode: this.record.setupMode,
      alwaysPromptReactions: this.record.alwaysPromptReactions,
      mapId: 'quickstart',
    };
    this.record.config = config;
    this.record.seed = seed;
    this.record.status = 'playing';
    this.state = createGame(config, seed);
    const rows = this.runBotsCollecting();
    return { rows, recordChanged: true };
  }

  private runBotsCollecting(): LogRow[] {
    const rows: LogRow[] = [];
    if (!this.state) return rows;
    runBots(this.state, { onAction: (_s, action) => rows.push({ type: 'action', action }) });
    return rows;
  }

  private action(token: string, action: Action): HandleResult {
    if (!this.state) return this.fail('The game has not begun.');
    const pid = this.playerIdFor(token);
    if (!pid) return this.fail('You are a spectator at this table.');
    if (action.playerId !== pid) return this.fail('That is not your decision to make.');
    if (isGameOver(this.state)) return this.fail('The game is over.');
    applyActionInPlace(this.state, action); // throws RulesError when illegal
    const rows: LogRow[] = [{ type: 'action', action }, ...this.runBotsCollecting()];
    return { rows, recordChanged: false };
  }

  private delegate(token: string, playerId: string, bot: boolean): HandleResult {
    if (!this.state) return this.fail('The game has not begun.');
    const mine = this.playerIdFor(token);
    if (mine !== playerId && this.record.hostToken !== token) return this.fail('You may only hand your own seat to a bot.');
    if (!this.state.players[playerId]) return this.fail('No such leader.');
    if (this.state.players[playerId].isBot === bot) return { rows: [], recordChanged: false };
    this.state.players[playerId].isBot = bot;
    const rows: LogRow[] = [{ type: 'delegate', playerId, bot }];
    if (bot) rows.push(...this.runBotsCollecting());
    return { rows, recordChanged: false };
  }
}
