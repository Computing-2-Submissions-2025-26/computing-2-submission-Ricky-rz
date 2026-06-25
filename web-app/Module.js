/**
 * @file Module.js
 * Pure-function Kingdomino engine for 2 players.
 * All exported functions return new state objects;
 * no inputs are mutated.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID_SIZE    = 9;   // 9×9 board; a 5×5 kingdom fits anywhere
const KINGDOM_SIZE = 5;   // Maximum bounding-box dimension
const CASTLE_ROW   = 4;   // Centre cell row index
const CASTLE_COL   = 4;   // Centre cell column index
const DRAFT_SIZE   = 2;   // Dominoes drawn per round
const DECK_SIZE    = 48;  // Full deck; each game randomly picks 24

// ─── JSDoc type definitions ──────────────────────────────────────────────────

/**
 * @namespace KingdominoGame
 */

/**
 * @typedef {"empty"|"castle"|"wheat"|"forest"|
 *           "water"|"grass"|"swamp"|"mine"} Terrain
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
 * @property {number} id     - Unique identifier (1–48)
 * @property {number} number - Sort key; lower = earlier pick next round
 * @property {Cell}   left   - First half-tile
 * @property {Cell}   right  - Second half-tile
 */

/**
 * @typedef {object} DraftSlot
 * @property {Domino}      domino    - The domino on offer
 * @property {number|null} claimedBy - Player id of claimer, or null
 */

/**
 * @typedef {object} Player
 * @property {number}      id            - 0 or 1
 * @property {Grid}        grid          - This player's 9×9 kingdom
 * @property {Domino|null} claimedDomino - Held domino, or null
 * @property {boolean}     hasPlaced     - True once placed this round
 */

/**
 * @typedef {object} Placement
 * @property {number} row         - Row of the first half-tile
 * @property {number} col         - Column of the first half-tile
 * @property {number} orientation - 0=right, 1=down, 2=left, 3=up
 */

/**
 * @typedef {"first-claim"|"placing"|"final-place"|"game-over"} Phase
 *
 * Phase transitions:
 * ```
 * first-claim
 *   └─ (both claimed) → placing
 *       ├─ (deck empty after both place) → final-place
 *       │       └─ (both placed) → game-over
 *       └─ (deck has tiles) → placing (next round)
 * ```
 *
 * - **first-claim** Round 1; both claim from nextDraft.
 * - **placing**     Each player places their held domino.
 * - **final-place** Deck exhausted; place last domino, no claim.
 * - **game-over**   All placed; call {@link scoreGrid} for scores.
 */

/**
 * @typedef {object} GameState
 * @property {Player[]}    players      - Two-element array; index = id
 * @property {DraftSlot[]} currentDraft - Ascending by domino.number
 * @property {DraftSlot[]} nextDraft    - Ascending by domino.number
 * @property {Domino[]}    deck         - Remaining undrawn dominoes
 * @property {Phase}       phase        - Current phase of the game
 * @property {number}      round        - 1-based counter (1–12)
 * @property {number}      firstClaimer - playerId who picks first
 */

// ─── Domino deck data (official full 48-tile set) ───────────────────────────

