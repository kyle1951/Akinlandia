import { useEffect, useMemo, useState } from 'react';
import type { Action, Allocation, BuildingKind, BuildingPlacement, GameState, PendingDecision, PlayerId } from '../engine/types';
import { checkAllocation, emptyAllocation } from '../engine/rules/allocation';
import { checkBuildingPlacements } from '../engine/rules/deploy';
import { destinationsFrom, movableUnitsAt, validateOrder } from '../engine/rules/movement';
import { allianceName, capacityOf, cityCount, tile, unitsOnTile } from '../engine/query';
import { tileLabel } from '../engine/map';
import { CARD_BY_TYPE } from '../data/cards';
import type { Highlight } from './Board';
import { PlayerSwatch } from './SidePanel';
import { TilePreview } from './TilePreview';

export interface BoardControl {
  highlights: Highlight[];
  onTileClick?: (tileId: string) => void;
}

interface Props {
  game: GameState;
  pending: PendingDecision;
  dispatch: (a: Action) => string | null;
  setBoard: (c: BoardControl) => void;
}

function useBoard(setBoard: (c: BoardControl) => void, control: BoardControl, deps: unknown[]) {
  useEffect(() => {
    setBoard(control);
    return () => setBoard({ highlights: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Counter({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <span className="counter">
      <button className="small" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        −
      </button>
      <span className="n">{value}</span>
      <button className="small" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        +
      </button>
    </span>
  );
}

export function DecisionPanel(props: Props) {
  const { pending } = props;
  const name = props.game.players[pending.playerId].leaderName;
  return (
    <div className="decision">
      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
        <PlayerSwatch game={props.game} pid={pending.playerId} />
        {name} must decide
      </div>
      {(() => {
        switch (pending.kind) {
          case 'chooseRole':
            return <ChooseRole {...props} pending={pending} />;
          case 'placeTile':
            return <PlaceTile {...props} pending={pending} />;
          case 'allocate':
            return <Allocate {...props} pending={pending} />;
          case 'setFactionOrder':
            return <SetFactionOrder {...props} pending={pending} />;
          case 'placeFarmers':
            return <PlaceFarmers {...props} pending={pending} />;
          case 'placeBuildings':
            return <PlaceBuildings {...props} pending={pending} />;
          case 'placeShips':
          case 'placeSoldiers':
            return <PlaceCounted {...props} pending={pending} />;
          case 'issueOrder':
            return <IssueOrder {...props} pending={pending} />;
          case 'reaction':
            return <Reaction {...props} pending={pending} />;
          case 'assignCasualties':
            return <AssignCasualties {...props} pending={pending} />;
          case 'retreat':
            return <Retreat {...props} pending={pending} />;
          case 'assignOwnership':
            return <AssignOwnership {...props} pending={pending} />;
          case 'reflagShips':
            return <ReflagShips {...props} pending={pending} />;
          case 'disband':
            return <Disband {...props} pending={pending} />;
          case 'playCards':
            return <PlayCards {...props} pending={pending} />;
          case 'discardDown':
            return <DiscardDown {...props} pending={pending} />;
          case 'invokeApple':
            return <InvokeApple {...props} pending={pending} />;
          case 'philosophersTarget':
            return <PhilosophersTarget {...props} pending={pending} />;
          case 'singOffVote':
            return <SingOffVote {...props} pending={pending} />;
        }
      })()}
    </div>
  );
}

type P<K extends PendingDecision['kind']> = Omit<Props, 'pending'> & { pending: Extract<PendingDecision, { kind: K }> };

function ChooseRole({ game, pending, dispatch }: P<'chooseRole'>) {
  return (
    <div>
      <h2>Choose your role</h2>
      <p>Pick an alliance and an available faction. The Purple (royal) faction must be filled first and begins as General.</p>
      {pending.options.map((o) => {
        const f = game.factions[o.factionId];
        return (
          <button key={o.factionId} style={{ margin: 3, borderLeft: `10px solid ${f.color}` }} onClick={() => dispatch({ kind: 'chooseRole', playerId: pending.playerId, allianceId: o.allianceId, factionId: o.factionId })}>
            {allianceName(o.allianceId)} alliance · {f.name}
            {f.royal ? ' (royal, General)' : ''}
          </button>
        );
      })}
    </div>
  );
}

function PlaceTile({ game, pending, dispatch, setBoard }: P<'placeTile'>) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number | null>(null);
  const [claim, setClaim] = useState(pending.hasCity && pending.canClaim);
  const spots = useMemo(() => new Set(pending.placements.map((p) => p.tileId)), [pending]);
  const rotations = pending.placements.filter((p) => p.tileId === chosen).map((p) => p.rotation);
  useBoard(
    setBoard,
    {
      highlights: [...spots].map((t) => ({ tileId: t, kind: t === chosen ? 'selected' : 'legal' })),
      onTileClick: (id) => {
        if (spots.has(id)) {
          setChosen(id);
          const first = pending.placements.find((p) => p.tileId === id)!;
          setRotation(first.rotation);
        }
      },
    },
    [pending, chosen],
  );
  useEffect(() => {
    setChosen(null);
    setRotation(null);
    setClaim(pending.hasCity && pending.canClaim);
  }, [pending]);
  const touching = pending.placements[0]?.touching ?? 0;
  return (
    <div>
      <h2>Place a tile</h2>
      <p>
        Tiles left in your supply: {pending.supplyRemaining}. This tile must touch {touching >= 3 ? 'three or more' : touching} existing tile{touching === 1 ? '' : 's'} (the most possible). Click a highlighted spot, then choose a rotation.
      </p>
      <TilePreview specId={pending.tileSpecId} rotation={rotation ?? 0} />
      {chosen && (
        <div>
          Rotation:{' '}
          {rotations.map((r) => (
            <button key={r} className={`small ${r === rotation ? 'primary' : ''}`} onClick={() => setRotation(r)}>
              {r * 60}°
            </button>
          ))}
        </div>
      )}
      {pending.hasCity && (
        <label>
          <input type="checkbox" checked={claim} disabled={!pending.canClaim} onChange={(e) => setClaim(e.target.checked)} /> Claim this city as your own ({pending.canClaim ? 'you may claim up to two' : 'you have already claimed two'})
        </label>
      )}
      <div className="actions">
        <button className="primary" disabled={!chosen || rotation === null} onClick={() => dispatch({ kind: 'placeTile', playerId: pending.playerId, tileId: chosen!, rotation: rotation!, claim: claim && pending.hasCity && pending.canClaim })}>
          Place tile
        </button>
      </div>
      <p style={{ fontSize: 11 }}>{game.fullSetup ? `${Object.values(game.fullSetup.supplies).reduce((n, s) => n + s.length, 0)} tiles remain in all supplies.` : ''}</p>
    </div>
  );
}

function Allocate({ game, pending, dispatch }: P<'allocate'>) {
  const [a, setA] = useState<Allocation>(() => ({ ...emptyAllocation(), politicians: pending.capacity }));
  useEffect(() => setA({ ...emptyAllocation(), politicians: pending.capacity }), [pending]);
  const check = checkAllocation(game, pending.playerId, a);
  const set = (k: keyof Allocation) => (n: number) => setA((x) => ({ ...x, [k]: n }));
  const circles = (n: number, max: number) => '●'.repeat(n) + '○'.repeat(Math.max(0, max - n));
  const remaining = pending.capacity - (a.farmers + a.soldiers + a.politicians);
  return (
    <div>
      <h2>Allocation Order</h2>
      <div className="sheet">
        <div className="row">
          <span>TURN: {game.turn}</span>
          <span>PLAYER: {game.players[pending.playerId].leaderName}</span>
        </div>
        <div className="row">
          <span>PRODUCTIVE CAPACITY: {pending.capacity}</span>
          <span>CURRENT RESOURCES: {pending.food} food, {pending.raw} raw</span>
        </div>
        <div className="row">
          <span>
            FARMERS <span className="circles">{circles(a.farmers, Math.min(pending.capacity, 12))}</span>
          </span>
          <Counter value={a.farmers} onChange={set('farmers')} max={a.farmers + remaining} />
        </div>
        <div className="row">
          <span>
            SOLDIERS <span className="circles">{circles(a.soldiers, Math.min(pending.capacity, 12))}</span> +1 food +1 raw each
          </span>
          <Counter value={a.soldiers} onChange={set('soldiers')} max={a.soldiers + remaining} />
        </div>
        <div className="row">
          <span>
            POLITICIANS <span className="circles">{circles(a.politicians, Math.min(pending.capacity, 12))}</span> +1 free
          </span>
          <Counter value={a.politicians} onChange={set('politicians')} max={a.politicians + remaining} />
        </div>
        <div className="row">
          <span>SHIPS (1 raw each)</span>
          <Counter value={a.ships} onChange={set('ships')} />
        </div>
        <div className="row">
          <span>CITY LEVEL IMPROVEMENT (7 raw)</span>
          <Counter value={a.levelUps} onChange={set('levelUps')} />
        </div>
        <div className="row">
          <span>TEMPLE (3 raw, L3 city)</span>
          <Counter value={a.temples} onChange={set('temples')} />
        </div>
        <div className="row">
          <span>UNIVERSITY (3 raw, L3 city)</span>
          <Counter value={a.universities} onChange={set('universities')} />
        </div>
        <div className="row">
          <span>WALLS (2 raw, any level)</span>
          <Counter value={a.walls} onChange={set('walls')} />
        </div>
        <div className="row">
          <span>Capacity used: {check.capacityUsed} / {check.capacity}</span>
          <span>Food cost: {check.foodCost} / {pending.food}</span>
          <span>Raw cost: {check.rawCost} / {pending.raw}</span>
        </div>
      </div>
      {check.errors.map((e) => (
        <div className="error" key={e}>
          {e}
        </div>
      ))}
      {check.warnings.map((w) => (
        <div className="warn" key={w}>
          Warning: {w}
        </div>
      ))}
      <div className="actions">
        <button className="primary" disabled={!check.ok} onClick={() => dispatch({ kind: 'allocate', playerId: pending.playerId, allocation: a })}>
          Seal the allocation sheet
        </button>
      </div>
    </div>
  );
}

function SetFactionOrder({ game, pending, dispatch }: P<'setFactionOrder'>) {
  const [order, setOrder] = useState<PlayerId[]>(pending.members);
  useEffect(() => setOrder(pending.members), [pending]);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  return (
    <div>
      <h2>Set the {allianceName(pending.allianceId)} order for the turn</h2>
      <p>As General you decide who goes first, second and third within your alliance for deployment, feeding and everything else this turn.</p>
      {order.map((pid, i) => (
        <div key={pid} className="unit-row">
          <b>{i + 1}.</b> <PlayerSwatch game={game} pid={pid} /> {game.players[pid].leaderName}
          <button className="small" onClick={() => move(i, -1)} disabled={i === 0}>
            ↑
          </button>
          <button className="small" onClick={() => move(i, 1)} disabled={i === order.length - 1}>
            ↓
          </button>
        </div>
      ))}
      <div className="actions">
        <button className="primary" onClick={() => dispatch({ kind: 'setFactionOrder', playerId: pending.playerId, order })}>
          Confirm order
        </button>
      </div>
    </div>
  );
}

function PlaceFarmers({ game, pending, dispatch, setBoard }: P<'placeFarmers'>) {
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [pending]);
  const legal = useMemo(() => new Set(pending.legalTiles.map((t) => t.tileId)), [pending]);
  useBoard(
    setBoard,
    {
      highlights: [...legal].map((t) => ({ tileId: t, kind: sel.includes(t) ? 'selected' : 'legal' })),
      onTileClick: (id) => {
        if (!legal.has(id)) return;
        setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < pending.count ? [...s, id] : s));
      },
    },
    [pending, sel],
  );
  return (
    <div>
      <h2>Send farmers to the fields</h2>
      <p>
        Place {pending.count} farmer{pending.count === 1 ? '' : 's'} now ({pending.remaining} remaining). Click highlighted tiles: within two land tiles of your cities, or beside a chain of your alliance's manned ships. Tiles reachable only by sea are marked.
      </p>
      <div>
        Chosen: {sel.map((t) => tileLabel(tile(game, t))).join(', ') || 'none yet'}
      </div>
      <div className="actions">
        <button className="primary" disabled={sel.length !== pending.count} onClick={() => dispatch({ kind: 'placeFarmers', playerId: pending.playerId, tileIds: sel })}>
          Place farmers
        </button>
        <button onClick={() => setSel([])}>Clear</button>
      </div>
    </div>
  );
}

function PlaceBuildings({ game, pending, dispatch }: P<'placeBuildings'>) {
  const [list, setList] = useState<BuildingPlacement[]>([]);
  useEffect(() => setList([]), [pending]);
  const remaining = { ...pending.purchases };
  for (const p of list) {
    if (p.kind === 'levelUp') remaining.levelUps--;
    if (p.kind === 'temple') remaining.temples--;
    if (p.kind === 'university') remaining.universities--;
    if (p.kind === 'walls') remaining.walls--;
  }
  const err = checkBuildingPlacements(game, pending.playerId, pending.purchases, list);
  const kinds: { kind: BuildingKind; label: string; left: number }[] = [
    { kind: 'levelUp', label: 'City level improvement', left: remaining.levelUps },
    { kind: 'temple', label: 'Temple', left: remaining.temples },
    { kind: 'university', label: 'University', left: remaining.universities },
    { kind: 'walls', label: 'Walls', left: remaining.walls },
  ];
  const [kind, setKind] = useState<BuildingKind>('levelUp');
  const [city, setCity] = useState(pending.cityTileIds[0]);
  return (
    <div>
      <h2>Raise buildings and improvements</h2>
      <p>Place your purchases in the order you choose: a level-up placed first lets a Temple or University follow in the same city. Anything left unplaced is lost.</p>
      <div>
        {kinds.map((k) => (
          <span key={k.kind} className="chip">
            {k.label}: {k.left}
          </span>
        ))}
      </div>
      <div className="unit-row">
        <select value={kind} onChange={(e) => setKind(e.target.value as BuildingKind)}>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind} disabled={k.left <= 0}>
              {k.label}
            </option>
          ))}
        </select>
        <select value={city} onChange={(e) => setCity(e.target.value)}>
          {pending.cityTileIds.map((c) => (
            <option key={c} value={c}>
              {tile(game, c).city!.name} (L{tile(game, c).city!.level})
            </option>
          ))}
        </select>
        <button className="small" onClick={() => setList((l) => [...l, { kind, tileId: city }])}>
          Add
        </button>
      </div>
      <ol>
        {list.map((p, i) => (
          <li key={i}>
            {p.kind} in {tile(game, p.tileId).city!.name}{' '}
            <button className="small" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
              remove
            </button>
          </li>
        ))}
      </ol>
      {err && <div className="error">{err}</div>}
      <div className="actions">
        <button className="primary" disabled={!!err} onClick={() => dispatch({ kind: 'placeBuildings', playerId: pending.playerId, placements: list })}>
          Confirm placements
        </button>
      </div>
    </div>
  );
}

