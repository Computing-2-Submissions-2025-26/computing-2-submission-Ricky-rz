/**
 * @file Module.js
 * Pure-function Kingdomino engine for 2 players.
 * All exported functions return new state objects and never mutate their inputs.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID_SIZE    = 9;  // 9×9 board so a 5×5 kingdom fits anywhere around the castle
const KINGDOM_SIZE = 5;  // Maximum bounding-box dimension for a legal kingdom
const CASTLE_ROW   = 4;  // Centre cell row index
const CASTLE_COL   = 4;  // Centre cell column index
const DRAFT_SIZE   = 2;  // Dominoes drawn per round (one per king in a 2-player game)
const DECK_SIZE    = 48; // full deck; each game randomly picks 24

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
 * @property {boolean}     hasPlaced - true when the domino is placed this round
 */

/**
 * @typedef {object} Placement
 * @property {number} row         - Row of the first half-tile
 * @property {number} col         - Column of the first half-tile
 * @property {number} orientation - Direction of the second half: 0=right, 1=down, 2=left, 3=up
 */

/**
 * @typedef {"first-claim"|"placing"|"final-place"|"game-over"} Phase
 *
 * Phase transition diagram:
 * ```
 * first-claim
 *   └─ (both players claimed) → placing
 *                                   └─ (deck empty after both place) → final-place
 *                                   │                                      └─ (both placed) → game-over
 *                                   └─ (deck has tiles) → placing (next round)
 * ```
 *
 * - **first-claim**  Round 1 only: both players claim from `nextDraft`; no domino held yet.
 * - **placing**      Each player places their held domino; new `nextDraft` drawn each round.
 * - **final-place**  Deck exhausted: each player places their last held domino (no new claim).
 * - **game-over**    All dominoes placed; call {@link scoreGrid} for final scores.
 */

/**
 * @typedef {object} GameState
 * @property {Player[]}    players       - Two-element array indexed by player id
 * @property {DraftSlot[]} currentDraft  - Sorted ascending by `domino.number`; players place from these
 * @property {DraftSlot[]} nextDraft     - Sorted ascending by `domino.number`; players claim from these
 * @property {Domino[]}    deck          - Remaining shuffled dominoes not yet drawn
 * @property {Phase}       phase         - Current phase of the game
 * @property {number}      round         - 1-based round counter (1–12)
 * @property {number}      firstClaimer  - playerId who picks first this round
 */

// ─── Domino deck data (official full 48-tile set) ────────────────────────────

