/**
 * Reconciliation, politics, elections, end of game and scoring (milestone 4).
 */
import { rollD6, nextInt } from './rng';
import { RAW_MATERIALS } from './types';
import type { Action, AllianceId, GameState, PendingDecision, PlayerId, ScoreLine, Task } from './types';
import { cardName, discardFromHand, drawCard, label, log, popTask, pushFront, reactionCandidates, removeUnit, require, sinkUnmannedShipsAtSea, tLabel } from './core';
import { END_GAME_TOTAL, FOOD_PER_WHEAT, allianceName, allianceOf, cityCount, citiesOf, foodCapOf, membersOf, soldiersToFeed, tile } from './query';
import { sequentialOrder } from './rules/turnOrder';
import { electGeneral, playedValue } from './rules/politics';
import { compareScoreLines, computeScores, rankScoreLines, tiedAtTop } from './rules/scoring';
import { taskZeusWindow } from './flowMilitary';

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

function taskReconcile(state: GameState): void {
  popTask(state);
  state.phase = 'reconciliation';
  log(state, 'turn', 'Reconciliation: the harvest is gathered and the army is fed.', { banner: true });
  const gained: Record<PlayerId, { food: number; raw: number }> = {};
  for (const pid of state.seatOrder) gained[pid] = { food: 0, raw: 0 };
  for (const u of Object.values(state.units)) {
    if (u.kind !== 'farmer') continue;
    const t = tile(state, u.tileId);
    if (t.resources.includes('wheat')) gained[u.ownerId].food += FOOD_PER_WHEAT;
    if (t.resources.some((r) => RAW_MATERIALS.includes(r))) gained[u.ownerId].raw += 1;
    removeUnit(state, u.id); // ruling 12 / decision 66
  }
  for (const pid of state.seatOrder) {
    const g = gained[pid];
    state.players[pid].food += g.food;
    state.players[pid].raw += g.raw;
    log(state, 'reconcile', `${label(state, pid)} harvests ${g.food} food and ${g.raw} raw material(s); stocks now ${state.players[pid].food} food, ${state.players[pid].raw} raw.`);
  }
  pushFront(state, { kind: 'feeding', order: sequentialOrder(state), idx: 0 });
}

function taskFeeding(state: GameState, task: Extract<Task, { kind: 'feeding' }>): void {
  while (task.idx < task.order.length) {
    const pid = task.order[task.idx];
    const p = state.players[pid];
    const toFeed = soldiersToFeed(state, pid);
    const soldiers = toFeed.length;
    if (soldiers <= p.food) {
      p.food -= soldiers;
      if (soldiers > 0) log(state, 'reconcile', `${label(state, pid)} feeds ${soldiers} soldier(s); ${p.food} food remain.`);
      task.idx += 1;
      continue;
    }
    const candidates = toFeed.map((u) => u.id).sort();
    state.pending = { kind: 'disband', playerId: pid, shortfall: soldiers - p.food, candidates };
    return;
  }
  popTask(state);
  spoilFood(state);
}

/** House rule (decision 107): food stored beyond what a leader's cities can hold spoils once the army is fed. */
function spoilFood(state: GameState): void {
  for (const pid of state.seatOrder) {
    const p = state.players[pid];
    const cap = foodCapOf(state, pid);
    if (cap !== null && p.food > cap) {
      const n = cityCount(state, pid);
      log(state, 'reconcile', `${p.food - cap} of ${label(state, pid)}'s food spoils in the granaries; ${n} cit${n === 1 ? 'y stores' : 'ies store'} at most ${cap}.`);
      p.food = cap;
    }
  }
}

function actionDisband(state: GameState, action: Extract<Action, { kind: 'disband' }>, pending: Extract<PendingDecision, { kind: 'disband' }>): void {
  require(pending.candidates.includes(action.unitId), `${action.unitId} is not one of your soldiers`);
  const u = removeUnit(state, action.unitId)!;
  log(state, 'reconcile', `${label(state, action.playerId)} cannot feed a soldier on ${tLabel(state, u.tileId)}; it is disbanded.`);
  sinkUnmannedShipsAtSea(state);
}

// ---------------------------------------------------------------------------
// Politics
// ---------------------------------------------------------------------------