function PlaceCounted({ game, pending, dispatch, setBoard }: Omit<Props, 'pending'> & { pending: Extract<PendingDecision, { kind: 'placeShips' | 'placeSoldiers' }> }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => setCounts({}), [pending]);
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  const kind = pending.kind === 'placeShips' ? 'ship' : 'soldier';
  useBoard(
    setBoard,
    {
      highlights: pending.legalTiles.map((t) => ({ tileId: t, kind: (counts[t] ?? 0) > 0 ? 'selected' : 'legal' })),
      onTileClick: (id) => {
        if (!pending.legalTiles.includes(id) || sum >= pending.count) return;
        setCounts((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
      },
    },
    [pending, counts, sum],
  );
  return (
    <div>
      <h2>Place {pending.count} {kind}{pending.count === 1 ? '' : 's'}</h2>
      <p>{kind === 'ship' ? 'Ships are built in coastal or island cities you control.' : 'New soldiers muster in cities you control.'} Click cities or use the counters.</p>
      {pending.legalTiles.map((t) => (
        <div key={t} className="unit-row">
          <span style={{ width: 160 }}>{tile(game, t).city!.name}</span>
          <Counter value={counts[t] ?? 0} onChange={(n) => setCounts((c) => ({ ...c, [t]: n }))} max={(counts[t] ?? 0) + (pending.count - sum)} />
        </div>
      ))}
      <div className="actions">
        <button className="primary" disabled={sum !== pending.count} onClick={() => dispatch({ kind: pending.kind, playerId: pending.playerId, counts })}>
          Place {kind}s ({sum}/{pending.count})
        </button>
      </div>
    </div>
  );
}

function IssueOrder({ game, pending, dispatch, setBoard }: P<'issueOrder'>) {
  const [source, setSource] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, Record<string, number>>>({}); // dest -> groupKey -> n
  const [confirm, setConfirm] = useState(false);
  const [scuttle, setScuttle] = useState<string[]>([]);
  useEffect(() => {
    setSource(null);
    setAssign({});
    setConfirm(false);
    setScuttle([]);
  }, [pending]);
  const groups = useMemo(() => {
    const units = source ? movableUnitsAt(game, pending.allianceId, source) : [];
    const m = new Map<string, { key: string; ownerId: PlayerId; kind: 'soldier' | 'ship'; ids: string[] }>();
    for (const u of units) {
      const key = `${u.ownerId}:${u.kind}`;
      const g = m.get(key) ?? { key, ownerId: u.ownerId, kind: u.kind as 'soldier' | 'ship', ids: [] };
      g.ids.push(u.id);
      m.set(key, g);
    }
    return [...m.values()];
  }, [game, pending.allianceId, source]);
  const dests = source ? destinationsFrom(game, source) : [];
  const used = (key: string) => Object.values(assign).reduce((n, d) => n + (d[key] ?? 0), 0);
  const groupsForAction = () => {
    const taken: Record<string, number> = {};
    const out: { destTileId: string; unitIds: string[] }[] = [];
    for (const [dest, byKey] of Object.entries(assign)) {
      const ids: string[] = [];
      for (const [key, n] of Object.entries(byKey)) {
        if (n <= 0) continue;
        const g = groups.find((x) => x.key === key);
        if (!g) continue;
        const start = taken[key] ?? 0;
        ids.push(...g.ids.slice(start, start + n));
        taken[key] = start + n;
      }
      if (ids.length) out.push({ destTileId: dest, unitIds: ids });
    }
    return out;
  };
  const actionGroups = groupsForAction();
  let err: string | null = null;
  if (source && actionGroups.length) {
    try {
      validateOrder(game, pending.allianceId, pending.subPhase, source, actionGroups);
    } catch (e) {
      err = (e as Error).message;
    }
  }
  useBoard(
    setBoard,
    {
      highlights: source
        ? [{ tileId: source, kind: 'source' }, ...dests.map((d) => ({ tileId: d.tileId, kind: (assign[d.tileId] && Object.values(assign[d.tileId]).some((n) => n > 0) ? 'selected' : 'legal') as Highlight['kind'] }))]
        : pending.sourceTileIds.map((t) => ({ tileId: t, kind: 'legal' as const })),
      onTileClick: (id) => {
        if (!source) {
          if (pending.sourceTileIds.includes(id)) setSource(id);
          return;
        }
        if (pending.sourceTileIds.includes(id) && id !== source && !dests.some((d) => d.tileId === id)) {
          setSource(id);
          setAssign({});
          return;
        }
        if (dests.some((d) => d.tileId === id)) {
          // quick assign: one soldier (and a ship if crossing sea) from the first group with units left
          setAssign((a) => {
            const cur = { ...(a[id] ?? {}) };
            const sea = dests.find((d) => d.tileId === id)!.via === 'sea';
            const sg = groups.find((g) => g.kind === 'soldier' && used(g.key) < g.ids.length);
            if (!sg) return a;
            cur[sg.key] = (cur[sg.key] ?? 0) + 1;
            if (sea) {
              const shg = groups.find((g) => g.kind === 'ship' && used(g.key) < g.ids.length);
              if (shg) cur[shg.key] = (cur[shg.key] ?? 0) + 1;
            }
            return { ...a, [id]: cur };
          });
        }
      },
    },
    [pending, source, assign, groups.length],
  );
  const announce = () => {
    const parts = actionGroups.map((g) => {
      const s = g.unitIds.filter((id) => game.units[id].kind === 'soldier').length;
      const sh = g.unitIds.filter((id) => game.units[id].kind === 'ship').length;
      const desc = [s ? `${s} SOLDIER${s === 1 ? '' : 'S'}` : '', sh ? `${sh} SHIP${sh === 1 ? '' : 'S'}` : ''].filter(Boolean).join(' AND ');
      return `${desc} TO ${tileLabel(tile(game, g.destTileId)).toUpperCase()}`;
    });
    return `I, ${game.players[pending.playerId].leaderName.toUpperCase()}, ISSUE A FINAL ORDER. ${parts.join(', ')}.`;
  };
  return (
    <div>
      <h2>Orders of the {allianceName(pending.allianceId)} General</h2>
      <p style={{ fontSize: 12 }}>
        {pending.subPhase.startsWith('ships') ? 'Ship sub-phase: only manned ships (one soldier per ship) may move, across sea edges.' : 'Full movement: soldiers march across land edges without mountains; manned ships sail across sea edges.'} Each order disposes of one tile: pick a source, then assign units to adjacent destinations.
      </p>
      {!source && <p>Click a highlighted tile holding units you can still order, or pass.</p>}
      {source && (
        <div>
          <div>
            <b>From {tileLabel(tile(game, source))}</b>: {groups.map((g) => `${g.ids.length} ${g.kind}${g.ids.length === 1 ? '' : 's'} of ${game.players[g.ownerId].leaderName}`).join(', ')}
          </div>
          {dests.map((d) => (
            <div key={d.tileId} style={{ border: '1px solid #b59f75', borderRadius: 4, padding: 4, margin: '4px 0' }}>
              <b>
                To {tileLabel(tile(game, d.tileId))} <span className="chip">{d.via === 'sea' ? 'by sea' : 'by land'}</span>
              </b>{' '}
              {describeOccupants(game, d.tileId)}
              <div>
                {groups
                  .filter((g) => (d.via === 'sea' ? true : g.kind === 'soldier'))
                  .map((g) => (
                    <span key={g.key} style={{ marginRight: 10 }}>
                      <PlayerSwatch game={game} pid={g.ownerId} />
                      {g.kind}s{' '}
                      <Counter value={assign[d.tileId]?.[g.key] ?? 0} onChange={(n) => setAssign((a) => ({ ...a, [d.tileId]: { ...(a[d.tileId] ?? {}), [g.key]: n } }))} max={(assign[d.tileId]?.[g.key] ?? 0) + g.ids.length - used(g.key)} />
                    </span>
                  ))}
              </div>
            </div>
          ))}
          {err && <div className="error">{err}</div>}
        </div>
      )}
      {pending.scuttleableShipIds.length > 0 && (
        <details>
          <summary>Unmanned ships ({pending.scuttleableShipIds.length}) — destroy some?</summary>
          {pending.scuttleableShipIds.map((id) => (
            <label key={id}>
              <input type="checkbox" checked={scuttle.includes(id)} onChange={(e) => setScuttle((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))} /> ship of {game.players[game.units[id].ownerId].leaderName} on {tileLabel(tile(game, game.units[id].tileId))}
            </label>
          ))}
          <button className="small danger" disabled={scuttle.length === 0} onClick={() => dispatch({ kind: 'scuttle', playerId: pending.playerId, unitIds: scuttle })}>
            Destroy selected ships
          </button>
        </details>
      )}
      <div className="actions">
        <button className="primary" disabled={!source || actionGroups.length === 0 || !!err} onClick={() => setConfirm(true)}>
          Announce the FINAL ORDER
        </button>
        {source && (
          <button
            onClick={() => {
              setSource(null);
              setAssign({});
            }}
          >
            Choose another tile
          </button>
        )}
        <button onClick={() => dispatch({ kind: 'pass', playerId: pending.playerId })}>No further orders (pass)</button>
      </div>
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Announce in a clear voice:</p>
            <h2 style={{ letterSpacing: '0.06em' }}>{announce()}</h2>
            <p style={{ fontSize: 12 }}>Once announced, the order may not be altered; cards impacting it must be played immediately.</p>
            <div className="actions">
              <button
                className="primary"
                onClick={() => {
                  setConfirm(false);
                  dispatch({ kind: 'order', playerId: pending.playerId, sourceTileId: source!, groups: actionGroups });
                }}
              >
                So ordered
              </button>
              <button onClick={() => setConfirm(false)}>Reconsider</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function describeOccupants(game: GameState, tileId: string): string {
  const t = tile(game, tileId);
  const us = unitsOnTile(game, tileId);
  const parts: string[] = [];
  if (t.city) parts.push(`${t.city.ownerId ? `city of ${game.players[t.city.ownerId].leaderName}` : 'neutral city'} L${t.city.level}${t.city.walls ? ' walled' : ''}`);
  if (us.length) {
    const a = game.players[us[0].ownerId].allianceId!;
    parts.push(`${allianceName(a)}: ${['soldier', 'ship', 'farmer'].map((k) => ({ k, n: us.filter((u) => u.kind === k).length })).filter((x) => x.n).map((x) => `${x.n} ${x.k}${x.n === 1 ? '' : 's'}`).join(', ')}${us.some((u) => u.spent) ? ' (some spent)' : ''}`);
  }
  return parts.length ? `— ${parts.join('; ')}` : '— empty';
}

function Reaction({ game, pending, dispatch }: P<'reaction'>) {
  const def = CARD_BY_TYPE[pending.cardType];
  const inMilitary = game.phase === 'military';
  const hand = game.players[pending.playerId].hand.length;
  const canPlay = pending.holdsCard && (!inMilitary || hand > 1);
  return (
    <div>
      <h2>{def.name}</h2>
      <p>{pending.description}</p>
      <p style={{ fontSize: 12, fontStyle: 'italic' }}>{def.text}</p>
      {!pending.holdsCard && <p className="warn">You do not hold this card. Decline (nobody will know whether you could have played it).</p>}
      {pending.holdsCard && inMilitary && hand <= 1 && <p className="warn">It is your last card; one must remain for politics, so you cannot play it now.</p>}
      <div className="actions">
        <button className="primary" disabled={!canPlay} onClick={() => dispatch({ kind: 'react', playerId: pending.playerId, play: true })}>
          Play {def.name}
        </button>
        <button onClick={() => dispatch({ kind: 'react', playerId: pending.playerId, play: false })}>Decline</button>
      </div>
    </div>
  );
}

function AssignCasualties({ game, pending, dispatch }: P<'assignCasualties'>) {
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => setSel([]), [pending]);
  return (
    <div>
      <h2>Choose {pending.hits} casualt{pending.hits === 1 ? 'y' : 'ies'}</h2>
      <p>Your {pending.side === 'attacker' ? 'attacking' : 'defending'} force has taken {pending.hits} hit(s). Spent soldiers may be sacrificed (footnote 27). A soldier at sea takes its ship with it.</p>
      {pending.candidates.map((id) => {
        const u = game.units[id];
        return (
          <label key={id}>
            <input type="checkbox" checked={sel.includes(id)} disabled={!sel.includes(id) && sel.length >= pending.hits} onChange={(e) => setSel((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))} /> <PlayerSwatch game={game} pid={u.ownerId} />
            soldier of {game.players[u.ownerId].leaderName}
            {u.spent ? ' (spent)' : ''}
          </label>
        );
      })}
      <div className="actions">
        <button className="primary" disabled={sel.length !== pending.hits} onClick={() => dispatch({ kind: 'assignCasualties', playerId: pending.playerId, unitIds: sel })}>
          Remove the fallen
        </button>
      </div>
    </div>
  );
}

function Retreat({ game, pending, dispatch, setBoard }: P<'retreat'>) {
  const [moves, setMoves] = useState<Record<string, string>>({});
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const u of pending.units) init[u.unitId] = u.destinations[0]?.tileId ?? '';
    setMoves(init);
  }, [pending]);
  const byShip = pending.units.filter((u) => u.destinations.find((d) => d.tileId === moves[u.unitId])?.byShip).length;
  const seaOnly = (u: (typeof pending.units)[number]) => u.destinations.every((d) => d.byShip);
  const leftBehind = pending.units.filter((u) => !moves[u.unitId]);
  const mustFillShips = leftBehind.length > 0 && byShip < pending.shipsAvailable;
  const allDest = [...new Set(pending.units.flatMap((u) => u.destinations.map((d) => d.tileId)))];
  useBoard(setBoard, { highlights: [{ tileId: pending.tileId, kind: 'source' }, ...allDest.map((t) => ({ tileId: t, kind: 'legal' as const }))] }, [pending]);
  return (
    <div>
      <h2>Retreat from {tileLabel(tile(game, pending.tileId))}</h2>
      <p>Your defenders are defeated and must retreat to adjacent empty or friendly tiles; they will be spent until the end of the sub-phase. Ships available for retreat by sea: {pending.shipsAvailable}.</p>
      {pending.units.map((u) => (
        <div key={u.unitId} className="unit-row">
          <PlayerSwatch game={game} pid={game.units[u.unitId].ownerId} /> soldier of {game.players[game.units[u.unitId].ownerId].leaderName} →
          <select value={moves[u.unitId] ?? ''} onChange={(e) => setMoves((m) => ({ ...m, [u.unitId]: e.target.value }))}>
            {seaOnly(u) && <option value="">left behind (destroyed)</option>}
            {u.destinations.map((d) => (
              <option key={d.tileId} value={d.tileId}>
                {tileLabel(tile(game, d.tileId))}
                {d.byShip ? ' (by ship)' : ''}
              </option>
            ))}
          </select>
        </div>
      ))}
      {byShip > pending.shipsAvailable && <div className="error">Only {pending.shipsAvailable} ship(s) are available: leave the extra soldiers behind.</div>}
      {mustFillShips && <div className="error">Fill every ship before leaving a soldier behind.</div>}
      <div className="actions">
        <button className="primary" disabled={byShip > pending.shipsAvailable || mustFillShips} onClick={() => dispatch({ kind: 'retreat', playerId: pending.playerId, moves: pending.units.filter((u) => moves[u.unitId]).map((u) => ({ unitId: u.unitId, tileId: moves[u.unitId] })) })}>
          Order the retreat
        </button>
      </div>
    </div>
  );
}

