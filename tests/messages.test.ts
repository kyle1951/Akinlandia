import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/engine/machine';
import { allianceTarget } from '../src/engine/messages';
import { viewForPlayer } from '../src/engine/view';
import { destinationsFrom } from '../src/engine/rules/movement';
import { botAction } from '../src/bots/heuristic';
import { botSays, understandings } from '../src/bots/talk';
import { runBotGame } from '../src/bots/runner';
import { act, addUnit, clearUnits, generalOf, newGame, playerOf, runUntil, setActing, toMilitary } from './helpers';
import { advance } from '../src/engine/machine';
import type { CombatRecord, GameState, MessageAudience, MessageIntent, PendingDecision } from '../src/engine/types';

const say = (s: GameState, playerId: string, to: MessageAudience, text: string, intent?: MessageIntent) => act(s, { kind: 'say', playerId, to, text, ...(intent ? { intent } : {}) });
const WB: MessageAudience = { kind: 'diplomacy', allianceIds: ['white', 'black'] };

describe('messages (decisions 112, 114)', () => {
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
    expect(viewForPlayer(s, black).messages?.map((m) => m.text)).toEqual([]);
    expect(viewForPlayer(s, null).messages ?? []).toEqual([]);
    expect(viewForPlayer(s, playerOf(s, 'green')).messages?.map((m) => m.text)).toEqual(['Hello Green']);
  });

  it('records a General’s target, which bots read as the alliance objective', () => {
    const s = newGame(3, 1);
    const g = generalOf(s, 'white');
    const city = Object.values(s.tiles).find((t) => t.city && !t.city.ownerId)!;
    say(s, g, { kind: 'alliance', allianceId: 'white' }, `Everyone to ${city.city!.name}`, { kind: 'target', tileId: city.id });
    expect(allianceTarget(s, 'white')).toBe(city.id);
  });

  it('diplomacy is only words: an offer and its answer leave nothing in the rules, only in what bots understand', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    const black = playerOf(s, 'black');
    const before = JSON.stringify({ ...s, messages: undefined, actionLog: undefined });
    say(s, white, WB, 'Black, a truce for two turns?');
    expect(understandings(s, 'white').truce).toEqual([]);
    say(s, black, WB, 'Agreed, peace it is.');
    expect(JSON.stringify({ ...s, messages: undefined, actionLog: undefined })).toBe(before);
    expect(understandings(s, 'white').truce).toEqual(['black']);
    expect(understandings(s, 'black').truce).toEqual(['white']);
    say(s, white, { kind: 'diplomacy', allianceIds: ['white', 'green'] }, 'Green, join us against the Black alliance?');
    say(s, playerOf(s, 'green'), { kind: 'diplomacy', allianceIds: ['green', 'white'] }, 'No.');
    expect(understandings(s, 'green').joint).toEqual([]);
  });

  it('a bot General answers an offer made in plain words, and what it says is what it believes', () => {
    const s = newGame(3, 1);
    say(s, playerOf(s, 'white'), WB, 'Hey Black, how about a ceasefire for one turn?');
    const reply = botSays(s, generalOf(s, 'black'));
    expect(reply).toMatchObject({ kind: 'say', to: { kind: 'diplomacy' }, intent: { kind: 'reply' } });
    act(s, reply!);
    const accepted = reply!.kind === 'say' && reply!.intent?.kind === 'reply' && reply!.intent.accept;
    expect(understandings(s, 'black').truce.includes('white')).toBe(accepted);
  });

  it('bots keep their word, except when a city lies undefended', () => {
    const plan = (truce: boolean, undefendedCity: boolean) => {
      const s = newGame(3, 1);
      toMilitary(s, 'full1');
      clearUnits(s);
      const from = Object.values(s.tiles).find((t) => !t.city && destinationsFrom(s, t.id).filter((d) => d.via === 'land').length >= 2 && destinationsFrom(s, t.id).some((d) => d.via === 'land' && s.tiles[d.tileId].city))!;
      const around = destinationsFrom(s, from.id).filter((d) => d.via === 'land').map((d) => d.tileId);
      const city = around.find((t) => s.tiles[t].city)!;
      const black = playerOf(s, 'black');
      const white = playerOf(s, 'white');
      for (let i = 0; i < 3; i++) addUnit(s, 'soldier', black, from.id);
      for (const t of around) if (!(undefendedCity && t === city)) addUnit(s, 'soldier', white, t);
      s.tiles[city].city!.ownerId = white;
      if (truce) {
        say(s, generalOf(s, 'white'), WB, 'A truce for two turns?');
        say(s, generalOf(s, 'black'), WB, 'Agreed.');
      }
      setActing(s, 'black');
      const a = botAction(s, s.pending!);
      return a.kind === 'order' ? a.groups.map((g) => g.destTileId).filter((d) => around.includes(d)) : [];
    };
    expect(plan(false, false).length).toBeGreaterThan(0);
    expect(plan(true, false)).toEqual([]);
    expect(plan(true, true).length).toBeGreaterThan(0);
  });

  it('partners in a joint attack are at peace with each other', () => {
    const s = newGame(3, 1);
    say(s, generalOf(s, 'white'), WB, 'Join us against the Green alliance for two turns?');
    say(s, generalOf(s, 'black'), WB, 'Yes. We march with you.');
    expect(understandings(s, 'black')).toEqual({ truce: ['white'], joint: ['green'] });
  });

  it('a bot leaves a truce partner’s farmers alone', () => {
    const plan = (truce: boolean) => {
      const s = newGame(3, 1, { militaryMode: 'simultaneous' });
      runUntil(s, (st) => st.pending?.kind === 'submitOrders');
      clearUnits(s);
      // three Black soldiers ringed by White farmers on open, non-city land: without a truce they raid one
      const land = (id: string) => destinationsFrom(s, id).filter((d) => d.via === 'land').map((d) => d.tileId);
      const open = (id: string) => land(id).filter((n) => !s.tiles[n].city);
      const from = Object.values(s.tiles).find((t) => !t.city && open(t.id).length >= 2)!.id;
      const around = open(from);
      const black = playerOf(s, 'black');
      for (let i = 0; i < 3; i++) addUnit(s, 'soldier', black, from);
      for (const t of around) addUnit(s, 'farmer', playerOf(s, 'white'), t);
      // neighbouring cities are Black's own, so nothing else tempts the stack
      for (const n of land(from)) if (s.tiles[n].city) s.tiles[n].city!.ownerId = black;
      if (truce) {
        say(s, generalOf(s, 'white'), WB, 'A truce for two turns?');
        say(s, generalOf(s, 'black'), WB, 'Agreed.');
      }
      s.tasks = [{ kind: 'simRound', idx: 1, started: false }];
      s.pending = null;
      advance(s);
      const pending = () => s.pending as PendingDecision | null;
      while (pending()?.kind === 'submitOrders' && (pending() as Extract<PendingDecision, { kind: 'submitOrders' }>).allianceId !== 'black') act(s, { kind: 'submitOrders', playerId: pending()!.playerId, orders: [], scuttle: [] });
      const a = botAction(s, pending()!);
      return a.kind === 'submitOrders' && a.orders.some((o) => o.groups.some((g) => around.includes(g.destTileId)));
    };
    expect(plan(false)).toBe(true);
    expect(plan(true)).toBe(false);
  });

  it('a betrayed bot says so in public and stops trusting the betrayer', () => {
    const s = newGame(3, 1);
    say(s, generalOf(s, 'white'), WB, 'A truce for two turns?');
    say(s, generalOf(s, 'black'), WB, 'Agreed.');
    expect(understandings(s, 'black').truce).toEqual(['white']);
    s.turnData.combats = { c1: { attacker: { allianceId: 'white' }, defender: { allianceId: 'black' } } as unknown as CombatRecord };
    expect(understandings(s, 'black').truce).toEqual([]);
    const black = generalOf(s, 'black');
    let line = '';
    for (let i = 0; i < 6 && !line; i++) {
      const m = botSays(s, black);
      if (!m) break;
      act(s, m);
      if (m.kind === 'say' && m.to.kind === 'all') line = m.text;
    }
    expect(line).toMatch(/word|betrayal|promise/);
  });

  it('bots talk, name targets and make and answer offers in real games', () => {
    const s = runBotGame(7, 6, { config: { militaryMode: 'simultaneous' }, checkInvariants: true });
    const kinds = new Set((s.messages ?? []).map((m) => m.intent?.kind ?? m.to.kind));
    expect(kinds.has('target')).toBe(true);
    expect(kinds.has('all')).toBe(true);
    expect(kinds.has('propose')).toBe(true);
    expect(kinds.has('reply')).toBe(true);
  });
});
