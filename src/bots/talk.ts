/**
 * What the bots say, and what they make of what others say (decisions 112, 114).
 *
 * Before each of its decisions a bot may speak: a General names the alliance's
 * target for the turn, answers offers made to its alliance, and now and then
 * makes one; any bot may add a line of public table talk. Diplomacy is by word
 * only. Bots read diplomacy messages in plain words (from humans and bots
 * alike): an offer of a truce or of a joint attack on a third alliance, and an
 * answer of yes or no. What they believe was agreed is their own understanding,
 * rebuilt from the messages; nothing binds them, and they break their word when
 * an undefended city is there for the taking. Everything is derived from the
 * game state, so bot games stay deterministic.
 */
import type { Action, AllianceId, GameState, Message, PactKind, PlayerId, Tile } from '../engine/types';
import { createRng, nextFloat, nextInt } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { allianceName, allianceOf, cityCount, membersOf, soldiersOnTile } from '../engine/query';
import { hexDistance } from '../engine/hex';
import { tileLabel } from '../engine/map';
import { isGeneralOf } from '../engine/messages';

function talkRng(state: GameState, pid: PlayerId): RngState {
  let h = 2166136261;
  for (const ch of pid) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return createRng(((state.rng.s ^ Math.imul(state.actionLog.length + 7, 2246822519) ^ h) >>> 0) || 1);
}

const pick = <T,>(rng: RngState, xs: T[]): T => xs[nextInt(rng, xs.length)];
const ALLIANCES: AllianceId[] = ['white', 'black', 'green'];

/** An alliance's strength for diplomacy: the cities its members hold. */
function strength(state: GameState, a: AllianceId): number {
  return membersOf(state, a).reduce((n, m) => n + cityCount(state, m), 0);
}

function liveAlliances(state: GameState): AllianceId[] {
  return ALLIANCES.filter((a) => membersOf(state, a).length > 0);
}

// ---------------------------------------------------------------------------
// Reading diplomacy
// ---------------------------------------------------------------------------

/** An offer as the bots understand it, whether a bot noted it or they read it in a human's words. */
export interface Offer {
  id: string;
  from: AllianceId;
  to: AllianceId;
  pact: PactKind;
  targetAllianceId?: AllianceId;
  turns: number;
  turn: number;
  seq: number;
}