function taskPoliticsPlay(state: GameState, task: Extract<Task, { kind: 'politicsPlay' }>): void {
  if (state.phase !== 'politics') {
    state.phase = 'politics';
    log(state, 'turn', 'Politics: the vicious arts begin. Each leader fills their PLAY envelope in private.', { banner: true });
  }
  if (!state.turnData.politics || state.turnData.politics.round !== task.round) {
    state.turnData.politics = { round: task.round, played: {}, revealed: false, scores: {}, appleInvokedBy: null };
  }
  while (task.remaining.length > 0) {
    const pid = task.remaining[0];
    const hand = state.players[pid].hand;
    if (hand.length === 0) {
      log(state, 'politics', `${label(state, pid)} has no cards to play (decision 67).`);
      state.turnData.politics.played[pid] = [];
      task.remaining.shift();
      continue;
    }
    state.pending = { kind: 'playCards', playerId: pid, hand: [...hand], round: task.round };
    return;
  }
  popTask(state);
  pushFront(state, { kind: 'politicsReveal', round: task.round });
}

function actionPlayCards(state: GameState, action: Extract<Action, { kind: 'playCards' }>, _pending: Extract<PendingDecision, { kind: 'playCards' }>): void {
  require(action.cardUids.length >= 1, 'You must play at least one card');
  require(new Set(action.cardUids).size === action.cardUids.length, 'Each card may be played once');
  const hand = state.players[action.playerId].hand;
  for (const uid of action.cardUids) require(hand.includes(uid), `You do not hold card ${uid}`);
  for (const uid of action.cardUids) hand.splice(hand.indexOf(uid), 1);
  state.turnData.politics!.played[action.playerId] = [...action.cardUids];
  log(state, 'politics', `${label(state, action.playerId)} seals ${action.cardUids.length} card(s) in the PLAY envelope.`);
  const task = state.tasks[0] as Extract<Task, { kind: 'politicsPlay' }>;
  task.remaining.shift();
}

function taskPoliticsReveal(state: GameState, task: Extract<Task, { kind: 'politicsReveal' }>): void {
  popTask(state);
  const round = state.turnData.politics!;
  round.revealed = true;
  const revealData: Record<string, { type: string; name: string; value: number }[]> = {};
  for (const a of state.allianceOrder) {
    for (const pid of membersOf(state, a)) {
      const cards = round.played[pid] ?? [];
      round.scores[pid] = playedValue(state, cards);
      const names = cards.map((uid) => `${cardName(state.cards[uid].type)} (${playedValue(state, [uid])})`);
      revealData[pid] = cards.map((uid) => ({ type: state.cards[uid].type, name: cardName(state.cards[uid].type), value: playedValue(state, [uid]) }));
      log(state, 'politics', `${label(state, pid)} reveals: ${names.join(', ') || 'nothing'} = ${round.scores[pid]}.`, { reveal: true, playerId: pid });
      state.discard.push(...cards);
    }
  }
  state.turnData.lastReveal = { ...round, played: { ...round.played }, scores: { ...round.scores } };
  const apples = sequentialOrder(state).filter((pid) => (round.played[pid] ?? []).some((uid) => state.cards[uid].type === 'apple'));
  pushFront(state, { kind: 'appleWindow', remaining: apples, round: task.round });
}

function taskAppleWindow(state: GameState, task: Extract<Task, { kind: 'appleWindow' }>): void {
  if (task.remaining.length === 0) {
    popTask(state);
    const round = state.turnData.politics!;
    const phils = sequentialOrder(state).filter((pid) => (round.played[pid] ?? []).some((uid) => state.cards[uid].type === 'philosophers'));
    const limit: Task[] = state.config.handLimit ? [{ kind: 'handLimit', remaining: sequentialOrder(state) }] : [];
    pushFront(state, { kind: 'philosophers', remaining: phils }, { kind: 'elect' }, ...limit, { kind: 'endTurn' });
    return;
  }
  state.pending = { kind: 'invokeApple', playerId: task.remaining[0] };
}

function actionInvokeApple(state: GameState, action: Extract<Action, { kind: 'invokeApple' }>): void {
  const task = state.tasks[0] as Extract<Task, { kind: 'appleWindow' }>;
  if (!action.invoke) {
    log(state, 'card', `${label(state, action.playerId)} lets the Apple of Discord lie.`);
    task.remaining.shift();
    return;
  }
  popTask(state);
  state.turnData.politics!.appleInvokedBy = action.playerId;
  log(state, 'card', `${label(state, action.playerId)} invokes the Apple of Discord! All played cards stay spent; every leader draws one card and politics is replayed.`, { card: 'apple' });
  for (const pid of state.seatOrder) drawCard(state, pid);
  pushFront(state, { kind: 'politicsPlay', remaining: [...state.seatOrder], round: task.round + 1 });
}

