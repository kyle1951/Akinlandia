import { symmetricMap } from '../engine/map';
import type { MapSpec, MountainSpec, TileSpec } from '../engine/map';
import { TABLE_MAP, TABLE_SLOTS } from './tableMap';
import { EURASIA_MAP, EURASIA_SLOTS } from './eurasiaMap';
import { CLAREMONT_FACTIONS, CLAREMONT_MAP, CLAREMONT_SLOTS } from './claremontMap';
import type { FactionDef } from '../engine/types';

/**
 * The Quick Start map (ruling 4, decision 43).
 *
 * A radius-5 hex board of 91 tiles. The centre (rings 0-2) is a sea with one
 * island per homeland. Ring 3 is the coastline, rings 4-5 are land. The map is
 * authored as ONE 30-tile wedge plus the centre tile and rotated three times
 * so the three homelands are exactly symmetric. Wedge 0 (lower right) is the
 * White homeland, wedge 1 (lower left) Black, wedge 2 (top) Green.
 *
 * Wedge membership: { q > 0 and s < 0 } union { q > 0, r < 0, s = 0 } with s = -q-r.
 */

const CENTER: TileSpec[] = [{ q: 0, r: 0, base: 'sea' }];

const WEDGE: TileSpec[] = [
  // ring 1-2: sea
  { q: 1, r: 0, base: 'sea' },
  { q: 1, r: -1, base: 'sea' },
  { q: 2, r: -2, base: 'sea' },
  { q: 2, r: 0, base: 'sea', resources: ['fish'] },
  { q: 1, r: 1, base: 'sea' },
  // island with a neutral city
  { q: 2, r: -1, base: 'sea', city: { name: 'island', slot: 'neutral' }, resources: ['wheat', 'fish'] },
  // ring 3: coast (edges derived: sea toward the inner sea, land otherwise)
  { q: 3, r: -3, base: 'auto', resources: ['wood', 'fish'] },
  { q: 3, r: -2, base: 'auto', city: { name: 'coast-second', slot: 'second' }, resources: ['wheat'] },
  { q: 3, r: -1, base: 'auto', resources: ['wheat', 'wood', 'fish'] },
  { q: 3, r: 0, base: 'auto', city: { name: 'coast-purple', slot: 'purple' } },
  { q: 2, r: 1, base: 'auto', resources: ['wheat', 'stone'] },
  { q: 1, r: 2, base: 'auto', city: { name: 'coast-third', slot: 'third' }, resources: ['fish'] },
  // ring 4: land
  { q: 4, r: -4, base: 'land', resources: ['stone'] },
  { q: 4, r: -3, base: 'land', resources: ['wheat'] },
  { q: 4, r: -2, base: 'land', resources: ['iron'] },
  { q: 4, r: -1, base: 'land', resources: ['wheat'] },
  { q: 4, r: 0, base: 'land', resources: ['wheat', 'wood'] },
  { q: 3, r: 1, base: 'land', resources: ['wood'] },
  { q: 2, r: 2, base: 'land', resources: ['wheat'] },
  { q: 1, r: 3, base: 'land', resources: ['stone'] },
  // ring 5: land
  { q: 5, r: -5, base: 'land', resources: ['iron'] },
  { q: 5, r: -4, base: 'land', city: { name: 'inland-second', slot: 'second' } },
  { q: 5, r: -3, base: 'land', resources: ['wheat', 'wood'] },
  { q: 5, r: -2, base: 'land', resources: ['wheat'] },
  { q: 5, r: -1, base: 'land', city: { name: 'inland-purple', slot: 'purple' } },
  { q: 5, r: 0, base: 'land', resources: ['iron'] },
  { q: 4, r: 1, base: 'land', city: { name: 'inland-neutral', slot: 'neutral' } },
  { q: 3, r: 2, base: 'land', resources: ['wheat'] },
  { q: 2, r: 3, base: 'land', city: { name: 'inland-third', slot: 'third' } },
  { q: 1, r: 4, base: 'land', resources: ['wheat', 'wood'] },
];