/** @type {Readonly<Domino[]>} */
const ALL_DOMINOES = Object.freeze([
    // 1–12: double-terrain, no crowns
    { id: 1,  number: 1,  left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 2,  number: 2,  left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 3,  number: 3,  left: { terrain: "forest", crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 4,  number: 4,  left: { terrain: "forest", crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 5,  number: 5,  left: { terrain: "forest", crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 6,  number: 6,  left: { terrain: "forest", crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 7,  number: 7,  left: { terrain: "water",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 8,  number: 8,  left: { terrain: "water",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 9,  number: 9,  left: { terrain: "water",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 10, number: 10, left: { terrain: "grass",  crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 11, number: 11, left: { terrain: "grass",  crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 12, number: 12, left: { terrain: "swamp",  crowns: 0 }, right: { terrain: "swamp",  crowns: 0 } },
    // 13–18: mixed terrain, no crowns
    { id: 13, number: 13, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "forest", crowns: 0 } },
    { id: 14, number: 14, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 15, number: 15, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 16, number: 16, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "swamp",  crowns: 0 } },
    { id: 17, number: 17, left: { terrain: "forest", crowns: 0 }, right: { terrain: "water",  crowns: 0 } },
    { id: 18, number: 18, left: { terrain: "forest", crowns: 0 }, right: { terrain: "grass",  crowns: 0 } },
    // 19–23: wheat crowned (1 crown each)
    { id: 19, number: 19, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "forest", crowns: 0 } },
    { id: 20, number: 20, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "water",  crowns: 0 } },
    { id: 21, number: 21, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "grass",  crowns: 0 } },
    { id: 22, number: 22, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "swamp",  crowns: 0 } },
    { id: 23, number: 23, left: { terrain: "wheat",  crowns: 1 }, right: { terrain: "mine",   crowns: 0 } },
    // 24–29: forest crowned (1 crown each)
    { id: 24, number: 24, left: { terrain: "forest", crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 25, number: 25, left: { terrain: "forest", crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 26, number: 26, left: { terrain: "forest", crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 27, number: 27, left: { terrain: "forest", crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 28, number: 28, left: { terrain: "forest", crowns: 1 }, right: { terrain: "water",  crowns: 0 } },
    { id: 29, number: 29, left: { terrain: "forest", crowns: 1 }, right: { terrain: "grass",  crowns: 0 } },
    // 30–35: water crowned (1 crown each)
    { id: 30, number: 30, left: { terrain: "water",  crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 31, number: 31, left: { terrain: "water",  crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 32, number: 32, left: { terrain: "water",  crowns: 1 }, right: { terrain: "forest", crowns: 0 } },
    { id: 33, number: 33, left: { terrain: "water",  crowns: 1 }, right: { terrain: "forest", crowns: 0 } },
    { id: 34, number: 34, left: { terrain: "water",  crowns: 1 }, right: { terrain: "forest", crowns: 0 } },
    { id: 35, number: 35, left: { terrain: "water",  crowns: 1 }, right: { terrain: "forest", crowns: 0 } },
    // 36–39: grass crowned (1 crown, on right)
    { id: 36, number: 36, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "grass",  crowns: 1 } },
    { id: 37, number: 37, left: { terrain: "water",  crowns: 0 }, right: { terrain: "grass",  crowns: 1 } },
    { id: 38, number: 38, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "swamp",  crowns: 1 } },
    { id: 39, number: 39, left: { terrain: "grass",  crowns: 0 }, right: { terrain: "swamp",  crowns: 1 } },
    // 40: mine (1 crown)
    { id: 40, number: 40, left: { terrain: "mine",   crowns: 1 }, right: { terrain: "wheat",  crowns: 0 } },
    // 41–42: grass crowned (2 crowns, on right)
    { id: 41, number: 41, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "grass",  crowns: 2 } },
    { id: 42, number: 42, left: { terrain: "water",  crowns: 0 }, right: { terrain: "grass",  crowns: 2 } },
    // 43–44: swamp crowned (2 crowns, on right)
    { id: 43, number: 43, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "swamp",  crowns: 2 } },
    { id: 44, number: 44, left: { terrain: "grass",  crowns: 0 }, right: { terrain: "swamp",  crowns: 2 } },
    // 45–48: mine crowned (2–3 crowns)
    { id: 45, number: 45, left: { terrain: "mine",   crowns: 2 }, right: { terrain: "wheat",  crowns: 0 } },
    { id: 46, number: 46, left: { terrain: "swamp",  crowns: 0 }, right: { terrain: "mine",   crowns: 2 } },
    { id: 47, number: 47, left: { terrain: "swamp",  crowns: 0 }, right: { terrain: "mine",   crowns: 2 } },
    { id: 48, number: 48, left: { terrain: "wheat",  crowns: 0 }, right: { terrain: "mine",   crowns: 3 } },
]);

// ─── Private helpers ───────────────────────────────────────────────────────────

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
 * Creates a 9×9 grid with the castle at the centre and all other cells empty.
 * @returns {Grid}
 */
function makeGrid() {
    const grid =Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => ({ terrain: "empty", crowns: 0 }))
    );
    grid[CASTLE_ROW][CASTLE_COL] = { terrain: "castle", crowns: 0 };
    return grid;
}

/**
 * Returns the two cells that a domino would occupy given a position and orientation.
 * The first entry is the left half, the second is the right half.
 * @param {Domino} domino
 * @param {number} row         - Row of the first (left) half-tile
 * @param {number} col         - Column of the first (left) half-tile
 * @param {number} orientation - 0=right, 1=down, 2=left, 3=up
 * @returns {Array.<{row: number, col: number, half: Cell}>}
 */
 function getPlacedCells(domino, row, col, orientation) {
      let r, c;

      if (orientation === 0) { r = row;   c = col+1; }
      if (orientation === 1) { r = row+1; c = col;   }
      if (orientation === 2) { r = row;   c = col-1; }
      if (orientation === 3) { r = row-1; c = col;   }

      return [
          { row: row, col: col, half: domino.left },
          { row: r,  col: c,  half: domino.right }
      ];
  }

/**
* Checks if both cells are within the 9x9 grid.
* @param {Array.<{row: number, col: number}>} cells
* @returns {boolean}
*/
function cellsInBounds(cells) {
    return cells.every(
        ({row, col}) =>
            row >= 0 && row < GRID_SIZE &&
            col >= 0 && col < GRID_SIZE
    );
}

/**
 * checks if cells are empty
 * @param {Grid} grid
 * @param {Array.<{row: number, col: number}>} cells
 * @returns {boolean}
 */
function cellsAreEmpty(grid, cells) {
    return cells.every(
        ({row, col}) =>
            grid[row][col].terrain === "empty"
    )
}

/**
* Checks if at least one half-tile is orthogonally adjacent to the
* castle or to an existing cell of matching terrain.
* The other half of the same domino is excluded from adjacency checks.
* @param {Grid} grid
* @param {Array.<{row: number, col: number, half: Cell}>} cells
* @returns {boolean}
*/
function touchesMatchingTerrain(grid, cells) {
    return cells.some(({ row, col, half }) => {
        const neighbours = [
            { row: row - 1, col },
            { row: row + 1, col },
            { row, col: col - 1 },
            { row, col: col + 1 },
        ];
        return neighbours.some(({ row: r, col: c }) => {
            if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) {
                return false;// Out of bounds
            }
            if (cells.some(cell => cell.row === r && cell.col === c)) {
                return false;// Skip the other half of the same domino
            }
            const t = grid[r][c].terrain;
            return t === "castle" || t === half.terrain;
        });
    });
}

/**
   * Checks if all occupied cells fit within a 5x5 bounding box.
   * @param {Grid} grid
   * @param {Array.<{row: number, col: number}>} cells
   * @returns {boolean}
   */
function fitsInKingdom(grid, cells) {
    const occupied = [...cells.map(({ row, col }) => ({ row, col }))];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
        if(grid[r][c].terrain !== "empty"){
            occupied.push({row: r, col: c});
            }
    }}
    const row_min = Math.min(...occupied.map(({row}) => row));
    const row_max = Math.max(...occupied.map(({row}) => row));
    const col_min = Math.min(...occupied.map(({col}) => col));
    const col_max = Math.max(...occupied.map(({col}) => col));
    return (row_max - row_min) < KINGDOM_SIZE &&
        (col_max - col_min) < KINGDOM_SIZE;
}

