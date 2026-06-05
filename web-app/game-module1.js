/**
 * @file game-module.js
 * Pure-function Kingdomino engine for 2 players.
 * All exported functions return new state objects and never mutate their inputs.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_SIZE    = 9;  // 9×9 board so a 5×5 kingdom fits anywhere around the castle
const KINGDOM_SIZE = 5;  // Maximum bounding-box dimension for a legal kingdom
const CASTLE_ROW   = 4;  // Centre cell row index
const CASTLE_COL   = 4;  // Centre cell column index
const DRAFT_SIZE   = 2;  // Dominoes drawn per round (one per king in a 2-player game)
const DECK_SIZE    = 24; // 2-player half-deck (tiles 1–24)

// ─── JSDoc type definitions ───────────────────────────────────────────────────

/**
 * @namespace KingdominoGame
 */

/**
 * @typedef {"empty"|"castle"|"wheat"|"forest"|"water"|"grass"|"swamp"|"mine"} Terrain
 */

/**
 * @typedef {object} Cell
 * @property {Terrain} terrain - Terrain type of this cell
 * @property {number}  crowns  - Number of crowns on this cell (0–3)
 */

/**
 * @typedef {Cell[][]} Grid
 * A 9×9 row-major array of {@link Cell} objects.
 * The castle occupies `grid[CASTLE_ROW][CASTLE_COL]`.
 */

/**
 * @typedef {object} Domino
 * @property {number} id     - Unique identifier (1–24)
 * @property {number} number - Sort key; lower number = earlier turn priority
 * @property {Cell}   left   - First half-tile
 * @property {Cell}   right  - Second half-tile
 */

/**
 * @typedef {object} DraftSlot
 * @property {Domino}      domino     - The domino on offer
 * @property {number|null} claimedBy  - Index into `players[]`, or `null` if unclaimed
 */

/**
 * @typedef {object} Player
 * @property {number}      id            - Index into `players[]` (0 or 1)
 * @property {Grid}        grid          - This player's 9×9 kingdom
 * @property {Domino|null} claimedDomino - Held domino waiting to be placed, or `null`
 */

/**
 * @typedef {object} Placement
 * @property {number}                   row         - Row of the **first** half-tile
 * @property {number}                   col         - Column of the **first** half-tile
 * @property {"horizontal"|"vertical"}  orientation - Direction of the second half
 * @property {boolean}                  flipped     - When `true`, the right half is placed first
 */

/**
 * @typedef {"first-claim"|"place-and-claim"|"final-place"|"game-over"} Phase
 *
 * Phase transition diagram:
 * ```
 * first-claim
 *   └─ (all claims done) → place-and-claim
 *                              └─ (deck exhausted after last claim) → final-place
 *                                                                         └─ (all placed) → game-over
 * ```
 *
 * - **first-claim**     Round 1: both players claim from `nextDraft`; no domino held yet.
 * - **place-and-claim** Rounds 2–N: active player places their held domino, then claims
 *                       from `nextDraft`; repeat per player.
 * - **final-place**     Deck exhausted: each player places their last held domino (no claim).
 * - **game-over**       All dominoes placed; call {@link scoreGrid} for final scores.
 */

/**
 * @typedef {object} GameState
 * @property {Player[]}    players       - Two-element array indexed by player id
 * @property {DraftSlot[]} currentDraft  - Sorted ascending by `domino.number`; players place from these
 * @property {DraftSlot[]} nextDraft     - Sorted ascending by `domino.number`; players claim from these
 * @property {Domino[]}    deck          - Remaining shuffled dominoes not yet drawn
 * @property {number}      activePlayer  - Index into `players[]` whose turn it is
 * @property {Phase}       phase         - Current phase of the game
 * @property {number}      round         - 1-based round counter (1–12)
 */

// ─── Domino deck data (official 2-player tile set) ────────────────────────────

/** @type {Readonly<Domino[]>} */
const ALL_DOMINOES = Object.freeze([
    { id: 1,  number: 1,  left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 2,  number: 2,  left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 3,  number: 3,  left: { terrain: "forest", crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 4,  number: 4,  left: { terrain: "forest", crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 5,  number: 5,  left: { terrain: "forest", crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 6,  number: 6,  left: { terrain: "water",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 7,  number: 7,  left: { terrain: "water",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 8,  number: 8,  left: { terrain: "water",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 9,  number: 9,  left: { terrain: "grass",  crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 10, number: 10, left: { terrain: "grass",  crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 11, number: 11, left: { terrain: "swamp",  crowns: 0 }, right: { terrain: "swamp",  crowns: 0 } },
    { id: 12, number: 12, left: { terrain: "mine",   crowns: 0 }, right: { terrain: "mine",   crowns: 0 } },
    { id: 13, number: 13, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 14, number: 14, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 15, number: 15, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 16, number: 16, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "swamp",  crowns: 0 } },
    { id: 17, number: 17, left: { terrain: "forest", crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 18, number: 18, left: { terrain: "forest", crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 19, number: 19, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "forest", crowns: 0 } },
    { id: 20, number: 20, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "water",  crowns: 0 } },
    { id: 21, number: 21, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 22, number: 22, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "swamp",  crowns: 0 } },
    { id: 23, number: 23, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "mine",   crowns: 0 } },
    { id: 24, number: 24, left: { terrain: "forest", crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
]);

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle; will iterate backwards through the input array 
 * And swap it with a random element
 * @template T
 * @param {T[]} arr
 * @returns {T[]} A new array with the same elements as `arr` but in random order
 */
function shuffle(arr){
    const a = [...arr];
    for(let i = a.length - 1; i > 0; i--){
        const j = Math.floor(Math.random()*(i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Create a 9x9 grid with the castle in the centre and all of the other cells empty.
 * @typedef {cell[][]} Grid
 * A 9×9 row-major array of cells
 */
function makeGrid() {
    const grid =Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => ({ terrain: "empty", crowns: 0 }))
    );
    grid[CASTLE_ROW][CASTLE_COL] = { terrain: "castle", crowns: 0 };
    return grid;
}

/**
 * Place a domino on the grid, returning a new grid object with the domino's cells added.
 * @param {Grid} grid - The grid to place on
 * @param {Domino} domino - The domino to place
 * @param {Placement} placement - Where and how to place the domino
 * @returns {Grid} A new grid with the domino placed
 */
function placeDomino(row, col, orientation, flipped, grid, domino) {
    for (const [half, cell] of [["left", domino.left], ["right", domino.right]]) {
        const r = row + (orientation === "vertical" && half === "right" ? 1 : 0);
        const c = col + (orientation === "horizontal" && half === "right" ? 1 : 0);
        
    }
    }
}