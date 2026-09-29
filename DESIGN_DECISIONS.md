# Design decisions and rulings

The rules document (`docs/rules.md`) is the specification. The rulings below fill gaps and resolve ambiguities.
Rulings 1-40 come from `BUILD_PROMPT.md` section 4 and are binding. Everything after them is an interpretation made
during the build; each entry names the rule text it interprets.

## Rulings from the build prompt (binding)

### Alliances, factions, setup

1. Three alliances: White, Black, Green. Players are split as evenly as possible across alliances; each seat is one faction leader. Each alliance has a Purple (royal) faction, which is filled first and starts as that alliance's General. Other factions have distinct colors. With only one leader, that leader is permanently the General.
2. Role selection order is random. In order, each player picks an alliance and an available faction, keeping alliances balanced. Every player also enters a silly leader name used in the order announcement.
3. Each player starts with 2 food, 0 raw materials, 0 cards, and no pieces on the board.
4. Quick Start map is designed as data: roughly 60-90 hexes; a sea region with at least two islands; coastal and land regions; mountain edges; wheat and raw-material markers (fish inactive); three symmetric homelands each with 3 faction slots of 2 starting cities plus about 6 neutral cities; every faction slot gets at least one coastal city. Starting cities for unused faction slots are neutral.
5. Neutral cities have no defenders. A military unit that enters one takes it; the General assigns ownership to a member of the alliance.

### Turn order

6. Alliance order each turn: fewest total city points first (scoring values of ruling 38), ties broken Black, then White, then Green.
7. The General sets the in-alliance faction order once per turn after allocation is finalized; it is used for the whole turn. Interleave across alliances: A's 1st, B's 1st, C's 1st, A's 2nd, ... skipping players who have finished that placement type.

### Allocation and deployment