function philosopherTargets(state: GameState, pid: PlayerId): { partnerId: PlayerId; cityTileIds: string[] }[] {
  const a = allianceOf(state, pid);
  return membersOf(state, a)
    .filter((m) => m !== pid && cityCount(state, m) >= 2)
    .map((m) => ({ partnerId: m, cityTileIds: citiesOf(state, m).map((t) => t.id) }));
}

function taskPhilosophers(state: GameState, task: Extract<Task, { kind: 'philosophers' }>): void {
  while (task.remaining.length > 0) {
    const pid = task.remaining[0];
    const targets = philosopherTargets(state, pid);
    if (targets.length === 0) {
      log(state, 'card', `${label(state, pid)} played Attacked by Philosophers, but no alliance partner holds two cities; it has no effect.`);
      task.remaining.shift();
      continue;
    }
    state.pending = { kind: 'philosophersTarget', playerId: pid, targets };
    return;
  }
  popTask(state);
}

function actionPhilosophersTarget(state: GameState, action: Extract<Action, { kind: 'philosophersTarget' }>, pending: Extract<PendingDecision, { kind: 'philosophersTarget' }>): void {
  const t = pending.targets.find((x) => x.partnerId === action.partnerId);
  require(t, `${action.partnerId} is not a valid target`);
  require(t.cityTileIds.includes(action.cityTileId), `${action.cityTileId} is not a city of ${action.partnerId}`);
  log(state, 'card', `${label(state, action.playerId)} sets the philosophers upon ${label(state, action.partnerId)}, coveting ${tLabel(state, action.cityTileId)}.`, { card: 'philosophers' });
  const task = state.tasks[0] as Extract<Task, { kind: 'philosophers' }>;
  task.remaining.shift();
  const others = [action.partnerId, ...sequentialOrder(state).filter((p) => p !== action.playerId && p !== action.partnerId)];
  pushFront(state, {
    kind: 'zeusWindow',
    target: 'philosophers',
    cardPlayerId: action.playerId,
    remaining: reactionCandidates(state, others, 'zeus', false),
    cancelled: false,
    victimId: action.partnerId,
    effect: { kind: 'philosophersRoll', cardPlayerId: action.playerId, partnerId: action.partnerId, cityTileId: action.cityTileId },
  });
}

function taskPhilosophersRoll(state: GameState, task: Extract<Task, { kind: 'philosophersRoll' }>): void {
  popTask(state);
  const roll = rollD6(state.rng);
  const c = tile(state, task.cityTileId).city!;
  if (roll % 2 === 0) {
    c.ownerId = task.cardPlayerId;
    log(state, 'card', `The philosophers roll a ${roll}: even! ${c.name} passes from ${label(state, task.partnerId)} to ${label(state, task.cardPlayerId)}.`, { dice: [roll] });
  } else {
    const p = state.players[task.cardPlayerId];
    const n = p.hand.length;
    for (const uid of [...p.hand]) discardFromHand(state, task.cardPlayerId, uid);
    log(state, 'card', `The philosophers roll a ${roll}: odd. ${label(state, task.cardPlayerId)} is refuted and discards ${n} remaining card(s).`, { dice: [roll] });
  }
}

function taskElect(state: GameState): void {
  popTask(state);
  const round = state.turnData.politics!;
  for (const a of state.allianceOrder) {
    const members = membersOf(state, a);
    if (members.length <= 1) continue;
    const scores: Record<PlayerId, number> = {};
    for (const m of members) if (round.played[m] !== undefined) scores[m] = round.scores[m] ?? 0;
    const { winner, reason } = electGeneral(state, a, scores);
    const prev = state.alliances[a].generalId;
    state.alliances[a].generalId = winner;
    log(state, 'election', `${allianceName(a)} alliance: ${label(state, winner)} ${winner === prev ? 'remains' : 'is elected'} General (${reason}).`, { allianceId: a, generalId: winner });
  }
}

// ---------------------------------------------------------------------------
// End of turn, end of game, scoring
// ---------------------------------------------------------------------------

