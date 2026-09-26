import { describe, expect, it } from 'vitest';
import { Room, newRoomRecord } from '../server/roomLogic';
import type { LogRow } from '../server/roomLogic';
import { botAction } from '../src/bots/heuristic';

const HOST = 'host-token-12345';
const GUEST = 'guest-token-1234';

function table() {
  const room = new Room(newRoomRecord('ABC234'), [], () => 77);
  expect(room.touch(HOST)).toBe(true);
  expect(room.touch(GUEST)).toBe(false);
  return room;
}

describe('online room', () => {
  it('runs a lobby: host configures seats, players claim them, only the host may start', () => {
    const room = table();
    expect(room.lobbyFor(HOST).hostIsYou).toBe(true);
    expect(room.lobbyFor(GUEST).hostIsYou).toBe(false);
    const cfg = room.handle(GUEST, { type: 'configure', seats: [], setupMode: 'quick', alwaysPromptReactions: false });
    expect(cfg.reply).toMatchObject({ type: 'error' });
    const ok = room.handle(HOST, {
      type: 'configure',
      seats: [
        { name: 'Kyle', leaderName: 'Kyle the Philosopher King', isBot: false },
        { name: 'Bot A', leaderName: 'Bot A the Adequate', isBot: true },
        { name: 'Bot B', leaderName: 'Bot B the Tardy', isBot: true },
      ],
      setupMode: 'quick',
      alwaysPromptReactions: false,
    });
    expect(ok.recordChanged).toBe(true);
    expect(room.handle(HOST, { type: 'start' }).reply).toMatchObject({ type: 'error', message: /Claim a seat/ });
    expect(room.handle(HOST, { type: 'claim', seat: 0, name: 'Kyle', leaderName: 'Kyle the Philosopher King' }).recordChanged).toBe(true);
    expect(room.handle(GUEST, { type: 'claim', seat: 0, name: 'X', leaderName: 'X' }).reply).toMatchObject({ type: 'error', message: /taken/ });
    expect(room.handle(GUEST, { type: 'claim', seat: 1, name: 'Friend', leaderName: 'Friend the Bald' }).recordChanged).toBe(true);
    const lobby = room.lobbyFor(GUEST);
    expect(lobby.mySeat).toBe(1);
    expect(lobby.seats[0]).toMatchObject({ taken: true, isYou: false, isBot: false });
    expect(lobby.seats[2]).toMatchObject({ taken: false, isBot: true });
    expect(room.handle(GUEST, { type: 'start' }).reply).toMatchObject({ type: 'error' });
    const started = room.handle(HOST, { type: 'start' });
    expect(started.recordChanged).toBe(true);
    expect(room.record.status).toBe('playing');
    expect(room.record.seed).toBe(77);
    expect(room.state).not.toBeNull();
    expect(room.playerIdFor(HOST)).toBe('p0');
    expect(room.playerIdFor(GUEST)).toBe('p1');
    // the bot in seat 2 has already been played up to a human decision
    expect(started.rows.every((r) => r.type === 'action')).toBe(true);
    expect(room.state!.pending && !room.state!.players[room.state!.pending.playerId].isBot).toBe(true);
  });

  it('applies actions only from the right player, rejects illegal ones, and persists a replayable log', () => {
    const room = table();
    room.handle(HOST, {
      type: 'configure',
      seats: [
        { name: 'A', leaderName: 'A', isBot: false },
        { name: 'B', leaderName: 'B', isBot: true },
        { name: 'C', leaderName: 'C', isBot: true },
      ],
      setupMode: 'quick',
      alwaysPromptReactions: false,
    });
    room.handle(HOST, { type: 'claim', seat: 0, name: 'A', leaderName: 'A the Great' });
    const rows: LogRow[] = [...room.handle(HOST, { type: 'start' }).rows];
    const wrong = room.handle(GUEST, { type: 'action', action: { kind: 'pass', playerId: 'p0' } });
    expect(wrong.reply).toMatchObject({ type: 'error', message: /spectator/ });
    for (let i = 0; i < 12 && room.state!.pending; i++) {
      const pending = room.state!.pending;
      expect(pending.playerId).toBe('p0');
      if (pending.kind !== 'issueOrder') {
        const bad = room.handle(HOST, { type: 'action', action: { kind: 'pass', playerId: 'p0' } });
        expect(bad.reply).toMatchObject({ type: 'error' });
      }
      const action = botAction(room.state!, pending);
      const res = room.handle(HOST, { type: 'action', action });
      expect(res.reply).toBeUndefined();
      rows.push(...res.rows);
    }
    // hand the seat to a bot and back
    const del = room.handle(HOST, { type: 'delegate', playerId: 'p0', bot: true });
    expect(del.rows[0]).toEqual({ type: 'delegate', playerId: 'p0', bot: true });
    rows.push(...del.rows);
    expect(room.state!.players.p0.isBot).toBe(true);
    const back = room.handle(HOST, { type: 'delegate', playerId: 'p0', bot: false });
    rows.push(...back.rows);
    expect(room.state!.players.p0.isBot).toBe(false);
    // rebuilding from the record and the log yields the identical state
    const rebuilt = new Room(JSON.parse(JSON.stringify(room.record)), JSON.parse(JSON.stringify(rows)));
    expect(JSON.stringify(rebuilt.state)).toBe(JSON.stringify(room.state));
    // views are redacted for the guest
    const v = rebuilt.viewFor(GUEST)!;
    expect(v.viewerId).toBeNull();
    expect(v.players.p0.hand.every((u) => u === 'hidden')).toBe(true);
  });
});
