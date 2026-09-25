# Build Akinlandia: a playable digital version of the board game

You are building, from scratch and in one uninterrupted session, a complete, playable browser implementation of **Akinlandia**, a hex-map strategy and politics board game. The full rules are in `Akinlandia_v1p0.docx` in the repo root. Work autonomously until the Definition of Done at the bottom is met. Do not stop to ask me questions: when something is unclear, choose the most literal reasonable reading of the rules, record it in `DESIGN_DECISIONS.md`, and keep going.

## 0. First steps (do these before writing any game code)

1. Convert the rules to Markdown so you can read them reliably: `pandoc -t markdown Akinlandia_v1p0.docx -o docs/rules.md` (if pandoc is missing, use `npx mammoth` or `python-docx`). Keep footnotes; many rules live in them. Read the whole file, including the footnotes, the Appendix allocation sheet, and the politics card table.
2. `git init`, add a Node `.gitignore`, and commit.
3. Write `PLAN.md`: milestones (see section 8), module layout, and the list of rule areas you will test. Keep it updated as you go and check items off.
4. Create `DESIGN_DECISIONS.md` and start it with every ruling in section 4 of this prompt, then append any further interpretations you make.

## 1. Source of truth and scope

The rules document (`docs/rules.md`) is the spec. Section 4 of this prompt fills gaps and resolves ambiguities in it; where section 4 is explicit, follow it. Implement the **base game (MVP)** only. The memo at the end of the document ("To: Development Team ... Re: Features") lists future ideas such as faction specializations, gold, trade, knights, diplomacy, and river tiles. **Do not implement any of them**, but keep units, buildings, cards, and tiles data-driven so they could be added later.

## 2. Product decisions

- **Platform:** a single-page web app that runs locally with `npm run dev`. No backend.
- **Players:** 3 to 9 seats. Each seat is a human or a bot. Local "hotseat" play on one device: whenever private information is entered or shown (allocation sheet, hand of cards, PLAY/RETAIN choice, reaction prompts), show a full-screen "Pass the device to {name}" privacy screen that must be clicked through before the private view appears, and hide it again afterwards. Bots act without privacy screens.
- **All-bot mode** must work (spectate with adjustable speed, plus a "run to end" button). This doubles as the engine's stress test.
- **Setup modes:** Quick Start (preset map, each faction pre-assigned two cities) and Full Game (players build the map by placing tiles). Quick Start is the priority; build Full Game after everything else works.
- **Save/load:** autosave the game state to `localStorage` after every action; also allow export/import of the state as a JSON file.
- **Theme:** keep the document's classical, tongue-in-cheek voice in UI copy (see section 6).

## 3. Tech stack and architecture

- Vite + React 18 + TypeScript (`strict: true`), Vitest for tests, ESLint. SVG for the hex board. A small store (Zustand or `useReducer`) in the UI layer only.
- **The engine is pure TypeScript with zero React or DOM imports** and lives in `src/engine/`. Everything else depends on it, never the reverse.
- **State machine with an explicit pending-decision queue.** This is the core design; get it right first. The engine exposes roughly:
  - `createGame(config, seed): GameState`
  - `getPendingDecision(state): PendingDecision | null` — who must decide what right now, with the legal options (e.g. `{ kind: "placeFarmers", playerId, maxCount: 3, legalTiles: [...] }`, `{ kind: "reaction", playerId, window: "rageOfAchilles", ... }`).
  - `applyAction(state, action): { state, events }` — validates the action against the pending decision, rejects illegal ones with a clear error, and never mutates its input.
  - `getLegalActions(state)` or equivalent helpers used by both the UI and the bots.
  Interleaved placement order, simultaneous allocation (collected one player at a time, revealed together), combat sub-steps, retreats, casualty choices, ownership assignment by the General, and card reaction windows are all just decisions in this queue. The UI and the bots both do nothing but read the pending decision and submit an action.
