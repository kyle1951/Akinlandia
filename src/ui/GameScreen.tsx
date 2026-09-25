import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, LogEntry } from '../engine/types';
import { isGameOver } from '../engine/machine';
import { allianceName, membersOf } from '../engine/query';
import { CARD_BY_TYPE } from '../data/cards';
import { Board } from './Board';
import type { BoardControl } from './DecisionPanel';
import { DecisionPanel, isPrivateDecision, privateWhat } from './DecisionPanel';
import { LogPanel, PlayerSwatch, PlayersPanel, StatusPanel } from './SidePanel';
import { PrivacyScreen } from './PrivacyScreen';
import { RulesPanel } from './RulesPanel';
import { EndScreen } from './EndScreen';
import type { Controller } from './useGameController';

export function GameScreen({ ctl }: { ctl: Controller }) {
  const game = ctl.game!;
  const [board, setBoard] = useState<BoardControl>({ highlights: [] });
  const [rules, setRules] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [showEnd, setShowEnd] = useState(true);
  const [banner, setBanner] = useState<LogEntry | null>(null);
  const [reveal, setReveal] = useState<LogEntry[] | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pending = game.pending;
  const decisionKey = pending ? `${game.actionLog.length}:${pending.playerId}:${pending.kind}` : null;
  const humanTurn = !!pending && !game.players[pending.playerId].isBot;
  const needsPrivacy = humanTurn && pending && isPrivateDecision(pending) && unlocked !== decisionKey && !reveal;

  // Banners for FINAL ORDERs and battles; reveal modal for politics.
  useEffect(() => {
    const ev = ctl.events;
    const order = [...ev].reverse().find((e) => e.data?.banner && (e.category === 'order' || e.category === 'combat' || e.category === 'turn'));
    if (order && ctl.speed !== 'instant' && !ctl.running) {
      setBanner(order);
      if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
      bannerTimer.current = window.setTimeout(() => setBanner(null), order.category === 'order' ? 3500 : 2200);
    }
    if (ev.some((e) => e.data?.reveal) && !ctl.running) setReveal(ev.filter((e) => e.data?.reveal || e.category === 'election' || e.category === 'card'));
  }, [ctl.events, ctl.speed, ctl.running]);

  useEffect(() => {
    if (isGameOver(game)) setShowEnd(true);
  }, [game]);

  const allBots = game.seatOrder.every((p) => game.players[p].isBot);

  const exportSave = () => {
    const blob = new Blob([ctl.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akinlandia-turn${game.turn}-seed${game.rng.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const revealView = useMemo(() => {
    if (!reveal) return null;
    const r = game.turnData.lastReveal;
    if (!r) return null;
    return (
      <div className="modal-backdrop" onClick={() => setReveal(null)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>The PLAY envelopes are opened</h2>
          <div className="reveal-grid">
            {game.allianceOrder.map((a) => (
              <div key={a} className="reveal-alliance">
                <h4>{allianceName(a)} alliance</h4>
                {membersOf(game, a).map((pid) => (
                  <div key={pid} style={{ marginBottom: 6 }}>
                    <PlayerSwatch game={game} pid={pid} />
                    <b>{game.players[pid].leaderName}</b>: {r.scores[pid] ?? 0}
                    <div>
                      {(r.played[pid] ?? []).map((uid) => (
                        <span key={uid} className="mini-card">
                          {CARD_BY_TYPE[game.cards[uid].type].name} ({CARD_BY_TYPE[game.cards[uid].type].value})
                        </span>
                      ))}
                      {(r.played[pid] ?? []).length === 0 && <span className="mini-card">nothing</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            {reveal
              .filter((e) => e.category === 'election' || e.category === 'card')
              .map((e) => (
                <div key={e.seq} style={{ fontWeight: e.category === 'election' ? 'bold' : undefined }}>
                  {e.text}
                </div>
              ))}
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => setReveal(null)}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }, [reveal, game]);

  return (
    <div className="app">
      <div className="board-area">
        <Board game={game} highlights={board.highlights} onTileClick={board.onTileClick} showCoords={showCoords} />
        <div className="topbar">
          <div className="status">
            <b>Akinlandia</b> · seed {game.rng.seed} · {game.config.setupMode === 'quick' ? 'Quick Start' : 'Full Game'}
          </div>
          <button onClick={() => setRules(true)}>Rules</button>
          <button onClick={exportSave}>Export save</button>
          <button onClick={() => fileRef.current?.click()}>Import save</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const err = ctl.importJson(await f.text());
                if (err) alert(err);
              }
              e.target.value = '';
            }}
          />
          <label className="status">
            Bots:{' '}
            <select value={ctl.speed} onChange={(e) => ctl.setSpeed(e.target.value as Controller['speed'])} disabled={ctl.running}>
              <option value="paused">paused</option>
              <option value="slow">slow</option>
              <option value="fast">fast</option>
              <option value="instant">instant</option>
            </select>
          </label>
          {!isGameOver(game) && !ctl.running && (
            <button onClick={ctl.runToEnd} title={allBots ? 'Run the whole game' : 'Run until a human must decide'}>
              {allBots ? 'Run to end' : 'Run bots'}
            </button>
          )}
          {ctl.running && (
            <button className="danger" onClick={ctl.stopRun}>
              Stop
            </button>
          )}
          <label className="status">
            <input type="checkbox" checked={showCoords} onChange={(e) => setShowCoords(e.target.checked)} /> coords
          </label>
          <button
            className="danger"
            onClick={() => {
              if (confirm('Abandon this game? The autosave will be cleared.')) ctl.quit();
            }}
          >
            Quit
          </button>
          {isGameOver(game) && <button className="primary" onClick={() => setShowEnd(true)}>Final scores</button>}
        </div>
        {banner && <div className="banner">{banner.text}</div>}
        {ctl.error && (
          <div className="decision floating" style={{ borderColor: 'var(--crimson)' }}>
            <b>Illegal:</b> {ctl.error}
            <div className="actions">
              <button className="small" onClick={ctl.clearError}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="side">
        {pending && humanTurn && !needsPrivacy && !reveal && !ctl.running && <DecisionPanel game={game} pending={pending} dispatch={ctl.dispatch} setBoard={setBoard} />}
        {pending && !humanTurn && !isGameOver(game) && (
          <div className="decision">
            <PlayerSwatch game={game} pid={pending.playerId} />
            {game.players[pending.playerId].leaderName} (bot) is deciding: {pending.kind}
            {ctl.speed === 'paused' && !ctl.running && (
              <div className="actions">
                <button onClick={() => ctl.setSpeed('fast')}>Resume bots</button>
              </div>
            )}
          </div>
        )}
        <StatusPanel game={game} />
        <PlayersPanel game={game} />
        <LogPanel log={game.log} />
      </div>
      {needsPrivacy && pending && <PrivacyScreen name={game.players[pending.playerId].leaderName} what={privateWhat(pending)} onContinue={() => setUnlocked(decisionKey)} />}
      {rules && <RulesPanel onClose={() => setRules(false)} />}
      {revealView}
      {isGameOver(game) && showEnd && game.result && <EndScreen game={game} onNewGame={ctl.quit} onClose={() => setShowEnd(false)} />}
    </div>
  );
}

export type { GameState };
