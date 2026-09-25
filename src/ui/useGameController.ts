import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameConfig, GameState, LogEntry } from '../engine/types';
import { applyAction, cloneState, createGame, isGameOver } from '../engine';
import { botAction } from '../bots/heuristic';
import { runBots } from '../bots/runner';

export type BotSpeed = 'paused' | 'slow' | 'fast' | 'instant';
const DELAYS: Record<BotSpeed, number> = { paused: -1, slow: 1100, fast: 300, instant: 0 };
export const SAVE_KEY = 'akinlandia.save.v1';

export interface Controller {
  game: GameState | null;
  events: LogEntry[];
  speed: BotSpeed;
  setSpeed: (s: BotSpeed) => void;
  start: (config: GameConfig, seed: number) => void;
  dispatch: (action: Action) => string | null;
  runToEnd: () => void;
  stopRun: () => void;
  running: boolean;
  quit: () => void;
  exportJson: () => string;
  importJson: (text: string) => string | null;
  error: string | null;
  clearError: () => void;
}

function loadSaved(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s || typeof s !== 'object' || !s.players || !s.tiles) return null;
    return s;
  } catch {
    return null;
  }
}

function save(state: GameState | null): void {
  try {
    if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage full or unavailable: ignore
  }
}

export function useGameController(): Controller {
  const [game, setGame] = useState<GameState | null>(() => loadSaved());
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [speed, setSpeed] = useState<BotSpeed>('fast');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(false);

  const dispatch = useCallback(
    (action: Action): string | null => {
      let err: string | null = null;
      setGame((g) => {
        if (!g) return g;
        try {
          const res = applyAction(g, action);
          setEvents(res.events);
          save(res.state);
          return res.state;
        } catch (e) {
          err = (e as Error).message;
          setError(err);
          return g;
        }
      });
      return err;
    },
    [],
  );

  const start = useCallback((config: GameConfig, seed: number) => {
    const s = createGame(config, seed);
    setEvents(s.log);
    setGame(s);
    save(s);
    setRunning(false);
    runRef.current = false;
  }, []);

  // Bots answer their decisions automatically at the chosen speed.
  useEffect(() => {
    if (!game || running || isGameOver(game)) return;
    const pending = game.pending;
    if (!pending || !game.players[pending.playerId].isBot) return;
    const delay = DELAYS[speed];
    if (delay < 0) return;
    const t = setTimeout(() => {
      const action = botAction(game, pending);
      dispatch(action);
    }, delay);
    return () => clearTimeout(t);
  }, [game, speed, running, dispatch]);

  const runToEnd = useCallback(() => {
    if (!game) return;
    runRef.current = true;
    setRunning(true);
    let s = cloneState(game);
    const step = () => {
      if (!runRef.current) return;
      runBots(s, { maxActions: s.actionLog.length + 60, stopAtMax: true });
      const done = isGameOver(s) || !s.pending || !s.players[s.pending.playerId].isBot;
      const snapshot = s;
      setGame(snapshot);
      setEvents(snapshot.log.slice(-40));
      if (done) {
        save(snapshot);
        runRef.current = false;
        setRunning(false);
        return;
      }
      s = cloneState(snapshot);
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }, [game]);

  const stopRun = useCallback(() => {
    runRef.current = false;
    setRunning(false);
    setGame((g) => {
      save(g);
      return g;
    });
  }, []);

  const quit = useCallback(() => {
    runRef.current = false;
    setRunning(false);
    setGame(null);
    setEvents([]);
    save(null);
  }, []);

  const exportJson = useCallback(() => JSON.stringify(game, null, 1), [game]);

  const importJson = useCallback((text: string): string | null => {
    try {
      const s = JSON.parse(text) as GameState;
      if (!s || !s.players || !s.tiles || !s.tasks) return 'That file is not an Akinlandia save.';
      setGame(s);
      setEvents(s.log.slice(-30));
      save(s);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);

  return useMemo(
    () => ({ game, events, speed, setSpeed, start, dispatch, runToEnd, stopRun, running, quit, exportJson, importJson, error, clearError: () => setError(null) }),
    [game, events, speed, start, dispatch, runToEnd, stopRun, running, quit, exportJson, importJson, error],
  );
}