- **Seeded RNG stored in the state** (e.g. mulberry32) for every die roll, shuffle, and tile draw, so any game can be replayed exactly from seed + action log. Keep the action log in the state.
- **Hex model:** axial coordinates. Each tile has six edges, each typed `sea` or `land`; a land edge may carry a `mountain` flag. Tile type is derived: all six sea edges = sea/island tile; all land = land tile; mixed = coastal tile. Tiles may also have a city (level 1–3, owner, improvements), and resource markers: wheat, wood, stone, iron, fish. Two adjacent tiles connect only through their shared edge pair; tiles may be rotated when placed.
- Suggested layout: `src/engine/` (types, setup, phases, combat, cards, scoring, rng, hex), `src/data/` (maps, card deck, tile bag as JSON/TS data), `src/bots/`, `src/ui/`, `tests/`.

## 4. Rulings (gaps and ambiguities resolved)

Alliances, factions, setup

1. Three alliances: White, Black, Green. Players are split as evenly as possible across alliances; each seat is one faction leader. Each alliance has a Purple (royal) faction, which is filled first and starts as that alliance's General. Pick distinct colors for the other factions. With only one leader, that leader is permanently the General.
2. Role selection order is random. In order, each player picks an alliance and an available faction, keeping alliances balanced. Every player also enters a silly leader name (e.g. "Sinclair the Great"), used in the order announcement.
3. Each player starts with 2 food, 0 raw materials, 0 cards, and no pieces on the board.
4. Quick Start map: the rules reference a preset map but do not include it, so design one as data. Requirements: roughly 60–90 hexes; a sea region with at least two islands; coastal and land regions; mountain edges; wheat and raw-material markers (fish may appear but is inactive); three alliance "homelands" each with 3 faction slots of 2 starting cities each (so 18 starting cities) plus about 6 neutral cities; every faction slot gets at least one coastal city and reasonable nearby wheat and raw materials, and the three homelands are as symmetric as you can make them. Starting cities for unused faction slots are neutral. If you like, author a second smaller map for 3–5 players.
5. Neutral (unowned) cities have no defenders. A military unit that enters one takes it; the General assigns ownership to a member of the alliance.

Turn order

6. At the start of each turn compute alliance order: fewest total city points first (using the scoring values in ruling 38), ties broken Black, then White, then Green.
7. Within each alliance the General sets the order of factions once per turn, after allocation is finalized. That order is used for the whole turn (deployment, food removal, any other in-alliance ordering). Interleave across alliances as in footnotes 8 and 12: alliance A's 1st, B's 1st, C's 1st, A's 2nd, and so on, skipping players who have finished that placement type.

Allocation and deployment

