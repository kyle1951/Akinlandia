import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, LogEntry } from '../../engine/types';
import type { ClientView } from '../../engine/view';
import type { ClientMessage, LobbyInfo, ServerMessage } from '../../../server/protocol';
import type { Controller } from '../useGameController';

const TOKEN_KEY = 'akinlandia.player.token';

export function playerToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      t = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return `anon${Math.random().toString(36).slice(2, 14)}`;
  }
}

export interface RemoteSession {
  lobby: LobbyInfo | null;
  view: ClientView | null;
  connected: boolean;
  error: string | null;
  clearError: () => void;
  send: (msg: ClientMessage) => void;
  controller: Controller | null;
  leave: () => void;
}

export function useRemoteSession(code: string, onLeave: () => void): RemoteSession {
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [view, setView] = useState<ClientView | null>(null);
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSeq = useRef(-1);
  const closed = useRef(false);

  useEffect(() => {
    closed.current = false;
    let attempt = 0;
    let timer: number | null = null;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws?token=${playerToken()}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === 'lobby') {
          setLobby(msg.lobby);
        } else if (msg.type === 'state') {
          setLobby(msg.lobby);
          const fresh = msg.view.log.filter((l) => l.seq > lastSeq.current);
          lastSeq.current = msg.view.log.length ? msg.view.log[msg.view.log.length - 1].seq : lastSeq.current;
          setEvents(fresh.slice(-60));
          setView(msg.view);
        } else if (msg.type === 'error') {
          setError(msg.message);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (closed.current) return;
        attempt++;
        timer = window.setTimeout(connect, Math.min(15000, 500 * 2 ** Math.min(attempt, 5)));
      };
      ws.onerror = () => ws.close();
    };
    connect();
    const ping = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }, 25000);
    return () => {
      closed.current = true;
      window.clearInterval(ping);
      if (timer) window.clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [code]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Not connected to the table yet. Trying again...');
      return;
    }
    ws.send(JSON.stringify(msg));
  }, []);

  const leave = useCallback(() => {
    closed.current = true;
    wsRef.current?.close();
    onLeave();
  }, [onLeave]);

  const controller = useMemo<Controller | null>(() => {
    if (!view || !lobby) return null;
    const noop = () => {};
    return {
      game: view,
      events,
      speed: 'fast',
      setSpeed: noop,
      start: noop,
      dispatch: (action: Action) => {
        send({ type: 'action', action });
        return null;
      },
      runToEnd: noop,
      stopRun: noop,
      running: false,
      quit: leave,
      exportJson: () => JSON.stringify(view, null, 1),
      importJson: () => 'Saves cannot be imported into an online table.',
      error,
      clearError: () => setError(null),
      online: {
        code,
        viewerId: view.viewerId,
        waitingOn: view.waitingOn,
        connected,
        hostIsYou: lobby.hostIsYou,
        setDelegate: (playerId: string, bot: boolean) => send({ type: 'delegate', playerId, bot }),
        leave,
      },
    };
  }, [view, lobby, events, error, connected, code, send, leave]);

  return { lobby, view, connected, error, clearError: () => setError(null), send, controller, leave };
}
