/**
 * One Durable Object per game room. Owns persistence (SQLite: the room
 * record plus an append-only log of actions) and the WebSocket connections.
 * All game logic lives in roomLogic.ts; the engine runs here on the server.
 */
import { DurableObject } from 'cloudflare:workers';
import { Room, newRoomRecord } from './roomLogic';
import type { LogRow, RoomRecord } from './roomLogic';
import type { ClientMessage, ServerMessage } from './protocol';

export interface Env {
  ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
}

interface Attachment {
  token: string;
}

export class GameRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private rowCount = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS log (idx INTEGER PRIMARY KEY, json TEXT NOT NULL)`);
      const rec = this.ctx.storage.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = 'record'`).toArray()[0];
      if (rec) {
        const record = JSON.parse(rec.value) as RoomRecord;
        const rows = this.ctx.storage.sql
          .exec<{ json: string }>(`SELECT json FROM log ORDER BY idx`)
          .toArray()
          .map((r) => JSON.parse(r.json) as LogRow);
        this.rowCount = rows.length;
        this.room = new Room(record, rows, () => randomSeed());
      }
    });
  }

  private saveRecord(): void {
    if (!this.room) return;
    this.ctx.storage.sql.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('record', ?)`, JSON.stringify(this.room.record));
  }

  private appendRows(rows: LogRow[]): void {
    for (const row of rows) {
      this.ctx.storage.sql.exec(`INSERT INTO log (idx, json) VALUES (?, ?)`, this.rowCount++, JSON.stringify(row));
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/init') && request.method === 'POST') {
      if (!this.room) {
        const code = url.searchParams.get('code') ?? this.ctx.id.name ?? 'ROOM';
        this.room = new Room(newRoomRecord(code), [], () => randomSeed());
        this.saveRecord();
      }
      return Response.json({ code: this.room.record.code, status: this.room.record.status });
    }
    if (!this.room) return new Response('No such table. Check the room code.', { status: 404 });
    if (url.pathname.endsWith('/info')) {
      return Response.json(this.room.lobbyFor(null, this.onlineCount()));
    }
    if (url.pathname.endsWith('/ws')) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const token = url.searchParams.get('token');
      if (!token || token.length < 8 || token.length > 64) return new Response('Missing player token', { status: 400 });
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const becameHost = this.room.touch(token);
      if (becameHost) this.saveRecord();
      this.ctx.acceptWebSocket(server, [token]);
      server.serializeAttachment({ token } satisfies Attachment);
      this.sendTo(server, token);
      if (becameHost) this.broadcast();
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Not found', { status: 404 });
  }

  private onlineCount(): number {
    const tokens = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.token && this.room && this.room.seatOf(a.token) >= 0) tokens.add(a.token);
    }
    return tokens.size;
  }

  private messageFor(token: string): ServerMessage {
    const room = this.room!;
    const lobby = room.lobbyFor(token, this.onlineCount());
    const view = room.viewFor(token);
    return view ? { type: 'state', view, lobby } : { type: 'lobby', lobby };
  }

  private sendTo(ws: WebSocket, token: string): void {
    try {
      ws.send(JSON.stringify(this.messageFor(token)));
    } catch {
      // socket already gone
    }
  }

  private broadcast(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.token) this.sendTo(ws, a.token);
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.room || typeof message !== 'string') return;
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a?.token) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Malformed message' } satisfies ServerMessage));
      return;
    }
    const result = this.room.handle(a.token, msg);
    if (result.rows.length) this.appendRows(result.rows);
    if (result.recordChanged) this.saveRecord();
    if (result.reply) {
      ws.send(JSON.stringify(result.reply));
      if (result.reply.type === 'error') return;
    }
    if (result.rows.length || result.recordChanged) this.broadcast();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // ignore
    }
    this.broadcast();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}
