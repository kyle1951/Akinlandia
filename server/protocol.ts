/**
 * Messages exchanged between the browser and a game room over WebSocket.
 * Shared by the server (Durable Object) and the client (remote controller).
 */
import type { Action, SetupMode } from '../src/engine/types';
import type { ClientView } from '../src/engine/view';

export interface LobbySeat {
  name: string;
  leaderName: string;
  isBot: boolean;
  taken: boolean;
  isYou: boolean;
}

export interface LobbyInfo {
  code: string;
  status: 'lobby' | 'playing';
  seats: LobbySeat[];
  setupMode: SetupMode;
  mapId: string;
  alwaysPromptReactions: boolean;
  foodCapPerCity: number;
  handLimit: number;
  hostIsYou: boolean;
  mySeat: number | null;
  playersOnline: number;
}

export type ClientMessage =
  | { type: 'claim'; seat: number; name: string; leaderName: string }
  | { type: 'release' }
  | { type: 'configure'; seats: { name: string; leaderName: string; isBot: boolean }[]; setupMode: SetupMode; alwaysPromptReactions: boolean; seed?: string; mapId?: string; foodCapPerCity?: number; handLimit?: number }
  | { type: 'start' }
  | { type: 'action'; action: Action }
  | { type: 'delegate'; playerId: string; bot: boolean }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'lobby'; lobby: LobbyInfo }
  | { type: 'state'; view: ClientView; lobby: LobbyInfo }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_SEATS = 9;
export const MIN_SEATS = 3;
