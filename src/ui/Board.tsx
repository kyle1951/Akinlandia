import { useMemo, useRef, useState } from 'react';
import type { GameState, Tile, Unit } from '../engine/types';
import { edgeCorners, hexCorners, hexToPixel } from '../engine/hex';
import { tileType } from '../engine/map';
import { ALLIANCE_COLORS } from '../data/factions';

export type HighlightKind = 'legal' | 'selected' | 'source';
export interface Highlight {
  tileId: string;
  kind: HighlightKind;
}

export interface BoardProps {
  game: GameState;
  highlights: Highlight[];
  onTileClick?: (tileId: string) => void;
  showCoords?: boolean;
}

const SIZE = 36;

function pointsStr(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function Board({ game, highlights, onTileClick, showCoords }: BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const tiles = useMemo(() => Object.values(game.tiles), [game.tiles]);
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const t of tiles) {
      const p = hexToPixel(t, SIZE);
      minX = Math.min(minX, p.x - SIZE);
      maxX = Math.max(maxX, p.x + SIZE);
      minY = Math.min(minY, p.y - SIZE);
      maxY = Math.max(maxY, p.y + SIZE);
    }
    if (!isFinite(minX)) return { minX: -200, minY: -200, w: 400, h: 400 };
    return { minX: minX - 20, minY: minY - 20, w: maxX - minX + 40, h: maxY - minY + 40 };
  }, [tiles]);

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
          <TileView key={t.id} tile={t} game={game} units={unitsByTile.get(t.id) ?? []} highlight={hl.get(t.id)} onClick={() => clickTile(t.id)} showCoords={!!showCoords} />
        ))}
      </g>
    </svg>
  );
}

function TileView({ tile, game, units, highlight, onClick, showCoords }: { tile: Tile; game: GameState; units: Unit[]; highlight?: HighlightKind; onClick: () => void; showCoords: boolean }) {
  const c = hexToPixel(tile, SIZE);
  const corners = hexCorners(c.x, c.y, SIZE);
  const type = tileType(tile);
  const inset = (p: { x: number; y: number }, f: number) => ({ x: p.x + (c.x - p.x) * f, y: p.y + (c.y - p.y) * f });
  return (
    <g onClick={onClick} className={highlight === 'legal' ? 'legal' : ''}>
      <polygon className={`hex ${type} ${highlight ? 'legal' : ''}`} points={pointsStr(corners)} />
      {type === 'coastal' &&
        tile.edges.map((e, d) => {
          if (e.type !== 'sea') return null;
          const [a, b] = edgeCorners(d);
          const pts = [corners[a], corners[b], inset(corners[b], 0.38), inset(corners[a], 0.38)];
          return <polygon key={d} className="shore" points={pointsStr(pts)} />;
        })}
      {tile.edges.map((e, d) => {
        if (!e.mountain) return null;
        const [a, b] = edgeCorners(d);
        const p1 = inset(corners[a], 0.08);
        const p2 = inset(corners[b], 0.08);
        return <line key={`m${d}`} className="mountain" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
      })}
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

function Resources({ tile, cx, cy }: { tile: Tile; cx: number; cy: number }) {
  const items = tile.resources;
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
          case 'wood':
            return (
              <g key={i}>
                <polygon points={`${x},${y - 8} ${x - 6},${y + 3} ${x + 6},${y + 3}`} fill="#7a4b1e" stroke="#4a2c10" strokeWidth={0.8} />
                <rect x={x - 1.5} y={y + 3} width={3} height={4} fill="#4a2c10" />
              </g>
            );
          case 'stone':
            return (
              <g key={i} fill="#8f8f8f" stroke="#4d4d4d" strokeWidth={0.6}>
                <circle cx={x - 4} cy={y} r={2.6} />
                <circle cx={x + 3} cy={y - 2} r={2.6} />
                <circle cx={x + 1} cy={y + 4} r={2.6} />
              </g>
            );
          case 'iron':
            return (
              <g key={i} stroke="#e8781e" strokeWidth={2.2} strokeLinecap="round">
                <line x1={x - 5} y1={y + 6} x2={x + 3} y2={y - 4} />
                <path d={`M ${x - 3} ${y - 6} Q ${x + 3} ${y - 8} ${x + 8} ${y - 2}`} fill="none" />
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
      <text className="city-label" x={cx} y={cy + SIZE - 8}>
        {city.name}
      </text>
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