/**
 * Flood-fills a single connected region of matching terrain starting from
 * (startRow, startCol), marks all visited cells, and returns the collected cells.
 * @param {Grid}      grid
 * @param {number}    startRow - Row index of the seed cell
 * @param {number}    startCol - Column index of the seed cell
 * @param {boolean[][]} visited - Shared visited matrix; updated in place
 * @returns {Cell[]} All cells belonging to this region
 */
function floodFillRegion(grid, startRow, startCol, visited) {
    const terrain = grid[startRow][startCol].terrain;
    const region  = [];
    const stack   = [[startRow, startCol]];
    while (stack.length > 0) {
        const [row, col] = stack.pop();

          // 1. bounds check — must be first
        if (row < 0 || row >= GRID_SIZE ||
             col < 0 || col >= GRID_SIZE) { continue; }
          // 2. already visited?
        if (visited[row][col]) { continue; }
          // 3. wrong terrain?
        if (grid[row][col].terrain !== terrain) { continue; }

          // mark, collect, push neighbours
        visited[row][col] = true;
        region.push(grid[row][col]);

        stack.push([row - 1, col]);
        stack.push([row + 1, col]);
        stack.push([row, col - 1]);
        stack.push([row, col + 1]);
    }
    return region;
}

// ─── public API functions ──────────────────────────────────────────────────────


/**
* @param {Grid} grid
* @returns {number}
*/
export function scoreGrid(grid) {
    const visited = Array.from({length: GRID_SIZE}, () =>
        Array.from({length: GRID_SIZE}, () => false))
    let score = 0;
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            if (visited[row][col]) { continue; }
            const terrain = grid[row][col].terrain;
            if (terrain === "empty" || terrain === "castle") { continue; }
            const region = floodFillRegion(grid, row, col, visited);
            const crowns = region.reduce(
                (sum, cell) => sum + cell.crowns, 0
            );
            score += region.length * crowns;
        }
    }
    return score;
}

/**
 * Is the placement valid according to the game rules?
 * @param {Grid} grid
 * @param {Domino} domino
 * @param {number} row
 * @param {number} col
 * @param {number} orientation 0,1,2,3 for orientation and left or right for half
 * @return {boolean}
 */
export function isValidPlacement(grid, domino, row, col, orientation) {
    const cells = getPlacedCells(domino, row, col, orientation);
    return cellsInBounds(cells) &&
        cellsAreEmpty(grid, cells) &&
        touchesMatchingTerrain(grid, cells) &&
        fitsInKingdom(grid, cells);
}

/**
* Returns every legal placement for `domino` on `grid` for each orientation.
* @param {Grid} grid
* @param {Domino} domino
* @param {number} [orientation] 0-3; omit to chek all orientations
* @returns {Array.<{row: number, col: number, orientation: number}>}
*/
export function findLegalPlacements(grid, domino, orientation) {
    const orientations = orientation !== undefined
        ?[orientation]
        :[0, 1, 2, 3];
    const results = []
    for (let r = 0; r < GRID_SIZE; r++) {
        for(let c = 0; c < GRID_SIZE; c++) {
            for (const o of orientations) {
                if(isValidPlacement(grid, domino, r, c, o)) {
                    results.push({row: r, col: c, orientation: o
                    });
                }
            }
        }
    }
    return results;
}

