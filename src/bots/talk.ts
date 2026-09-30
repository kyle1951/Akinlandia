/**
 * What the bots say (decision 112). Before each of its decisions a bot may
 * speak: a General names the alliance's target for the turn and sometimes
 * proposes a pact to another alliance, answers proposals made to it, and any
 * bot may add a line of public table talk about the last turn. Everything is
 * derived from the game state, so bot games stay deterministic.
 */
import type { Action, AllianceId, GameState, Message, PlayerId, Proposal, Tile } from '../engine/types';
import { createRng, nextFloat, nextInt } from '../engine/rng';
import type { RngState } from '../engine/rng';
import { allianceName, allianceOf, cityCount, membersOf, soldiersOnTile } from '../engine/query';
import { hexDistance } from '../engine/hex';
import { tileLabel } from '../engine/map';
import { activePacts, isGeneralOf, jointTargets, openProposals, trucePartners } from '../engine/messages';

function talkRng(state: GameState, pid: PlayerId): RngState {
  let h = 2166136261;
  for (const ch of pid) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return createRng(((state.rng.s ^ Math.imul(state.actionLog.length + 7, 2246822519) ^ h) >>> 0) || 1);
}

const pick = <T,>(rng: RngState, xs: T[]): T => xs[nextInt(rng, xs.length)];

function speaker(state: GameState, pid: PlayerId): string {
  const p = state.players[pid];
  return p.factionId ? `${p.leaderName} of ${state.factions[p.factionId].name}` : p.leaderName;
}

/** An alliance's strength for diplomacy: the cities its members hold. */
function strength(state: GameState, a: AllianceId): number {
  return membersOf(state, a).reduce((n, m) => n + cityCount(state, m), 0);
}

function liveAlliances(state: GameState): AllianceId[] {
  return state.allianceOrder.length ? [...state.allianceOrder] : (['white', 'black', 'green'] as AllianceId[]).filter((a) => membersOf(state, a).length > 0);
}

/**
 * The alliance's objective: the nearest city it does not hold, preferring
 * neutral and lightly held ones, skipping truce partners and favouring the
 * target of a joint attack.
 */
export function chooseTarget(state: GameState, a: AllianceId): Tile | null {
  const truce = new Set(trucePartners(state, a));
  const joint = new Set(jointTargets(state, a));
  const mine: Tile[] = [];
  for (const t of Object.values(state.tiles)) if (t.city?.ownerId && allianceOf(state, t.city.ownerId) === a) mine.push(t);
  for (const u of Object.values(state.units)) if (u.kind === 'soldier' && allianceOf(state, u.ownerId) === a) mine.push(state.tiles[u.tileId]);
  if (mine.length === 0) return null;
  let best: { t: Tile; score: number } | null = null;
  for (const t of Object.values(state.tiles)) {
    if (!t.city) continue;
    const owner = t.city.ownerId ? allianceOf(state, t.city.ownerId) : null;
    if (owner === a || (owner && truce.has(owner))) continue;
    const dist = Math.min(...mine.map((m) => hexDistance(m, t)));
    const defenders = soldiersOnTile(state, t.id).filter((u) => allianceOf(state, u.ownerId) !== a).length;
    const score = dist * 3 + defenders * 2 - (owner === null ? 3 : 0) - (owner && joint.has(owner) ? 4 : 0) - t.city.level;
    if (!best || score < best.score || (score === best.score && t.id < best.t.id)) best = { t, score };
  }
  return best?.t ?? null;
}

function proposalFor(state: GameState, a: AllianceId, rng: RngState, pid: PlayerId): Action | null {
  const others = liveAlliances(state).filter((x) => x !== a);
  if (others.length < 2) return null;
  const pacted = new Set(activePacts(state, a).flatMap((p) => p.allianceIds));
  const byStrength = [...liveAlliances(state)].sort((x, y) => strength(state, y) - strength(state, x));
  const leader = byStrength[0];
  const id = `p${state.turn}-${a}-${(state.proposals?.length ?? 0) + 1}`;
  if (leader !== a && strength(state, leader) > strength(state, a)) {
    const partner = others.find((x) => x !== leader && !pacted.has(x));
    if (!partner) return null;
    const text = pick(rng, [
      `The ${allianceName(leader)} alliance grows too strong. Join us against them for two turns?`,
      `Let us settle our quarrel later. For two turns, we both march on the ${allianceName(leader)}.`,
      `The ${allianceName(leader)} will swallow us one at a time. Strike them with us?`,
    ]);
    return { kind: 'say', playerId: pid, to: { kind: 'diplomacy', allianceIds: [a, partner] }, text, intent: { kind: 'propose', proposalId: id, pact: 'joint', targetAllianceId: leader, turns: 2 } };
  }
  // the leader (or an alliance level with it) seeks a truce with its most dangerous neighbour
  const threat = (x: AllianceId) => {
    let n = 0;
    for (const u of Object.values(state.units)) {
      if (u.kind !== 'soldier' || allianceOf(state, u.ownerId) !== x) continue;
      for (const t of Object.values(state.tiles)) if (t.city?.ownerId && allianceOf(state, t.city.ownerId) === a && hexDistance(state.tiles[u.tileId], t) <= 2) n++;
    }
    return n;
  };
  const rival = others.filter((x) => !pacted.has(x)).sort((x, y) => threat(y) - threat(x))[0];
  if (!rival || nextFloat(rng) < 0.5) return null;
  const text = pick(rng, [
    `Our quarrel profits no one. A truce for two turns?`,
    `Peace between us for two turns, and let the others bleed.`,
    `Hold your soldiers back from our cities and we will hold ours from yours. Two turns?`,
  ]);
  return { kind: 'say', playerId: pid, to: { kind: 'diplomacy', allianceIds: [a, rival] }, text, intent: { kind: 'propose', proposalId: id, pact: 'truce', turns: 2 } };
}

