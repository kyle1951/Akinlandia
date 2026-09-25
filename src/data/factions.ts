import type { AllianceId, FactionDef } from '../engine/types';

export const ALLIANCE_NAMES: Record<AllianceId, string> = {
  white: 'White',
  black: 'Black',
  green: 'Green',
};

export const ALLIANCE_COLORS: Record<AllianceId, string> = {
  white: '#f4f1ea',
  black: '#1a1a1a',
  green: '#2e8b3d',
};

/**
 * Each alliance has three faction slots. Purple (royal) is filled first and
 * starts as General (ruling 1). The other six colours are distinct (ruling 42).
 */
export const FACTIONS: FactionDef[] = [
  { id: 'white-purple', allianceId: 'white', name: 'Purple', color: '#7b3fbf', royal: true },
  { id: 'white-crimson', allianceId: 'white', name: 'Crimson', color: '#c8102e', royal: false },
  { id: 'white-azure', allianceId: 'white', name: 'Azure', color: '#2f6fdb', royal: false },
  { id: 'black-purple', allianceId: 'black', name: 'Purple', color: '#7b3fbf', royal: true },
  { id: 'black-orange', allianceId: 'black', name: 'Orange', color: '#e8781e', royal: false },
  { id: 'black-gold', allianceId: 'black', name: 'Gold', color: '#d4b30c', royal: false },
  { id: 'green-purple', allianceId: 'green', name: 'Purple', color: '#7b3fbf', royal: true },
  { id: 'green-rose', allianceId: 'green', name: 'Rose', color: '#e75480', royal: false },
  { id: 'green-teal', allianceId: 'green', name: 'Teal', color: '#1aa39a', royal: false },
];

export const FACTION_MAP: Record<string, FactionDef> = Object.fromEntries(FACTIONS.map((f) => [f.id, f]));

export function factionsOf(allianceId: AllianceId): FactionDef[] {
  return FACTIONS.filter((f) => f.allianceId === allianceId);
}