8. Productive capacity per city: L1 = 3, L2 = 5, L3 = 6, spent in full on farmers, soldiers and politicians (1 each). Every player also receives 1 politician card free each turn.
9. Raw-material costs: ship 1; city level improvement 7; Temple 3; University 3; Walls 2. Temple and University require an L3 city, max one of each per city. Walls at any level, max one per city. Raw materials and food carry over. Improvements are bought during allocation and placed during deployment; any that cannot legally be placed are lost (the allocation screen warns). Within one player's building placement, items are applied in the order the player chooses.
10. Deployment order: farmers, then buildings and improvements, then ships, then soldiers, then politician cards. Farmers are placed up to 3 per placement decision; every other type all at once.
11. Farmer placement: at most one farmer per tile. Illegal if the tile has another leader's farmer, another leader's city (even an ally's), or any unit of another alliance. Own city tiles and tiles guarded by allied soldiers are fine. The tile must be (a) within land-path distance 2 of a city the leader controls across non-mountain land edges, or (b) sea-adjacent to (or part of) a chain of tiles connected by sea edges, each holding at least one manned ship of the leader's alliance, the first tile being the leader's city or sea-adjacent to it. Unplaceable farmers are lost.
12. Farmers are removed from the board at the end of the turn, after collection.
13. Ships are placed on coastal (or island) city tiles the leader controls. Soldiers on any city tile the leader controls. Footnote 15's exception for ships is not implemented.

### Movement

14. Four sub-phases per turn: Ships 1, Ships 2, Full 1, Full 2. In each, Generals act in alliance order; each General issues all of that sub-phase's orders before the next General begins.
15. An order targets one source tile and splits some or all of its units among adjacent destinations. The General confirms with "I, {LEADER NAME}, ISSUE A FINAL ORDER. {units} TO {tile}, ...". Then a Rage of Achilles window opens, then all moves from that tile resolve, then all resulting combats, before any other tile may be ordered. Units that moved this sub-phase cannot move again until the next sub-phase. Units may stay put.
16. Each unit moves at most one tile per sub-phase. Soldiers move across land edges without mountains. Ships move only across sea edges, only into sea, island or coastal tiles, and only when manned.
17. Only soldiers are combat units and only soldiers eat. One ship carries exactly one soldier. A group crossing a sea edge must have every ship paired with a soldier and vice versa. In Ships 1 and 2 only manned ship pairs move. In Full 1 and 2 both land and ship moves are allowed.
18. A tile may only hold pieces of one alliance. Ships in a tile with no soldiers of their alliance are unmanned: they cannot move, the General may destroy them, and an unmanned ship on a pure sea tile is destroyed immediately. An enemy entering a tile holding only unmanned ships captures them and its General reflags them to a faction of their choice.
19. Moving into a tile holding only enemy farmers destroys them without combat. Moving into an enemy city tile with no enemy soldiers conquers it without combat. On any conquest from another alliance, the conquering General immediately assigns ownership to one member of their alliance. Ownership persists without occupation.

### Combat

20. Combat happens when units move into a tile holding enemy soldiers. The defender is the side already there. Ships add no dice; sea/coastal fights are not split into component battles.
21. Each side rolls 1d6 per non-spent soldier. Territorial score = dice total, plus for the defender +2 per soldier, +1 per defending soldier if the tile has a city, and another +1 per defending soldier if the city has Walls. Spent soldiers roll nothing and add no bonuses. The full calculation is logged.
22. Every 6 rolled is one hit. The owning side's General chooses which soldiers are removed; spent soldiers may be chosen. At sea a removed soldier's ship goes with it. In a coastal fight loose land soldiers may be taken before ship pairs. Excess hits are wasted.
23. Final control: higher score wins; ties go to the defender. Exceptions: both wiped out, defender keeps the tile; attacker scored higher but has no survivors, defender keeps; defender scored higher but has no non-spent survivors, spent defenders are destroyed and the attacker takes the tile. If a side is wiped out and its ships remain, the winner captures them.
24. A losing attacker returns all survivors to their origin tile, not spent (they count as moved). A losing defender retreats all survivors to adjacent empty or friendly tiles by legal land moves or by ship using available ships; their General chooses. Retreated units are spent until the end of the sub-phase. Survivors with no legal retreat are destroyed. Farmers in a lost tile are destroyed. A tile held only by spent units cannot defend; attacked, all are lost.

### Reconciliation

25. Collection: each surviving farmer yields 1 food if its tile has wheat and 1 raw material if its tile has any raw-material marker (at most 1). Fish is inactive. Collection does not depend on the ships that enabled placement.
26. Feeding: each soldier costs its owner 1 food. Players must feed units they can feed. If short, they choose which soldiers to disband one at a time, processed in alliance order then in-alliance order.

### Politics and cards

27. Deck from the Appendix: 20 Rage of Achilles (0), 3 Apple of Discord (0), 2 Attacked by Philosophers (0), 2 Trojan Horse (0), 40 A Citizen (1), 20 A Clever Man (2), 10 An Orator (3), 3 Lightning Bolt of Zeus (4) = 100 cards. Played cards go to a discard pile; reshuffled into the deck when it runs out.
28. Hands are hidden; hand sizes public. Each player privately moves cards to PLAY and must play at least one. PLAY cards are revealed at once. In each alliance the highest total value becomes General for the next turn. Tie: the incumbent wins if tied; otherwise the tied player earliest in the current in-alliance order.
29. Resolution after reveal: (1) Apple of Discord in alliance order; if invoked, all played cards stay discarded, every player draws 1, and the whole PLAY selection repeats. (2) Then special texts for this phase (Attacked by Philosophers) with Zeus reaction windows. (3) Then elect Generals.
30. Attacked by Philosophers: name an alliance partner (owning at least 2 cities) and one of their cities. Roll 1d6: even, the city transfers; odd, the card's player discards their whole remaining hand.
31. Lightning Bolt of Zeus: in PLAY it counts 4 and does nothing else. As a reaction from the hand immediately after a Philosophers or Trojan Horse is announced (before any roll or effect) it cancels that card; it is then discarded with no politics score.
32. Rage of Achilles (military reaction): after an order is announced, any other player whose own units were ordered from that source tile may play it to keep their own units there. Other moves still happen. In PLAY it is value 0.
33. Trojan Horse (military reaction): immediately after a combat between two alliances other than the card player's, if an attack on a city failed and the defending city's owner owns at least 2 cities. Effect: restore every soldier and ship removed in that combat on both sides; move the attackers into the city and the defenders to the attacker's origin tile (not spent). If the origin still holds units of the attacking alliance, the defenders instead retreat per ruling 24. The card player chooses which faction of the attacking alliance owns the city. Zeus may cancel it.
34. During the military phase a player may never play their last card.
35. Reaction windows in hotseat: by default only players who hold an eligible card and meet the conditions are prompted, each behind a privacy screen. A setup option "Always prompt every eligible player" prompts everyone who meets the conditions. Bots decide instantly.
36. The collusion-objection rule (footnote 31) is a tabletop rule and is not implemented; the privacy screens serve its purpose.

### End of game and scoring

37. At the end of each turn roll 1d6 and add it to a public running total. When the total reaches 35 or more the game ends.
38. Score per city: L1 = 3, L2 = 5, L3 = 6, plus 1 per Temple or University on an L3 city. Walls score nothing. Each current General gets +2.
39. Tiebreakers: holding a Generalship; then highest total value of cards in hand; then a Sing-Off modal where other players vote (bots abstain; if only bots remain to vote, pick randomly and say so). The final screen gently mocks the last-place leader.

### Full Game setup

40. Bounded play area (hex radius) and a tile bag as data. Each player gets a supply with at least 2 city tiles. In reverse role-selection order players draw a random tile from their own supply and place it (rotated) where every shared edge matches. If a tile can touch 3+ existing tiles it must; otherwise 2-sided before 1-sided. If no legal spot exists, draw the next tile; a tile with no legal spot ever is discarded. A player may claim a city tile they place, up to 2. One starting sea tile in the center. A player ending setup with no cities receives the nearest unclaimed city.

## Interpretations made during the build

Numbered from 41 onward. Each names the rule text it interprets.

### Setup and map

41. **Alliance sizes** ("evenly balancing the number of leaders in each alliance to the extent possible"): with N players each alliance gets floor(N/3) seats; the N mod 3 extra seats go to Black, then White, then Green (the same order as the alliance-order tiebreak). A player may only pick an alliance with an open seat, and must take Purple if it is still open in that alliance.
42. **Faction colours**: Purple is the royal faction in every alliance. The other six factions are Crimson and Azure (White alliance), Orange and Gold (Black alliance), Rose and Teal (Green alliance). Pieces are filled with the faction colour and outlined in the alliance colour.
43. **Quick Start map geometry** (ruling 4): a radius-5 hex board of 91 tiles built from one 30-tile homeland wedge rotated three times, so the homelands are exactly symmetric. The centre is a 19-tile sea with three one-tile islands (each a neutral city with wheat and fish). Ring 3 is the coastline; rings 4-5 are land. Mountains run along the two land borders between homelands, leaving a two-tile coastal pass between neighbouring homelands. Each homeland has Purple, second and third faction slots with one coastal and one inland city each, plus one neutral inland city.
44. **Edges between two coastal tiles** (Board section: "Coastal Tiles. Some edges are sea edges while other edges are land edges"): on the Quick Start map an edge shared by two coastal tiles is a land edge unless the map data says otherwise, so armies can walk along the coast and ships must go coast -> sea -> coast.
45. **Mountain edges** are stored on both tiles that share the edge; a land edge is impassable if either side carries the flag.
46. **Role selection by bots**: a bot picks the first open alliance in seat-balanced order and its first open faction (Purple first).

### Allocation and deployment

47. **Farmers must be placed when a legal tile exists** ("Any additional farmers which were allocated but cannot be legally placed are lost"): each farmer decision must place min(3, remaining farmers, legal tiles) farmers. A player cannot voluntarily discard a farmer that could be placed. If no legal tile exists the remaining farmers are lost automatically.
48. **Farmers on sea tiles**: a farmer may never be placed on open sea (a tile with no land edge and no city); island cities count as land for this purpose, so the ship chain rule lets farmers reach coastal tiles and islands.
49. **Manned ship** ("Ships may only move if manned"): for capture, chains and unmanned-ship loss, a ship is manned if its tile holds at least one soldier of the ship's alliance. For movement a ship needs its own soldier (one soldier per ship crossing a sea edge).
50. **Buildings that cannot be placed** are lost silently in the engine (the raw materials were spent at allocation); the UI warns before purchase. Building placement is one decision listing (kind, city) pairs in the order chosen; a pair that is illegal at its turn in the sequence is rejected as a whole action so the player can reorder.
51. **Players with no cities** have capacity 0, must allocate 0/0/0, still receive the free politician, and lose any ships they buy with saved raw materials because there is no legal placement.
52. **Deployment interleaving positions** (footnote 12): the k-th player of each alliance (in the General's order) forms round k. Rounds repeat until nobody has anything left of the current type. A player with nothing to place of that type is skipped.
53. **Politician draw when the deck and discard are both empty**: the player receives no card and this is logged. This cannot happen in practice with 100 cards.

### Movement and combat

54. **Attacking units stay on their origin tile until the combat is decided**; if they win they enter the destination, if they lose they simply remain (equivalent to "return to the tile from which they came"). This keeps the one-alliance-per-tile invariant true after every action.
55. **Ship removal with casualties** ("At sea, a hit destroys a ship and the unit manning it. In fights for coastal territories, the attacker and defender may choose to remove land armies before ship/army pairs"): loose soldiers (soldiers beyond the number of ships) are always removed first; once every remaining soldier has a ship, each further soldier casualty removes a ship too, preferring a ship of the same faction as the soldier. The option to remove a ship pair while loose soldiers remain is never advantageous and is not offered.
56. **Ships left behind by retreating defenders** are captured by the attacker who takes the tile, exactly as ships of a wiped-out side are (ruling 23).
57. **Retreat destinations** ("either unoccupied or friendly"): a tile is available if it holds no pieces at all or only pieces of the retreating alliance. A tile with an enemy farmer or enemy unmanned ships is not available. Ship retreats use one ship per soldier from the losing tile and cross a sea edge; land retreats cross a non-mountain land edge.
58. **Retreat decision**: the General must give a destination to every survivor that has at least one legal destination; survivors with none are destroyed. The choice of which soldier gets which ship is made by the engine (ships of the soldier's own faction first).
59. **Casualty choice is one decision per side per combat** listing the soldiers removed; when hits >= soldiers no decision is asked.
60. **Reaction prompt order**: Rage of Achilles windows are offered to eligible players in seat order; Trojan Horse and Zeus windows in alliance order then in-alliance order. The first Zeus played cancels the card and no further Zeus prompts are made.
61. **Trojan Horse eligibility** ("if a city attack has failed against a faction with at least two cities"): the destination tile has a city owned by a player of the defending alliance who owns at least 2 cities at the moment the combat ends, the defender kept the tile, and the card player is in neither alliance. Spent-only defenses that were annihilated are not "failed attacks".
62. **Trojan Horse swap** (ruling 33): restored casualties reappear with their original owners; the attacking units (survivors plus restored casualties, including their ships) are placed in the city marked as moved; the defending units (survivors plus restored) go to the attacker's origin tile unspent unless it still holds attacking-alliance pieces, in which case their General retreats them from the city per ruling 24. Defender farmers in the city are destroyed; the card player assigns the city to a faction of the attacking alliance; leftover ships follow their soldiers.
63. **Scuttling** ("Ships may be abandoned, at which point the general may leave them in place or destroy them"): during their movement decision a General may destroy any unmanned ships of their alliance as a separate action.
64. **Order announcement**: destinations in the banner are named by tile label (city name or coordinates).
65. **Soldiers entering a tile holding only friendly farmers** simply guard them; a farmer of an allied faction never blocks movement.

### Reconciliation and politics

66. **Farmers are removed right after collection**, which is the end of the turn for their purposes (ruling 12) and before politics.
67. **Politics PLAY is collected in seat order** behind privacy screens; nothing is revealed until every player has chosen. A player with an empty hand (possible only after losing a Philosophers roll and before their next draw) is skipped and plays nothing.
68. **Apple of Discord replay**: only the final, un-appled reveal resolves special texts and elections. Cards played in an appled round are discarded without effect. During the replay each player must again play at least one card; everyone drew one so everyone has one.
69. **Attacked by Philosophers with no eligible partner** (solo alliance, or every partner owns fewer than 2 cities): the card has no effect and is discarded. If any partner is eligible the card must be used.
70. **Zeus in the politics phase** may be played from the RETAIN hand even if it is the player's last card (ruling 34 covers the military phase only). Any player other than the Philosophers card's player may cancel; prompts go to the target first, then the rest in alliance order.
71. **Zeus cancelling Trojan Horse** during the military phase obeys ruling 34: a player holding only Zeus cannot play it.
72. **Election with no cards played** (every member skipped because of empty hands): the incumbent General stays.

### End of game and scoring

73. **Tiebreak by cards in hand** uses the total printed value of cards held after the final politics phase.
74. **Sing-Off votes** are collected one voter at a time from human players not among the tied; a majority (plurality, then earliest-tied player) wins. Bots abstain; if there is no human voter the engine picks at random and says so.
75. **Last place** is the lowest final score, with the same tiebreakers applied in reverse (the loser is the one who would lose every tiebreak); with a full tie the last seat in seat order is mocked.
76. **The end-of-game roll happens after the election** so a General elected on the final turn holds the office for scoring.

### Full Game

77. **Play area** is a hex of radius 6 (127 cells). The tile bag is dealt evenly; every supply contains at least 2 city tiles.
78. **Tile bag**: 90 tiles authored as data (sea, island-city, coastal with cities and resources, land with cities, resources and mountains).
79. **Placement legality**: every shared edge must match type (sea/sea or land/land); mountain flags need not match. Legal spots are ranked by the number of touching neighbours, and only spots with the maximal count (3+ counts as one class) are offered.
80. **Claiming** is part of the placement action (`claim: true`) and allowed only for a city tile and only while the player has fewer than 2 claimed cities.
81. **Unplayable tile**: if a drawn tile has no legal spot it is discarded and the player draws again immediately as part of the same turn; the turn passes only when a tile is placed or the supply is empty.
82. **No cities after setup**: the player receives the unclaimed city nearest (by hex distance) to the last tile they placed, or the first unclaimed city in tile order if they placed none. Still no city: the player starts with nothing and only politics.

### Added while building and testing

83. **Refusals and sea crossings** (footnote 18, "any combats resulting from the remaining movements go forward"): after Rage of Achilles removes some units from a group crossing a sea edge, the group is re-paired: only as many soldier-ship pairs as both counts allow still sail, preferring ships owned by the sailing soldiers; unpaired ships and soldiers stay behind and this is logged.
84. **Units ordered to stay** (footnote 20, "once a unit is ordered to stay in a tile, that unit may not subsequently be ordered someplace else"): an order disposes of every orderable unit on its source tile, so all of them, including refusers and those left behind, are marked as moved for the rest of the sub-phase.
85. **Scuttling only alongside orders**: unmanned ships can be destroyed by their General as a side action of any movement decision; a General with nothing to move is not prompted merely to scuttle.
86. **Bot randomness** ("use the game's seeded RNG for any randomness so bot games are reproducible"): bots seed a private mulberry32 from the game RNG's current state, the action count and the player id. They never advance the game RNG, so replaying an action log reproduces the same game and the same bot choices.
87. **Defender ships in the Trojan Horse swap** (ruling 33): restored and surviving defender ships accompany the defenders to the attacker's origin tile only if that tile has a sea edge; otherwise they stay in the city and are captured by the attacking alliance like any unmanned ships.
88. **Captured ships change hands immediately** (ruling 18): ships found unmanned pass to the capturing General the moment their tile is entered, then the General chooses the faction that will fly its flag. This keeps "a tile may only hold pieces of one alliance" true after every action.
89. **Spent-only defenders and the Trojan Horse**: a tile lost because every defender was spent (ruling 24) is not a "failed attack", so the Trojan Horse window never opens for it.
90. **Politics reveal and privacy in the UI**: the public reveal of the PLAY envelopes is shown before any "Pass the device" screen for the next private decision, and closes by itself when no human has to act.

### Online play

91. **What a remote player may see** (ruling 28, "Hands are hidden; hand sizes are public"): the server sends each player a view holding their own cards, every hand size, the whole board and log, and the pending decision only when it is theirs. The deck order, the seed and RNG, the action log and the task queue are withheld because any of them would let a client reconstruct hidden cards. Unrevealed PLAY envelopes show only their card counts.
92. **Reaction windows online** (ruling 35): the "who is being asked" information is withheld from other players (the waiting indicator says only that a reaction is being weighed), so prompting only card holders no longer leaks who holds a card; the "always prompt" option remains available at the table for players who want to hide even the timing.
93. **Absent players**: any leader may hand their seat to a bot and take it back later; the host may do so for anyone. The change is recorded in the table's log so a rebuilt table replays identically. Seats nobody claims before the game starts are bots for the whole game. If every seat ends up delegated, the bots simply finish the game.
94. **Authority and persistence**: the server is the only rules engine online; clients send actions and receive views. A table persists as its configuration, seed and the ordered list of actions (including the bots' actions) and is rebuilt by replay, which the replay test guarantees is exact.

### The Table of 2026 (map reconstructed from photographs)

95. **Source and method** (ruling 4, "the rules reference a preset map but do not include it"): the second preset map, `table2026`, is the hand-painted board photographed after the last live game (Drive folder "Akinlandia", IMG_4927 to IMG_4974). A flat-top hex lattice was fitted as a homography to photo IMG_4958 (anchored on a measured column of tile seams and refined by outline correlation), every lattice cell was warped to a normalised square, and each tile was read from those crops and the close-ups. Tiles whose crop was mostly table rather than board were dropped, leaving 93 tiles.
96. **Reading rules**: an edge is sea when water is painted across it on either side (each tile lists its own sea edges and the builder unions the two lists), so coastlines lean to sea and every shared edge agrees. Yellow rectangles are wheat, orange trees are wood, pale rock patches are stone, blue fish shapes are fish (inactive), black dots are cities, and orange zig-zag ridges along a seam are mountains on that edge. No iron marker could be distinguished in the photographs, so none is placed. Small features that were ambiguous at 640x480 were omitted rather than guessed.
97. **Faction slots on the photographed board**: the meeples in the photos are not legible, so the eighteen starting cities were assigned by geography: White in the west (Selymbria and Pessinus; Byzantion and Marmara; Gordion and Tavium), Black in the south-east (Heraclea and Ancyra; Amastris and Sinope; Chalcedon and Nicomedia), Green in the north-east archipelago (Dascylium and Nicaea; Cyzicus and Parium; Abydos and Sestos). Two White slots (Gordion/Tavium) have no coastal city, unlike the designed map; the other thirteen cities are neutral. City names are invented in the Anatolian style since the board carries none.

### House rules (requested after the first games, 2026-09-28)

98. **Wheat yields 2 food** (replaces ruling 25's "1 food if its tile has wheat"): each surviving farmer on a wheat tile collects 2 food. Raw materials are unchanged at 1 per farmer.
99. **Raising an army costs 1 food and 1 raw material** in addition to its unit of productive capacity (ruling 8 still requires capacity to be spent in full). Both are paid when the allocation sheet is sealed and are lost if the soldier cannot be placed, like any other purchase. The sheet refuses an allocation the player cannot afford.
100. **Maintenance is 1 food per existing army** (ruling 26 unchanged), and a soldier is not fed in the turn it is raised, since its food was paid at allocation. From the following turn it eats like any other. Restored Trojan Horse casualties and captured units count as existing.
101. **Every city can make a living** (map design rule requested 2026-09-28): on both preset maps every city can reach at least two wheat tiles and one raw-material tile, counting tiles within land distance 2 without mountains plus tiles one ship away across a sea edge (a coastal city with a single ship reaches them under ruling 11b). On the photographed board this added nine markers that the photos did not show; on the designed map the coastal tile beside each island city gained a wood marker. `tests/mapResources.test.ts` enforces the rule.
102. **No holes in the photographed board**: eight positions inside or on the rim of the board had no tile because the fitted lattice cell fell mostly on the table (1,1; 2,1; 2,-3; 4,-3; 6,-2; 7,-3; 9,0; -2,2). They are filled as open-sea tiles, which matches the water visible around them in the photos; the position under the sticky note at (11,-5) stays empty because it is outside the board.
103. **Island cities are joined to the mainland** (requested 2026-09-28 after Marmara could field only one farmer on turn one): on the photographed board every city that sat on an all-sea tile (Marmara, Lemnos, Tenos, Andros and the effectively isolated Tenedos), plus the wheat islet at (2,-1), now has land edges toward each neighbouring tile that carries land or a city, and those neighbours reciprocate. Each former island is therefore a coastal tile from which farmers reach the adjacent shore by land. The designed map's three islands are neutral cities reached by ship and are left as islands.
105. **More retreating soldiers than ships** (ruling 24, "Survivors with no legal retreat are destroyed"; found by the fairness simulation on the Table of 2026): when a defeated defender's only escapes are by sea and there are more survivors than ships, the General chooses which soldiers take the ships; every ship must be used, and the soldiers left over have no legal retreat and are destroyed. Soldiers with a land escape must still be given one.
104. **Equitable starting slots on the Table of 2026** (supersedes decision 97's slot assignment; requested 2026-09-28 after a player deploying second could place no farmers). The earlier slots put Black's factions next to each other with no fields of their own, and in 300 all-bot games White won 88% of the time and Black 2%. The board itself was uneven: resources were spread evenly over three regions, but the north-east archipelago held 14 cities on 25 land tiles while the west held 7 on 32, leaving the west almost nothing to expand into. The fix, kept deliberately light:
    - three crowded archipelago cities (Priapus, Zeleia, Sestos, each touching two others) became open tiles, and three new cities were founded on open western land (Aenus, Rhaedestus, Doriscus), giving the homelands 12, 10 and 10 cities with similar land and fields;
    - one alliance per homeland: White in the west, Black in the centre and south-east, Green in the archipelago; Black's third faction starts at Tavium and Andros on White's border so the four neutral cities behind the western mountains are contested (left uncontested, White's Azure faction won 60% of bot games);
    - slot rules, enforced by `tests/startingSlots.test.ts`: a faction's two cities at most 4 apart with at least one on the coast, no starting city adjacent to another faction's, and at least two wheat tiles and one raw-material tile that no other faction's farmers can reach, so deployment order can never starve anyone;
    - four markers were added where a faction or city was one short (wood on the old Priapus tile, on (7,-1) and on Rhaedestus; wheat on Tenedos);
    - within each alliance the royal Purple faction, which starts as General, takes the pair with the least land.
    Result over 200 all-bot 9-player games: alliance wins White 25.5%, Black 64.5%, Green 10% (from 88%, 2% and 11%); per-faction win rates 1.5% to 40.5% (from 0% to 70%). Not yet even: with these bots the side with uncontested neutral cities to take wins, and the land-poor archipelago trails; the next lever is the map itself (neutral cities per homeland), not the slots.
    `scripts/regions.ts` proposes homelands and slots, `scripts/slotcheck.ts` explains a layout, and `scripts/fairness.ts` measures win rates by faction over bot games.
