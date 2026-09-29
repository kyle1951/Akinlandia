# Akinlandia

A playable browser version of **Akinlandia**, a hex-map strategy and politics board game for 3 to 9 leaders,
"in honor of Kyle Akin, a true philosopher king". The rules are in `docs/rules.md` (converted from
`Akinlandia_v1p0.docx`) and are also readable inside the app.

## Install and run

Requires Node 18 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173). Other commands:

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run build`     | typecheck and produce a production build in `dist/`       |
| `npm run typecheck` | `tsc --noEmit` with `strict: true`                        |
| `npm run lint`      | ESLint                                                     |
| `npm test`          | every unit test plus the 200-game simulation and replay tests |
| `npm run sim`       | only the 200-game all-bot simulation                      |
| `npm run dev:online`| build the app and run the online server locally on http://localhost:8787 |
| `npm run deploy`    | build the app and deploy it (with the online server) to Cloudflare |

`SIM_GAMES=20 npm run sim` runs a shorter simulation; `npx vite-node scripts/debug.ts <seed>` replays a
failing seed and prints the state around the failing action.

## How to play

1. **Setup screen.** Choose 3 to 9 seats, name each leader (and give them a silly leader name for the order
   announcements), and mark each seat human or bot. Pick Quick Start (a preset map: the designed board, the
   photographed Table of 2026, or Eurasia) or Full Game (build the map tile by tile), optionally turn on "Always prompt every eligible player" at reaction windows or the
   optional house rules (food spoils above a cap per city held; a hand limit of 7 cards), choose
   simultaneous (the default: Generals write secret orders, then everything resolves at once and a
   resolution map shows what happened) or sequential military orders, and set a
   seed if you want a reproducible game. An all-bot game can be watched at any speed or run to the end.
2. **Roles.** In a random order each leader picks an alliance (White, Black, Green) and a faction. Purple, the
   royal faction, must be taken first in each alliance and starts as that alliance's General.
3. **Hotseat play.** The game is played on one device. Whenever a decision is private (the allocation sheet,
   the PLAY/RETAIN envelopes, a reaction window) a "Pass the device to ..." screen appears first. Every other
   decision is public and appears in the panel on the right; the board highlights legal targets in gold.
4. **Saving.** The game autosaves to the browser after every action and offers to resume on reload. "Export
   save" downloads the state as JSON and "Import save" loads one.

## Playing online with friends

The same game can be played from different cities, each leader on their own screen. The board, panels,
allocation sheet and cards work exactly as in hotseat play; the "pass the device" screens disappear because
private decisions only ever appear on their owner's screen.

- **Hosting.** The online server is a Cloudflare Worker with one Durable Object per table. It runs the same
  rules engine as the browser, validates every action, plays the bots, and keeps each table in its own
  SQLite store, so a game can be left for days and resumed from the same link. The free plan is more than
  enough: a whole game is a few thousand requests against a 100,000-per-day allowance.
- **Deploy once.** `npx wrangler login` (opens the Cloudflare sign-in page in your browser), then
  `npm run deploy`. Wrangler prints the address, something like `https://akinlandia.<your-account>.workers.dev`.
- **Play.** Open the address, choose "Play online at a shared table", open a table, and send the link (or the
  six-character code) to your friends. Each person claims a seat with their name and silly leader name;
  seats nobody claims are played by bots. The host sets the map and starts the game. The tab title changes to
  "YOUR TURN" when a decision is yours, and any player can hand their seat to a bot from the leaders panel
  while they are away and take it back later.
- **What the server tells each player.** Only what the tabletop would: your own cards, everyone's hand
  sizes, the board, the log, and the pending decision when it is yours. Reaction windows do not reveal who
  is being asked, so holding a Rage of Achilles or a Lightning Bolt stays secret.
- **Local testing.** `npm run dev:online` serves the built app and the server from a local Cloudflare
  emulator; open two browser windows on http://localhost:8787 to play both sides of a table.

## Rules in brief

Each **turn** has three phases.

- **Allocation and deployment.** Every leader privately spends the full productive capacity of their cities
  (L1 = 3, L2 = 5, L3 = 6) on farmers, soldiers and politicians (1 each; a new soldier also costs 1 food and
  1 raw material, a house rule) and may spend saved raw materials
  on ships (1), city level improvements (7), Temples and Universities (3 each, Level 3 cities only) and
  Walls (2). Each General then fixes the order of play inside their alliance. Farmers (three at a time),
  buildings, ships, soldiers and politician cards are deployed in turn, alliances interleaving. Farmers go
  within two land tiles of your cities or beside a chain of your alliance's manned ships; ships are built in
  coastal cities; soldiers in any city; everyone draws one politician card for free.
- **Military movement and combat.** In four sub-phases (Ships 1, Ships 2, Full 1, Full 2) each General, in
  alliance order, issues orders one tile at a time: "I, SINCLAIR THE GREAT, ISSUE A FINAL ORDER ...". Only
  manned ships (one soldier per ship) move in the ship sub-phases. A tile holds pieces of one alliance
  only, so entering an enemy tile means combat: one d6 per non-spent soldier, the defender adds +2 per
  soldier, +1 more in a city and +1 more behind Walls; every 6 is a hit. Higher score wins the tile; ties
  and mutual annihilation favour the defender. Losing defenders retreat and are spent for the sub-phase.
  Unmanned ships are captured by whoever walks in.
- **Reconciliation and politics.** Farmers harvest 2 food from wheat (house rule) and 1 raw material from any
  wood, stone or iron marker, then leave the board. Every soldier raised in an earlier turn eats 1 food or is
  disbanded. Then each leader
  secretly fills a PLAY envelope with at least one card; the envelopes are revealed together and the highest
  total in each alliance becomes General. Apple of Discord forces a replay, Attacked by Philosophers steals
  a partner's city on an even roll (or your hand on an odd one), Rage of Achilles lets you refuse your
  General's orders, the Trojan Horse reverses a failed city assault between two other alliances, and the
  Lightning Bolt of Zeus cancels the last two.

At the end of every turn a d6 is added to a running total; when it reaches 35 the game ends. Score 3 / 5 / 6
per city by level, +1 per Temple or University on a Level 3 city, +2 for holding a Generalship. Ties are
broken by Generalship, then by cards left in hand, then by a Sing-Off. The last-place leader is mocked, as
the rules intend.

## Layout

- `src/engine/` pure TypeScript rules engine (no React), a task-queue state machine with an explicit
  pending decision; `src/data/` map, tile bag, cards and factions as data; `src/bots/` heuristic bot and
  simulation runner; `src/ui/` React app; `tests/` Vitest suites.
- `DESIGN_DECISIONS.md` records every ruling and interpretation, each tied to the rule text it interprets.
- `PLAN.md` tracks the milestones; `CLAUDE.md` documents the architecture and conventions for future work.