function answer(state: GameState, a: AllianceId, prop: Proposal, rng: RngState, pid: PlayerId): Action {
  const mine = strength(state, a);
  let accept: boolean;
  if (prop.pact === 'joint') {
    const target = prop.targetAllianceId!;
    accept = !trucePartners(state, a).includes(target) && strength(state, target) >= mine;
  } else {
    // a truce is worth having with someone at least as strong; with the weak, only sometimes
    const theirs = strength(state, prop.from);
    accept = theirs >= mine * 1.1 || nextFloat(rng) < 0.3;
  }
  const text = accept
    ? pick(rng, prop.pact === 'joint' ? ['Agreed. Together, then.', 'We march with you.', 'Done. May the Fates favour us both.'] : ['Agreed. Keep your word and we will keep ours.', 'A truce, then.', 'Peace, for now.'])
    : pick(rng, ['We decline.', 'Not this time.', 'You mistake us for fools.', 'Our answer is no.']);
  return { kind: 'say', playerId: pid, to: { kind: 'diplomacy', allianceIds: [prop.from, a] }, text, intent: { kind: 'reply', proposalId: prop.id, accept } };
}

/** A line of public table talk about what happened to this leader lately, or a little banter. */
function tableTalk(state: GameState, pid: PlayerId, rng: RngState): string | null {
  const me = state.players[pid];
  const recent = state.log.filter((e) => e.turn >= state.turn - 1);
  const a = me.allianceId!;
  const betrayed = (state.pacts ?? []).find((p) => p.broken && p.broken.turn >= state.turn - 1 && p.broken.byAllianceId && p.broken.byAllianceId !== a && p.allianceIds.includes(a));
  if (betrayed) return pick(rng, [`So much for the word of the ${allianceName(betrayed.broken!.byAllianceId!)} alliance.`, `Remember this betrayal, all of you.`, `A truce is only as good as the ${allianceName(betrayed.broken!.byAllianceId!)} General's memory.`]);
  for (let i = recent.length - 1; i >= 0; i--) {
    const t = recent[i].text;
    const lost = t.match(/^(.*) is conquered from (.*) and assigned to (.*)\.$/);
    if (lost && lost[2].startsWith(me.leaderName)) return pick(rng, [`${lost[1]} will be ours again before the Fates are done.`, `Enjoy ${lost[1]} while you can.`, `A setback. ${lost[1]} remembers its true masters.`]);
    if (lost && lost[3].startsWith(me.leaderName)) return pick(rng, [`${lost[1]} flies our colours now.`, `Who is next after ${lost[1]}?`, `${lost[1]} welcomed us with open gates. Mostly.`]);
    const taken = t.match(/^(.*) is taken and assigned to (.*)\.$/);
    if (taken && taken[2].startsWith(me.leaderName)) return pick(rng, [`${taken[1]} is ours. It was only a matter of time.`, `A fine morning in ${taken[1]}.`]);
    if (t.includes(`${me.leaderName}`) && t.includes('is elected General')) return pick(rng, ['The alliance has chosen wisely.', 'I will not waste this mandate.']);
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
 * The runner asks again after each message, so a bot answers proposals first,
 * then (as General, during allocation) names the turn's target and sometimes
 * proposes a pact, then may add one public line per turn.
 */
export function botSays(state: GameState, pid: PlayerId): Action | null {
  const me = state.players[pid];
  const a = me?.allianceId;
  if (!a || state.phase === 'setup' || state.phase === 'gameOver') return null;
  const rng = talkRng(state, pid);
  const mineThisTurn = (pred: (m: Message) => boolean) => (state.messages ?? []).some((m) => m.turn === state.turn && m.fromId === pid && pred(m));
  const general = isGeneralOf(state, pid);
  if (general) {
    const prop = openProposals(state, general)[0];
    if (prop) return answer(state, general, prop, rng, pid);
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
      const prop = proposalFor(state, general, rng, pid);
      if (prop) return prop;
    }
  }
  if ((state.phase === 'allocation' || state.phase === 'politics') && !mineThisTurn((m) => m.to.kind === 'all') && nextFloat(rng) < 0.3) {
    const text = tableTalk(state, pid, rng);
    if (text) return { kind: 'say', playerId: pid, to: { kind: 'all' }, text };
  }
  return null;
}

export { speaker };
