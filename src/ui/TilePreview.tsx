import { edgeCorners, hexCorners } from '../engine/hex';
import { tileSpecById } from '../data/tileBag';

/** Small preview of a bag tile at a given rotation (Full Game setup). */
export function TilePreview({ specId, rotation }: { specId: string; rotation: number }) {
  const spec = tileSpecById(specId);
  if (!spec) return null;
  const size = 40;
  const corners = hexCorners(50, 50, size);
  const pts = corners.map((p) => `${p.x},${p.y}`).join(' ');
  const inset = (p: { x: number; y: number }, f: number) => ({ x: p.x + (50 - p.x) * f, y: p.y + (50 - p.y) * f });
  const edges = spec.edges.map((_, i) => spec.edges[(i - rotation + 6) % 6]);
  const allSea = edges.every((e) => e.type === 'sea');
  return (
    <svg width={110} height={110} style={{ verticalAlign: 'middle', marginRight: 8 }}>
      <polygon points={pts} fill={allSea ? '#3b6fb6' : '#a8c48a'} stroke="#2b2118" />
      {!allSea &&
        edges.map((e, d) => {
          if (e.type !== 'sea') return null;
          const [a, b] = edgeCorners(d);
          const poly = [corners[a], corners[b], inset(corners[b], 0.38), inset(corners[a], 0.38)];
          return <polygon key={d} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill="#3b6fb6" />;
        })}
      {edges.map((e, d) => {
        if (!e.mountain) return null;
        const [a, b] = edgeCorners(d);
        const p1 = inset(corners[a], 0.08);
        const p2 = inset(corners[b], 0.08);
        return <line key={`m${d}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#6b3f1d" strokeWidth={6} strokeLinecap="round" />;
      })}
      {spec.city && <circle cx={50} cy={46} r={8} fill="#111" stroke="#fff" strokeWidth={1.5} />}
      <text x={50} y={72} textAnchor="middle" fontSize={9}>
        {spec.resources.join(' ') || (spec.city ? 'city' : '')}
      </text>
    </svg>
  );
}