function AssignOwnership({ game, pending, dispatch }: P<'assignOwnership'>) {
  const t = tile(game, pending.tileId);
  return (
    <div>
      <h2>{pending.reason === 'trojan' ? 'The Trojan Horse delivers a city' : pending.reason === 'neutral' ? 'A city is taken' : 'A city is conquered'}</h2>
      <p>
        {t.city!.name} (Level {t.city!.level}) must be assigned to a member of the alliance.
      </p>
      {pending.candidates.map((pid) => (
        <button key={pid} style={{ margin: 3 }} onClick={() => dispatch({ kind: 'assignOwnership', playerId: pending.playerId, ownerId: pid })}>
          <PlayerSwatch game={game} pid={pid} />
          {game.players[pid].leaderName} ({cityCount(game, pid)} cities)
        </button>
      ))}
    </div>
  );
}

function ReflagShips({ game, pending, dispatch }: P<'reflagShips'>) {
  return (
    <div>
      <h2>Captured ships</h2>
      <p>
        {pending.unitIds.length} unmanned ship(s) on {tileLabel(tile(game, pending.tileId))} are captured. Which faction shall fly its flag on them?
      </p>
      {pending.candidates.map((pid) => (
        <button key={pid} style={{ margin: 3 }} onClick={() => dispatch({ kind: 'reflagShips', playerId: pending.playerId, ownerId: pid })}>
          <PlayerSwatch game={game} pid={pid} />
          {game.players[pid].leaderName}
        </button>
      ))}
    </div>
  );
}

