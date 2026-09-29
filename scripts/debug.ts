import { runBotGame, SimulationError } from '../src/bots/runner';
import { unitsOnTile } from '../src/engine/query';

const seed = Number(process.argv[2] ?? 4);
const players = 3 + (seed % 7);
// the simulation test plays odd seeds with simultaneous orders (decision 109)
const config = { militaryMode: seed % 2 ? ('simultaneous' as const) : ('sequential' as const) };
const tileOfInterest = process.argv[3];
try {
  runBotGame(seed, players, { checkInvariants: true, config });
} catch (e) {
  if (e instanceof SimulationError) {
    console.error(e.message.split('\n')[0]);
    // rerun without invariant checks up to the failing action to inspect
    const idx = e.actionIndex;
    const s = runBotGame(seed, players, { maxActions: idx + 1, stopAtMax: true, config });
    console.log('phase', s.phase, 'sub', s.turnData.subPhase, 'pending', JSON.stringify(s.pending)?.slice(0, 300));
    console.log('last actions:', JSON.stringify(s.actionLog.slice(-4)));
    console.log('tasks:', s.tasks.slice(0, 5).map((t) => t.kind).join(','));
    console.log(s.log.slice(-25).map((l) => `[${l.turn}/${l.category}] ${l.text}`).join('\n'));
    if (tileOfInterest) console.log('units on tile', JSON.stringify(unitsOnTile(s, tileOfInterest)));
  } else throw e;
}
