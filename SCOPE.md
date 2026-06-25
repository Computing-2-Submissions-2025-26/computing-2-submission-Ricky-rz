# Kingdomino – Project Scope

## Game Choice

**Kingdomino** — a 2-player domino-tile placement game where each player builds a 5×5 kingdom
around a central castle. Each round, players claim one domino from a shared draft and place it
on their board （the person collecting the lower id domino will pick first the next round）. At 
the end of 12 rounds, players score by multiplying the size of each connected
terrain region by the number of crowns it contains.

---

## Game Module (`web-app/Module.js`)

A pure-function engine with no side effects. Every exported function takes state as input and
returns a new state object; no inputs are mutated.

### Exported API

| Function    | Signature         | Description|
|---          |---                |---          |
| `scoreGrid` | `(grid) → number` | Flood-fill scoring: Σ(region size × crowns) |
| `isValidPlacement` | `(grid, domino, row, col, orientation) → boolean` | Checks bounds, occupancy, adjacency, and 5×5 constraint |
| `findLegalPlacements` | `(grid, domino, orientation?) → Placement[]` | Returns every legal position for a domino |
| `getNextDraft` | `(deck) → { slots, remain }` | Draws 2 tiles, sorts by number, wraps in DraftSlots |
| `createInitialState` | `() → GameState` | Shuffles the 48-tile deck, picks 24, draws first draft |
| `claimDomino` | `(state, playerId, slotIndex) → GameState` | First player claims a slot; opponent is auto-assigned the other |
| `placeDomino` | `(state, playerId, placement\|null) → GameState` | Places or discards a held domino; throws on invalid placement |
| `advanceRound` | `(state) → GameState` | Draws next draft, increments round, handles final-place and game-over transitions |

### Deck

Uses the official full 48-tile deck. Each game randomly selects 24 tiles to play with,
giving varied games while keeping the 2-player duration appropriate.

### Functional Patterns Used

- `Array.map`, `Array.filter`, `Array.find`, `Array.every`, `Array.reduce`, `Array.slice`,
  `Array.sort` throughout the module
- `Object.freeze` on the deck constant
- Fisher-Yates shuffle via recursion-style iteration
- Flood-fill via an explicit stack (iterative DFS)

---

## Unit Tests (`web-app/tests/game-module.test.js`)

34 Mocha tests using Node's built-in `assert` module, covering all 8 exported functions.

| Suite | Tests |
|---|---|
| `scoreGrid` | 5 — empty grid, no crowns, single tile, connected region, two separate regions |
| `isValidPlacement` | 5 — valid placement, out of bounds, overlap, no adjacency, exceeds 5×5 |
| `findLegalPlacements` | 3 — fresh grid, no legal moves, orientation filter |
| `getNextDraft` | 4 — draws 2, correct remainder, sorted ascending, claimedBy null |
| `createInitialState` | 5 — phase, round, castles, draft size, deck size |
| `claimDomino` | 4 — domino assignment, auto-assign opponent, phase transition, firstClaimer |
| `placeDomino` | 5 — hasPlaced flag, clears claimedDomino, grid terrain, null discard, throws on invalid |
| `advanceRound` | 3 — round increment, final-place transition, game-over transition |

Run with: `npx mocha web-app/tests/game-module.test.js`

---

## Web Application (`web-app/`)

A single-page app using vanilla JS ES modules. All game logic is imported from `Module.js`;
`main.js` handles only DOM rendering and event wiring.

### Screens

1. **Instructions** — rules overview with terrain colour key and "Let's Play" button
2. **Setup** — player name entry, 2-player or vs Computer mode toggle
3. **Game** — two-column focus layout described below
4. **Game Over** — side-by-side final grids, score breakdown, winner announcement

### Game Layout

- **Left column** — inactive player's small (26 px cell) grid + live score table
- **Right column** — active player's grid (54 px cells when placing, 42 px when claiming)
  with a thin side panel containing:
  - *Claim phase*: clickable draft slots tinted in the claiming player's colour
  - *Placing phase*: both players' held dominos in their colour (empty once placed),
    current orientation arrow, Left/Right click instructions, Discard button
- Score table below the active player's grid

### Player Identity

- Player 1 = red (`#e05555`), Player 2 = blue (`#5588e0`)
- Each player's castle cell, grid border, draft slot, and held-domino panel all use
  their colour, allowing players to distinguish their board at a glance

### Round Tracker

12 dots across the top of the game screen show completed (grey), current (gold),
and future (outline) rounds.

### Auto-discard

If a player has no legal placements for their held domino (grid full), the tile is
automatically discarded and the round advances without requiring input.

---

## Known Limitations

- **No AI opponent** — the "vs Computer" mode accepts a name but the computer player
  does not take automated turns; it functions as a hot-seat second player.
- **No undo** — placements are final once confirmed.
- **Single browser tab only** — state is module-level; multiple tabs share no state.

---

## Submission Checklist

- [x] `web-app/Module.js` — pure game logic, fully JSDoc-documented
- [x] `web-app/tests/game-module.test.js` — 34 passing Mocha tests
- [x] `web-app/main.js` — DOM layer, no game logic
- [x] `web-app/index.html` — entry point, opens directly in Firefox Developer Edition
- [x] `web-app/default.css` — all styles
- [x] `package.json` — mocha dev dependency, `type: "module"`
- [x] `.gitignore` — excludes `node_modules`