const TRUCE = /\b(truce|peace|cease-?fire|non-?aggression|leave (us|each other) alone|don'?t attack|stop attacking|stand down|friends?)\b/i;
const JOINT = /\b(join|together|team up|gang up|against|attack|strike|march on|help us|with us)\b/i;
const YES = /\b(agreed?|yes|yeah|yep|deal|accept(ed)?|ok(ay)?|sure|done|fine|very well|you have our word)\b/i;
const NO = /\b(no|nope|decline[sd]?|never|refuse[sd]?|not a chance|reject(ed)?)\b/i;
const WORD_TURNS: Record<string, number> = { one: 1, two: 2, three: 3, a: 1 };

/** Alliances named in a text, by alliance name or by the name of one of their factions. */
function alliancesNamed(state: GameState, text: string): AllianceId[] {
  const t = text.toLowerCase();
  return ALLIANCES.filter((a) => t.includes(allianceName(a).toLowerCase()) || Object.values(state.factions).some((f) => f.allianceId === a && f.name.length > 3 && t.includes(f.name.toLowerCase())));
}

function turnsIn(text: string): number {
  const m = text.toLowerCase().match(/\b(\d|one|two|three|a)\s+(more\s+)?turns?\b/);
  if (!m) return 2;
  const n = WORD_TURNS[m[1]] ?? Number(m[1]);
  return Math.max(1, Math.min(3, n || 2));
}

function sides(state: GameState, m: Message): { from: AllianceId; to: AllianceId } | null {
  if (m.to.kind !== 'diplomacy') return null;
  const from = state.players[m.fromId]?.allianceId;
  if (!from) return null;
  const to = m.to.allianceIds[0] === from ? m.to.allianceIds[1] : m.to.allianceIds[0];
  return { from, to };
}

/** What a diplomacy message offers, if anything. */
function offerIn(state: GameState, m: Message): Offer | null {
  const s = sides(state, m);
  if (!s) return null;
  if (m.intent?.kind === 'propose') return { id: m.intent.proposalId, ...s, pact: m.intent.pact, targetAllianceId: m.intent.targetAllianceId, turns: m.intent.turns, turn: m.turn, seq: m.seq };
  if (m.intent) return null;
  const third = alliancesNamed(state, m.text).find((a) => a !== s.from && a !== s.to);
  if (third && JOINT.test(m.text)) return { id: `m${m.seq}`, ...s, pact: 'joint', targetAllianceId: third, turns: turnsIn(m.text), turn: m.turn, seq: m.seq };
  if (TRUCE.test(m.text)) return { id: `m${m.seq}`, ...s, pact: 'truce', turns: turnsIn(m.text), turn: m.turn, seq: m.seq };
  return null;
}

/** Whether a diplomacy message says yes or no (the first of the two it contains), or neither. */
function answerIn(m: Message): boolean | null {
  if (m.intent?.kind === 'reply') return m.intent.accept;
  if (m.intent) return null;
  const yes = m.text.search(YES);
  const no = m.text.search(NO);
  if (yes < 0 && no < 0) return null;
  if (no < 0) return true;
  if (yes < 0) return false;
  return yes < no;
}

interface Understanding {
  offer: Offer;
  /** null while unanswered */
  accepted: boolean | null;
  /** turn of the latest answer */
  answeredTurn: number;
}

/** Offers made to or by an alliance in the last few turns, with the latest word on each. */
function readDiplomacy(state: GameState, a: AllianceId): Understanding[] {
  const out: Understanding[] = [];
  for (const m of state.messages ?? []) {
    if (m.turn < state.turn - 4) continue;
    const s = sides(state, m);
    if (!s || (s.from !== a && s.to !== a)) continue;
    // a yes or no answers the offer it names, else the latest open offer from the other side
    // ("Agreed, peace it is" answers an offer of peace rather than making a new one)
    const verdict = answerIn(m);
    const target =
      verdict === null
        ? undefined
        : m.intent?.kind === 'reply'
          ? out.find((u) => u.offer.id === (m.intent as { proposalId: string }).proposalId)
          : [...out].reverse().find((u) => u.offer.from === s.to && u.offer.to === s.from && (u.accepted === null || m.turn > u.answeredTurn));
    if (target) {
      target.accepted = verdict;
      target.answeredTurn = m.turn;
      continue;
    }
    const offer = offerIn(state, m);
    if (offer) out.push({ offer, accepted: null, answeredTurn: -1 });
  }
  return out;
}

/**
 * What an alliance's bots believe they have agreed and not yet seen broken: whom they are at peace with (a
 * truce, or the partner in a joint attack) and whom they have agreed to attack together.
 */
export function understandings(state: GameState, a: AllianceId): { truce: AllianceId[]; joint: AllianceId[] } {
  const truce = new Set<AllianceId>();
  const joint = new Set<AllianceId>();
  for (const u of readDiplomacy(state, a)) {
    if (!u.accepted || state.turn > u.answeredTurn + u.offer.turns) continue;
    const other = u.offer.from === a ? u.offer.to : u.offer.from;
    truce.add(other);
    if (u.offer.pact === 'joint' && u.offer.targetAllianceId) joint.add(u.offer.targetAllianceId);
  }
  for (const b of betrayers(state, a)) truce.delete(b);
  for (const j of joint) truce.delete(j);
  return { truce: [...truce], joint: [...joint] };
}

/**
 * Alliances that attacked this one this turn: an assault on its units, or a march into its tile across the
 * same border it was crossing. Reaching the same empty tile at once (a contest) is nobody's attack.
 */
function attackersOf(state: GameState, a: AllianceId): AllianceId[] {
  const out = new Set<AllianceId>();
  for (const c of Object.values(state.turnData.combats ?? {})) {
    if (c.mode === 'contest') continue;
    if (c.defender.allianceId === a && c.attacker.allianceId !== a) out.add(c.attacker.allianceId);
    if (c.mode === 'border' && c.attacker.allianceId === a) out.add(c.defender.allianceId);
  }
  return [...out];
}

/** Alliances that gave their word of peace and attacked this turn anyway. */
function betrayers(state: GameState, a: AllianceId): AllianceId[] {
  const attackers = attackersOf(state, a);
  if (attackers.length === 0) return [];
  const promised = new Set<AllianceId>();
  for (const u of readDiplomacy(state, a)) {
    // a truce, or partnership in a joint attack, is a promise of peace between the two
    if (u.accepted && state.turn <= u.answeredTurn + u.offer.turns) promised.add(u.offer.from === a ? u.offer.to : u.offer.from);
  }
  return attackers.filter((x) => promised.has(x));
}

// ---------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------

/**
 * The alliance's objective: the nearest city it does not hold, preferring
 * neutral and lightly held ones, sparing those it has promised peace and
 * favouring the target of an agreed joint attack.
 */
export function chooseTarget(state: GameState, a: AllianceId): Tile | null {
  const { truce, joint } = understandings(state, a);
  const mine: Tile[] = [];
  for (const t of Object.values(state.tiles)) if (t.city?.ownerId && allianceOf(state, t.city.ownerId) === a) mine.push(t);
  for (const u of Object.values(state.units)) if (u.kind === 'soldier' && allianceOf(state, u.ownerId) === a) mine.push(state.tiles[u.tileId]);
  if (mine.length === 0) return null;
  let best: { t: Tile; score: number } | null = null;
  for (const t of Object.values(state.tiles)) {
    if (!t.city) continue;
    const owner = t.city.ownerId ? allianceOf(state, t.city.ownerId) : null;
    if (owner === a || (owner && truce.includes(owner))) continue;
    const dist = Math.min(...mine.map((m) => hexDistance(m, t)));
    const defenders = soldiersOnTile(state, t.id).filter((u) => allianceOf(state, u.ownerId) !== a).length;
    const score = dist * 3 + defenders * 2 - (owner === null ? 3 : 0) - (owner && joint.includes(owner) ? 4 : 0) - t.city.level;
    if (!best || score < best.score || (score === best.score && t.id < best.t.id)) best = { t, score };
  }
  return best?.t ?? null;
}

function makeOffer(state: GameState, a: AllianceId, rng: RngState, pid: PlayerId): Action | null {
  const others = liveAlliances(state).filter((x) => x !== a);
  if (others.length < 2) return null;
  const { truce, joint } = understandings(state, a);
  const byStrength = [...liveAlliances(state)].sort((x, y) => strength(state, y) - strength(state, x));
  const leader = byStrength[0];
  const id = `p${state.turn}-${a}-${state.messages?.length ?? 0}`;
  if (leader !== a && strength(state, leader) > strength(state, a) && !joint.includes(leader)) {
    const partner = others.find((x) => x !== leader);
    if (!partner) return null;
    const L = allianceName(leader);
    const text = pick(rng, [
      `The ${L} alliance grows too strong. Join us against the ${L} for two turns?`,
      `Let us settle our quarrel later. For two turns, we both march on the ${L}.`,
      `The ${L} will swallow us one at a time. Strike them with us?`,
    ]);
    return { kind: 'say', playerId: pid, to: { kind: 'diplomacy', allianceIds: [a, partner] }, text, intent: { kind: 'propose', proposalId: id, pact: 'joint', targetAllianceId: leader, turns: 2 } };
  }
  // the leader (or an alliance level with it) seeks peace with its most dangerous neighbour
  const threat = (x: AllianceId) => {
    let n = 0;
    for (const u of Object.values(state.units)) {
      if (u.kind !== 'soldier' || allianceOf(state, u.ownerId) !== x) continue;
      for (const t of Object.values(state.tiles)) if (t.city?.ownerId && allianceOf(state, t.city.ownerId) === a && hexDistance(state.tiles[u.tileId], t) <= 2) n++;
    }
    return n;
  };
  const rival = others.filter((x) => !truce.includes(x)).sort((x, y) => threat(y) - threat(x))[0];
  if (!rival || nextFloat(rng) < 0.5) return null;
  const text = pick(rng, ['Our quarrel profits no one. A truce for two turns?', 'Peace between us for two turns, and let the others bleed.', 'Hold your soldiers back from our cities and we will hold ours from yours. Two turns?']);
  return { kind: 'say', playerId: pid, to: { kind: 'diplomacy', allianceIds: [a, rival] }, text, intent: { kind: 'propose', proposalId: id, pact: 'truce', turns: 2 } };
}

function answerOffer(state: GameState, a: AllianceId, offer: Offer, rng: RngState, pid: PlayerId): Action {
  const mine = strength(state, a);
  let accept: boolean;
  if (offer.pact === 'joint') {
    const target = offer.targetAllianceId!;
    accept = target !== a && !understandings(state, a).truce.includes(target) && strength(state, target) >= mine;
  } else {
    // peace is worth having with someone at least as strong; with the weak, only sometimes
    accept = strength(state, offer.from) >= mine * 1.1 || nextFloat(rng) < 0.3;
  }
  const text = accept
    ? pick(rng, offer.pact === 'joint' ? ['Agreed. Together, then.', 'Yes. We march with you.', 'Done. May the Fates favour us both.'] : ['Agreed. Keep your word and we will keep ours.', 'Yes, a truce, then.', 'Agreed. Peace, for now.'])
    : pick(rng, ['No. We decline.', 'Not a chance.', 'No. You mistake us for fools.', 'Our answer is no.']);
  return { kind: 'say', playerId: pid, to: { kind: 'diplomacy', allianceIds: [offer.from, a] }, text, intent: { kind: 'reply', proposalId: offer.id, accept } };
}

/** A line of public table talk about what happened to this leader lately, or a little banter. */
function tableTalk(state: GameState, pid: PlayerId, rng: RngState): string | null {
  const me = state.players[pid];
  const a = me.allianceId!;
  const traitor = betrayers(state, a)[0];
  if (traitor) return pick(rng, [`So much for the word of the ${allianceName(traitor)} alliance.`, 'Remember this betrayal, all of you.', `A promise is only as good as the ${allianceName(traitor)} General's memory.`]);
  const recent = state.log.filter((e) => e.turn >= state.turn - 1);
  for (let i = recent.length - 1; i >= 0; i--) {
    const t = recent[i].text;
    const lost = t.match(/^(.*) is conquered from (.*) and assigned to (.*)\.$/);
    if (lost && lost[2].startsWith(me.leaderName)) return pick(rng, [`${lost[1]} will be ours again before the Fates are done.`, `Enjoy ${lost[1]} while you can.`, `A setback. ${lost[1]} remembers its true masters.`]);
    if (lost && lost[3].startsWith(me.leaderName)) return pick(rng, [`${lost[1]} flies our colours now.`, `Who is next after ${lost[1]}?`, `${lost[1]} welcomed us with open gates. Mostly.`]);
    const taken = t.match(/^(.*) is taken and assigned to (.*)\.$/);
    if (taken && taken[2].startsWith(me.leaderName)) return pick(rng, [`${taken[1]} is ours. It was only a matter of time.`, `A fine morning in ${taken[1]}.`]);
    if (t.includes(me.leaderName) && t.includes('is elected General')) return pick(rng, ['The alliance has chosen wisely.', 'I will not waste this mandate.']);
  }
  if (nextFloat(rng) < 0.5) return null;
  return pick(rng, [
    'The harvest is good and the soldiers are hungry.',
    'Politics is war by other envelopes.',
    'I trust my allies. Mostly.',
    'Somebody is hoarding Orators, and we all know who.',
    'The Fates are rolling. Tick, tock.',
    'Nothing personal. It is only a board game, until it is not.',
  ]);
}

/**
 * The next thing a bot says before answering its pending decision, or null.
 * The runner asks again after each message, so a General first answers any
 * offer made to its alliance, then (during allocation) names the turn's target
 * and sometimes makes an offer, and any bot may add one public line per turn.
 */
export function botSays(state: GameState, pid: PlayerId): Action | null {
  const me = state.players[pid];
  const a = me?.allianceId;
  if (!a || state.phase === 'setup' || state.phase === 'gameOver') return null;
  const rng = talkRng(state, pid);
  const mineThisTurn = (pred: (m: Message) => boolean) => (state.messages ?? []).some((m) => m.turn === state.turn && m.fromId === pid && pred(m));
  const general = isGeneralOf(state, pid);
  if (general) {
    const open = readDiplomacy(state, general).find((u) => u.accepted === null && u.offer.to === general && u.offer.turn >= state.turn - 1);
    if (open) return answerOffer(state, general, open.offer, rng, pid);
  }
  if (general && state.phase === 'allocation') {
    if (!mineThisTurn((m) => m.intent?.kind === 'target')) {
      const t = chooseTarget(state, general);
      if (t) {
        const name = tileLabel(t);
        const text = pick(rng, [`All forces toward ${name} this turn.`, `Our objective is ${name}.`, `${name}. Everyone, ${name}.`, `We take ${name}, or we die trying.`]);
        return { kind: 'say', playerId: pid, to: { kind: 'alliance', allianceId: general }, text, intent: { kind: 'target', tileId: t.id } };
      }
    }
    if (!mineThisTurn((m) => m.intent?.kind === 'propose') && nextFloat(rng) < 0.35) {
      const offer = makeOffer(state, general, rng, pid);
      if (offer) return offer;
    }
  }
  if ((state.phase === 'allocation' || state.phase === 'politics' || state.phase === 'reconciliation') && !mineThisTurn((m) => m.to.kind === 'all') && (betrayers(state, a).length > 0 || nextFloat(rng) < 0.3)) {
    const text = tableTalk(state, pid, rng);
    if (text) return { kind: 'say', playerId: pid, to: { kind: 'all' }, text };
  }
  return null;
}
