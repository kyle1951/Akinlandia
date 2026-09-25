import { runBotGame } from '../src/bots/runner';
const s = runBotGame(Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 5));
const lines = s.log.filter((l) => l.category === 'reconcile' || l.category === 'allocation' && l.text.includes('allocated')).slice(0, 40);
console.log(lines.map((l) => `[${l.turn}] ${l.text}`).join('\n'));
