import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatRecord, GameState, PlayerId } from '../engine/types';
import { allianceName } from '../engine/query';
import { tileLabel } from '../engine/map';
import { defenderBonusPerSoldier } from '../engine/rules/combat';
import { ALLIANCE_COLORS } from '../data/factions';

/**
 * The battle scene: a presentation of a battle the engine has already
 * resolved. Nothing here changes the rules; the dice, bonuses, hits and the
 * verdict all come from the combat record, replayed one die at a time.
 */
export interface BattleSnapshot {
  combat: CombatRecord;
  /** owner of every soldier in the battle, alive or fallen */
  owners: Record<string, PlayerId>;
  tileName: string;
  originName: string;
  cityName: string | null;
  perSoldier: number;
  bonusParts: string[];
}

/** Battles worth a scene: any fight over a city, or six or more soldiers in all. */
export function isBigBattle(game: GameState, c: CombatRecord): boolean {
  if (c.spentOnly) return false;
  return !!game.tiles[c.tileId]?.city || c.attacker.soldierIds.length + c.defender.soldierIds.length >= 6;
}

export function snapshotBattle(game: GameState, c: CombatRecord): BattleSnapshot {
  const combat: CombatRecord = JSON.parse(JSON.stringify(c));
  const owners: Record<string, PlayerId> = {};
  for (const side of [combat.attacker, combat.defender]) {
    for (const id of side.soldierIds) owners[id] = game.units[id]?.ownerId ?? side.generalId;
    for (const u of side.casualties) owners[u.id] = u.ownerId;
  }
  const t = game.tiles[c.tileId];
  const field = c.mode === 'border' || c.mode === 'contest';
  const b = defenderBonusPerSoldier(game, c.tileId);
  return {
    combat,
    owners,
    tileName: tileLabel(t),
    originName: tileLabel(game.tiles[c.originTileId]),
    cityName: t.city?.name ?? null,
    perSoldier: field ? 0 : b.perSoldier,
    bonusParts: field ? [] : b.parts,
  };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

interface DieStep {
  side: 'attacker' | 'defender';
  value: number;
  start: number;
  land: number;
}

const INTRO = 1400;
const BONUS = 1300;

function timeline(s: BattleSnapshot): { dice: DieStep[]; bonusAt: number; end: number } {
  const c = s.combat;
  const a = c.attacker.dice;
  const d = c.defender.dice;
  const seq: { side: 'attacker' | 'defender'; value: number }[] = [];
  for (let i = 0; i < Math.max(a.length, d.length); i++) {
    if (i < a.length) seq.push({ side: 'attacker', value: a[i] });
    if (i < d.length) seq.push({ side: 'defender', value: d[i] });
  }
  const bonus = c.defender.bonus > 0;
  const bonusAt = INTRO;
  let t = INTRO + (bonus ? BONUS : 0);
  const dt = Math.max(230, Math.min(620, 6000 / Math.max(1, seq.length)));
  const dice: DieStep[] = [];
  let att = 0;
  let def = c.defender.bonus;
  seq.forEach((x, i) => {
    const last = i === seq.length - 1;
    const close = last && Math.abs(att - def) <= 6;
    const roll = close ? 1500 : dt * 0.65;
    dice.push({ ...x, start: t, land: t + roll });
    t += roll + (close ? 500 : dt * 0.35);
    if (x.side === 'attacker') att += x.value;
    else def += x.value;
  });
  return { dice, bonusAt, end: t + 300 };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

function Die({ value, state }: { value: number; state: 'rolling' | 'landed' }) {
  const six = state === 'landed' && value === 6;
  return (
    <svg viewBox="0 0 100 100" className={`die ${state} ${six ? 'six' : ''}`}>
      <rect x={4} y={4} width={92} height={92} rx={16} />
      {PIPS[value].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={9} />
      ))}
    </svg>
  );
}

