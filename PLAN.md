# Akinlandia build plan

Spec: `docs/rules.md` (converted from `Akinlandia_v1p0.docx`) plus the rulings in `BUILD_PROMPT.md` section 4.
Interpretations live in `DESIGN_DECISIONS.md`.

## Milestones

- [x] 1. Scaffold (Vite + React 18 + TS strict, Vitest, ESLint), rules conversion, `PLAN.md`, `DESIGN_DECISIONS.md`.
- [x] 2. Engine core: types, hex model, RNG, Quick Start map data, setup and role selection, alliance order, allocation, deployment.
- [x] 3. Movement and combat, including retreats, casualties, captures and ship rules.
- [x] 4. Reconciliation, politics, card deck, all card effects and reaction windows, end of game, scoring and tiebreakers.
- [x] 5. Heuristic bots and the 200-game simulation harness with invariants; everything it found was fixed (captured ships now change owner immediately).
- [x] 6. UI: setup, SVG board (pan/zoom), all phase interfaces, privacy screens, log, end screen, save/load, all-bot spectate mode, in-app rules.
- [x] 7. Full Game tile-placement setup.
- [x] 8. Polish: `README.md`, `CLAUDE.md`, final pass on `DESIGN_DECISIONS.md`.

## Module layout

```
src/engine/          pure TypeScript, no React/DOM imports
  rng.ts             mulberry32 seeded RNG stored in state
  hex.ts             axial coordinates, neighbours, rotation, edge indices
  types.ts           GameState, Tile, Unit, Player, PendingDecision, Action, Task, LogEntry
  map.ts             builds Tile records from a compact MapSpec, validates edge consistency
  query.ts           read-only helpers (units on tile, cities of player, alliance of player, scores)
  core.ts            mutation helpers: log, task queue, units, cards, reaction candidates
  rules/
    turnOrder.ts     alliance order, interleaved and sequential player orders
    allocation.ts    allocation validation
    deploy.ts        farmer / building / ship / soldier placement legality
    movement.ts      order legality (land, ship pairing, ship-only sub-phases, no chaining)
    combat.ts        dice, hits, ship losses, final-control exceptions, retreat legality
    politics.ts      elections
    scoring.ts       city points, general bonus, tiebreakers
  flowSetup.ts       roles, turn start, allocation, faction order, deployment tasks and actions
  flowMilitary.ts    sub-phases, orders, reaction windows, combat, retreats, captures, Trojan Horse
  flowPolitics.ts    reconciliation, feeding, politics, Apple, Philosophers, elections, end of game
  fullGame.ts        Full Game tile placement
  machine.ts         task queue interpreter: advance(), applyAction(), getPendingDecision()
  setup.ts           createGame
  invariants.ts      checks run by the simulation harness after every action
  index.ts           public API
src/data/            quick start map spec, tile bag, card table, faction/alliance data
src/bots/            heuristic bot answering every PendingDecision kind; simulation runner
src/ui/              React app: setup, board, panels, decision dialogs, privacy screens, log, save/load
tests/               Vitest unit tests + simulation harness + replay test + Full Game tests
scripts/             smoke/batch/debug helpers for vite-node
```

## Rule areas covered by tests

- [x] hex adjacency, rotation, edge matching, derived tile types (`tests/hex.test.ts`)
- [x] alliance order and tiebreaks (Black, White, Green), seat balancing, Purple first (`tests/turnOrder.test.ts`)
- [x] allocation validation (capacity spent exactly, raw material costs, free politician, warnings) (`tests/allocation.test.ts`)
- [x] farmer legality by land (distance 2, mountains, other leaders' cities/farmers, enemy units, allied guards) and by ship chain (`tests/deploy.test.ts`)
- [x] deployment interleaving (A1 B1 C1 A2 ...) and 3-per-decision farmers; building placement order (`tests/deploy.test.ts`)
- [x] movement legality: land edges, mountains, ship pairing, ship-only sub-phases, no chaining, one alliance per tile (`tests/movement.test.ts`)
- [x] combat scoring, hits, all four final-control exceptions, casualty choice, retreats and spent status, no line of retreat, ship losses, capture of unmanned ships, sinking (`tests/combat.test.ts`)
- [x] non-combat entries: farmers destroyed, undefended city conquered, neutral city taken, ownership assignment (`tests/combat.test.ts`)
- [x] feeding and forced disbanding; collection rules (`tests/politics.test.ts`)
- [x] each card: Rage of Achilles (incl. re-pairing), Apple of Discord, Attacked by Philosophers (even/odd, Zeus cancel), Trojan Horse (swap, Zeus cancel, eligibility, retreat variant), Zeus in PLAY, never play your last card (`tests/cards.test.ts`, `tests/politics.test.ts`)
- [x] election ties (incumbent, then in-alliance order) (`tests/politics.test.ts`)
- [x] end-of-game trigger (running d6 total >= 35) (`tests/politics.test.ts`)
- [x] scoring and every tiebreaker incl. sing-off with human votes and random fallback (`tests/politics.test.ts`)
- [x] Full Game tile placement priority, claims, legality, bounded map, fallback city, full games to completion (`tests/fullgame.test.ts`)
- [x] simulation harness: 200 all-bot games, 3-9 players, invariants after every action (`tests/simulation.test.ts`)
- [x] replay: seed + action log reproduce identical final state; pure applyAction never mutates (`tests/replay.test.ts`)
