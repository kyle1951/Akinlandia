import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, AllianceId, GameState, Message, MessageAudience, PactKind, PlayerId } from '../engine/types';
import { allianceName } from '../engine/query';
import { tileLabel } from '../engine/map';
import { activePacts, canRead, isGeneralOf, MAX_MESSAGE_LENGTH, openProposals } from '../engine/messages';
import { PlayerSwatch } from './SidePanel';

/**
 * Messages and diplomacy (decision 112): read what you may, speak publicly or
 * to your alliance or to another alliance, and, as General, name the alliance's
 * target and propose or answer pacts. Bots read and act on the same messages.
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
  const [propTo, setPropTo] = useState<AllianceId | ''>('');
  const [pact, setPact] = useState<PactKind>('truce');
  const [jointTarget, setJointTarget] = useState<AllianceId | ''>('');
  const [turns, setTurns] = useState(2);
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
  const badge = (m: Message) => {
    const i = m.intent;
    if (!i) return null;
    if (i.kind === 'target') return <span className="msg-badge">⚑ {tileLabel(game.tiles[i.tileId])}</span>;
    if (i.kind === 'propose') return <span className="msg-badge">🤝 {i.pact === 'truce' ? `truce, ${i.turns} turn${i.turns === 1 ? '' : 's'}` : `joint attack on ${allianceName(i.targetAllianceId!)}, ${i.turns} turn${i.turns === 1 ? '' : 's'}`}</span>;
    return <span className="msg-badge">{i.accept ? '✔ accepted' : '✘ declined'}</span>;
  };

  const incoming = general ? openProposals(game, general) : [];
  const pacts = myAlliance ? activePacts(game, myAlliance) : [];
  const brokenPacts = (game.pacts ?? []).filter((p) => p.broken && (!myAlliance || p.allianceIds.includes(myAlliance)) && p.broken.turn >= game.turn - 1);

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
      {(pacts.length > 0 || brokenPacts.length > 0) && (
        <div className="msg-pacts">
          {pacts.map((p) => {
            const other = p.allianceIds[0] === myAlliance ? p.allianceIds[1] : p.allianceIds[0];
            return (
              <div key={p.id}>
                🤝 {p.kind === 'truce' ? `Truce with the ${allianceName(other)}` : `With the ${allianceName(other)} against the ${allianceName(p.targetAllianceId!)}`} through turn {p.untilTurn}
              </div>
            );
          })}
          {brokenPacts.map((p) => (
            <div key={`b${p.id}`} className="msg-broken">
              ⚔ Truce between the {allianceName(p.allianceIds[0])} and {allianceName(p.allianceIds[1])} broken{p.broken!.byAllianceId ? ` by the ${allianceName(p.broken!.byAllianceId)}` : ''}
            </div>
          ))}
        </div>
      )}
      <div className="msg-list" ref={listRef}>
        {visible.length === 0 && <div className="msg-empty">No messages yet.</div>}
        {visible.map((m) => (
          <div key={m.seq} className={`msg msg-${m.to.kind}`}>
            <span className="msg-meta">
              [{m.turn}] <PlayerSwatch game={game} pid={m.fromId} />
              <b>{game.players[m.fromId].leaderName}</b> {describe(m)}
            </span>
            <div>
              {m.text} {badge(m)}
            </div>
          </div>
        ))}
      </div>
      {incoming.map((p) => (
        <div key={p.id} className="msg-proposal">
          The {allianceName(p.from)} General proposes {p.pact === 'truce' ? `a truce for ${p.turns} turn${p.turns === 1 ? '' : 's'}` : `a joint attack on the ${allianceName(p.targetAllianceId!)} for ${p.turns} turn${p.turns === 1 ? '' : 's'}`}.
          <div className="actions">
            <button className="small primary" onClick={() => send({ to: { kind: 'diplomacy', allianceIds: [p.from, general!] }, text: 'Agreed.', intent: { kind: 'reply', proposalId: p.id, accept: true } })}>
              Accept
            </button>
            <button className="small" onClick={() => send({ to: { kind: 'diplomacy', allianceIds: [p.from, general!] }, text: 'We decline.', intent: { kind: 'reply', proposalId: p.id, accept: false } })}>
              Decline
            </button>
          </div>
        </div>
      ))}
      {me && (
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
      )}
      {general && (
        <details className="msg-general">
          <summary>General&apos;s orders and diplomacy</summary>
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
          </div>
          {others.length > 0 && (
            <div style={{ marginTop: 6 }}>
              Propose to{' '}
              <select value={propTo} onChange={(e) => setPropTo(e.target.value as AllianceId)}>
                <option value="">an alliance</option>
                {others.map((a) => (
                  <option key={a} value={a}>
                    the {allianceName(a)}
                  </option>
                ))}
              </select>{' '}
              <select value={pact} onChange={(e) => setPact(e.target.value as PactKind)}>
                <option value="truce">a truce</option>
                <option value="joint">a joint attack on</option>
              </select>{' '}
              {pact === 'joint' && (
                <select value={jointTarget} onChange={(e) => setJointTarget(e.target.value as AllianceId)}>
                  <option value="">whom?</option>
                  {others
                    .filter((a) => a !== propTo)
                    .map((a) => (
                      <option key={a} value={a}>
                        the {allianceName(a)}
                      </option>
                    ))}
                </select>
              )}{' '}
              for{' '}
              <select value={turns} onChange={(e) => setTurns(Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} turn{n === 1 ? '' : 's'}
                  </option>
                ))}
              </select>{' '}
              <button
                className="small"
                disabled={!propTo || (pact === 'joint' && !jointTarget)}
                onClick={() =>
                  send({
                    to: { kind: 'diplomacy', allianceIds: [general, propTo as AllianceId] },
                    text: text.trim() || (pact === 'truce' ? `A truce for ${turns} turn${turns === 1 ? '' : 's'}?` : `Join us against the ${allianceName(jointTarget as AllianceId)} for ${turns} turn${turns === 1 ? '' : 's'}?`),
                    intent: { kind: 'propose', proposalId: `p${game.turn}-${general}-${(game.proposals?.length ?? 0) + 1}-${Date.now() % 100000}`, pact, targetAllianceId: pact === 'joint' ? (jointTarget as AllianceId) : undefined, turns },
                  })
                }
              >
                Propose
              </button>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Pacts are not enforced by the rules. Bots keep them; attacking a truce partner breaks the truce for all to see.</div>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
