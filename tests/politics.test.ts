import { describe, expect, it } from 'vitest';
import { electGeneral, playedValue } from '../src/engine/rules/politics';
import { compareScoreLines, computeScores, tiedAtTop } from '../src/engine/rules/scoring';
import { handValue, membersOf } from '../src/engine/query';
import { runBots } from '../src/bots/runner';
import { act, addUnit, clearUnits, giveCard, handTypes, logHas, newGame, playerOf, runUntil, seedForRolls } from './helpers';
import { advance } from '../src/engine/machine';
import type { GameState } from '../src/engine/types';

/** Replace the task queue so the next thing that happens is reconciliation. */
function jumpToReconcile(s: GameState): void {
  s.tasks = [{ kind: 'reconcile' }, { kind: 'politicsPlay', remaining: [...s.seatOrder], round: 1 }];
  s.pending = null;
}

function stripZeus(s: GameState): void {
  for (const pid of s.seatOrder) {
    const keep = s.players[pid].hand.filter((u) => s.cards[u].type !== 'zeus');
    s.discard.push(...s.players[pid].hand.filter((u) => s.cards[u].type === 'zeus'));
    s.players[pid].hand = keep;
  }
}

describe('reconciliation', () => {
  it('collects food from wheat and one raw material per tile, removes farmers, then feeds soldiers', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    runUntil(s, (st) => st.phase === 'military' && st.pending?.kind === 'issueOrder');
    clearUnits(s);
    jumpToReconcile(s);
    addUnit(s, 'farmer', white, '4,0'); // wheat + wood
    addUnit(s, 'farmer', white, '4,-2'); // iron only
    addUnit(s, 'farmer', white, '3,1'); // wood only
    addUnit(s, 'soldier', white, '3,0');
    s.players[white].food = 0;
    s.players[white].raw = 0;
    advance(s);
    runUntil(s, (st) => st.phase === 'politics');
    expect(logHas(s, 'harvests 2 food and 3 raw material(s)')).toBe(true); // wheat yields 2 (house rule)
    expect(Object.values(s.units).some((u) => u.kind === 'farmer')).toBe(false);
    expect(s.players[white].food).toBe(1); // 2 harvested, 1 eaten
    expect(s.players[white].raw).toBe(3);
  });

  it('forces disbanding one soldier at a time when food runs short', () => {
    const s = newGame(3, 1);
    const white = playerOf(s, 'white');
    runUntil(s, (st) => st.phase === 'military' && st.pending?.kind === 'issueOrder');
    clearUnits(s);
    jumpToReconcile(s);
    const a = addUnit(s, 'soldier', white, '3,0');
    const b = addUnit(s, 'soldier', white, '3,0');
    const c = addUnit(s, 'soldier', white, '5,-1');
    const fresh = addUnit(s, 'soldier', white, '5,-1', { bornTurn: s.turn }); // raised this turn: not fed (house rule)
    s.players[white].food = 1;
    advance(s);
    runUntil(s, (st) => st.pending?.kind === 'disband');
    expect(s.pending).toMatchObject({ kind: 'disband', playerId: white, shortfall: 2 });
    expect((s.pending as { candidates: string[] }).candidates).not.toContain(fresh.id);
    act(s, { kind: 'disband', playerId: white, unitId: c.id });
    expect(s.pending).toMatchObject({ kind: 'disband', shortfall: 1 });
    act(s, { kind: 'disband', playerId: white, unitId: a.id });
    expect(s.units[b.id]).toBeDefined();
    expect(s.units[fresh.id]).toBeDefined();
    expect(s.players[white].food).toBe(0);
    expect(s.pending?.kind).not.toBe('disband');
  });
});

