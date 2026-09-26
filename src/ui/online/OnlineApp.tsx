import { useCallback, useEffect, useState } from 'react';
import { Lobby } from './Lobby';
import { useRemoteSession } from './useRemoteController';
import { GameScreen } from '../GameScreen';

export function roomCodeFromHash(): string | null {
  const m = location.hash.match(/room=([A-Za-z0-9]{6})/);
  return m ? m[1].toUpperCase() : null;
}

export function OnlineHome({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { code: string };
      location.hash = `room=${data.code}`;
    } catch (e) {
      setError(`Could not open a table: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) {
      setError('A table code has six letters or digits.');
      return;
    }
    const res = await fetch(`/api/rooms/${c}`);
    if (!res.ok) {
      setError('No table with that code.');
      return;
    }
    location.hash = `room=${c}`;
  };
  return (
    <div className="setup">
      <h1>Akinlandia · play with friends</h1>
      <p className="quote">Every leader plays on their own screen. The table lives on the server, so you can close the page and return days later.</p>
      <div className="panel">
        <h3>Open a new table</h3>
        <p>You become the host, set the seats, and share the link.</p>
        <button className="primary" disabled={busy} onClick={create}>
          Open a table
        </button>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Join a table</h3>
        <label>
          Code: <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" style={{ textTransform: 'uppercase' }} />
        </label>
        <button onClick={join}>Join</button>
      </div>
      {error && <p style={{ color: 'var(--crimson)' }}>{error}</p>}
      <p>
        <button onClick={onBack}>Back to hotseat play</button>
      </p>
    </div>
  );
}

export function OnlineRoom({ code, onLeave }: { code: string; onLeave: () => void }) {
  const session = useRemoteSession(code, onLeave);
  if (!session.lobby) {
    return (
      <div className="setup">
        <h1>Akinlandia</h1>
        <p>{session.connected ? 'Taking your seat...' : `Connecting to table ${code}...`}</p>
        {session.error && <p style={{ color: 'var(--crimson)' }}>{session.error}</p>}
        <button onClick={session.leave}>Leave</button>
      </div>
    );
  }
  if (session.lobby.status === 'lobby' || !session.controller) {
    return <Lobby lobby={session.lobby} send={session.send} connected={session.connected} error={session.error} clearError={session.clearError} onLeave={session.leave} />;
  }
  return <GameScreen key={code} ctl={session.controller} />;
}

/** Follows the URL hash: #online opens the home, #room=CODE joins a table. */
export function useOnlineRoute(): { online: boolean; code: string | null; leave: () => void } {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const leave = useCallback(() => {
    location.hash = '';
  }, []);
  const code = roomCodeFromHash();
  return { online: hash.startsWith('#online') || !!code, code, leave };
}