function Disband({ game, pending, dispatch }: P<'disband'>) {
  return (
    <div>
      <h2>The army goes hungry</h2>
      <p>You are short {pending.shortfall} food. Choose a soldier to disband (one at a time).</p>
      {pending.candidates.map((id) => (
        <button key={id} style={{ margin: 3 }} onClick={() => dispatch({ kind: 'disband', playerId: pending.playerId, unitId: id })}>
          soldier on {tileLabel(tile(game, game.units[id].tileId))}
        </button>
      ))}
    </div>
  );
}

function PlayCards({ game, pending, dispatch }: P<'playCards'>) {
  const [play, setPlay] = useState<string[]>([]);
  useEffect(() => setPlay([]), [pending]);
  const hand = game.players[pending.playerId].hand;
  const total = play.reduce((n, uid) => n + CARD_BY_TYPE[game.cards[uid].type].value, 0);
  const a = game.players[pending.playerId].allianceId!;
  const rivals = game.seatOrder.filter((p) => p !== pending.playerId && game.players[p].allianceId === a);
  return (
    <div style={{ maxWidth: 540 }}>
      <h2>Politics{pending.round > 1 ? ` (replay ${pending.round})` : ''}</h2>
      <p style={{ fontSize: 12 }}>
        Click cards to move them between RETAIN and PLAY. You must play at least one. The highest total in your alliance becomes General; ties favour the incumbent, then the General's order. Rivals' hands: {rivals.map((r) => `${game.players[r].leaderName} ${game.players[r].hand.length}`).join(', ') || 'none (you are alone in your alliance)'}.
      </p>
      <div>
        {hand.map((uid) => {
          const def = CARD_BY_TYPE[game.cards[uid].type];
          const inPlay = play.includes(uid);
          return (
            <div key={uid} className={`card ${inPlay ? 'play' : ''}`} onClick={() => setPlay((p) => (inPlay ? p.filter((x) => x !== uid) : [...p, uid]))}>
              {inPlay && <span className="tag">PLAY</span>}
              <div>
                <div className="value">{def.value}</div>
                <div className="name">{def.name}</div>
              </div>
              <div className="text">{def.text.slice(0, 110)}{def.text.length > 110 ? '…' : ''}</div>
            </div>
          );
        })}
      </div>
      <div>
        PLAY total: <b>{total}</b> ({play.length} card{play.length === 1 ? '' : 's'}); RETAIN {hand.length - play.length}
      </div>
      <div className="actions">
        <button className="primary" disabled={play.length === 0} onClick={() => dispatch({ kind: 'playCards', playerId: pending.playerId, cardUids: play })}>
          Seal the PLAY envelope
        </button>
      </div>
    </div>
  );
}