/** @type {Readonly<Domino[]>} */
const ALL_DOMINOES = Object.freeze([
    // 1–12: double-terrain, no crowns
    {id: 1,  number: 1,  left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 2,  number: 2,  left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 3,  number: 3,  left: {terrain: "forest", crowns: 0},
        right: {terrain: "forest", crowns: 0}},
    {id: 4,  number: 4,  left: {terrain: "forest", crowns: 0},
        right: {terrain: "forest", crowns: 0}},
    {id: 5,  number: 5,  left: {terrain: "forest", crowns: 0},
        right: {terrain: "forest", crowns: 0}},
    {id: 6,  number: 6,  left: {terrain: "forest", crowns: 0},
        right: {terrain: "forest", crowns: 0}},
    {id: 7,  number: 7,  left: {terrain: "water",  crowns: 0},
        right: {terrain: "water",  crowns: 0}},
    {id: 8,  number: 8,  left: {terrain: "water",  crowns: 0},
        right: {terrain: "water",  crowns: 0}},
    {id: 9,  number: 9,  left: {terrain: "water",  crowns: 0},
        right: {terrain: "water",  crowns: 0}},
    {id: 10, number: 10, left: {terrain: "grass",  crowns: 0},
        right: {terrain: "grass",  crowns: 0}},
    {id: 11, number: 11, left: {terrain: "grass",  crowns: 0},
        right: {terrain: "grass",  crowns: 0}},
    {id: 12, number: 12, left: {terrain: "swamp",  crowns: 0},
        right: {terrain: "swamp",  crowns: 0}},
    // 13–18: mixed terrain, no crowns
    {id: 13, number: 13, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "forest", crowns: 0}},
    {id: 14, number: 14, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "water",  crowns: 0}},
    {id: 15, number: 15, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "grass",  crowns: 0}},
    {id: 16, number: 16, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "swamp",  crowns: 0}},
    {id: 17, number: 17, left: {terrain: "forest", crowns: 0},
        right: {terrain: "water",  crowns: 0}},
    {id: 18, number: 18, left: {terrain: "forest", crowns: 0},
        right: {terrain: "grass",  crowns: 0}},
    // 19–23: wheat crowned (1 crown each)
    {id: 19, number: 19, left: {terrain: "wheat",  crowns: 1},
        right: {terrain: "forest", crowns: 0}},
    {id: 20, number: 20, left: {terrain: "wheat",  crowns: 1},
        right: {terrain: "water",  crowns: 0}},
    {id: 21, number: 21, left: {terrain: "wheat",  crowns: 1},
        right: {terrain: "grass",  crowns: 0}},
    {id: 22, number: 22, left: {terrain: "wheat",  crowns: 1},
        right: {terrain: "swamp",  crowns: 0}},
    {id: 23, number: 23, left: {terrain: "wheat",  crowns: 1},
        right: {terrain: "mine",   crowns: 0}},
    // 24–29: forest crowned (1 crown each)
    {id: 24, number: 24, left: {terrain: "forest", crowns: 1},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 25, number: 25, left: {terrain: "forest", crowns: 1},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 26, number: 26, left: {terrain: "forest", crowns: 1},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 27, number: 27, left: {terrain: "forest", crowns: 1},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 28, number: 28, left: {terrain: "forest", crowns: 1},
        right: {terrain: "water",  crowns: 0}},
    {id: 29, number: 29, left: {terrain: "forest", crowns: 1},
        right: {terrain: "grass",  crowns: 0}},
    // 30–35: water crowned (1 crown each)
    {id: 30, number: 30, left: {terrain: "water",  crowns: 1},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 31, number: 31, left: {terrain: "water",  crowns: 1},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 32, number: 32, left: {terrain: "water",  crowns: 1},
        right: {terrain: "forest", crowns: 0}},
    {id: 33, number: 33, left: {terrain: "water",  crowns: 1},
        right: {terrain: "forest", crowns: 0}},
    {id: 34, number: 34, left: {terrain: "water",  crowns: 1},
        right: {terrain: "forest", crowns: 0}},
    {id: 35, number: 35, left: {terrain: "water",  crowns: 1},
        right: {terrain: "forest", crowns: 0}},
    // 36–39: grass/swamp crowned (1 crown, on right)
    {id: 36, number: 36, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "grass",  crowns: 1}},
    {id: 37, number: 37, left: {terrain: "water",  crowns: 0},
        right: {terrain: "grass",  crowns: 1}},
    {id: 38, number: 38, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "swamp",  crowns: 1}},
    {id: 39, number: 39, left: {terrain: "grass",  crowns: 0},
        right: {terrain: "swamp",  crowns: 1}},
    // 40: mine (1 crown)
    {id: 40, number: 40, left: {terrain: "mine",   crowns: 1},
        right: {terrain: "wheat",  crowns: 0}},
    // 41–42: grass crowned (2 crowns, on right)
    {id: 41, number: 41, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "grass",  crowns: 2}},
    {id: 42, number: 42, left: {terrain: "water",  crowns: 0},
        right: {terrain: "grass",  crowns: 2}},
    // 43–44: swamp crowned (2 crowns, on right)
    {id: 43, number: 43, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "swamp",  crowns: 2}},
    {id: 44, number: 44, left: {terrain: "grass",  crowns: 0},
        right: {terrain: "swamp",  crowns: 2}},
    // 45–48: mine crowned (2–3 crowns)
    {id: 45, number: 45, left: {terrain: "mine",   crowns: 2},
        right: {terrain: "wheat",  crowns: 0}},
    {id: 46, number: 46, left: {terrain: "swamp",  crowns: 0},
        right: {terrain: "mine",   crowns: 2}},
    {id: 47, number: 47, left: {terrain: "swamp",  crowns: 0},
        right: {terrain: "mine",   crowns: 2}},
    {id: 48, number: 48, left: {terrain: "wheat",  crowns: 0},
        right: {terrain: "mine",   crowns: 3}}
]);