describe('elections', () => {
  it('elects the highest score, incumbent on ties, else earliest in the General\'s order', () => {
    const s = newGame(6, 2);
    const members = membersOf(s, 'white');
    const inc = s.alliances.white.generalId!;
    const other = members.find((m) => m !== inc)!;
    s.alliances.white.factionOrder = [other, inc];
    expect(electGeneral(s, 'white', { [inc]: 3, [other]: 5 }).winner).toBe(other);
    expect(electGeneral(s, 'white', { [inc]: 4, [other]: 4 }).winner).toBe(inc);
    s.alliances.white.generalId = null;
    expect(electGeneral(s, 'white', { [inc]: 4, [other]: 4 }).winner).toBe(other);
    expect(electGeneral(s, 'white', {}).reason).toMatch(/incumbent/);
  });

  it('counts Zeus as 4 and reaction cards as 0 in the PLAY envelope', () => {
    const s = newGame(3, 1);
    const pid = playerOf(s, 'white');
    const z = giveCard(s, pid, 'zeus');
    const r = giveCard(s, pid, 'rage');
    const o = giveCard(s, pid, 'orator');
    expect(playedValue(s, [z, r, o])).toBe(7);
    expect(handValue(s, pid)).toBe(7);
  });

  it('requires at least one card, reveals all envelopes together and elects new Generals', () => {
    const s = newGame(6, 2);
    runUntil(s, (st) => st.pending?.kind === 'playCards');
    const pid = s.pending!.playerId;
    expect(() => act(s, { kind: 'playCards', playerId: pid, cardUids: [] })).toThrow(/at least one/);
    const uid = s.players[pid].hand[0];
    act(s, { kind: 'playCards', playerId: pid, cardUids: [uid] });
    expect(s.turnData.politics!.played[pid]).toEqual([uid]);
    expect(s.turnData.politics!.revealed).toBe(false);
    runUntil(s, (st) => st.turn === 2 || st.phase === 'gameOver');
    expect(logHas(s, 'reveals:')).toBe(true);
    expect(logHas(s, 'General (')).toBe(true);
  });

  it('Apple of Discord replays the whole phase after everyone draws a card', () => {
    const s = newGame(3, 1);
    const pid = playerOf(s, 'white');
    runUntil(s, (st) => st.pending?.kind === 'playCards' && st.pending.playerId === pid);
    const apple = giveCard(s, pid, 'apple');
    act(s, { kind: 'playCards', playerId: pid, cardUids: [apple] });
    runUntil(s, (st) => st.pending?.kind === 'invokeApple');
    const sizes = s.seatOrder.map((p) => s.players[p].hand.length);
    const discardBefore = s.discard.length;
    act(s, { kind: 'invokeApple', playerId: pid, invoke: true });
    expect(s.seatOrder.map((p) => s.players[p].hand.length)).toEqual(sizes.map((n) => n + 1));
    expect(s.discard.length).toBe(discardBefore); // apple stays spent
    runUntil(s, (st) => st.pending?.kind === 'playCards' && st.pending.playerId === pid);
    expect((s.pending as { round: number }).round).toBe(2);
  });

  it('Attacked by Philosophers transfers a city on an even roll and costs the hand on an odd roll', async () => {
    const s = newGame(6, 2);
    const a = s.alliances.white.generalId!;
    const b = membersOf(s, 'white').find((m) => m !== a)!;
    runUntil(s, (st) => st.pending?.kind === 'playCards' && st.pending.playerId === a);
    stripZeus(s);
    const phil = giveCard(s, a, 'philosophers');
    giveCard(s, a, 'citizen');
    act(s, { kind: 'playCards', playerId: a, cardUids: [phil] });
    runUntil(s, (st) => st.pending?.kind === 'philosophersTarget');
    const p = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'philosophersTarget' }>;
    expect(p.targets.map((t) => t.partnerId)).toEqual([b]);
    const city = p.targets[0].cityTileIds[0];
    s.rng.s = seedForRolls([4]);
    act(s, { kind: 'philosophersTarget', playerId: a, partnerId: b, cityTileId: city });
    runUntil(s, (st) => st.pending?.kind !== 'reaction');
    expect(s.tiles[city].city!.ownerId).toBe(a);
    expect(logHas(s, 'even!')).toBe(true);
  });

  it('Attacked by Philosophers on an odd roll discards the rest of the hand, and Zeus can cancel it', async () => {
    const s = newGame(6, 2);
    const a = s.alliances.white.generalId!;
    const b = membersOf(s, 'white').find((m) => m !== a)!;
    runUntil(s, (st) => st.pending?.kind === 'playCards' && st.pending.playerId === a);
    stripZeus(s);
    const phil = giveCard(s, a, 'philosophers');
    giveCard(s, a, 'citizen');
    const zeus = giveCard(s, b, 'zeus');
    act(s, { kind: 'playCards', playerId: a, cardUids: [phil] });
    runUntil(s, (st) => st.pending?.kind === 'playCards' && st.pending.playerId === b);
    const bPlay = s.players[b].hand.find((u) => u !== zeus)!;
    act(s, { kind: 'playCards', playerId: b, cardUids: [bPlay] });
    runUntil(s, (st) => st.pending?.kind === 'philosophersTarget');
    const p = s.pending as Extract<NonNullable<typeof s.pending>, { kind: 'philosophersTarget' }>;
    const city = p.targets[0].cityTileIds[0];
    act(s, { kind: 'philosophersTarget', playerId: a, partnerId: b, cityTileId: city });
    expect(s.pending).toMatchObject({ kind: 'reaction', playerId: b, window: 'zeus', target: 'philosophers' });
    // first decline: odd roll costs the hand
    s.rng.s = seedForRolls([3]);
    const handBefore = s.players[a].hand.length;
    expect(handBefore).toBeGreaterThan(0);
    act(s, { kind: 'react', playerId: b, play: false });
    runUntil(s, (st) => st.pending?.kind !== 'reaction');
    expect(s.tiles[city].city!.ownerId).toBe(b);
    expect(s.players[a].hand.length).toBe(0);
    expect(logHas(s, 'is refuted')).toBe(true);
    expect(handTypes(s, b)).toContain('zeus');
    // and the cancel path
    const t = newGame(6, 2);
    const ta = t.alliances.white.generalId!;
    const tb = membersOf(t, 'white').find((m) => m !== ta)!;
    runUntil(t, (st) => st.pending?.kind === 'playCards' && st.pending.playerId === ta);
    stripZeus(t);
    const tphil = giveCard(t, ta, 'philosophers');
    giveCard(t, ta, 'citizen');
    giveCard(t, tb, 'zeus');
    act(t, { kind: 'playCards', playerId: ta, cardUids: [tphil] });
    runUntil(t, (st) => st.pending?.kind === 'philosophersTarget');
    const tp = t.pending as Extract<NonNullable<typeof t.pending>, { kind: 'philosophersTarget' }>;
    const tcity = tp.targets[0].cityTileIds[0];
    act(t, { kind: 'philosophersTarget', playerId: ta, partnerId: tb, cityTileId: tcity });
    expect(t.pending).toMatchObject({ kind: 'reaction', playerId: tb, window: 'zeus', victimId: tb });
    const handBeforeCancel = t.players[ta].hand.length;
    act(t, { kind: 'react', playerId: tb, play: true });
    expect(t.tiles[tcity].city!.ownerId).toBe(tb);
    expect(t.players[ta].hand.length).toBe(handBeforeCancel);
    expect(handTypes(t, tb)).not.toContain('zeus');
    expect(logHas(t, 'is cancelled')).toBe(true);
  });
});

