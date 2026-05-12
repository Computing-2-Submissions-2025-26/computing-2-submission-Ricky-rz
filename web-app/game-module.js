/* constants */
const GRID_SIZE = 9;             // 9×9 board so a 5×5 kingdom fits anywhere around the central castle
const KINGDOM_SIZE = 5;          // Max bounding box of placed dominoes
const CASTLE_ROW = 4;            // Centre of the 9×9
const CASTLE_COL = 4;
const DRAFT_SIZE = 2;            // Dominoes drawn per round (2 players × 1 king)
const DECK_SIZE = 24;            // 2-player half-deck
const NUM_ROUNDS = DECK_SIZE / DRAFT_SIZE; // 12

/**
 * @namespace KingdominoGame
 */

/**
 * @typedef {"empty" | "castle" | "wheat" | "forest" | "water" | "grass" | "swamp" | "mine"} Terrain
 */

/**
 * @typedef {object} Cell
 * @property {Terrain} terrain
 * @property {number} crowns
 */

/**
 * @typedef {Cell[][]} Grid
 * A 9×9 array of cells. Castle starts at [CASTLE_ROW][CASTLE_COL].
 */

/**
 * @typedef {object} Domino
 * @property {number} id      - Unique identifier
 * @property {number} number  - Sort order number (used to determine claim order)
 * @property {Cell} left      - The left half-tile
 * @property {Cell} right     - The right half-tile
 */

/**
 * @typedef {object} DraftSlot
 * @property {Domino} domino
 * @property {?number} claimedBy  - Player id who claimed it, or null
 */

/**
 * @typedef {object} Player
 * @property {number} id
 * @property {Grid} grid
 * @property {?Domino} claimedDomino  - The domino they hold, ready to place
 */

/**
 * @typedef {object} Placement
 * @property {number} row              - Row of the FIRST half
 * @property {number} col              - Column of the FIRST half
 * @property {"horizontal" | "vertical"} orientation
 * @property {boolean} flipped         - If true, the "right" half is placed first
 */

/**
 * @typedef {"first-claim" | "place-and-claim" | "final-place" | "game-over"} Phase
 * - first-claim: round 1, players only claim (no domino held yet)
 * - place-and-claim: rounds 2..N, each player places then claims
 * - final-place: deck empty, each player places their last held domino
 * - game-over: nothing to do
 */

/**
 * @typedef {object} GameState
 * @property {Player[]} players
 * @property {DraftSlot[]} currentDraft  - Sorted by domino.number; players place from these
 * @property {DraftSlot[]} nextDraft     - Sorted by domino.number; players claim from these
 * @property {Domino[]} deck             - Remaining shuffled dominoes
 * @property {number} activePlayer       - Index into players[]
 * @property {Phase} phase
 * @property {number} round
 */

