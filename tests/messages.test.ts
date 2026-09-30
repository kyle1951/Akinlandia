import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/machine';
import { allianceTarget, noteHostility, trucePartners } from '../src/engine/messages';
import { viewForPlayer } from '../src/engine/view';
import { destinationsFrom } from '../src/engine/rules/movement';
import { botAction } from '../src/bots/heuristic';
import { runBotGame } from '../src/bots/runner';
import { act, addUnit, clearUnits, generalOf, newGame, playerOf, setActing, toMilitary } from './helpers';
import type { GameState, MessageAudience, MessageIntent } from '../src/engine/types';

const say = (s: GameState, playerId: string, to: MessageAudience, text: string, intent?: MessageIntent) => act(s, { kind: 'say', playerId, to, text, ...(intent ? { intent } : {}) });

describe('messages and diplomacy (decision 112)', () => {
  it('lets any leader speak at any time without answering the pending decision', () => {
    const s = newGame(3, 1);
    const pending = s.pending;
    const white = playerOf(s, 'white');
    say(s, white, { kind: 'all' }, 'Greetings, rivals.');
    expect(s.pending).toEqual(pending);
    expect(s.messages?.at(-1)).toMatchObject({ fromId: white, text: 'Greetings, rivals.', to: { kind: 'all' } });
    expect(s.actionLog.at(-1)?.kind).toBe('say');
  });

  it('keeps private channels private and rejects speaking for another alliance', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    const black = playerOf(s, 'black');
    expect(() => applyAction(s, { kind: 'say', playerId: white, to: { kind: 'alliance', allianceId: 'black' }, text: 'psst' })).toThrow();
    expect(() => applyAction(s, { kind: 'say', playerId: white, to: { kind: 'all' }, text: 'x'.repeat(281) })).toThrow();
    say(s, white, { kind: 'alliance', allianceId: 'white' }, 'Our plan');
    say(s, white, { kind: 'diplomacy', allianceIds: ['white', 'green'] }, 'Hello Green');
    const blackView = viewForPlayer(s, black);
    expect(blackView.messages?.map((m) => m.text)).toEqual([]);
    const spectator = viewForPlayer(s, null);
    expect(spectator.messages ?? []).toEqual([]);
    const green = playerOf(s, 'green');
    expect(viewForPlayer(s, green).messages?.map((m) => m.text)).toEqual(['Hello Green']);
  });

  it('records a General’s target, which bots read as the alliance objective', () => {
    const s = newGame(3, 1);
    const g = generalOf(s, 'white');
    const city = Object.values(s.tiles).find((t) => t.city && !t.city.ownerId)!;
    say(s, g, { kind: 'alliance', allianceId: 'white' }, `Everyone to ${city.city!.name}`, { kind: 'target', tileId: city.id });
    expect(allianceTarget(s, 'white')).toBe(city.id);
  });

  it('only Generals propose and answer pacts; an accepted truce is in force and a battle breaks it', () => {
    const s = newGame(3, 1);
    const gw = generalOf(s, 'white');
    const gb = generalOf(s, 'black');
    const intent: MessageIntent = { kind: 'propose', proposalId: 'p1', pact: 'truce', turns: 2 };
    const to: MessageAudience = { kind: 'diplomacy', allianceIds: ['white', 'black'] };
    const whiteMember = s.seatOrder.find((p) => s.players[p].allianceId === 'white' && p !== gw);
    if (whiteMember) expect(() => applyAction(s, { kind: 'say', playerId: whiteMember, to, text: 'truce?', intent })).toThrow();
    say(s, gw, to, 'A truce?', intent);
    expect(() => applyAction(s, { kind: 'say', playerId: gw, to, text: 'yes', intent: { kind: 'reply', proposalId: 'p1', accept: true } })).toThrow(/Only the General who received/);
    say(s, gb, to, 'Agreed.', { kind: 'reply', proposalId: 'p1', accept: true });
    expect(trucePartners(s, 'white')).toEqual(['black']);
    noteHostility(s, 'white', 'black', 'white');
    expect(trucePartners(s, 'white')).toEqual([]);
    expect(s.pacts?.[0].broken).toMatchObject({ byAllianceId: 'white' });
  });

  it('bots do not attack an alliance they have a truce with', () => {
    const plan = (truce: boolean) => {
      const s = newGame(3, 1);
      toMilitary(s, 'full1');
      clearUnits(s);
      // three Black soldiers with a White soldier on every land side: without a truce they must attack one
      const from = Object.values(s.tiles).find((t) => !t.city && destinationsFrom(s, t.id).filter((d) => d.via === 'land').length >= 2)!;
      const around = destinationsFrom(s, from.id).filter((d) => d.via === 'land').map((d) => d.tileId);
      const black = playerOf(s, 'black');
      for (let i = 0; i < 3; i++) addUnit(s, 'soldier', black, from.id);
      for (const t of around) addUnit(s, 'soldier', playerOf(s, 'white'), t);
      if (truce) s.pacts = [{ id: 't', kind: 'truce', allianceIds: ['white', 'black'], untilTurn: s.turn + 1 }];
      setActing(s, 'black');
      const a = botAction(s, s.pending!);
      return a.kind === 'order' && a.groups.some((g) => around.includes(g.destTileId));
    };
    expect(plan(false)).toBe(true);
    expect(plan(true)).toBe(false);
  });

  it('bots talk, name targets and make and answer proposals in real games', () => {
    const s = runBotGame(7, 6, { config: { militaryMode: 'simultaneous' }, checkInvariants: true });
    const kinds = new Set((s.messages ?? []).map((m) => m.intent?.kind ?? m.to.kind));
    expect(kinds.has('target')).toBe(true);
    expect(kinds.has('all')).toBe(true);
    expect((s.proposals ?? []).length).toBeGreaterThan(0);
    expect((s.proposals ?? []).every((p) => p.status !== 'open' || p.turn >= s.turn - 1)).toBe(true);
  });
});
