import { useMemo, useRef, useState } from 'react';
import type { GameState, Tile, Unit } from '../engine/types';
import { edgeCorners, hexCorners, hexToPixel, neighbor, parseTileId, tileId } from '../engine/hex';
import { tileType } from '../engine/map';
import { ALLIANCE_COLORS } from '../data/factions';

export type HighlightKind = 'legal' | 'selected' | 'source';
export interface Highlight {
  tileId: string;
  kind: HighlightKind;
}

/** A march drawn on the map: planned orders, or what happened in a resolved round. */
export interface BoardArrow {
  from: string;
  to: string;
  color: string;
  style: 'arrived' | 'repulsed' | 'lost' | 'draft';
  label?: string;
}

/** A battle marker, on a tile or (for a border clash) on the edge toward another tile. */
export interface BoardMarker {
  tileId: string;
  towardTileId?: string;
  text: string;
}

export interface BoardProps {
  game: GameState;
  highlights: Highlight[];
  onTileClick?: (tileId: string) => void;
  showCoords?: boolean;
  arrows?: BoardArrow[];
  markers?: BoardMarker[];
}

const SIZE = 36;

function pointsStr(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function Board({ game, highlights, onTileClick, showCoords, arrows = [], markers = [] }: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const tiles = useMemo(() => Object.values(game.tiles), [game.tiles]);
  // highlighted positions with no tile yet (Full Game placement spots)
  const ghosts = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; q: number; r: number; kind: HighlightKind }[] = [];
    for (const h of highlights) {
      if (game.tiles[h.tileId] || seen.has(h.tileId)) continue;
      seen.add(h.tileId);
      const { q, r } = parseTileId(h.tileId);
      out.push({ id: h.tileId, q, r, kind: h.kind });
    }
    return out;
  }, [highlights, game.tiles]);
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of [...tiles, ...ghosts]) {
      const p = hexToPixel(t, SIZE);
      minX = Math.min(minX, p.x - SIZE);
      maxX = Math.max(maxX, p.x + SIZE);
      minY = Math.min(minY, p.y - SIZE);
      maxY = Math.max(maxY, p.y + SIZE);
    }
    if (!isFinite(minX)) return { minX: -200, minY: -200, w: 400, h: 400 };
    return { minX: minX - 20, minY: minY - 20, w: maxX - minX + 40, h: maxY - minY + 40 };
  }, [tiles, ghosts]);

  // one name label per river, on the uninhabited tile nearest the middle of its course
  const riverLabels = useMemo(() => {
    const byName = new Map<string, Tile[]>();
    for (const t of tiles) if (t.river) byName.set(t.river, [...(byName.get(t.river) ?? []), t]);
    return [...byName].map(([name, ts]) => {
      const course = ts.sort((a, b) => a.q - b.q || a.r - b.r);
      const open = course.filter((t) => !t.city);
      const at = (open.length ? open : course)[Math.floor((open.length ? open : course).length / 2)];
      return { name, ...hexToPixel(at, SIZE) };
    });
  }, [tiles]);

  const riverLinks = useMemo(() => riverCourse(game.tiles), [game.tiles]);

  const hl = useMemo(() => {
    const m = new Map<string, HighlightKind>();
    for (const h of highlights) m.set(h.tileId, h.kind);
    return m;
  }, [highlights]);

  const unitsByTile = useMemo(() => {
    const m = new Map<string, Unit[]>();
    for (const u of Object.values(game.units)) {
      const arr = m.get(u.tileId) ?? [];
      arr.push(u);
      m.set(u.tileId, arr);
    }
    return m;
  }, [game.units]);

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => ({ ...v, k: Math.min(4, Math.max(0.4, v.k * factor)) }));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      drag.current.moved = true;
      setDragging(true);
    }
    if (drag.current.moved) {
      const scale = viewScale();
      setView((v) => ({ ...v, x: drag.current!.vx + dx / scale, y: drag.current!.vy + dy / scale }));
    }
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const viewScale = () => {
    const el = svgRef.current;
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    return Math.min(r.width / bounds.w, r.height / bounds.h) * view.k;
  };
  const clickTile = (id: string) => {
    if (drag.current?.moved) return;
    onTileClick?.(id);
  };

  return (
    <svg
      ref={svgRef}
      className={dragging ? 'dragging' : ''}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <g transform={`translate(${bounds.minX + bounds.w / 2} ${bounds.minY + bounds.h / 2}) scale(${view.k}) translate(${-(bounds.minX + bounds.w / 2) + view.x} ${-(bounds.minY + bounds.h / 2) + view.y})`}>
        {tiles.map((t) => (
          <TileView key={t.id} tile={t} game={game} units={unitsByTile.get(t.id) ?? []} highlight={hl.get(t.id)} onClick={() => clickTile(t.id)} showCoords={!!showCoords} riverDirs={riverLinks.get(t.id)} />
        ))}
        {/* city names on top of every hex, so a neighbouring tile never covers the end of one */}
        {tiles
          .filter((t) => t.city)
          .map((t) => {
            const c = hexToPixel(t, SIZE);
            return (
              <text key={`name-${t.id}`} className="city-label" x={c.x} y={c.y + SIZE - 8}>
                {t.city!.name}
              </text>
            );
          })}
        {riverLabels.map((l) => (
          <text key={`river-${l.name}`} className="river-label" x={l.x} y={l.y - SIZE * 0.55}>
            {l.name}
          </text>
        ))}
        {arrows.map((a, i) => (
          <Arrow key={`arrow-${i}`} arrow={a} />
        ))}
        {markers.map((m, i) => {
          const c = hexToPixel(parseTileId(m.tileId), SIZE);
          const o = m.towardTileId ? hexToPixel(parseTileId(m.towardTileId), SIZE) : c;
          const x = (c.x + o.x) / 2;
          const y = (c.y + o.y) / 2 - (m.towardTileId ? 0 : SIZE * 0.45);
          return (
            <g key={`marker-${i}`} pointerEvents="none">
              <circle cx={x} cy={y} r={9} fill="#8b1a1a" stroke="#fff" strokeWidth={1.5} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="#fff">
                {m.text}
              </text>
            </g>
          );
        })}
        {ghosts.map((g) => {
          const c = hexToPixel(g, SIZE);
          const corners = hexCorners(c.x, c.y, SIZE);
          return (
            <g key={`ghost-${g.id}`} onClick={() => clickTile(g.id)} className="legal">
              <polygon className="hex ghost" points={pointsStr(corners)} />
              <polygon className={`hex-highlight ${g.kind}`} points={pointsStr(corners.map((p) => ({ x: p.x + (c.x - p.x) * 0.06, y: p.y + (c.y - p.y) * 0.06 })))} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function TileView({ tile, game, units, highlight, onClick, showCoords, riverDirs }: { tile: Tile; game: GameState; units: Unit[]; highlight?: HighlightKind; onClick: () => void; showCoords: boolean; riverDirs?: number[] }) {
  const c = hexToPixel(tile, SIZE);
  const corners = hexCorners(c.x, c.y, SIZE);
  const type = tileType(tile);
  const inset = (p: { x: number; y: number }, f: number) => ({ x: p.x + (c.x - p.x) * f, y: p.y + (c.y - p.y) * f });
  return (
    <g onClick={onClick} className={highlight === 'legal' ? 'legal' : ''}>
      <polygon className={`hex ${type} ${highlight ? 'legal' : ''}`} points={pointsStr(corners)} style={tile.tint && type !== 'sea' ? { fill: tile.tint } : undefined} />
      {type === 'coastal' &&
        tile.edges.map((e, d) => {
          if (e.type !== 'sea') return null;
          const [a, b] = edgeCorners(d);
          const pts = [corners[a], corners[b], inset(corners[b], 0.38), inset(corners[a], 0.38)];
          return <polygon key={d} className="shore" points={pointsStr(pts)} />;
        })}
      {riverDirs && <RiverView dirs={riverDirs} cx={c.x} cy={c.y} corners={corners} />}
      {tile.edges.map((e, d) => {
        if (!e.mountain) return null;
        const [a, b] = edgeCorners(d);
        const p1 = inset(corners[a], 0.08);
        const p2 = inset(corners[b], 0.08);
        return <line key={`m${d}`} className="mountain" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
      })}
      {type === 'sea' && tile.city && (
        <path
          className="islet"
          d={`M ${c.x - 22} ${c.y - 4} c 4 -14 18 -20 30 -14 c 10 5 16 14 12 24 c -4 10 -16 12 -26 10 c -12 -3 -20 -10 -16 -20 z`}
          fill="var(--land)"
          stroke="#c8895a"
          strokeWidth={2}
        />
      )}
      <Resources tile={tile} cx={c.x} cy={c.y} />
      {tile.city && <CityView tile={tile} game={game} cx={c.x} cy={c.y} />}
      <Units units={units} game={game} cx={c.x} cy={c.y + (tile.city ? 10 : 4)} />
      {showCoords && (
        <text className="tile-coord" x={c.x} y={c.y + SIZE - 6}>
          {tile.q},{tile.r}
        </text>
      )}
      {highlight && <polygon className={`hex-highlight ${highlight}`} points={pointsStr(corners.map((p) => inset(p, 0.06)))} />}
    </g>
  );
}

/**
 * How each river tile's water is drawn (decision 117): toward the neighbours on the same river,
 * and from a river's end into the one tile of the river it flows into (straight on where possible).
 * Purely visual; ships may cross every river edge.
 */
function riverCourse(tiles: Record<string, Tile>): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const at = (t: Tile, d: number) => {
    const n = neighbor({ q: t.q, r: t.r }, d);
    return tiles[tileId(n.q, n.r)];
  };
  for (const t of Object.values(tiles)) {
    if (!t.river) continue;
    const same = [0, 1, 2, 3, 4, 5].filter((d) => at(t, d)?.river === t.river);
    out.set(t.id, same);
  }
  for (const t of Object.values(tiles)) {
    const same = out.get(t.id);
    if (!same || same.length > 1) continue;
    const other = [0, 1, 2, 3, 4, 5].filter((d) => at(t, d)?.river && at(t, d).river !== t.river);
    if (!other.length) continue;
    const ahead = same.length ? (same[0] + 3) % 6 : other[0];
    const d = other.includes(ahead) ? ahead : other.sort((a, b) => Math.abs(((a - ahead + 9) % 6) - 3) - Math.abs(((b - ahead + 9) % 6) - 3))[0];
    same.push(d);
    const back = out.get(at(t, d).id)!;
    if (!back.includes((d + 3) % 6)) back.push((d + 3) % 6);
  }
  return out;
}

/** A river tile's water: a curve through the tile between the edges where the river enters and leaves. */
function RiverView({ dirs, cx, cy, corners }: { dirs: number[]; cx: number; cy: number; corners: { x: number; y: number }[] }) {
  const mid = (d: number) => {
    const [a, b] = edgeCorners(d);
    return { x: ((corners[a].x + corners[b].x) / 2).toFixed(1), y: ((corners[a].y + corners[b].y) / 2).toFixed(1) };
  };
  let path: string;
  if (dirs.length === 2) {
    const [a, b] = dirs.map(mid);
    path = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  } else if (dirs.length === 0) path = `M ${cx - 1} ${cy} L ${cx + 1} ${cy}`;
  else path = dirs.map((d) => `M ${cx} ${cy} L ${mid(d).x} ${mid(d).y}`).join(' ');
  return (
    <g pointerEvents="none">
      <path d={path} className="river-bank" />
      <path d={path} className="river-water" />
    </g>
  );
}

function Resources({ tile, cx, cy }: { tile: Tile; cx: number; cy: number }) {
  // Raw materials are interchangeable in the base game, so wood, stone and iron all show as one green tree.
  const items: ('wheat' | 'raw' | 'fish')[] = [];
  for (const r of tile.resources) {
    if (r === 'wheat' || r === 'fish') items.push(r);
    else if (!items.includes('raw')) items.push('raw');
  }
  if (items.length === 0) return null;
  const spots = [
    { x: -14, y: -20 },
    { x: 14, y: -20 },
    { x: -22, y: 0 },
    { x: 22, y: 0 },
  ];
  return (
    <g>
      {items.map((r, i) => {
        const s = spots[i] ?? spots[0];
        const x = cx + s.x;
        const y = cy + s.y;
        switch (r) {
          case 'wheat':
            return <ellipse key={i} cx={x} cy={y} rx={8} ry={5} fill="#f2d33b" stroke="#a88d13" strokeWidth={1} />;
          case 'raw':
            return (
              <g key={i}>
                <polygon points={`${x},${y - 9} ${x - 6},${y + 1} ${x + 6},${y + 1}`} fill="#2f7d32" stroke="#1b4d1e" strokeWidth={0.8} />
                <polygon points={`${x},${y - 4} ${x - 7},${y + 5} ${x + 7},${y + 5}`} fill="#3a9a3e" stroke="#1b4d1e" strokeWidth={0.8} />
                <rect x={x - 1.5} y={y + 5} width={3} height={4} fill="#5a3a1a" />
              </g>
            );
          case 'fish':
            return <ellipse key={i} cx={x} cy={y} rx={7} ry={3.5} fill="#1b3f7a" opacity={0.45} />;
        }
      })}
    </g>
  );
}

function CityView({ tile, game, cx, cy }: { tile: Tile; game: GameState; cx: number; cy: number }) {
  const city = tile.city!;
  const owner = city.ownerId ? game.players[city.ownerId] : null;
  const faction = owner?.factionId ? game.factions[owner.factionId] : null;
  const ring = faction ? faction.color : '#999';
  const allianceRing = owner?.allianceId ? ALLIANCE_COLORS[owner.allianceId] : 'transparent';
  const badges: string[] = [];
  if (city.walls) badges.push('W');
  if (city.temple) badges.push('T');
  if (city.university) badges.push('U');
  return (
    <g>
      {owner && <circle cx={cx} cy={cy - 6} r={13} fill="none" stroke={allianceRing} strokeWidth={3} />}
      <circle cx={cx} cy={cy - 6} r={9} className="city-dot" style={{ stroke: ring, strokeWidth: 3 }} />
      <text x={cx} y={cy - 2.5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight="bold" pointerEvents="none">
        {city.level}
      </text>
      {badges.length > 0 && (
        <text x={cx + 12} y={cy - 12} fontSize={8} fill="#111" fontWeight="bold" stroke="#fff" strokeWidth={2} paintOrder="stroke" pointerEvents="none">
          {badges.join('')}
        </text>
      )}
    </g>
  );
}

function Arrow({ arrow }: { arrow: BoardArrow }) {
  const p = hexToPixel(parseTileId(arrow.from), SIZE);
  const q = hexToPixel(parseTileId(arrow.to), SIZE);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const start = { x: p.x + dx * 0.18, y: p.y + dy * 0.18 };
  const end = { x: p.x + dx * 0.78, y: p.y + dy * 0.78 };
  const head = [
    { x: end.x + ux * 11, y: end.y + uy * 11 },
    { x: end.x - uy * 9, y: end.y + ux * 9 },
    { x: end.x + uy * 9, y: end.y - ux * 9 },
  ];
  const dash = arrow.style === 'repulsed' ? '6 4' : arrow.style === 'lost' ? '2 3' : arrow.style === 'draft' ? '8 3' : undefined;
  const failed = arrow.style === 'repulsed' || arrow.style === 'lost';
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return (
    <g pointerEvents="none" opacity={arrow.style === 'draft' ? 0.85 : 1}>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#222" strokeWidth={9} strokeLinecap="round" strokeDasharray={dash} opacity={0.55} />
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={arrow.color} strokeWidth={5.5} strokeLinecap="round" strokeDasharray={dash} />
      <polygon points={pointsStr(head)} fill={arrow.color} stroke="#222" strokeWidth={1} />
      {failed && (
        <text x={end.x} y={end.y + 5} textAnchor="middle" fontSize={22} fontWeight="bold" fill="#c0392b" stroke="#fff" strokeWidth={2.5} paintOrder="stroke">
          ✕
        </text>
      )}
      {arrow.label && (
        <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={13} fontWeight="bold" fill="#111" stroke="#fff" strokeWidth={2.5} paintOrder="stroke">
          {arrow.label}
        </text>
      )}
    </g>
  );
}

function Units({ units, game, cx, cy }: { units: Unit[]; game: GameState; cx: number; cy: number }) {
  if (units.length === 0) return null;
  // group by kind + owner
  const groups = new Map<string, { unit: Unit; n: number; spent: number }>();
  for (const u of units) {
    const key = `${u.kind}:${u.ownerId}`;
    const g = groups.get(key) ?? { unit: u, n: 0, spent: 0 };
    g.n++;
    if (u.spent) g.spent++;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => a.unit.kind.localeCompare(b.unit.kind));
  const step = 15;
  const startX = cx - ((list.length - 1) * step) / 2;
  return (
    <g>
      {list.map((g, i) => {
        const x = startX + i * step;
        const p = game.players[g.unit.ownerId];
        const fill = p.factionId ? game.factions[p.factionId].color : '#888';
        const stroke = p.allianceId ? ALLIANCE_COLORS[p.allianceId] : '#000';
        const cls = `unit ${g.spent === g.n ? 'spent' : ''}`;
        return (
          <g key={i}>
            {g.unit.kind === 'farmer' && <circle className={cls} cx={x} cy={cy + 6} r={5.5} fill={fill} stroke={stroke} />}
            {g.unit.kind === 'soldier' && <path className={cls} d={`M ${x - 5} ${cy} h 10 l -2 4 v 4 l 2 4 h -10 l 2 -4 v -4 z`} fill={fill} stroke={stroke} />}
            {g.unit.kind === 'ship' && <polygon className={cls} points={`${x},${cy - 1} ${x - 6},${cy + 11} ${x + 6},${cy + 11}`} fill={fill} stroke={stroke} />}
            {p.allianceId === 'white' && g.unit.kind === 'soldier' && <path d={`M ${x - 5} ${cy} h 10 l -2 4 v 4 l 2 4 h -10 l 2 -4 v -4 z`} fill="none" stroke="#333" strokeWidth={0.5} />}
            {g.n > 1 && (
              <text className="unit-count" x={x + 6} y={cy - 2}>
                {g.n}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
