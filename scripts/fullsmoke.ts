import { runBotGame, SimulationError } from '../src/bots/runner';
import { validateTiles } from '../src/engine/map';
for (const seed of [1, 2, 3]) {
  const players = 3 + (seed % 7);
  try {
    const s = runBotGame(seed, players, { checkInvariants: true, config: { setupMode: 'full' } });
    validateTiles(s.tiles, 'full');
    const cities = Object.values(s.tiles).filter((t) => t.city).length;
    console.log(`seed ${seed} players ${players}: tiles ${Object.keys(s.tiles).length}, cities ${cities}, turns ${s.turn}, actions ${s.actionLog.length}, discarded ${s.fullSetup?.discarded.length}`);
    console.log(s.log.filter((l) => l.text.includes('board is complete') || l.text.includes('granted')).map((l) => l.text).join('\n'));
  } catch (e) {
    console.error(e instanceof SimulationError ? e.message : (e as Error).stack);
  }
}