/** House rule (decision 108): at the end of the turn every leader over the hand limit discards down to it. */
function taskHandLimit(state: GameState, task: Extract<Task, { kind: 'handLimit' }>): void {
  const limit = state.config.handLimit ?? 0;
  while (task.remaining.length > 0) {
    const pid = task.remaining[0];
    const hand = state.players[pid].hand;
    if (limit > 0 && hand.length > limit) {
      state.pending = { kind: 'discardDown', playerId: pid, hand: [...hand], count: hand.length - limit, limit };
      return;
    }
    task.remaining.shift();
  }
  popTask(state);
}

function actionDiscardDown(state: GameState, action: Extract<Action, { kind: 'discardDown' }>, pending: Extract<PendingDecision, { kind: 'discardDown' }>): void {
  require(action.cardUids.length === pending.count, `Discard exactly ${pending.count} card(s)`);
  require(new Set(action.cardUids).size === action.cardUids.length, 'Each card may be discarded once');
  for (const uid of action.cardUids) discardFromHand(state, action.playerId, uid);
  log(state, 'politics', `${label(state, action.playerId)} discards ${pending.count} card(s) to keep to the hand limit of ${pending.limit}.`);
  const task = state.tasks[0] as Extract<Task, { kind: 'handLimit' }>;
  task.remaining.shift();
}

function taskEndTurn(state: GameState): void {
  popTask(state);
  const roll = rollD6(state.rng);
  state.endTotal += roll;
  log(state, 'endgame', `The Fates roll a ${roll}; the running total is ${state.endTotal} of ${END_GAME_TOTAL}.`, { dice: [roll], endTotal: state.endTotal });
  if (state.endTotal >= END_GAME_TOTAL) {
    pushFront(state, { kind: 'gameOver' });
    return;
  }
  if (state.config.maxTurns && state.turn >= state.config.maxTurns) {
    log(state, 'system', `Safety cap of ${state.config.maxTurns} turns reached; the game ends early.`);
    pushFront(state, { kind: 'gameOver' });
    return;
  }
  pushFront(state, { kind: 'startTurn' });
}

function taskGameOver(state: GameState): void {
  popTask(state);
  state.phase = 'gameOver';
  state.tasks = [];
  const scores = computeScores(state);
  for (const s of rankScoreLines(scores)) {
    log(state, 'endgame', `${label(state, s.playerId)}: ${s.cityPoints} city points${s.isGeneral ? ' + 2 for the Generalship' : ''} = ${s.total} (cards in hand worth ${s.cardValue}).`);
  }
  const tied = tiedAtTop(scores);
  if (tied.length > 1) {
    const voters = state.seatOrder.filter((p) => !tied.includes(p) && !state.players[p].isBot);
    log(state, 'endgame', `${tied.map((p) => label(state, p)).join(' and ')} are tied even after counting Generalships and cards. A Sing-Off shall decide it!`, { singOff: tied });
    pushFront(state, { kind: 'singOff', tiedPlayerIds: tied, voters, idx: 0, votes: {} });
    return;
  }
  finalize(state, scores, null);
}

function taskSingOff(state: GameState, task: Extract<Task, { kind: 'singOff' }>): void {
  if (task.idx < task.voters.length) {
    state.pending = { kind: 'singOffVote', playerId: task.voters[task.idx], tiedPlayerIds: task.tiedPlayerIds };
    return;
  }
  popTask(state);
  const tally: Record<PlayerId, number> = {};
  for (const v of Object.values(task.votes)) tally[v] = (tally[v] ?? 0) + 1;
  let winner: PlayerId;
  let random = false;
  if (Object.keys(task.votes).length === 0) {
    winner = task.tiedPlayerIds[nextInt(state.rng, task.tiedPlayerIds.length)];
    random = true;
    log(state, 'endgame', `No mortal judge remains to hear the songs; the Muses choose ${label(state, winner)} at random.`);
  } else {
    let best = -1;
    winner = task.tiedPlayerIds[0];
    for (const p of task.tiedPlayerIds) {
      const n = tally[p] ?? 0;
      if (n > best) {
        best = n;
        winner = p;
      }
    }
    log(state, 'endgame', `The judges have spoken: ${label(state, winner)} wins the Sing-Off with ${best} vote(s).`);
  }
  finalize(state, computeScores(state), { tiedPlayerIds: task.tiedPlayerIds, votes: task.votes, winnerId: winner, random });
}

