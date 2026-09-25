# Akinlandia build plan

Spec: `docs/rules.md` (converted from `Akinlandia_v1p0.docx`) plus the rulings in `BUILD_PROMPT.md` section 4.
Interpretations live in `DESIGN_DECISIONS.md`.

## Milestones

- [x] 1. Scaffold (Vite + React 18 + TS strict, Vitest, ESLint), rules conversion, `PLAN.md`, `DESIGN_DECISIONS.md`.
- [ ] 2. Engine core: types, hex model, RNG, Quick Start map data, setup and role selection, alliance order, allocation, deployment.
- [ ] 3. Movement and combat, including retreats, casualties, captures and ship rules.
- [ ] 4. Reconciliation, politics, card deck, all card effects and reaction windows, end of game, scoring and tiebreakers.
- [ ] 5. Heuristic bots and the 200-game simulation harness with invariants; fix everything it finds.
- [ ] 6. UI: setup, SVG board (pan/zoom), all phase interfaces, privacy screens, log, end screen, save/load, all-bot spectate mode, in-app rules.
- [ ] 7. Full Game tile-placement setup.
- [ ] 8. Polish: `README.md`, `CLAUDE.md`, final pass on `DESIGN_DECISIONS.md`.

## Module layout

```
src/engine/          pure TypeScript, no React/DOM imports
  rng.ts             mulberry32 seeded RNG stored in state
  hex.ts             axial coordinates, neighbours, rotation, edge indices
  types.ts           GameState, Tile, Unit, Player, PendingDecision, Action, LogEntry
  map.ts             builds Tile records from a compact MapSpec, validates edge consistency
  cards.ts           card definitions and deck construction
  query.ts           read-only helpers (units on tile, cities of player, alliance of player, scores)
  rules/
    turnOrder.ts     alliance order, faction order
    allocation.ts    allocation validation and application
    deploy.ts        farmer / building / ship / soldier placement legality
    movement.ts      order legality (land, sea pairing, ship-only sub-phases, no chaining)
    combat.ts        dice, hits, casualties, final-control exceptions, retreat legality
    politics.ts      play validation, elections, card resolution helpers
    scoring.ts       city points, general bonus, tiebreakers, alliance points
  machine.ts         task queue interpreter: advance(), applyAction(), getPendingDecision()
  setup.ts           createGame, role selection, Quick Start placement, Full Game tile placement
  index.ts           public API
src/data/            quick start map spec, card table, faction/alliance data, tile bag
src/bots/            heuristic bot answering every PendingDecision kind
src/ui/              React app: setup, board, panels, decision dialogs, privacy screens, log, save/load
tests/               Vitest unit tests + simulation harness + replay test
```

## Rule areas covered by tests

- [ ] hex adjacency, rotation, edge matching, derived tile types
- [ ] alliance order and tiebreaks (Black, White, Green)
- [ ] allocation validation (capacity spent exactly, raw material costs, free politician)
- [ ] farmer legality by land (distance 2, mountains, other leaders' cities/farmers, enemy units) and by ship chain
- [ ] deployment interleaving (A1 B1 C1 A2 ...) and 3-per-decision farmers
- [ ] movement legality: land edges, mountains, ship pairing, ship-only sub-phases, no chaining, one alliance per tile
- [ ] combat scoring, hits, all four final-control exceptions, retreats and spent status, capture of unmanned ships
- [ ] non-combat entries: farmers destroyed, undefended city conquered, neutral city taken, ownership assignment
- [ ] feeding and forced disbanding
- [ ] each card: Rage of Achilles, Apple of Discord, Attacked by Philosophers, Trojan Horse, Zeus (both modes), never play your last card
- [ ] election ties (incumbent, then in-alliance order)
- [ ] end-of-game trigger (running d6 total >= 35)
- [ ] scoring and every tiebreaker incl. sing-off
- [ ] Full Game tile placement priority (3-sided before 2-sided before 1-sided)
- [ ] simulation harness: 200 all-bot games, 3-9 players, invariants after every action
- [ ] replay: seed + action log reproduces identical final state