function DiscardDown({ game, pending, dispatch }: P<'discardDown'>) {
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => setChosen([]), [pending]);
  return (
    <div style={{ maxWidth: 540 }}>
      <h2>Hand limit</h2>
      <p style={{ fontSize: 12 }}>
        You hold {pending.hand.length} cards; the limit is {pending.limit}. Click {pending.count} card{pending.count === 1 ? '' : 's'} to discard. The log records only how many.
      </p>
      <div>
        {pending.hand.map((uid) => {
          const def = CARD_BY_TYPE[game.cards[uid].type];
          const out = chosen.includes(uid);
          return (
            <div key={uid} className={`card ${out ? 'play' : ''}`} onClick={() => setChosen((c) => (out ? c.filter((x) => x !== uid) : c.length < pending.count ? [...c, uid] : c))}>
              {out && <span className="tag">DISCARD</span>}
              <div>
                <div className="value">{def.value}</div>
                <div className="name">{def.name}</div>
              </div>
              <div className="text">{def.text.slice(0, 110)}{def.text.length > 110 ? '…' : ''}</div>
            </div>
          );
        })}
      </div>
      <div className="actions">
        <button className="primary" disabled={chosen.length !== pending.count} onClick={() => dispatch({ kind: 'discardDown', playerId: pending.playerId, cardUids: chosen })}>
          Discard {chosen.length} / {pending.count}
        </button>
      </div>
    </div>
  );
}

