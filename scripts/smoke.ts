import { runBotGame, SimulationError } from '../src/bots/runner';

const seed = Number(process.argv[2] ?? 1);
const players = Number(process.argv[3] ?? 5);
try {
  const t0 = Date.now();
  const s = runBotGame(seed, players, { checkInvariants: true });
  console.log(`seed ${seed} players ${players}: turns ${s.turn}, actions ${s.actionLog.length}, log ${s.log.length}, ${Date.now() - t0}ms`);
  console.log('winner', s.result?.winnerId, 'ranking', s.result?.ranking.join(','));
  const tail = s.log.slice(-12).map((l) => `[${l.turn}] ${l.text}`).join('\n');
  console.log(tail);
} catch (e) {
  if (e instanceof SimulationError) {
    console.error(e.message);
  } else throw e;
  process.exit(1);
}
