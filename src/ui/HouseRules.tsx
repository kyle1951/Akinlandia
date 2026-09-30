import type { MilitaryMode } from '../engine/types';

/** Options chosen when a game is created (decisions 107-109); 0 means a house rule is off. */
export interface HouseRuleSettings {
  foodCapPerCity: number;
  handLimit: number;
  militaryMode: MilitaryMode;
  /** decision 115: the lowest die that kills */
  hitOn: number;
}

export const NO_HOUSE_RULES: HouseRuleSettings = { foodCapPerCity: 0, handLimit: 0, militaryMode: 'simultaneous', hitOn: 4 };
const DEFAULT_FOOD_CAP = 4;
const DEFAULT_HAND_LIMIT = 7;

export function HouseRuleOptions({ value, onChange }: { value: HouseRuleSettings; onChange: (v: HouseRuleSettings) => void }) {
  const num = (s: string, min: number) => Math.max(min, Math.min(99, Math.floor(Number(s)) || min));
  return (
    <>
      <label>
        Military orders:{' '}
        <select value={value.militaryMode} onChange={(e) => onChange({ ...value, militaryMode: e.target.value as MilitaryMode })}>
          <option value="simultaneous">Simultaneous: Generals write secret orders, then everything resolves at once</option>
          <option value="sequential">Sequential: one order at a time in alliance order, as in the rules</option>
        </select>
      </label>
      <label>
        Combat:{' '}
        <select value={value.hitOn} onChange={(e) => onChange({ ...value, hitOn: Number(e.target.value) })}>
          <option value={4}>every 4, 5 or 6 rolled kills an enemy soldier</option>
          <option value={6}>only a 6 kills an enemy soldier, as in the rules</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={value.foodCapPerCity > 0} onChange={(e) => onChange({ ...value, foodCapPerCity: e.target.checked ? DEFAULT_FOOD_CAP : 0 })} /> Food spoils: after the army is fed, a leader keeps at most{' '}
        <input type="number" min={1} max={99} style={{ width: 48 }} disabled={value.foodCapPerCity === 0} value={value.foodCapPerCity || DEFAULT_FOOD_CAP} onChange={(e) => onChange({ ...value, foodCapPerCity: num(e.target.value, 1) })} /> food per city held, plus 2 for each upgrade of a city's level.
      </label>
      <label>
        <input type="checkbox" checked={value.handLimit > 0} onChange={(e) => onChange({ ...value, handLimit: e.target.checked ? DEFAULT_HAND_LIMIT : 0 })} /> Hand limit: at the end of each turn, discard down to{' '}
        <input type="number" min={1} max={99} style={{ width: 48 }} disabled={value.handLimit === 0} value={value.handLimit || DEFAULT_HAND_LIMIT} onChange={(e) => onChange({ ...value, handLimit: num(e.target.value, 1) })} /> cards.
      </label>
    </>
  );
}