/**
 * Mountains along the upper-right homeland border (rotated to all three
 * borders). The coastal ring stays open as a two-tile pass.
 */
const WEDGE_MOUNTAINS: MountainSpec[] = [
  { a: [4, -4], b: [4, -5] },
  { a: [4, -4], b: [3, -4] },
  { a: [5, -5], b: [4, -5] },
  // an interior ridge for flavour
  { a: [5, -3], b: [5, -2] },
];

export const QUICK_START_MAP: MapSpec = symmetricMap('quickstart', 'The Akinlandian Sea', CENTER, WEDGE, WEDGE_MOUNTAINS, [
  {
    slotPrefix: 'white',
    names: {
      island: 'Aegina',
      'coast-purple': 'Athenopolis',
      'inland-purple': 'Marathon',
      'coast-second': 'Piraeus',
      'inland-second': 'Eleusis',
      'coast-third': 'Salamis',
      'inland-third': 'Megara',
      'inland-neutral': 'Delphi',
    },
  },
  {
    slotPrefix: 'black',
    names: {
      island: 'Kythera',
      'coast-purple': 'Gytheion',
      'inland-purple': 'Sparta',
      'coast-second': 'Pylos',
      'inland-second': 'Messene',
      'coast-third': 'Argos',
      'inland-third': 'Mycenae',
      'inland-neutral': 'Olympia',
    },
  },
  {
    slotPrefix: 'green',
    names: {
      island: 'Samos',
      'coast-purple': 'Ephesus',
      'inland-purple': 'Sardis',
      'coast-second': 'Miletus',
      'inland-second': 'Gordion',
      'coast-third': 'Smyrna',
      'inland-third': 'Pergamon',
      'inland-neutral': 'Troy',
    },
  },
]);

/** Slot id -> faction id (they coincide on this map). */
export const QUICK_START_SLOTS: Record<string, string> = {
  'white-purple': 'white-purple',
  'white-second': 'white-crimson',
  'white-third': 'white-azure',
  'black-purple': 'black-purple',
  'black-second': 'black-orange',
  'black-third': 'black-gold',
  'green-purple': 'green-purple',
  'green-second': 'green-rose',
  'green-third': 'green-teal',
};

export interface PresetMap {
  spec: MapSpec;
  slots: Record<string, string>;
  description: string;
  /** replaces the standard factions (names, colours; only these may be chosen) */
  factions?: FactionDef[];
  /** most leaders the map has starting cities for */
  maxPlayers?: number;
}

export const MAPS: Record<string, PresetMap> = {
  quickstart: { spec: QUICK_START_MAP, slots: QUICK_START_SLOTS, description: 'The Akinlandian Sea: a symmetric 91-hex board designed for the digital game.' },
  table2026: { spec: TABLE_MAP, slots: TABLE_SLOTS, description: 'The Table of 2026: the hand-painted board from the last live game, reconstructed from photographs.' },
  eurasia: { spec: EURASIA_MAP, slots: EURASIA_SLOTS, description: 'Eurasia: Europe (White), the Middle East and India (Black) and East Asia (Green), with Siberia and the steppe as a shared frontier; every homeland has equal fields.' },
  claremont: {
    spec: CLAREMONT_MAP,
    slots: CLAREMONT_SLOTS,
    description: 'The Claremont Colleges: nine nations in three teams. CMS (North Quad Networkers, Grinders of Galileo, Feelers of Fowler), the Sagehens (The Frary Feast, Monologuers of Marston, Munchers of Mound) and the Grad Schools (Dissertators of Drucker, Pipette Priests of Kresge, Hushers of Honnold). Every nation has a city to grab on the first turn and two to fight over, out to the Villages and 21 Choices. Landlocked: no ships.',
    factions: CLAREMONT_FACTIONS,
  },
};
