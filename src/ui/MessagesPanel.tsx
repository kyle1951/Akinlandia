import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, AllianceId, GameState, Message, MessageAudience, PlayerId } from '../engine/types';
import { allianceName } from '../engine/query';
import { tileLabel } from '../engine/map';
import { canRead, isGeneralOf, MAX_MESSAGE_LENGTH } from '../engine/messages';
import { PlayerSwatch } from './SidePanel';

/**
 * Messages (decisions 112, 114): read what you may, and speak publicly, to your
 * alliance, or to another alliance. Diplomacy is by word only; nothing is
 * recorded as agreed and nothing binds anyone. A General can also name the
 * alliance's target, which bot allies follow.
 */
export function MessagesPanel({
  game,
  speakerId,
  speakers,
  onSpeaker,
  showAll,
  dispatch,
}: {
  game: GameState;
  /** who reads and speaks (null: nobody, e.g. an all-bot game) */
  speakerId: PlayerId | null;
  /** hotseat: the human leaders one may speak as */
  speakers?: PlayerId[];
  onSpeaker?: (pid: PlayerId) => void;
  /** show every message regardless of audience (all-bot games) */
  showAll: boolean;
  dispatch: (a: Action) => string | null;
}) {
  const [filter, setFilter] = useState<'all' | 'public' | 'alliance' | 'diplomacy'>('all');
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('all');
  const [targetTile, setTargetTile] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const me = speakerId ? game.players[speakerId] : null;
  const myAlliance = me?.allianceId ?? null;
  const general = speakerId ? isGeneralOf(game, speakerId) : null;
  const alliances = (['white', 'black', 'green'] as AllianceId[]).filter((a) => Object.values(game.players).some((p) => p.allianceId === a));
  const others = alliances.filter((a) => a !== myAlliance);

  const visible = useMemo(() => {
    const all = game.messages ?? [];
    return all.filter((m) => showAll || canRead(game, speakerId, m.to)).filter((m) => filter === 'all' || (filter === 'public' ? m.to.kind === 'all' : m.to.kind === filter));
  }, [game, speakerId, showAll, filter]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const audience = (): MessageAudience => {
    if (channel === 'alliance' && myAlliance) return { kind: 'alliance', allianceId: myAlliance };
    if (channel.startsWith('to:') && myAlliance) return { kind: 'diplomacy', allianceIds: [myAlliance, channel.slice(3) as AllianceId] };
    return { kind: 'all' };
  };
  const send = (a: Omit<Extract<Action, { kind: 'say' }>, 'kind' | 'playerId'>) => {
    if (!speakerId) return;
    const err = dispatch({ kind: 'say', playerId: speakerId, ...a });
    if (!err) setText('');
  };
  const cities = useMemo(
    () =>
      Object.values(game.tiles)
        .filter((t) => t.city)
        .sort((a, b) => tileLabel(a).localeCompare(tileLabel(b))),
    [game.tiles],
  );
  const describe = (m: Message) => {
    if (m.to.kind === 'all') return 'to everyone';
    if (m.to.kind === 'alliance') return `to the ${allianceName(m.to.allianceId)} alliance`;
    const [a, b] = m.to.allianceIds;
    return `${allianceName(a)} ↔ ${allianceName(b)}`;
  };

  return (
    <div className="panel messages">
      <h3>
        Messages{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ fontSize: 12 }}>
          <option value="all">all</option>
          <option value="public">public</option>
          <option value="alliance">alliance</option>
          <option value="diplomacy">diplomacy</option>
        </select>
        {speakers && speakers.length > 1 && onSpeaker && (
          <span style={{ fontSize: 12, marginLeft: 8 }}>
            as{' '}
            <select value={speakerId ?? ''} onChange={(e) => onSpeaker(e.target.value)}>
              {speakers.map((p) => (
                <option key={p} value={p}>
                  {game.players[p].leaderName}
                </option>
              ))}
            </select>
          </span>
        )}
      </h3>
      <div className="msg-list" ref={listRef}>
        {visible.length === 0 && <div className="msg-empty">No messages yet.</div>}
        {visible.map((m) => (
          <div key={m.seq} className={`msg msg-${m.to.kind}`}>
            <span className="msg-meta">
              [{m.turn}] <PlayerSwatch game={game} pid={m.fromId} />
              <b>{game.players[m.fromId].leaderName}</b> {describe(m)}
            </span>
            <div>
              {m.text} {m.intent?.kind === 'target' && <span className="msg-badge">⚑ {tileLabel(game.tiles[m.intent.tileId])}</span>}
            </div>
          </div>
        ))}
      </div>
      {me && (
        <>
          <div className="msg-compose">
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">Everyone</option>
              {myAlliance && <option value="alliance">My alliance</option>}
              {myAlliance && others.map((a) => <option key={a} value={`to:${a}`}>{`To the ${allianceName(a)} alliance`}</option>)}
            </select>
            <input
              value={text}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Say something..."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text.trim()) send({ to: audience(), text });
              }}
            />
            <button className="small" disabled={!text.trim()} onClick={() => send({ to: audience(), text })}>
              Send
            </button>
          </div>
          {channel.startsWith('to:') && (
            <div className="msg-hint">
              Diplomacy is by word only; nothing binds anyone. Bot Generals understand plain offers and answers, for example &quot;A truce for two turns?&quot;, &quot;Join us against the Black alliance&quot;, &quot;Agreed&quot; or &quot;No&quot;, and keep
              their word until an undefended city tempts them.
            </div>
          )}
        </>
      )}
      {general && (
        <details className="msg-general">
          <summary>General&apos;s orders</summary>
          <div>
            Target for the {allianceName(general)} alliance:{' '}
            <select value={targetTile} onChange={(e) => setTargetTile(e.target.value)}>
              <option value="">choose a city</option>
              {cities.map((t) => (
                <option key={t.id} value={t.id}>
                  {tileLabel(t)}
                </option>
              ))}
            </select>{' '}
            <button className="small" disabled={!targetTile} onClick={() => send({ to: { kind: 'alliance', allianceId: general }, text: `Our objective is ${tileLabel(game.tiles[targetTile])}.`, intent: { kind: 'target', tileId: targetTile } })}>
              Announce
            </button>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Bot allies march on the announced target and raise soldiers near it.</div>
          </div>
        </details>
      )}
    </div>
  );
}