// ─── Private helpers ─────────────────────────────────────────────────────────

/**
 * Fisher-Yates shuffle; iterates backwards through the array
 * and swaps each element with a random earlier element.
 * @template T
 * @param {T[]} arr
 * @returns {T[]} New array with same elements in random order
 */
function shuffle(arr) {
    const a = [...arr];
    let i = a.length - 1;
    let j;
    while (i > 0) {
        j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
        i -= 1;
    }
    return a;
}

/**
 * Creates a 9×9 grid with the castle at the centre.
 * @returns {Grid}
 */
function makeGrid() {
    const grid = Array.from({length: GRID_SIZE}, function () {
        return Array.from({length: GRID_SIZE}, function () {
            return {terrain: "empty", crowns: 0};
        });
    });
    grid[CASTLE_ROW][CASTLE_COL] = {terrain: "castle", crowns: 0};
    return grid;
}

/**
 * Returns the two cells a domino occupies given position and orientation.
 * First entry is the left half, second is the right half.
 * @param {Domino} domino
 * @param {number} row         - Row of the first (left) half-tile
 * @param {number} col         - Column of the first (left) half-tile
 * @param {number} orientation - 0=right, 1=down, 2=left, 3=up
 * @returns {Array.<{row: number, col: number, half: Cell}>}
 */
function getPlacedCells(domino, row, col, orientation) {
    let r;
    let c;
    if (orientation === 0) { r = row;       c = col + 1; }
    if (orientation === 1) { r = row + 1;   c = col;     }
    if (orientation === 2) { r = row;       c = col - 1; }
    if (orientation === 3) { r = row - 1;   c = col;     }
    return [
        {row, col, half: domino.left},
        {row: r, col: c, half: domino.right}
    ];
}

/**
 * Checks if both cells are within the 9×9 grid.
* @param {Array.<{row: number, col: number}>} cells
* @returns {boolean}
*/
function cellsInBounds(cells) {
    return cells.every(function ({row, col}) {
        return row >= 0 && row < GRID_SIZE &&
            col >= 0 && col < GRID_SIZE;
    });
}

/**
 * Checks if all cells are empty.
 * @param {Grid} grid
 * @param {Array.<{row: number, col: number}>} cells
 * @returns {boolean}
 */
function cellsAreEmpty(grid, cells) {
    return cells.every(function ({row, col}) {
        return grid[row][col].terrain === "empty";
    });
}

/**
 * Checks if at least one half-tile is adjacent to the castle or
 * to an existing cell of matching terrain.
* The other half of the same domino is excluded from adjacency checks.
* @param {Grid} grid
* @param {Array.<{row: number, col: number, half: Cell}>} cells
* @returns {boolean}
*/
function touchesMatchingTerrain(grid, cells) {
    return cells.some(function ({row, col, half}) {
        const neighbours = [
            {row: row - 1, col},
            {row: row + 1, col},
            {row, col: col - 1},
            {row, col: col + 1}
        ];
        return neighbours.some(function ({row: r, col: c}) {
            if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) {
                return false;
            }
            if (cells.some(function (cell) {
                return cell.row === r && cell.col === c;
            })) {
                return false;
            }
            const t = grid[r][c].terrain;
            return t === "castle" || t === half.terrain;
        });
    });
}

/**
 * Checks if all occupied cells fit within a 5×5 bounding box.
   * @param {Grid} grid
   * @param {Array.<{row: number, col: number}>} cells
   * @returns {boolean}
   */
