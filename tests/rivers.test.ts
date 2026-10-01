import { describe, expect, it } from 'vitest';
import { neighbor, tileId } from '../src/engine/hex';
import { legalDestinations, validateOrder } from '../src/engine/rules/movement';
import { legalShipTiles } from '../src/engine/rules/deploy';
import { addUnit, clearUnits, newGame, order, playerOf, setActing, toMilitary } from './helpers';
import type { GameState, Tile } from '../src/engine/types';

const around = (s: GameState, t: Tile) =>
  [0, 1, 2, 3, 4, 5].map((d) => ({ d, n: s.tiles[tileId(neighbor(t, d).q, neighbor(t, d).r)] })).filter((x) => x.n);

/** a stretch of Dartmouth Ave with river on both sides and an ordinary field beside it */
function stretch(s: GameState) {
  for (const t of Object.values(s.tiles)) {
    if (t.river !== 'Dartmouth Ave' || t.city) continue;
    const up = around(s, t).filter(({ n }) => n.river === 'Dartmouth Ave' && !n.city);
    const field = around(s, t).find(({ n }) => !n.river && !n.city);
    if (up.length >= 2 && field) return { at: t.id, next: up[0].n.id, field: field.n.id };
  }
  throw new Error('no stretch of Dartmouth Ave');
}

function setup(sub: 'ships1' | 'full1') {
  const s = newGame(3, 1, { mapId: 'claremont' });
  toMilitary(s, sub, 'white');
  clearUnits(s);
  return s;
}

describe('navigable rivers (decision 117)', () => {
  it('the Claremont streets run as rivers, with river edges along them and into the cities on their banks', () => {
    const s = newGame(3, 1, { mapId: 'claremont' });
    const names = new Set(Object.values(s.tiles).flatMap((t) => (t.river ? [t.river] : [])));
    expect([...names].sort()).toEqual(['6th St', 'Claremont Blvd', 'Dartmouth Ave', 'Foothill Blvd']);
    for (const t of Object.values(s.tiles)) {
      for (const { d, n } of around(s, t)) {
        const riverEdge = !!t.edges[d].river;
        expect(riverEdge).toBe((!!t.river && (!!n.river || !!n.city)) || (!!t.city && !!n.river));
        if (riverEdge) expect(t.edges[d].type).toBe('land');
      }
    }
    expect(s.tiles[Object.values(s.tiles).find((t) => t.city?.name === 'Honnold Library')!.id].river).toBe('Dartmouth Ave');
  });

  it('soldiers cross a river on foot; in the ship rounds only manned ships sail along it', () => {
    const s = setup('ships1');
    const { at, next, field } = stretch(s);
    const white = playerOf(s, 'white');
    const a = addUnit(s, 'soldier', white, at);
    const b = addUnit(s, 'soldier', white, at);
    const ship = addUnit(s, 'ship', white, at);
    const ship2 = addUnit(s, 'ship', white, at);
    setActing(s, 'white');
    const by = (sub: 'ships1' | 'full1') => Object.fromEntries(legalDestinations(s, 'white', at, sub).map((d) => [d.tileId, d.via]));
    expect(by('ships1')[next]).toBe('river');
    expect(by('ships1')[field]).toBeUndefined();
    expect(by('full1')[field]).toBe('land');
    expect(() => validateOrder(s, 'white', 'ships1', at, [{ destTileId: next, unitIds: [a.id, ship.id] }])).not.toThrow();
    expect(() => validateOrder(s, 'white', 'ships1', at, [{ destTileId: next, unitIds: [a.id] }])).toThrow(/manned ships/);
    expect(() => validateOrder(s, 'white', 'ships1', at, [{ destTileId: next, unitIds: [a.id, b.id, ship.id] }])).toThrow(/one ship per soldier/);
    expect(() => validateOrder(s, 'white', 'full1', at, [{ destTileId: next, unitIds: [a.id, b.id, ship.id] }])).not.toThrow();
    expect(() => validateOrder(s, 'white', 'full1', at, [{ destTileId: next, unitIds: [a.id, ship.id, ship2.id] }])).toThrow(/every ship must carry a soldier/);
    expect(() => validateOrder(s, 'white', 'full1', at, [{ destTileId: field, unitIds: [a.id, ship.id] }])).toThrow(/Ships cannot cross a land edge/);
  });

  it('a manned ship sails down the river in a ship round', () => {
    const s = setup('ships1');
    const { at, next } = stretch(s);
    const white = playerOf(s, 'white');
    const sol = addUnit(s, 'soldier', white, at);
    const ship = addUnit(s, 'ship', white, at);
    // a Green sentinel keeps the sub-phase open
    const far = Object.values(s.tiles).find((t) => !t.river && !t.city && Object.values(s.units).every((u) => u.tileId !== t.id))!;
    addUnit(s, 'soldier', playerOf(s, 'green'), far.id);
    setActing(s, 'white');
    order(s, s.alliances.white.generalId!, at, [{ dest: next, units: [sol.id, ship.id] }]);
    expect(s.units[sol.id].tileId).toBe(next);
    expect(s.units[ship.id].tileId).toBe(next);
  });

  it('ships are built in cities on or beside a river, not inland', () => {
    const s = newGame(9, 1, { mapId: 'claremont' });
    const holder = (name: string) => Object.values(s.tiles).find((t) => t.city?.name === name)!;
    const galileo = holder('Galileo Hall');
    const grove = holder('Grove House');
    expect(galileo.edges.some((e) => e.river)).toBe(true);
    expect(grove.edges.some((e) => e.river)).toBe(false);
    expect(legalShipTiles(s, galileo.city!.ownerId!)).toContain(galileo.id);
    expect(legalShipTiles(s, grove.city!.ownerId!)).not.toContain(grove.id);
  });
});