describe('end of game and scoring', () => {
  it('ends when the running d6 total reaches 35 and scores cities plus the Generalship', () => {
    const s = newGame(3, 1);
    s.endTotal = 34;
    runBots(s);
    expect(s.phase).toBe('gameOver');
    expect(s.endTotal).toBeGreaterThanOrEqual(35);
    expect(s.result).not.toBeNull();
    const lines = computeScores(s);
    for (const l of lines) {
      expect(l.generalBonus).toBe(2); // three single-member alliances
      expect(l.total).toBe(l.cityPoints + 2);
    }
    expect(s.result!.ranking[0]).toBe(s.result!.winnerId);
    expect(logHas(s, 'crowned the greatest leader')).toBe(true);
    expect(logHas(s, 'mock')).toBe(true);
  });

  it('applies the tiebreakers: Generalship, then cards in hand, then a Sing-Off', () => {
    const s = newGame(6, 2);
    const lines = computeScores(s);
    const a = lines[0];
    const b = { ...lines[1], total: a.total, isGeneral: a.isGeneral, cardValue: a.cardValue };
    expect(compareScoreLines(a, b)).toBe(0);
    expect(compareScoreLines({ ...a, isGeneral: true }, { ...b, isGeneral: false })).toBeLessThan(0);
    expect(compareScoreLines({ ...a, isGeneral: false, cardValue: 3 }, { ...b, isGeneral: false, cardValue: 5 })).toBeGreaterThan(0);
    expect(compareScoreLines({ ...a, total: 9 }, { ...b, total: 8 })).toBeLessThan(0);
    const tied = tiedAtTop([{ ...a, total: 30 }, { ...b, total: 30 }, ...lines.slice(2)]);
    expect(tied.length).toBe(2);
  });

  it('runs a Sing-Off with votes from human non-contestants and picks at random when only bots could vote', async () => {
    const s = newGame(4, 7);
    // make two players exactly tied at the top: two members of black (one is General, one not) -> give both the Generalship? impossible;
    // instead tie the white and green generals (both Generals of single-member alliances)
    const w = playerOf(s, 'white');
    const g = playerOf(s, 'green');
    for (const t of Object.values(s.tiles)) if (t.city && (t.city.ownerId === w || t.city.ownerId === g)) t.city.level = 1;
    for (const p of s.seatOrder) s.players[p].hand = [];
    s.units = {};
    // black players own nothing so they score below
    for (const t of Object.values(s.tiles)) if (t.city && t.city.ownerId && s.players[t.city.ownerId].allianceId === 'black') t.city.ownerId = null;
    s.tasks = [{ kind: 'gameOver' }];
    s.pending = null;
    s.phase = 'politics';
    const black = membersOf(s, 'black');
    s.players[black[0]].isBot = false;
    advance(s);
    const pend = s.pending as unknown as { kind: string; playerId: string; tiedPlayerIds: string[] };
    expect(pend).toMatchObject({ kind: 'singOffVote', playerId: black[0] });
    const p = pend;
    expect(p.tiedPlayerIds.sort()).toEqual([w, g].sort());
    act(s, { kind: 'singOffVote', playerId: black[0], votedFor: g });
    expect(s.result!.winnerId).toBe(g);
    expect(s.result!.singOff!.random).toBe(false);
    // all-bot variant
    const s2 = newGame(4, 7);
    for (const t of Object.values(s2.tiles)) if (t.city && t.city.ownerId && s2.players[t.city.ownerId].allianceId === 'black') t.city.ownerId = null;
    for (const p2 of s2.seatOrder) s2.players[p2].hand = [];
    s2.units = {};
    s2.tasks = [{ kind: 'gameOver' }];
    s2.pending = null;
    advance(s2);
    expect(s2.result!.singOff!.random).toBe(true);
    expect(logHas(s2, 'at random')).toBe(true);
  });
});