8. Productive capacity per city: L1 = 3, L2 = 5, L3 = 6. It must be spent in full on farmers, soldiers, and politicians (1 each). Every player also receives 1 politician card free each turn.
9. Raw-material costs: ship 1; city level improvement (L1→L2 or L2→L3) 7; Temple 3; University 3; Walls 2. Temple and University require an L3 city, max one of each per city. Walls allowed at any level, max one per city. Raw materials and food carry over between turns. Improvements are bought during allocation and placed during deployment; any that cannot legally be placed are lost (warn the player on the allocation screen). Within one player's building placement, apply them in the order the player chooses, so a level-up placed first can enable an L3 improvement placed after it.
10. Deployment order: farmers, then buildings and improvements, then ships, then soldiers, then politician cards. Farmers are placed up to 3 per placement decision; every other type is placed all at once when it is that player's turn.
11. Farmer placement: at most one farmer per tile. Illegal if the tile has another leader's farmer, another leader's city (even an alliance partner's), or any unit of another alliance. Own city tiles and tiles guarded by allied soldiers are fine. The tile must be (a) within land-path distance 2 of a city the leader controls, moving only across land edges without mountains (the city tile itself is distance 0), or (b) sea-adjacent to (or itself part of) a chain of tiles connected by sea edges, where every tile in the chain holds at least one manned ship of the leader's alliance and the first tile of the chain is the leader's city or sea-adjacent to it (see footnote 14). Unplaceable farmers are lost.
12. Farmers are removed from the board at the end of the turn, after collection. They are re-allocated each year.
13. Ships are placed on coastal (or island) city tiles the leader controls. Soldiers are placed on any city tile the leader controls. Implement only this main rule for ships; note the footnote 15 exception as not implemented.

Movement

14. Four movement sub-phases per turn: Ships 1, Ships 2, Full 1, Full 2. In each sub-phase, Generals act in alliance order; each General issues all of that sub-phase's orders before the next General begins.
15. An order targets one source tile and splits some or all of its units among adjacent destinations. The General confirms with the announcement "I, {LEADER NAME}, ISSUE A FINAL ORDER. {units} TO {tile}, ..." shown as a dramatic banner. After the announcement a reaction window opens (Rage of Achilles), then all moves from that tile resolve, then all resulting combats resolve, before any other tile may be ordered. Units that moved this sub-phase cannot move again until the next sub-phase. Units are allowed to stay put.
16. Each unit moves at most one tile per sub-phase. Soldiers move across land edges without mountains. Ships move only across sea edges, only into sea, island, or coastal tiles, and only when manned.
17. Only soldiers are combat units, and only soldiers eat. Ships are carriers: one ship carries exactly one soldier. A group crossing a sea edge must have every ship paired with a soldier and every soldier paired with a ship. In Ships 1 and 2, only such manned ship pairs may move. In Full 1 and 2, both land moves and ship moves are allowed.
18. A tile may only hold pieces of one alliance (units from several factions of that alliance may share it). Ships left in a tile with no soldiers of their alliance are unmanned: they cannot move, the General may destroy them, and an unmanned ship on a pure sea tile is destroyed immediately. An enemy that enters a tile holding only unmanned ships captures them, and its General reflags them to a faction of their choice.
19. Moving into a tile holding only enemy farmers destroys the farmers with no combat. Moving into an enemy city tile with no enemy soldiers conquers it with no combat. On any conquest from another alliance, the conquering General immediately assigns ownership to one member of their alliance. Ownership persists without occupation.

Combat

20. Combat happens when units move into a tile holding enemy soldiers. The defender is the side already in the tile. Ships add no dice; a sea or coastal fight is not split into component battles (footnote 24).
21. Each side rolls 1d6 per non-spent soldier. Territorial score = dice total, plus for the defender +2 per soldier, plus +1 per defending soldier if the tile has a city (owned or neutral), plus another +1 per defending soldier if the city has Walls. Spent soldiers roll nothing and add no bonuses. Log the full calculation.
22. Every 6 rolled is one hit on the other side. The owning side's General chooses which soldiers are removed; spent soldiers may be chosen (footnote 27). At sea, a removed soldier's ship is removed with it. In a coastal fight, loose land soldiers may be taken before ship pairs. Hits beyond the number of soldiers are wasted.
23. Final control: the higher score wins; a tie goes to the defender. Exceptions from the rules: if both sides are wiped out, the defender keeps the tile; if the attacker scored higher but has no survivors, the defender keeps the tile; if the defender scored higher but has no non-spent survivors, any spent defenders are destroyed and the attacker takes the tile. If a side is wiped out and ships of that side remain, the winner captures those ships.
24. A losing attacker returns all surviving units to the tile they came from, not spent (they still count as having moved). A losing defender must retreat all survivors to adjacent tiles that are empty or friendly, reached by legal land moves or by ship moves using available ships; their own General chooses the destinations. Retreated units are spent until the end of the current sub-phase. Survivors with no legal retreat are destroyed. Farmers in a lost tile are destroyed. A tile held only by spent units cannot defend; attacked, all are lost.

Reconciliation

25. Collection: each surviving farmer yields 1 food if its tile has wheat and 1 raw material if its tile has any raw-material marker (at most 1 raw material, however many markers). Fish is inactive. Collection does not depend on the ships that enabled placement.
26. Feeding: each soldier costs its owner 1 food. Players must feed units they can feed. If a player is short, they choose which of their soldiers to disband, one at a time, processed in alliance order and then the General's in-alliance order.

Politics and cards

27. Build the deck from the Appendix table: 20 Rage of Achilles (0), 3 Apple of Discord (0), 2 Attacked by Philosophers (0), 2 Trojan Horse (0), 40 A Citizen (1), 20 A Clever Man (2), 10 An Orator (3), 3 Lightning Bolt of Zeus (4). 100 cards. Played cards go to a discard pile; reshuffle the discard into the deck when the deck runs out.
28. Hands are hidden; hand sizes are public. In the politics phase each player privately moves cards from their hand (RETAIN) into PLAY and must play at least one card. All PLAY cards are then revealed at once. In each alliance, the highest total value becomes General for the next turn. Tie: the incumbent General wins if tied; otherwise the tied player earliest in the current in-alliance order wins.
29. Resolution order after reveal: (1) Apple of Discord: in alliance order, each player who played one may invoke it. If anyone does, all played cards stay discarded, every player draws 1 card, and the whole PLAY selection repeats. (2) Then, in alliance order, resolve special texts that apply in this phase (Attacked by Philosophers), with Zeus reaction windows. (3) Then elect Generals.
30. Attacked by Philosophers (politics phase): the player names an alliance partner and one of that partner's cities; the partner must own at least 2 cities. Roll 1d6: even, the city transfers to the card's player; odd, the card's player discards their entire remaining hand.
31. Lightning Bolt of Zeus works in two ways. In the PLAY envelope it counts 4 toward politics score and has no other effect. As a reaction, it may be played from the hand immediately after a Philosophers or Trojan Horse is announced (before any roll or effect), cancelling that card. Played as a reaction it is discarded and gives no politics score.
32. Rage of Achilles (military phase reaction): after a General announces an order, any other player whose own units were ordered from that source tile may play it to make their own units in that tile stay put. All other moves in the order still happen. Played in the PLAY envelope it is just value 0.
33. Trojan Horse (military phase reaction): immediately after a combat between two alliances other than the card player's, if an attack on a city failed and the defending city's owner owns at least 2 cities, the card player may play it. Effect: restore every soldier and ship removed in that combat on both sides; move the attacking units into the city and the defending units to the attacker's origin tile (not spent). If the origin tile still holds units of the attacking alliance, the defenders instead retreat per ruling 24. The card player chooses which faction of the attacking alliance now owns the city. Zeus may cancel it.
34. During the military phase a player may never play their last card, because one must remain for politics.
35. Reaction windows in hotseat: by default, prompt only players who hold an eligible card and meet the conditions, each behind a privacy screen. This leaks that a card exists, so also add a setup option "Always prompt every eligible player" that prompts everyone who meets the conditions, whether or not they hold the card. Bots decide instantly.
36. The rule allowing a player to object to collusion is a tabletop rule and is not implemented (the privacy screens serve its purpose). Note this in `DESIGN_DECISIONS.md`.

End of game and scoring

37. At the end of each turn, roll 1d6 and add it to a public running total. When the total reaches 35 or more, the game ends.
38. Score per city: L1 = 3, L2 = 5, L3 = 6, plus 1 per Temple or University on an L3 city. Walls score nothing. Each current General gets +2. Highest total wins overall.
39. Tiebreakers: holding a Generalship; then the highest total value of cards remaining in hand; then a "Sing-Off" modal that tells the tied players to each sing a song and lets the other players vote for the winner (bots abstain; if only bots remain to vote, pick randomly and say so). The final screen should also gently mock the last-place leader, as the rules intend.

Full Game setup (after everything else works)

40. Define a bounded play area (a hex radius large enough for the tile count) and a tile bag as data. Deal each player a supply of tiles containing at least 2 city tiles. In reverse role-selection order, players take turns drawing a random tile from their own supply and placing it (with rotation) where every shared edge matches (sea to sea, land to land). Placement priority from the rules: if the tile can be placed touching 3 or more existing tiles, it must be; otherwise 2-sided spots come before 1-sided. If no legal spot exists, draw the next tile; a tile with no legal spot ever is discarded. A player may claim a city tile they place, up to 2. Seed the board with one starting sea tile in the center. If a player ends setup with no cities, give them the nearest unclaimed city (document this fallback).

## 5. Bots

Write a heuristic bot in `src/bots/` that can answer every pending decision type. It only needs to be sensible, not strong. Allocation: buy enough farmers to feed its soldiers with some margin, save raw materials for city levels, then split the rest between soldiers and politicians. Placement: farmers on wheat + raw tiles first. Generalship: defend threatened cities, attack weakly held enemy cities and farmers, avoid bad odds. Politics: play enough cards to contest the Generalship when it can win, keep Zeus and reaction cards. Use the game's seeded RNG for any randomness so bot games are reproducible.

## 6. UI requirements

- **Setup screen:** player count, human/bot per seat, names, role selection, setup mode, reaction-prompt option, optional seed.
- **Board:** SVG hex map with pan and zoom. Follow the rules document's visual language: cities as black dots (with level/improvement badges), mountains as brown edge strokes, wheat as a yellow patch, wood as a brown tree, stone as gray dots, iron as an orange pick, fish dark blue (dimmed as inactive), farmers as circles, soldiers as spools, ships as triangles. Color pieces by faction with an alliance-colored outline. Highlight legal targets for the current decision; show spent units visibly.
- **Side panels:** current turn, phase and sub-phase, alliance order, Generals, each player's public stats (cities, capacity, food, raw materials, hand size, current score), the running end-game die total, and a scrolling game log with every roll and combat calculation.
- **Allocation sheet:** modeled on the Appendix form, showing capacity, current stocks, counters for each purchase, the free politician, and live validation (capacity must be spent exactly; raw materials must cover purchases).
- **Politics:** a PLAY/RETAIN drag or toggle interface, then a dramatic simultaneous reveal per alliance and the election result.
- **Movement:** click source tile, assign unit counts to destinations, confirm, show the "FINAL ORDER" banner, then animate or step through combat results.
- **In-app rules:** a panel that renders `docs/rules.md`.
- Copy should keep the document's voice (Hobbes, Herodotus, Clemenceau, "a true philosopher king").

## 7. Testing

- Unit tests for each rule area: hex adjacency and edge matching; alliance order and tiebreaks; allocation validation; farmer legality by land (including mountains) and by ship chain; deployment interleaving; movement legality (land, ship pairing, ship-only sub-phases, no chaining); combat scoring, hits, all four final-control exceptions, retreats and spent status, capture of unmanned ships; feeding and forced disbanding; each card's effect and timing, including Zeus cancelling and "never play your last card"; election ties; end-of-game trigger; scoring and every tiebreaker; Full Game tile placement priority.
- **Simulation harness:** run at least 200 all-bot games with different seeds and player counts (3 to 9) to completion (with a safety cap on turns). After every action, check invariants: at most one alliance per tile; at most one farmer per tile; no negative food, raw materials, or unit counts; card count conserved across deck, discard, and hands; every city has at most one owner; capacity spent exactly; the pending decision is always non-null until the game ends. Any failure must print the seed and action index so it can be replayed.
- Add a replay test: the same seed and action log reproduce an identical final state.

## 8. Milestones (commit after each)

1. Scaffold, rules conversion, `PLAN.md`, `DESIGN_DECISIONS.md`.
2. Engine core: types, hex model, RNG, Quick Start map data, setup and role selection, alliance order, allocation, deployment.
3. Movement and combat, including retreats and ship rules.
4. Reconciliation, politics, the card deck and all card effects and reaction windows, end of game, scoring.
5. Bots and the simulation harness. Fix everything the simulations turn up before moving on.
6. UI: setup, board, all phase interfaces, privacy screens, log, end screen, save/load, all-bot spectate mode.
7. Full Game tile-placement setup.
8. Polish: `README.md` (how to install, run, and play; a short rules summary), `CLAUDE.md` (architecture, commands, conventions, and where rulings live, for future sessions), final pass on `DESIGN_DECISIONS.md`.

## 9. Definition of Done

- `npm install`, `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test` all succeed with no errors.
- All unit tests and the 200-game simulation pass.
- A human can set up a Quick Start game with a mix of humans and bots and play it to the final score screen entirely through the UI, and an all-bot game can be watched to completion.
- Full Game setup produces a legal map and plays through.
- Every interpretation you made beyond this prompt is listed in `DESIGN_DECISIONS.md` with the rule text it interprets.
- Work is committed to git with meaningful messages.

When you finish, print a short summary: what was built, how to run it, test results, and the most important entries in `DESIGN_DECISIONS.md`.