function actionSingOffVote(state: GameState, action: Extract<Action, { kind: 'singOffVote' }>, pending: Extract<PendingDecision, { kind: 'singOffVote' }>): void {
  require(pending.tiedPlayerIds.includes(action.votedFor), `${action.votedFor} is not singing`);
  const task = state.tasks[0] as Extract<Task, { kind: 'singOff' }>;
  task.votes[action.playerId] = action.votedFor;
  log(state, 'endgame', `${label(state, action.playerId)} votes for the song of ${label(state, action.votedFor)}.`);
  task.idx += 1;
}

function finalize(state: GameState, scores: ScoreLine[], singOff: { tiedPlayerIds: PlayerId[]; votes: Record<PlayerId, PlayerId>; winnerId: PlayerId; random: boolean } | null): void {
  let ranked = rankScoreLines(scores).map((s) => s.playerId);
  if (singOff) {
    ranked = [singOff.winnerId, ...ranked.filter((p) => p !== singOff.winnerId)];
  }
  // last place: lowest by the same comparison, last seat among full ties (decision 75)
  const byLine = new Map(scores.map((s) => [s.playerId, s]));
  const worst = [...scores].sort((a, b) => -compareScoreLines(a, b));
  const loserLine = worst[0];
  const tiedAtBottom = worst.filter((s) => compareScoreLines(s, loserLine) === 0);
  const loserId = tiedAtBottom[tiedAtBottom.length - 1].playerId;
  const winnerId = ranked[0];
  let tiebreakNote = '';
  const second = ranked[1] ? byLine.get(ranked[1])! : null;
  const first = byLine.get(winnerId)!;
  if (second && first.total === second.total) {
    if (singOff) tiebreakNote = singOff.random ? 'decided by a Sing-Off judged at random' : 'decided by a Sing-Off';
    else if (first.isGeneral && !second.isGeneral) tiebreakNote = 'decided by holding a Generalship';
    else tiebreakNote = 'decided by the value of cards remaining in hand';
  }
  state.result = { ranking: ranked, scores, winnerId, loserId, singOff, tiebreakNote };
  log(state, 'endgame', `${label(state, winnerId)} is crowned the greatest leader of the age${tiebreakNote ? ` (${tiebreakNote})` : ''}. Let the people down to the latest generation mock ${label(state, loserId)}.`, { banner: true, winnerId, loserId });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function handlePoliticsTask(state: GameState, task: Task): boolean {
  switch (task.kind) {
    case 'reconcile':
      taskReconcile(state);
      return true;
    case 'feeding':
      taskFeeding(state, task);
      return true;
    case 'politicsPlay':
      taskPoliticsPlay(state, task);
      return true;
    case 'politicsReveal':
      taskPoliticsReveal(state, task);
      return true;
    case 'appleWindow':
      taskAppleWindow(state, task);
      return true;
    case 'philosophers':
      taskPhilosophers(state, task);
      return true;
    case 'philosophersRoll':
      taskPhilosophersRoll(state, task);
      return true;
    case 'zeusWindow':
      taskZeusWindow(state, task);
      return true;
    case 'elect':
      taskElect(state);
      return true;
    case 'endTurn':
      taskEndTurn(state);
      return true;
    case 'handLimit':
      taskHandLimit(state, task);
      return true;
    case 'gameOver':
      taskGameOver(state);
      return true;
    case 'singOff':
      taskSingOff(state, task);
      return true;
    default:
      return false;
  }
}

export function handlePoliticsAction(state: GameState, action: Action, pending: PendingDecision): boolean {
  switch (action.kind) {
    case 'disband':
      actionDisband(state, action, pending as Extract<PendingDecision, { kind: 'disband' }>);
      return true;
    case 'playCards':
      actionPlayCards(state, action, pending as Extract<PendingDecision, { kind: 'playCards' }>);
      return true;
    case 'discardDown':
      actionDiscardDown(state, action, pending as Extract<PendingDecision, { kind: 'discardDown' }>);
      return true;
    case 'invokeApple':
      actionInvokeApple(state, action);
      return true;
    case 'philosophersTarget':
      actionPhilosophersTarget(state, action, pending as Extract<PendingDecision, { kind: 'philosophersTarget' }>);
      return true;
    case 'singOffVote':
      actionSingOffVote(state, action, pending as Extract<PendingDecision, { kind: 'singOffVote' }>);
      return true;
    default:
      return false;
  }
}

export type { AllianceId };
