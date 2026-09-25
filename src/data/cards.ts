import type { CardDef, CardType } from '../engine/types';

/** The base-level politics deck from the Appendix (ruling 27): 100 cards. */
export const CARD_DEFS: CardDef[] = [
  {
    type: 'rage',
    name: 'Rage of Achilles',
    value: 0,
    count: 20,
    text: 'Play this card during the movement phase to refuse an already-issued order for units of your own in a specific territory from the alliance\'s general.',
  },
  {
    type: 'apple',
    name: 'Apple of Discord',
    value: 0,
    count: 3,
    text: 'Once all politics cards are revealed, any players who deployed the Apple of Discord (in alliance order) may choose to require re-playing the phase for all players, with all spent cards remaining spent. All players draw 1 new card before re-playing.',
  },
  {
    type: 'philosophers',
    name: 'Attacked by Philosophers',
    value: 0,
    count: 2,
    text: 'When played during the politics phase, the player may roll a d6 to try to take control of a city away from a specific named alliance partner, provided that it is not the partner\'s only city. Evens wins. Odds: lose all remaining politics cards.',
  },
  {
    type: 'trojan',
    name: 'Trojan Horse',
    value: 0,
    count: 2,
    text: 'Play immediately following combat between two other alliances; if a city attack has failed against a faction with at least two cities, playing this card switches the attacker and defender locations, reversing all combat losses; the player of the card assigns, within the victorious alliance, which faction shall control the conquered city.',
  },
  { type: 'citizen', name: 'A Citizen', value: 1, count: 40, text: 'None.' },
  { type: 'clever', name: 'A Clever Man', value: 2, count: 20, text: 'None.' },
  { type: 'orator', name: 'An Orator', value: 3, count: 10, text: 'None.' },
  {
    type: 'zeus',
    name: 'Lightning Bolt of Zeus',
    value: 4,
    count: 3,
    text: 'May be played to counteract effects of Attacked by Philosophers or a Trojan Horse (played immediately afterwards).',
  },
];

export const CARD_BY_TYPE: Record<CardType, CardDef> = Object.fromEntries(CARD_DEFS.map((c) => [c.type, c])) as Record<CardType, CardDef>;

export const DECK_SIZE = CARD_DEFS.reduce((n, c) => n + c.count, 0);