function Soldier({ game, owner, fallen, spent }: { game: GameState; owner: PlayerId; fallen: boolean; spent: boolean }) {
  const p = game.players[owner];
  const fill = p?.factionId ? game.factions[p.factionId].color : '#888';
  const stroke = p?.allianceId ? ALLIANCE_COLORS[p.allianceId] : '#000';
  return (
    <svg viewBox="-8 -2 16 16" className={`battle-soldier ${fallen ? 'fallen' : ''} ${spent ? 'spent' : ''}`}>
      <path d="M -5 0 h 10 l -2 4 v 4 l 2 4 h -10 l 2 -4 v -4 z" fill={fill} stroke={stroke === '#f4f1ea' ? '#333' : stroke} strokeWidth={1.2} />
      {fallen && <path d="M -6 -1 L 6 13 M 6 -1 L -6 13" stroke="#c0392b" strokeWidth={2.2} />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Odds and words
// ---------------------------------------------------------------------------

/** Chance of each outcome before the dice, by simulation with the same rules the engine used. */
function odds(s: BattleSnapshot): { attacker: number; defender: number } {
  const c = s.combat;
  const n = c.attacker.dice.length;
  const m = c.defender.dice.length;
  const field = c.mode === 'border' || c.mode === 'contest';
  const trials = 4000;
  let aw = 0;
  let dw = 0;
  for (let t = 0; t < trials; t++) {
    let a = 0, aSix = 0, d = 0, dSix = 0;
    for (let i = 0; i < n; i++) {
      const x = 1 + Math.floor(Math.random() * 6);
      a += x;
      if (x === 6) aSix++;
    }
    for (let i = 0; i < m; i++) {
      const x = 1 + Math.floor(Math.random() * 6);
      d += x;
      if (x === 6) dSix++;
    }
    d += s.perSoldier * m;
    const aAlive = n - Math.min(n, dSix);
    const dAlive = m - Math.min(m, aSix);
    if (field) {
      if (aAlive && !dAlive) aw++;
      else if (dAlive && !aAlive) dw++;
      else if (aAlive && dAlive) {
        if (a > d) aw++;
        else if (d > a) dw++;
      }
    } else if (aAlive && (a > d || dAlive === 0)) aw++;
    else dw++;
  }
  return { attacker: aw / trials, defender: dw / trials };
}

function headline(s: BattleSnapshot): string {
  const c = s.combat;
  const A = allianceName(c.attacker.allianceId).toUpperCase();
  const D = allianceName(c.defender.allianceId).toUpperCase();
  const place = (s.cityName ?? s.tileName).toUpperCase();
  if (c.mode === 'border') return c.winner ? `${c.winner === 'attacker' ? A : D} WINS THE BORDER CLASH` : 'STALEMATE ON THE BORDER';
  if (c.mode === 'contest') return c.winner ? `THE ${c.winner === 'attacker' ? A : D} ALLIANCE SEIZES ${place}` : `NEITHER SIDE TAKES ${place}`;
  if (c.winner === 'attacker') return s.cityName ? `${place} FALLS TO THE ${A} ALLIANCE!` : `THE ${A} ALLIANCE TAKES ${place}`;
  return `${place} HOLDS!`;
}

function chronicle(s: BattleSnapshot): string {
  const c = s.combat;
  const A = allianceName(c.attacker.allianceId);
  const D = allianceName(c.defender.allianceId);
  const aDead = c.attacker.casualties.filter((u) => u.kind === 'soldier').length;
  const dDead = c.defender.casualties.filter((u) => u.kind === 'soldier').length;
  if (c.mode === 'border') return c.winner ? `On the border between ${s.originName} and ${s.tileName}, the ${c.winner === 'attacker' ? A : D} carried the day.` : `Neither side gave ground on the border between ${s.originName} and ${s.tileName}.`;
  if (c.mode === 'contest') return c.winner ? `Both armies reached ${s.tileName} at once; the ${c.winner === 'attacker' ? A : D} were left standing.` : `Both armies reached ${s.tileName} at once, and neither could claim it.`;
  if (c.winner === 'attacker') {
    const why = c.attacker.score <= c.defender.score ? ' Not one defender was left standing to hold it.' : '';
    return s.cityName ? `The gates of ${s.cityName} were broken, and the ${A} banners rose over its walls.${why}` : `The ${A} drove the ${D} from ${s.tileName}.${why}`;
  }
  const tie = c.attacker.score === c.defender.score ? ' The scores were level, and a tie goes to the defender.' : '';
  return s.cityName ? `The walls of ${s.cityName} held; the ${A} host fell back, leaving ${aDead} dead before the gates.${tie}` : `The ${D} line at ${s.tileName} did not break${dDead ? `, though ${dDead} fell` : ''}.${tie}`;
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------

export function BattleScene({ game, snapshot, onClose }: { game: GameState; snapshot: BattleSnapshot; onClose: () => void }) {
  const s = snapshot;
  const c = s.combat;
  const plan = useMemo(() => timeline(s), [s]);
  const chances = useMemo(() => odds(s), [s]);
  const [t, setT] = useState(0);
  const startRef = useRef(performance.now());
  useEffect(() => {
    startRef.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now() - startRef.current;
      setT(Math.min(now, plan.end));
      if (now >= plan.end) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [plan]);
  const skip = () => {
    startRef.current = performance.now() - plan.end;
    setT(plan.end);
  };
  const done = t >= plan.end;
  const landed = plan.dice.filter((d) => t >= d.land);
  const total = (side: 'attacker' | 'defender') => landed.filter((d) => d.side === side).reduce((n, d) => n + d.value, 0) + (side === 'defender' && t >= plan.bonusAt + 600 ? c.defender.bonus : 0);
  const att = done ? c.attacker.score : total('attacker');
  const def = done ? c.defender.score : total('defender');
  const sixes = (side: 'attacker' | 'defender') => landed.filter((d) => d.side === side && d.value === 6).length;
  const shake = plan.dice.some((d) => d.value === 6 && t >= d.land && t < d.land + 350);
  const field = c.mode === 'border' || c.mode === 'contest';
  const title = c.mode === 'border' ? `Border clash between ${s.originName} and ${s.tileName}` : c.mode === 'contest' ? `Contest for ${s.tileName}` : `Assault on ${s.cityName ?? s.tileName}`;

  const army = (side: 'attacker' | 'defender') => {
    const rec = c[side];
    const fallen = rec.casualties.filter((u) => u.kind === 'soldier');
    const fallenIds = new Set(fallen.map((u) => u.id));
    // survivors first, the fallen last, so strikes land on the right factions from the end of the line
    const ids = [...rec.soldierIds.filter((id) => !fallenIds.has(id)), ...fallen.map((u) => u.id)];
    const struck = done ? fallen.length : Math.min(fallen.length, sixes(side === 'attacker' ? 'defender' : 'attacker'));
    const active = rec.dice.length;
    return ids.map((id, i) => ({ id, owner: s.owners[id], fallen: i >= ids.length - struck, spent: side === 'defender' && i >= active && !fallenIds.has(id) }));
  };
  const barA = att + def > 0 ? (100 * att) / (att + def) : 50;

  const side = (key: 'attacker' | 'defender') => {
    const rec = c[key];
    const name = allianceName(rec.allianceId);
    const role = field ? 'marching' : key === 'attacker' ? `attacking from ${s.originName}` : 'defending';
    const myDice = plan.dice.filter((d) => d.side === key && t >= d.start);
    const pct = Math.round(100 * chances[key]);
    return (
      <div className={`battle-side ${key}`}>
        <div className="battle-side-head" style={{ borderColor: ALLIANCE_COLORS[rec.allianceId] === '#f4f1ea' ? '#999' : ALLIANCE_COLORS[rec.allianceId] }}>
          <b>{name}</b> <span className="battle-role">{role}</span>
          <div className="battle-odds">odds before the dice: {pct}%</div>
        </div>
        <div className="battle-army">
          {army(key).map((x) => (
            <Soldier key={x.id} game={game} owner={x.owner} fallen={x.fallen} spent={x.spent} />
          ))}
        </div>
        {key === 'defender' && rec.bonus > 0 && t >= plan.bonusAt && (
          <div className="battle-bonus">
            {s.bonusParts.join(' ')} per fresh defender × {rec.dice.length} = <b>+{rec.bonus}</b>
          </div>
        )}
        <div className="battle-dice">
          {myDice.map((d, i) => (
            <Die key={i} value={t >= d.land ? d.value : 1 + (Math.floor(t / 70 + i * 2) % 6)} state={t >= d.land ? 'landed' : 'rolling'} />
          ))}
        </div>
        <div className="battle-total">{key === 'attacker' ? att : def}</div>
      </div>
    );
  };

  return (
    <div className="modal-backdrop battle-backdrop">
      <div className={`battle-scene ${shake ? 'shake' : ''}`}>
        <div className="battle-title">{title}</div>
        <div className="battle-subtitle">
          {c.attacker.soldierIds.length} {allianceName(c.attacker.allianceId)} soldier{c.attacker.soldierIds.length === 1 ? '' : 's'} against {c.defender.soldierIds.length} {allianceName(c.defender.allianceId)}
          {field ? '. Both sides march, so neither gets a defensive bonus.' : s.cityName ? `, behind the gates of ${s.cityName}.` : '.'} Every 6 strikes down an enemy soldier.
        </div>
        <div className="battle-bar">
          <div style={{ width: `${barA}%`, background: ALLIANCE_COLORS[c.attacker.allianceId] }} />
          <div style={{ width: `${100 - barA}%`, background: ALLIANCE_COLORS[c.defender.allianceId] }} />
        </div>
        <div className="battle-field">
          {side('attacker')}
          <div className="battle-vs">⚔</div>
          {side('defender')}
        </div>
        {done && (
          <div className="battle-verdict">
            <div className="battle-headline">{headline(s)}</div>
            <div className="battle-chronicle">{chronicle(s)}</div>
          </div>
        )}
        <div className="actions" style={{ justifyContent: 'center' }}>
          {!done && <button onClick={skip}>Skip</button>}
          {done && (
            <button className="primary" onClick={onClose}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
