import { useEffect, useRef } from 'react';
import type { GameState, LogEntry, PlayerId } from '../engine/types';
import { END_GAME_TOTAL, allianceName, capacityOf, cityCount, isGeneral, scoreOf } from '../engine/query';
import { subPhaseName } from '../engine/flowMilitary';
import { ALLIANCE_COLORS } from '../data/factions';

export function PlayerSwatch({ game, pid }: { game: GameState; pid: PlayerId }) {
  const p = game.players[pid];
  const f = p.factionId ? game.factions[p.factionId] : null;
  return <span className="swatch" style={{ background: f?.color ?? '#999', borderColor: p.allianceId ? ALLIANCE_COLORS[p.allianceId] : '#000' }} title={f ? `${allianceName(f.allianceId)} ${f.name}` : ''} />;
}

export function StatusPanel({ game }: { game: GameState }) {
  const phaseName: Record<string, string> = {
    setup: 'Setup',
    allocation: 'Allocation',
    deployment: 'Deployment',
    military: 'Military movement and combat',
    reconciliation: 'Reconciliation',
    politics: 'Politics',
    gameOver: 'The game is over',
  };
  return (
    <div className="panel">
      <h3>
        Turn {game.turn} · {phaseName[game.phase]}
        {game.turnData.subPhase ? ` · ${subPhaseName(game.turnData.subPhase)}` : ''}
      </h3>
      <div>
        Alliance order:{' '}
        {game.allianceOrder.length
          ? game.allianceOrder.map((a, i) => (
              <span key={a}>
                {i > 0 && ' › '}
                <span className="chip" style={{ background: ALLIANCE_COLORS[a], color: a === 'black' ? '#fff' : '#111' }}>
                  {allianceName(a)}
                </span>
              </span>
            ))
          : 'not yet determined'}
      </div>
      <div style={{ marginTop: 4 }}>
        Generals:{' '}
        {(['white', 'black', 'green'] as const).map((a) => {
          const g = game.alliances[a].generalId;
          if (!g) return null;
          return (
            <span key={a} style={{ marginRight: 8 }}>
              <PlayerSwatch game={game} pid={g} />
              {game.players[g].leaderName}
            </span>
          );
        })}
      </div>
      <div style={{ marginTop: 4 }}>
        The Fates' running total: <b>{game.endTotal}</b> / {END_GAME_TOTAL} (the game ends at {END_GAME_TOTAL})
      </div>
    </div>
  );
}

export function PlayersPanel({ game }: { game: GameState }) {
  return (
    <div className="panel">
      <h3>Leaders</h3>
      <table className="players-table">
        <thead>
          <tr>
            <th>Leader</th>
            <th title="cities">C</th>
            <th title="productive capacity">Cap</th>
            <th title="food">Food</th>
            <th title="raw materials">Raw</th>
            <th title="cards in hand">Hand</th>
            <th title="score">Pts</th>
          </tr>
        </thead>
        <tbody>
          {game.seatOrder.map((pid) => {
            const p = game.players[pid];
            const f = p.factionId ? game.factions[p.factionId] : null;
            const active = game.pending?.playerId === pid;
            return (
              <tr key={pid} className={isGeneral(game, pid) ? 'general' : ''} style={{ background: active ? '#f7e7a1' : undefined }}>
                <td>
                  <PlayerSwatch game={game} pid={pid} />
                  {p.leaderName}
                  {p.isBot ? ' (bot)' : ''}
                  <div style={{ fontSize: 10, color: '#5b4a3a' }}>{f ? `${allianceName(f.allianceId)} ${f.name}` : 'choosing a role'}</div>
                </td>
                <td>{cityCount(game, pid)}</td>
                <td>{capacityOf(game, pid)}</td>
                <td>{p.food}</td>
                <td>{p.raw}</td>
                <td>{p.hand.length}</td>
                <td>{f ? scoreOf(game, pid) : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LogPanel({ log }: { log: LogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  const shown = log.slice(-400);
  return (
    <div className="panel">
      <h3>The Record of Deeds</h3>
      <div className="log" ref={ref}>
        {shown.map((e) => (
          <div key={e.seq} className={`entry ${e.category}`}>
            <span style={{ opacity: 0.6 }}>[{e.turn}]</span> {e.text}
          </div>
        ))}
      </div>
    </div>
  );
}