function InvokeApple({ game, pending, dispatch }: P<'invokeApple'>) {
  const round = game.turnData.politics!;
  const a = game.players[pending.playerId].allianceId!;
  const members = game.seatOrder.filter((p) => game.players[p].allianceId === a);
  return (
    <div>
      <h2>Apple of Discord</h2>
      <p>You played the Apple of Discord. Scores this round: {members.map((m) => `${game.players[m].leaderName} ${round.scores[m] ?? 0}`).join(', ')}.</p>
      <p>Invoke it? All played cards stay spent, every leader draws one card, and the whole PLAY phase is repeated.</p>
      <div className="actions">
        <button className="danger" onClick={() => dispatch({ kind: 'invokeApple', playerId: pending.playerId, invoke: true })}>
          Invoke discord
        </button>
        <button onClick={() => dispatch({ kind: 'invokeApple', playerId: pending.playerId, invoke: false })}>Let it lie</button>
      </div>
    </div>
  );
}

function PhilosophersTarget({ game, pending, dispatch }: P<'philosophersTarget'>) {
  const [partner, setPartner] = useState(pending.targets[0].partnerId);
  const [city, setCity] = useState(pending.targets[0].cityTileIds[0]);
  useEffect(() => {
    setPartner(pending.targets[0].partnerId);
    setCity(pending.targets[0].cityTileIds[0]);
  }, [pending]);
  const t = pending.targets.find((x) => x.partnerId === partner)!;
  return (
    <div>
      <h2>Attacked by Philosophers</h2>
      <p>Name an alliance partner with at least two cities and the city you covet. Evens: it is yours. Odds: you lose every remaining card in your hand.</p>
      <select
        value={partner}
        onChange={(e) => {
          setPartner(e.target.value);
          setCity(pending.targets.find((x) => x.partnerId === e.target.value)!.cityTileIds[0]);
        }}
      >
        {pending.targets.map((x) => (
          <option key={x.partnerId} value={x.partnerId}>
            {game.players[x.partnerId].leaderName}
          </option>
        ))}
      </select>{' '}
      <select value={city} onChange={(e) => setCity(e.target.value)}>
        {t.cityTileIds.map((c) => (
          <option key={c} value={c}>
            {tile(game, c).city!.name} (L{tile(game, c).city!.level})
          </option>
        ))}
      </select>
      <div className="actions">
        <button className="primary" onClick={() => dispatch({ kind: 'philosophersTarget', playerId: pending.playerId, partnerId: partner, cityTileId: city })}>
          Loose the philosophers
        </button>
      </div>
    </div>
  );
}

