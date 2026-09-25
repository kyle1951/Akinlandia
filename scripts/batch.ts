import { runBotGame, SimulationError } from '../src/bots/runner';

const count = Number(process.argv[2] ?? 30);
const start = Number(process.argv[3] ?? 1);
const stats: Record<string, number> = {};
const bump = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);
let failures = 0;
const t0 = Date.now();
for (let i = 0; i < count; i++) {
  const seed = start + i;
  const players = 3 + (seed % 7);
  try {
    const s = runBotGame(seed, players, { checkInvariants: true });
    bump('games');
    bump('turns', s.turn);
    bump('actions', s.actionLog.length);
    for (const l of s.log) {
      if (l.category === 'combat' && l.text.startsWith('Battle for')) bump('combats');
      if (l.text.includes('retreats')) bump('retreats');
      if (l.text.includes('captured and reflagged')) bump('shipCaptures');
      if (l.text.includes('is conquered')) bump('conquests');
      if (l.text.includes('is taken and assigned')) bump('neutralTaken');
      if (l.text.includes('plays Rage')) bump('rage');
      if (l.text.includes('Trojan Horse upon')) bump('trojan');
      if (l.text.includes('Lightning Bolt')) bump('zeus');
      if (l.text.includes('invokes the Apple')) bump('apple');
      if (l.text.includes('sets the philosophers')) bump('philosophers');
      if (l.text.includes('is disbanded')) bump('disband');
      if (l.text.includes('Sing-Off')) bump('singoff');
      if (l.text.includes('lost at sea')) bump('sunk');
      if (l.text.includes('no line of retreat')) bump('noRetreat');
      if (l.text.includes('rises to Level')) bump('levelUp');
      if (l.text.includes('Temple is raised') || l.text.includes('University is founded')) bump('l3improve');
      if (l.text.includes('retreats by sea')) bump('seaRetreat');
      if (l.text.includes('all spent and cannot mount')) bump('spentOnly');
      if (l.text.includes('reshuffled')) bump('reshuffle');
    }
    if (s.result?.singOff) bump('singoffResult');
  } catch (e) {
    failures++;
    console.error(e instanceof SimulationError ? e.message : (e as Error).stack);
    if (failures > 5) break;
  }
}
console.log(JSON.stringify(stats), `${Date.now() - t0}ms, failures ${failures}`);