/**
* Draws the next DRAFT_SIZE dominoes from the deck, sorts them by number,
* and wraps each in a DraftSlot with claimedBy: null.
* @param {Domino[]} deck
* @returns {{ slots: DraftSlot[], remain: Domino[] }}
*/
export function getNextDraft(deck) {
    const drawn = deck.slice(0, DRAFT_SIZE).sort((a, b) => a.number - b.number);
    const remain = deck.slice(DRAFT_SIZE);
    const slots = drawn.map(domino => ({domino, claimedBy: null}));
    return {slots, remain};
  }

/**
* Builds the starting GameState for a 2-player game.
* Shuffles the deck, draws the first nextDraft, and sets phase to "first-claim".
* @returns {GameState}
*/
export function createInitialState() {
    const deck = shuffle(ALL_DOMINOES).slice(0, 24);
    const {slots, remain} = getNextDraft(deck);
    return {
        players: [
            { id: 0, grid: makeGrid(), claimedDomino: null, hasPlaced: false},
            { id: 1, grid: makeGrid(), claimedDomino: null, hasPlaced: false},
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
* Active player claims a slot; the other player is auto-assigned
* @param {GameState} state
* @param {number} playerId
* @param {number} slotIndex 0 or 1
* @returns {GameState}
*/
export function claimDomino(state, playerId, slotIndex) {
    const myDomino = state.nextDraft[slotIndex].domino;
    const theirdomino = state.nextDraft[1 - slotIndex].domino;
    const nextFirstCLaim = myDomino.number < theirdomino.number
        ? playerId
        : 1 - playerId;
    return {
        players: state.players.map(p =>
            p.id === playerId
                ? {...p, claimedDomino: myDomino,    hasPlaced: false}
                : {...p, claimedDomino: theirdomino, hasPlaced: false}
        ),
        currentDraft: [],
        nextDraft: [],
        deck: state.deck,
        havePlaced: false,
        phase: "placing",
        round: state.round,
        firstClaimer: nextFirstCLaim
    }

  }

/**
   * Places the active player's held domino onto their grid (or discards it if
   * `placement` is null), then advances the game to the next player/phase.
   * Throws if the player has no held domino or the placement is invalid.
   * @param {GameState} state
   * @param {number} playerId
   * @param {{row: number, col: number, orientation: number}|null} placement
   * @returns {GameState}
   */
export function placeDomino(state, playerId, placement) {
    const player = state.players.find(p => p.id === playerId);
    const domino = player.claimedDomino;
    const grid   = player.grid;

    if (domino === null) {
        throw new Error("No domino to place");
    }

    let newGrid;
    if (placement === null) {
        newGrid = grid;
    } else {
        const { row, col, orientation } = placement;
        if (!isValidPlacement(grid, domino, row, col, orientation)) {
            throw new Error("Invalid placement");
        }
        const cells = getPlacedCells(domino, row, col, orientation);
        newGrid = grid.map((rowArr, r) =>
            rowArr.map((cell, c) => {
                const placed = cells.find(p => p.row === r && p.col === c);
                return placed ? placed.half : cell;
            })
        );
    }

    return {
          ...state,
          players: state.players.map(p =>
              p.id === playerId
                  ? { ...p, grid: newGrid, claimedDomino: null, hasPlaced: true}
                  : p
          ),
      };
  }

/**
* Advances the game to the next round after both players have placed.
* Draws a fresh nextDraft, resets hasPlaced, increments round.
* Transitions to "final-place" when deck empties, "game-over" after final-place.
* @param {GameState} state
* @returns {GameState}
*/
export function advanceRound(state) {
    const bothPlaced = state.players.every(p => p.hasPlaced);

    if (state.phase === "final-place" && bothPlaced) {
        return {...state, phase: "game-over" };
    }
    if (state.deck.length === 0) {
        return {
            ...state,
            players: state.players.map(p => ({...p, hasPlaced: false})),
            phase: "final-place"
        };
    }
    else {
        const {slots, remain} = getNextDraft(state.deck);
        const firstClaimer = state.firstClaimer;
    return {
        players: state.players.map(p => ({...p, hasPlaced: false, claimedDomino: null})),
        currentDraft: state.nextDraft,
        nextDraft: slots,
        deck: remain,
        round: state.round + 1,
        firstClaimer: firstClaimer,
        phase: "placing"
    }}
}