function SingOffVote({ game, pending, dispatch }: P<'singOffVote'>) {
  return (
    <div>
      <h2>The Sing-Off</h2>
      <p>{pending.tiedPlayerIds.map((p) => game.players[p].leaderName).join(' and ')} are tied even after every tiebreaker. Each must sing a song. You judge: whose was finest?</p>
      {pending.tiedPlayerIds.map((pid) => (
        <button key={pid} style={{ margin: 3 }} onClick={() => dispatch({ kind: 'singOffVote', playerId: pending.playerId, votedFor: pid })}>
          <PlayerSwatch game={game} pid={pid} />
          {game.players[pid].leaderName}
        </button>
      ))}
    </div>
  );
}

export function isPrivateDecision(p: PendingDecision): boolean {
  return p.kind === 'allocate' || p.kind === 'playCards' || p.kind === 'reaction' || p.kind === 'discardDown';
}

export function privateWhat(p: PendingDecision): string {
  switch (p.kind) {
    case 'allocate':
      return 'The allocation sheet is filled in privately and revealed only through deployment.';
    case 'playCards':
      return 'Fill the PLAY and RETAIN envelopes in private. Hands are secret; only their size is known.';
    case 'discardDown':
      return 'Your hand is over the limit. Choose your discards in private.';
    case 'reaction':
      return 'A reaction window has opened. Whether you hold the card is your own affair.';
    default:
      return '';
  }
}

export { capacityOf };
