import { useState } from 'react';
import type { GameConfig } from '../engine/types';
import { hashSeed } from '../engine/rng';
import { MAPS } from '../data/quickstartMap';
import { HouseRuleOptions, NO_HOUSE_RULES } from './HouseRules';

const DEFAULT_NAMES = ['Sinclair', 'Akin', 'Hobbes', 'Herodotus', 'Clemenceau', 'Pericles', 'Xerxes', 'Leonidas', 'Solon'];
const EPITHETS = ['the Great', 'the Adequate', 'the Unready', 'the Magnificent', 'the Verbose', 'the Bald', 'the Younger', 'the Pious', 'the Tardy'];

interface Seat {
  name: string;
  leaderName: string;
  isBot: boolean;
}

export function SetupScreen(props: { onStart: (config: GameConfig, seed: number) => void; onImport: (text: string) => string | null; hasSave: boolean; onResume: () => void; onOnline?: () => void }) {
  const [count, setCount] = useState(5);
  const [seats, setSeats] = useState<Seat[]>(() => DEFAULT_NAMES.map((n, i) => ({ name: n, leaderName: `${n} ${EPITHETS[i]}`, isBot: i > 0 })));
  const [mode, setMode] = useState<'quick' | 'full'>('quick');
  const [mapId, setMapId] = useState('quickstart');
  const [alwaysPrompt, setAlwaysPrompt] = useState(false);
  const [houseRules, setHouseRules] = useState(NO_HOUSE_RULES);
  const [seedText, setSeedText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Seat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // a map with starting cities for fewer leaders caps the table
  const maxLeaders = mode === 'quick' ? (MAPS[mapId]?.maxPlayers ?? 9) : 9;
  const leaders = Math.min(count, maxLeaders);

  const start = () => {
    const seed = seedText.trim() === '' ? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 : /^\d+$/.test(seedText.trim()) ? Number(seedText.trim()) >>> 0 : hashSeed(seedText.trim());
    props.onStart(
      {
        seats: seats.slice(0, leaders).map((s) => ({ name: s.name || 'Leader', leaderName: s.leaderName || `${s.name || 'Leader'} the Adequate`, isBot: s.isBot })),
        setupMode: mode,
        alwaysPromptReactions: alwaysPrompt,
        mapId,
        ...houseRules,
      },
      seed,
    );
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setImportError(props.onImport(text));
  };

  return (
    <div className="setup">
      <h1>Akinlandia</h1>
      <p className="quote">In honor of Kyle Akin, a true philosopher king.</p>
      <p>
        "If one plant, sow, build, or possesse a convenient Seat, others may probably be expected to come prepared with forces united, to dispossesse, and deprive him." Gather your factions, choose your alliance, and strive for renown, or at least avoid being mocked down to the latest generation.
      </p>
      {props.onOnline && (
        <div className="panel" style={{ marginBottom: 12 }}>
          Friends in other cities? <button className="primary" onClick={props.onOnline}>Play online at a shared table</button>
          <span style={{ fontSize: 12, marginLeft: 8 }}>Everything below is for hotseat play on this one device.</span>
        </div>
      )}
      {props.hasSave && (
        <div className="panel" style={{ marginBottom: 12 }}>
          A game in progress was found in this browser. <button className="primary" onClick={props.onResume}>Resume it</button>
        </div>
      )}
      <div className="panel">
        <h3>Leaders</h3>
        <label>
          Number of leaders (3 to {maxLeaders}):{' '}
          <select value={leaders} onChange={(e) => setCount(Number(e.target.value))}>
            {[3, 4, 5, 6, 7, 8, 9].filter((n) => n <= maxLeaders).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <table>
          <thead>
            <tr>
              <th>Seat</th>
              <th>Name</th>
              <th>Silly leader name (for the order announcement)</th>
              <th>Played by</th>
            </tr>
          </thead>
          <tbody>
            {seats.slice(0, leaders).map((s, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td>
                  <input style={{ width: '100%' }} value={s.leaderName} onChange={(e) => update(i, { leaderName: e.target.value })} />
                </td>
                <td>
                  <select value={s.isBot ? 'bot' : 'human'} onChange={(e) => update(i, { isBot: e.target.value === 'bot' })}>
                    <option value="human">Human</option>
                    <option value="bot">Bot</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12 }}>
          Roles (alliance and faction) are chosen in the game itself, in a random selection order. <button className="small" onClick={() => setSeats((s) => s.map((x) => ({ ...x, isBot: true })))}>All bots</button>{' '}
          <button className="small" onClick={() => setSeats((s) => s.map((x) => ({ ...x, isBot: false })))}>All humans</button>
        </p>
      </div>
      <div className="panel config" style={{ marginTop: 12 }}>
        <h3>Configuration</h3>
        <label>
          <input type="radio" checked={mode === 'quick'} onChange={() => setMode('quick')} /> Quick Start: a preset map, two cities per faction.
        </label>
        {mode === 'quick' && (
          <label style={{ marginLeft: 24 }}>
            Map:{' '}
            <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
              {Object.entries(MAPS).map(([id, m]) => (
                <option key={id} value={id}>
                  {m.spec.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{MAPS[mapId]?.description}</div>
          </label>
        )}
        <label>
          <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} /> Full Game: build the board tile by tile before play begins.
        </label>
        <label>
          <input type="checkbox" checked={alwaysPrompt} onChange={(e) => setAlwaysPrompt(e.target.checked)} /> Always prompt every eligible player at reaction windows (hides who holds Rage of Achilles, Trojan Horse or Zeus; slower).
        </label>
        <HouseRuleOptions value={houseRules} onChange={setHouseRules} />
        <label>
          Seed (optional, any text or number): <input value={seedText} onChange={(e) => setSeedText(e.target.value)} placeholder="random" />
        </label>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="primary" onClick={start}>
          Begin the game
        </button>
        <label>
          or import a saved game: <input type="file" accept="application/json" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {importError && <span style={{ color: 'var(--crimson)' }}>{importError}</span>}
      </div>
    </div>
  );
}
