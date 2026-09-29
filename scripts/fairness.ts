/**
 * Empirical fairness check: run all-bot 9-player games on a map and report,
 * per faction slot, the average final score and the share of games won.
 *
 * usage: npx vite-node scripts/fairness.ts <mapId> [games] [startSeed]
 */
import { readFileSync } from 'fs';
import { runBotGame } from '../src/bots/runner';
import { MAPS } from '../src/data/quickstartMap';

const mapId = process.argv[2] ?? 'table2026';
const GAMES = Number(process.argv[3] ?? 200);
const START = Number(process.argv[4] ?? 1000);
// optional: a JSON file {"q,r": "white-purple", ...} replacing the map's starting slots
const override = process.argv[5];
if (override) {
  const slots = JSON.parse(readFileSync(override, 'utf-8')) as Record<string, string>;
  for (const t of MAPS[mapId].spec.tiles) {
    if (!t.city) continue;
    t.city = { ...t.city, slot: slots[`${t.q},${t.r}`] ?? 'neutral' };
  }
}

const score: Record<string, number[]> = {};
const wins: Record<string, number> = {};
const allianceWins: Record<string, number> = { white: 0, black: 0, green: 0 };
for (let g = 0; g < GAMES; g++) {
  const s = runBotGame(START + g, 9, { config: { mapId } });
  const r = s.result!;
  for (const line of r.scores) {
    const f = s.players[line.playerId].factionId!;
    (score[f] ??= []).push(line.total);
  }
  const wf = s.players[r.winnerId].factionId!;
  wins[wf] = (wins[wf] ?? 0) + 1;
  allianceWins[s.players[r.winnerId].allianceId!]++;
}
const order = ['white-purple', 'white-crimson', 'white-azure', 'black-purple', 'black-orange', 'black-gold', 'green-purple', 'green-rose', 'green-teal'];
const rows = order.map((f) => {
  const xs = score[f] ?? [];
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return { faction: f, meanScore: +mean.toFixed(2), winPct: +((100 * (wins[f] ?? 0)) / GAMES).toFixed(1) };
});
const means = rows.map((r) => r.meanScore);
const wp = rows.map((r) => r.winPct);
console.log(JSON.stringify({ mapId, games: GAMES, rows, meanScoreRange: [Math.min(...means), Math.max(...means)], winPctRange: [Math.min(...wp), Math.max(...wp)], allianceWinPct: Object.fromEntries(Object.entries(allianceWins).map(([k, v]) => [k, +((100 * v) / GAMES).toFixed(1)])) }, null, 1));
