import { useEffect, useState } from 'react';
import type { ClientMessage, LobbyInfo } from '../../../server/protocol';
import { MAPS } from '../../data/quickstartMap';
import { HouseRuleOptions } from '../HouseRules';
import type { HouseRuleSettings } from '../HouseRules';

const NAME_KEY = 'akinlandia.player.name';
const LEADER_KEY = 'akinlandia.player.leader';

function remembered(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function Lobby({ lobby, send, connected, error, clearError, onLeave }: { lobby: LobbyInfo; send: (m: ClientMessage) => void; connected: boolean; error: string | null; clearError: () => void; onLeave: () => void }) {
  const [name, setName] = useState(() => remembered(NAME_KEY, ''));
  const [leader, setLeader] = useState(() => remembered(LEADER_KEY, ''));
  const [seats, setSeats] = useState(lobby.seats.map((s) => ({ name: s.name, leaderName: s.leaderName, isBot: s.isBot })));
  const [mode, setMode] = useState(lobby.setupMode);
  const [mapId, setMapId] = useState(lobby.mapId ?? 'quickstart');
  const [alwaysPrompt, setAlwaysPrompt] = useState(lobby.alwaysPromptReactions);
  const [houseRules, setHouseRules] = useState<HouseRuleSettings>({ foodCapPerCity: lobby.foodCapPerCity ?? 0, handLimit: lobby.handLimit ?? 0 });
  const [seed, setSeed] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setSeats(lobby.seats.map((s) => ({ name: s.name, leaderName: s.leaderName, isBot: s.isBot })));
    setMode(lobby.setupMode);
    setMapId(lobby.mapId ?? 'quickstart');
    setAlwaysPrompt(lobby.alwaysPromptReactions);
    setHouseRules({ foodCapPerCity: lobby.foodCapPerCity ?? 0, handLimit: lobby.handLimit ?? 0 });
  }, [lobby]);

  const link = `${location.origin}${location.pathname}#room=${lobby.code}`;
  const claim = (seat: number) => {
    const n = name.trim() || `Leader ${seat + 1}`;
    const l = leader.trim() || `${n} the Adequate`;
    try {
      localStorage.setItem(NAME_KEY, n);
      localStorage.setItem(LEADER_KEY, l);
    } catch {
      // ignore
    }
    send({ type: 'claim', seat, name: n, leaderName: l });
  };
  const configure = (next: typeof seats, m = mode, a = alwaysPrompt, s = seed) => {
    send({ type: 'configure', seats: next, setupMode: m, alwaysPromptReactions: a, seed: s, mapId, ...houseRules });
  };
  const setCount = (n: number) => {
    const next = [...seats];
    const names = ['Sinclair', 'Akin', 'Hobbes', 'Herodotus', 'Clemenceau', 'Pericles', 'Xerxes', 'Leonidas', 'Solon'];
    while (next.length < n) next.push({ name: names[next.length], leaderName: `${names[next.length]} the Adequate`, isBot: true });
    configure(next.slice(0, n));
  };
  const humans = lobby.seats.filter((s) => s.taken).length;

  return (
    <div className="setup">
      <h1>Akinlandia · table {lobby.code}</h1>
      <p className="quote">{connected ? 'Connected to the table.' : 'Connecting to the table...'} {lobby.playersOnline} leader{lobby.playersOnline === 1 ? '' : 's'} present.</p>
      <div className="panel">
        <h3>Invite your friends</h3>
        <p>
          Send them this link: <code>{link}</code>{' '}
          <button
            className="small"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </p>
        <p style={{ fontSize: 12 }}>Or tell them the code <b>{lobby.code}</b>. Everyone plays on their own screen; seats nobody claims are played by bots.</p>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Take a seat</h3>
        <label>
          Your name: <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kyle" />
        </label>
        <label>
          Silly leader name (for the order announcements): <input style={{ width: 320 }} value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="Kyle the Philosopher King" />
        </label>
        <table>
          <thead>
            <tr>
              <th>Seat</th>
              <th>Leader</th>
              <th>Played by</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lobby.seats.map((s, i) => (
              <tr key={i} style={{ background: s.isYou ? '#f7e7a1' : undefined }}>
                <td>{i + 1}</td>
                <td>
                  {s.leaderName} <span style={{ color: 'var(--ink-soft)' }}>({s.name})</span>
                </td>
                <td>{s.isYou ? 'you' : s.taken ? 'a friend' : 'a bot (until claimed)'}</td>
                <td>
                  {!s.taken && (
                    <button className="small" onClick={() => claim(i)}>
                      {lobby.mySeat === null ? 'Claim' : 'Move here'}
                    </button>
                  )}
                  {s.isYou && (
                    <button className="small" onClick={() => send({ type: 'release' })}>
                      Give up seat
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lobby.hostIsYou && (
        <div className="panel config" style={{ marginTop: 12 }}>
          <h3>Host controls</h3>
          <label>
            Number of leaders (3 to 9):{' '}
            <select value={lobby.seats.length} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <table>
            <tbody>
              {seats.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input value={s.name} disabled={lobby.seats[i]?.taken} onChange={(e) => setSeats((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                  </td>
                  <td>
                    <input style={{ width: '100%' }} value={s.leaderName} disabled={lobby.seats[i]?.taken} onChange={(e) => setSeats((x) => x.map((y, j) => (j === i ? { ...y, leaderName: e.target.value } : y)))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label>
            <input type="radio" checked={mode === 'quick'} onChange={() => setMode('quick')} /> Quick Start map:{' '}
            <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
              {Object.entries(MAPS).map(([id, m]) => (
                <option key={id} value={id}>
                  {m.spec.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} /> Full Game (build the board first)
          </label>
          <label>
            <input type="checkbox" checked={alwaysPrompt} onChange={(e) => setAlwaysPrompt(e.target.checked)} /> Always prompt every eligible player at reaction windows
          </label>
          <HouseRuleOptions value={houseRules} onChange={setHouseRules} />
          <label>
            Seed (optional): <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => configure(seats)}>Save table settings</button>
            <button className="primary" disabled={humans === 0} onClick={() => send({ type: 'start' })}>
              Begin the game ({humans} human{humans === 1 ? '' : 's'}, {lobby.seats.length - humans} bots)
            </button>
          </div>
        </div>
      )}
      {!lobby.hostIsYou && (
        <p style={{ fontStyle: 'italic' }}>
          Waiting for the host to begin the game.
          {lobby.foodCapPerCity ? ` Food spoils above ${lobby.foodCapPerCity} per city held, +2 per city upgrade.` : ''}
          {lobby.handLimit ? ` Hand limit ${lobby.handLimit} cards.` : ''}
        </p>
      )}
      {error && (
        <p style={{ color: 'var(--crimson)' }}>
          {error} <button className="small" onClick={clearError}>ok</button>
        </p>
      )}
      <p>
        <button onClick={onLeave}>Leave</button>
      </p>
    </div>
  );
}
