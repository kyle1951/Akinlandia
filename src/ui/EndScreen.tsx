import type { GameState } from '../engine/types';
import { allianceName } from '../engine/query';
import { PlayerSwatch } from './SidePanel';

const MOCKERY = [
  'Herodotus will record the deeds of the great; the deeds of {name} will be recorded in the margins, in pencil.',
  'Let the people down to the latest generation mock {name}, and let them do it in verse.',
  '{name} came, saw, and was politely asked to leave.',
  'The philosophers agree: {name} governed with the wisdom of a wet sandal.',
  'Somewhere, a statue of {name} is being quietly repurposed as a birdbath.',
];

export function EndScreen({ game, onNewGame, onClose }: { game: GameState; onNewGame: () => void; onClose: () => void }) {
  const r = game.result!;
  const winner = game.players[r.winnerId];
  const loser = game.players[r.loserId];
  const mock = MOCKERY[(game.rng.seed + game.turn) % MOCKERY.length].replace('{name}', loser.leaderName);
  const lineOf = (pid: string) => r.scores.find((s) => s.playerId === pid)!;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 720 }}>
        <h2>The Age Concludes</h2>
        <p>
          <b>{winner.leaderName}</b> of the {winner.allianceId ? allianceName(winner.allianceId) : ''} alliance is crowned the greatest leader of the age
          {r.tiebreakNote ? `, ${r.tiebreakNote}` : ''}. "Neither the deeds of men may be forgotten by lapse of time, nor the works great and marvelous may lose their renown."
        </p>
        {r.singOff && (
          <p>
            A Sing-Off between {r.singOff.tiedPlayerIds.map((p) => game.players[p].leaderName).join(' and ')} was {r.singOff.random ? 'judged at random by the Muses, no mortal being available' : 'judged by the assembled leaders'}; {game.players[r.singOff.winnerId].leaderName} sang best.
          </p>
        )}
        <table className="final-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Leader</th>
              <th>City points</th>
              <th>General</th>
              <th>Total</th>
              <th>Cards in hand</th>
            </tr>
          </thead>
          <tbody>
            {r.ranking.map((pid, i) => {
              const l = lineOf(pid);
              const p = game.players[pid];
              return (
                <tr key={pid} className={pid === r.winnerId ? 'winner' : pid === r.loserId ? 'loser' : ''}>
                  <td>{i + 1}</td>
                  <td>
                    <PlayerSwatch game={game} pid={pid} /> {p.leaderName}
                  </td>
                  <td>{l.cityPoints}</td>
                  <td>{l.isGeneral ? '+2' : ''}</td>
                  <td>{l.total}</td>
                  <td>{l.cardValue}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ fontStyle: 'italic', color: 'var(--crimson)' }}>{mock}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" onClick={onNewGame}>
            Begin a new age
          </button>
          <button onClick={onClose}>Study the board</button>
        </div>
      </div>
    </div>
  );
}
