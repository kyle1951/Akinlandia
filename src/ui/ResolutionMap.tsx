import { useMemo } from 'react';
import type { GameState, ResolutionReport, Tile, Unit } from '../engine/types';
import { allianceName } from '../engine/query';
import { tileLabel } from '../engine/map';
import { subPhaseName } from '../engine/flowMilitary';
import { ALLIANCE_COLORS } from '../data/factions';
import { Board } from './Board';
import type { BoardArrow, BoardMarker } from './Board';

/**
 * After a simultaneous round (decision 109): the board as it stood when the
 * round was resolved, with every march drawn as an arrow (solid: arrived,
 * dashed with a cross: beaten back, dotted: destroyed) and every battle marked.
 */
export function ResolutionMap({ game, report, onClose, onWatch }: { game: GameState; report: ResolutionReport; onClose: () => void; onWatch?: (combatId: string) => void }) {
  const snapshot = useMemo(() => {
    const units: Record<string, Unit> = {};
    for (const u of report.units) units[u.id] = u;
    const tiles: Record<string, Tile> = {};
    for (const [id, t] of Object.entries(game.tiles)) tiles[id] = t.city && id in report.cityOwners ? { ...t, city: { ...t.city, ownerId: report.cityOwners[id] } } : t;
    return { ...game, units, tiles };
  }, [game, report]);
  const arrows: BoardArrow[] = report.forces.map((f) => ({ from: f.from, to: f.to, color: ALLIANCE_COLORS[f.allianceId], style: f.outcome, label: String(f.soldiers) }));
  const markers: BoardMarker[] = report.battles.map((b) => (b.mode === 'border' ? { tileId: b.tileId, towardTileId: b.originTileId, text: '⚔' } : { tileId: b.tileId, text: '⚔' }));
  const name = (id: string) => tileLabel(game.tiles[id]);
  const alliances = game.allianceOrder.filter((a) => report.forces.some((f) => f.allianceId === a));
  return (
    <div className="modal-backdrop">
      <div className="modal resolution-modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          Turn {report.turn}, {subPhaseName(report.round)} round: what happened
        </h2>
        <div className="resolution-board board-area">
          <Board game={snapshot} highlights={[]} arrows={arrows} markers={markers} />
        </div>
        <div className="resolution-legend">Solid arrow: arrived. Dashed with ✕: beaten back. Dotted with ✕: destroyed. ⚔: battle. Numbers are soldiers ordered.</div>
        {report.forces.length === 0 && <p>No General gave any orders; every unit held its ground.</p>}
        <div className="resolution-lists">
          {alliances.map((a) => {
            const fs = report.forces.filter((f) => f.allianceId === a);
            return (
              <div key={a}>
                <h4>{allianceName(a)}</h4>
                {fs.map((f, i) => (
                  <div key={i} className={`resolution-line ${f.outcome}`}>
                    {f.soldiers} soldier{f.soldiers === 1 ? '' : 's'}
                    {f.ships ? ` and ${f.ships} ship${f.ships === 1 ? '' : 's'}` : ''} {name(f.from)} → {name(f.to)}: {f.outcome === 'arrived' ? 'arrived' : f.outcome === 'lost' ? 'destroyed' : 'beaten back'}
                  </div>
                ))}
              </div>
            );
          })}
          {report.battles.length > 0 && (
            <div>
              <h4>Battles</h4>
              {report.battles.map((b) => {
                const where = b.mode === 'border' ? `Border clash, ${name(b.originTileId)} / ${name(b.tileId)}` : b.mode === 'contest' ? `Contest for ${name(b.tileId)}` : `Assault on ${name(b.tileId)}`;
                const w = b.winner === 'attacker' ? allianceName(b.attackerAllianceId) : b.winner === 'defender' ? allianceName(b.defenderAllianceId) : 'nobody';
                return (
                  <div key={b.combatId} className="resolution-line">
                    {where}: {allianceName(b.attackerAllianceId)} {b.attackerScore} vs {allianceName(b.defenderAllianceId)} {b.defenderScore}; {w} prevail{b.winner ? 's' : ''}. Losses {b.attackerLosses} / {b.defenderLosses}.
                    {onWatch && game.turnData.combats[b.combatId] && (
                      <button className="small" style={{ marginLeft: 6 }} onClick={() => onWatch(b.combatId)}>
                        ▶ watch
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="actions">
          <button className="primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