function fitsInKingdom(grid, cells) {
    const occupied = [...cells.map(function ({row, col}) {
        return {row, col};
    })];
    let r;
    let c;
    for (r = 0; r < GRID_SIZE; r += 1) {
        for (c = 0; c < GRID_SIZE; c += 1) {
            if (grid[r][c].terrain !== "empty") {
                occupied.push({row: r, col: c});
            }
        }
    }
    const rows = occupied.map(function ({row}) { return row; });
    const cols = occupied.map(function ({col}) { return col; });
    return (Math.max(...rows) - Math.min(...rows)) < KINGDOM_SIZE &&
        (Math.max(...cols) - Math.min(...cols)) < KINGDOM_SIZE;
}

/**
 * Flood-fills a connected region of matching terrain from a seed cell,
 * marks visited cells, and returns all cells in the region.
 * @param {Grid}        grid
 * @param {number}      startRow - Row index of the seed cell
 * @param {number}      startCol - Column index of the seed cell
 * @param {boolean[][]} visited  - Shared visited matrix; updated in place
 * @returns {Cell[]} All cells belonging to this region
 */
function floodFillRegion(grid, startRow, startCol, visited) {
    const terrain = grid[startRow][startCol].terrain;
    const region  = [];
    const stack   = [[startRow, startCol]];
    while (stack.length > 0) {
        const [row, col] = stack.pop();
        if (
            row >= 0 && row < GRID_SIZE &&
            col >= 0 && col < GRID_SIZE &&
            !visited[row][col] &&
            grid[row][col].terrain === terrain
        ) {
        visited[row][col] = true;
        region.push(grid[row][col]);
        stack.push([row - 1, col]);
        stack.push([row + 1, col]);
        stack.push([row, col - 1]);
        stack.push([row, col + 1]);
        }
    }
    return region;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Scores a grid using flood-fill: Σ(region size × crowns in region).
* @param {Grid} grid
* @returns {number}
*/
export function scoreGrid(grid) {
    const visited = Array.from({length: GRID_SIZE}, function () {
        return Array.from({length: GRID_SIZE}, function () {
            return false;
        });
    });
    let score = 0;
    let row;
    let col;
    for (row = 0; row < GRID_SIZE; row += 1) {
        for (col = 0; col < GRID_SIZE; col += 1) {
            if (!visited[row][col]) {
            const terrain = grid[row][col].terrain;
                if (terrain !== "empty" && terrain !== "castle") {
            const region = floodFillRegion(grid, row, col, visited);
                    const crowns = region.reduce(function (sum, cell) {
                        return sum + cell.crowns;
                    }, 0);
            score += region.length * crowns;
                }
            }
        }
    }
    return score;
}

/**
 * Returns true when a domino placement is legal.
 * Checks bounds, occupancy, adjacency, and the 5×5 kingdom constraint.
 * @param {Grid}   grid
 * @param {Domino} domino
 * @param {number} row
 * @param {number} col
 * @param {number} orientation - 0=right, 1=down, 2=left, 3=up
 * @returns {boolean}
 */
export function isValidPlacement(grid, domino, row, col, orientation) {
    const cells = getPlacedCells(domino, row, col, orientation);
    return cellsInBounds(cells) &&
        cellsAreEmpty(grid, cells) &&
        touchesMatchingTerrain(grid, cells) &&
        fitsInKingdom(grid, cells);
}

/**
 * Returns every legal placement for a domino on a grid.
 * @param {Grid}   grid
* @param {Domino} domino
 * @param {number} [orientation] - 0-3; omit to check all orientations
* @returns {Array.<{row: number, col: number, orientation: number}>}
*/
export function findLegalPlacements(grid, domino, orientation) {
    const orientations = (
        orientation !== undefined
        ? [orientation]
        : [0, 1, 2, 3]
    );
    const results = [];
    let r;
    let c;
    for (r = 0; r < GRID_SIZE; r += 1) {
        for (c = 0; c < GRID_SIZE; c += 1) {
            orientations.forEach(function (o) {
                if (isValidPlacement(grid, domino, r, c, o)) {
                    results.push({row: r, col: c, orientation: o});
                }
            });
        }
    }
    return results;
}

/**
 * Draws DRAFT_SIZE dominoes from the deck, sorts by number ascending,
* and wraps each in a DraftSlot with claimedBy: null.
* @param {Domino[]} deck
* @returns {{ slots: DraftSlot[], remain: Domino[] }}
*/
export function getNextDraft(deck) {
    const drawn = deck.slice(0, DRAFT_SIZE).sort(function (a, b) {
        return a.number - b.number;
    });
    const remain = deck.slice(DRAFT_SIZE);
    const slots = drawn.map(function (domino) {
        return {domino, claimedBy: null};
    });
    return {slots, remain};
  }

/**
* Builds the starting GameState for a 2-player game.
 * Shuffles the full deck, picks 24 tiles, draws the first draft.
* @returns {GameState}
*/
export function createInitialState() {
    const deck = shuffle(ALL_DOMINOES).slice(0, 24);
    const {slots, remain} = getNextDraft(deck);
    return {
        players: [
            {id: 0, grid: makeGrid(), claimedDomino: null, hasPlaced: false},
            {id: 1, grid: makeGrid(), claimedDomino: null, hasPlaced: false}
        ],
        currentDraft: [],
        nextDraft: slots,
        deck: remain,
        havePlaced: false,
        phase: "first-claim",
        round: 1,
        firstClaimer: Math.floor(Math.random() * 2)
    };
}

/**
 * Active player claims a slot; the other player is auto-assigned.
 * Sets firstClaimer to whoever took the lower-numbered tile.
* @param {GameState} state
 * @param {number}    playerId
 * @param {number}    slotIndex - 0 or 1
* @returns {GameState}
*/
export function claimDomino(state, playerId, slotIndex) {
    const myDomino    = state.nextDraft[slotIndex].domino;
    const theirDomino = state.nextDraft[1 - slotIndex].domino;
    const nextFirstClaimer = (
        myDomino.number < theirDomino.number
        ? playerId
        : 1 - playerId
    );
    return {
        players: state.players.map(function (p) {
            return (p.id === playerId)
                ? {...p, claimedDomino: myDomino,    hasPlaced: false}
                : {...p, claimedDomino: theirDomino, hasPlaced: false};
        }),
        currentDraft: [],
        nextDraft: [],
        deck: state.deck,
        havePlaced: false,
        phase: "placing",
        round: state.round,
        firstClaimer: nextFirstClaimer
    };
  }

/**
 * Places the active player's held domino onto their grid, or discards
 * it when placement is null. Throws if no domino held or placement invalid.
   * @param {GameState} state
 * @param {number}    playerId
   * @param {{row: number, col: number, orientation: number}|null} placement
   * @returns {GameState}
   */
export function placeDomino(state, playerId, placement) {
    const player = state.players.find(function (p) {
        return p.id === playerId;
    });
    const domino = player.claimedDomino;
    const grid   = player.grid;

    if (domino === null) {
        throw new Error("No domino to place");
    }

    let newGrid;
    if (placement === null) {
        newGrid = grid;
    } else {
        const {row, col, orientation} = placement;
        if (!isValidPlacement(grid, domino, row, col, orientation)) {
            throw new Error("Invalid placement");
        }
        const cells = getPlacedCells(domino, row, col, orientation);
        newGrid = grid.map(function (rowArr, r) {
            return rowArr.map(function (cell, c) {
                const placed = cells.find(function (p) {
                    return p.row === r && p.col === c;
                });
                return (placed ? placed.half : cell);
            });
        });
    }

    return {
          ...state,
        players: state.players.map(function (p) {
            return (p.id === playerId)
                ? {...p, grid: newGrid, claimedDomino: null, hasPlaced: true}
                : p;
        })
      };
  }

/**
 * Advances the game after both players have placed.
* Draws a fresh nextDraft, resets hasPlaced, increments round.
 * Transitions to "final-place" when the deck empties,
 * then to "game-over" once both have placed in final-place.
* @param {GameState} state
* @returns {GameState}
*/
export function advanceRound(state) {
    const bothPlaced = state.players.every(function (p) {
        return p.hasPlaced;
    });

    if (state.phase === "final-place" && bothPlaced) {
        return {...state, phase: "game-over"};
    }
    if (state.deck.length === 0) {
        return {
            ...state,
            players: state.players.map(function (p) {
                return {...p, hasPlaced: false};
            }),
            phase: "final-place"
        };
    }
        const {slots, remain} = getNextDraft(state.deck);
    return {
            players: state.players.map(function (p) {
                return {...p, hasPlaced: false, claimedDomino: null};
            }),
        currentDraft: state.nextDraft,
        nextDraft: slots,
        deck: remain,
        round: state.round + 1,
            firstClaimer: state.firstClaimer,
        phase: "placing"
        };
    }
