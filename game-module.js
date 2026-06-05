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
 * Fisher-Yates shuffle; returns a new array, original untouched.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Build a fresh 9×9 grid with the castle at the centre cell.
 * @returns {Grid}
 */
function makeGrid() {
    const grid = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => ({ terrain: "empty", crowns: 0 }))
    );
    grid[CASTLE_ROW][CASTLE_COL] = { terrain: "castle", crowns: 0 };
    return grid;
}

/**
 * Return the two `{row, col, half}` cells occupied by `domino` at `placement`.
 * @param {Domino}    domino
 * @param {Placement} placement
 * @returns {{ row: number, col: number, half: Cell }[]}
 */
function getPlacedCells(domino, { row, col, orientation, flipped }) {
    const [firstHalf, secondHalf] = flipped
        ? [domino.right, domino.left]
        : [domino.left,  domino.right];

    return orientation === "horizontal"
        ? [{ row, col,       half: firstHalf  },
           { row, col: col + 1, half: secondHalf }]
        : [{ row,       col, half: firstHalf  },
           { row: row + 1, col, half: secondHalf }];
}

/**
 * Returns `true` when both cells lie within the grid.
 * @param {{ row: number, col: number }[]} cells
 * @param {number} size
 * @returns {boolean}
 */
function cellsInBounds(cells, size) {
    return cells.every(({ row, col }) =>
        row >= 0 && row < size && col >= 0 && col < size
    );
}

/**
 * Returns `true` when both target cells are currently empty.
 * @param {Grid} grid
 * @param {{ row: number, col: number }[]} cells
 * @returns {boolean}
 */
function cellsAreEmpty(grid, cells) {
    return cells.every(({ row, col }) => grid[row][col].terrain === "empty");
}

/**
 * Returns `true` when at least one half-tile is orthogonally adjacent to the
 * castle or to an existing cell of matching terrain (the other half of the
 * same domino is ignored).
 * @param {Grid} grid
 * @param {{ row: number, col: number, half: Cell }[]} cells
 * @returns {boolean}
 */
function touchesMatchingTerrain(grid, cells) {
    const size = grid.length;
    const isBeingPlaced = (r, c) => cells.some(p => p.row === r && p.col === c);

    return cells.some(({ row, col, half }) =>
        [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
            .some(([r, c]) => {
                if (r < 0 || r >= size || c < 0 || c >= size) return false;
                if (isBeingPlaced(r, c)) return false;
                const t = grid[r][c].terrain;
                return t === "castle" || t === half.terrain;
            })
    );
}

/**
 * Returns `true` when all non-empty cells (existing + new) fit inside a 5×5
 * bounding box, ensuring the kingdom never exceeds `KINGDOM_SIZE` in any axis.
 * @param {Grid} grid
 * @param {{ row: number, col: number }[]} cells
 * @returns {boolean}
 */
function fitsInKingdom(grid, cells) {
    const occupied = cells.map(({ row, col }) => ({ row, col }));
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c].terrain !== "empty") occupied.push({ row: r, col: c });
        }
    }
    const rows = occupied.map(p => p.row);
    const cols = occupied.map(p => p.col);
    return (
        Math.max(...rows) - Math.min(...rows) < KINGDOM_SIZE &&
        Math.max(...cols) - Math.min(...cols) < KINGDOM_SIZE
    );
}

/**
 * Flood-fill all connected same-terrain cells starting at `(startRow, startCol)`.
 * Marks every visited cell in `visited` (mutated in place).
 * @param {Grid}       grid
 * @param {number}     startRow
 * @param {number}     startCol
 * @param {boolean[][]} visited - Mutated: cells found are set to `true`
 * @returns {[number, number][]} Array of `[row, col]` pairs in the region
 */
function floodFillRegion(grid, startRow, startCol, visited) {
    const size    = grid.length;
    const terrain = grid[startRow][startCol].terrain;
    const region  = [];
    const stack   = [[startRow, startCol]];

    while (stack.length > 0) {
        const [r, c] = stack.pop();
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        if (visited[r][c]) continue;
        if (grid[r][c].terrain !== terrain) continue;

        visited[r][c] = true;
        region.push([r, c]);
        stack.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]);
    }
    return region;
}

/**
 * Apply a validated placement to a grid; returns a new grid (original untouched).
 * @param {Grid}      grid
 * @param {Domino}    domino
 * @param {Placement} placement
 * @returns {Grid}
 */
function applyPlacement(grid, domino, placement) {
    const cells   = getPlacedCells(domino, placement);
    const newGrid = grid.map(row => [...row]);
    for (const { row, col, half } of cells) {
        newGrid[row]      = [...newGrid[row]];
        newGrid[row][col] = { terrain: half.terrain, crowns: half.crowns };
    }
    return newGrid;
}

/**
 * Return the player id that follows `justPlayedId` in ascending draft-number
 * order for the given draft (wraps around).
 * @param {DraftSlot[]} draft
 * @param {number}      justPlayedId
 * @returns {number}
 */
function nextInDraftOrder(draft, justPlayedId) {
    const order = [...draft]
        .filter(s => s.claimedBy !== null)
        .sort((a, b) => a.domino.number - b.domino.number)
        .map(s => s.claimedBy);

    const idx = order.indexOf(justPlayedId);
    return order[(idx + 1) % order.length];
}

// ─── Exported pure functions ──────────────────────────────────────────────────

/**
 * Create the initial {@link GameState} for a fresh 2-player game.
 *
 * The full 24-domino deck is shuffled, the first `DRAFT_SIZE` dominoes are
 * drawn and sorted into `nextDraft`, and `phase` is set to `"first-claim"`
 * with player 0 as the first active player.
 *
 * @memberof KingdominoGame
 * @returns {GameState}
 *
 * @example
 * const state = createInitialState();
 * // state.phase === "first-claim"
 * // state.nextDraft.length === 2
 * // state.players[0].grid[4][4].terrain === "castle"
 */
export function createInitialState() {
    const shuffledDeck                   = shuffle(ALL_DOMINOES);
    const { draft, remainingDeck }       = getNextDraft(shuffledDeck);

    return {
        players: [
            { id: 0, grid: makeGrid(), claimedDomino: null },
            { id: 1, grid: makeGrid(), claimedDomino: null },
        ],
        currentDraft: [],
        nextDraft:    draft,
        deck:         remainingDeck,
        activePlayer: 0,
        phase:        "first-claim",
        round:        1,
    };
}

/**
 * Draw the next `DRAFT_SIZE` dominoes from `deck` and return them as a
 * draft array sorted in ascending `number` order with all slots unclaimed.
 *
 * When the deck has fewer than `DRAFT_SIZE` dominoes the remaining tiles are
 * all drawn.  An empty deck returns an empty draft.
 *
 * @memberof KingdominoGame
 * @param {Domino[]} deck - Current deck; **not** mutated
 * @returns {{ draft: DraftSlot[], remainingDeck: Domino[] }}
 *
 * @example
 * const { draft, remainingDeck } = getNextDraft(state.deck);
 * // draft[0].domino.number <= draft[1].domino.number
 * // draft[0].claimedBy === null
 */
export function getNextDraft(deck) {
    if (deck.length === 0) return { draft: [], remainingDeck: [] };

    const drawn         = deck.slice(0, DRAFT_SIZE);
    const remainingDeck = deck.slice(DRAFT_SIZE);
    const draft         = [...drawn]
        .sort((a, b) => a.number - b.number)
        .map(domino => ({ domino, claimedBy: null }));

    return { draft, remainingDeck };
}

/**
 * Claim a domino from `state.nextDraft` on behalf of `playerId`.
 *
 * **Valid in phases:** `"first-claim"`, `"place-and-claim"`
 *
 * In `"place-and-claim"` a player must call {@link placeDomino} before
 * calling `claimDomino` (their held domino must be placed first).
 *
 * **Transition logic when all `nextDraft` slots become claimed:**
 * - `"first-claim"` → moves `nextDraft` to `currentDraft`, draws a new
 *   `nextDraft`, assigns each player their claimed domino, and advances to
 *   `"place-and-claim"` (or `"final-place"` if no more dominoes remain).
 * - `"place-and-claim"` → same transition; the round ends once every player
 *   has both placed and claimed.
 *
 * @memberof KingdominoGame
 * @param {GameState} state
 * @param {number}    playerId   - Index into `state.players`
 * @param {number}    slotIndex  - Index into `state.nextDraft`
 * @returns {GameState} New state; `state` is not mutated.
 * @throws {Error} If it is not `playerId`'s turn, the slot index is out of
 *                 range, or the slot is already claimed.
 *
 * @example
 * // Player 0 picks the first draft slot
 * const next = claimDomino(state, 0, 0);
 */
export function claimDomino(state, playerId, slotIndex) {
    if (state.activePlayer !== playerId) {
        throw new Error(
            `Not player ${playerId}'s turn to claim (active: ${state.activePlayer}).`
        );
    }
    const slot = state.nextDraft[slotIndex];
    if (!slot) {
        throw new Error(`No draft slot at index ${slotIndex}.`);
    }
    if (slot.claimedBy !== null) {
        throw new Error(`Slot ${slotIndex} is already claimed by player ${slot.claimedBy}.`);
    }

    const newNextDraft = state.nextDraft.map((s, i) =>
        i === slotIndex ? { ...s, claimedBy: playerId } : s
    );

    const allClaimed = newNextDraft.every(s => s.claimedBy !== null);

    // ── Not all claimed yet: advance to next player ───────────────────────────
    if (!allClaimed) {
        const nextActive = (state.activePlayer + 1) % state.players.length;
        return { ...state, nextDraft: newNextDraft, activePlayer: nextActive };
    }

    // ── All slots claimed: end of claiming, start round transition ────────────
    const { draft: freshNextDraft, remainingDeck } = getNextDraft(state.deck);

    // Assign each player the domino they just claimed (it becomes their held tile)
    const newPlayers = state.players.map(p => {
        const claimed = newNextDraft.find(s => s.claimedBy === p.id);
        return claimed ? { ...p, claimedDomino: claimed.domino } : p;
    });

    const nextPhase   = freshNextDraft.length === 0 ? "final-place" : "place-and-claim";
    // Player who claimed the lowest-numbered tile moves first next round
    const firstActive = newNextDraft[0].claimedBy;

    return {
        ...state,
        players:      newPlayers,
        currentDraft: newNextDraft,
        nextDraft:    freshNextDraft,
        deck:         remainingDeck,
        activePlayer: firstActive,
        phase:        nextPhase,
        round:        state.round + 1,
    };
}

/**
 * Place the active player's `claimedDomino` onto their grid, then advance
 * the game state.
 *
 * **Valid in phases:** `"place-and-claim"`, `"final-place"`
 *
 * Pass `null` as `placement` to legally **discard** the domino when no valid
 * placement exists.
 *
 * **Turn sequencing in `"place-and-claim"`:**
 * After a successful placement `activePlayer` is unchanged — the same player
 * must immediately call {@link claimDomino} to pick from `nextDraft`.
 * `activePlayer` advances only after the subsequent claim.
 *
 * **In `"final-place"`:**
 * After placing, `activePlayer` advances to the next player in current-draft
 * order.  When all players have placed, `phase` becomes `"game-over"`.
 *
 * @memberof KingdominoGame
 * @param {GameState}      state
 * @param {number}         playerId  - Index into `state.players`
 * @param {Placement|null} placement - Target placement, or `null` to discard
 * @returns {GameState} New state; `state` is not mutated.
 * @throws {Error} If it is not `playerId`'s turn, the player has no domino
 *                 to place, or `placement` is not valid.
 *
 * @example
 * const next = placeDomino(state, 0, { row: 4, col: 5, orientation: "horizontal", flipped: false });
 */
export function placeDomino(state, playerId, placement) {
    if (state.activePlayer !== playerId) {
        throw new Error(
            `Not player ${playerId}'s turn to place (active: ${state.activePlayer}).`
        );
    }
    const player = state.players[playerId];
    if (!player.claimedDomino) {
        throw new Error(`Player ${playerId} has no domino to place.`);
    }
    if (placement !== null && !isValidPlacement(player.grid, player.claimedDomino, placement)) {
        throw new Error(`Invalid placement for player ${playerId}.`);
    }

    const newGrid = placement !== null
        ? applyPlacement(player.grid, player.claimedDomino, placement)
        : player.grid;

    const newPlayers = state.players.map((p, i) =>
        i === playerId ? { ...p, grid: newGrid, claimedDomino: null } : p
    );

    // ── final-place: advance or end game ─────────────────────────────────────
    if (state.phase === "final-place") {
        const allPlaced = newPlayers.every(p => p.claimedDomino === null);
        if (allPlaced) {
            return { ...state, players: newPlayers, phase: "game-over" };
        }
        const nextActive = nextInDraftOrder(state.currentDraft, playerId);
        return { ...state, players: newPlayers, activePlayer: nextActive };
    }

    // ── place-and-claim: same player must still claim; do not advance ─────────
    return { ...state, players: newPlayers };
}

/**
 * Determine whether `domino` can legally be placed on `grid` at `placement`.
 *
 * A placement is valid when **all** of the following hold:
 * 1. Both half-tiles fall within the 9×9 grid boundaries.
 * 2. Both target cells are currently empty.
 * 3. At least one half-tile is orthogonally adjacent to the castle or to an
 *    existing cell of matching terrain type.
 * 4. All non-empty cells (existing + new domino) fit inside a 5×5 bounding box.
 *
 * @memberof KingdominoGame
 * @param {Grid}      grid
 * @param {Domino}    domino
 * @param {Placement} placement
 * @returns {boolean}
 *
 * @example
 * const ok = isValidPlacement(player.grid, domino, { row: 4, col: 5, orientation: "horizontal", flipped: false });
 */
export function isValidPlacement(grid, domino, placement) {
    const cells = getPlacedCells(domino, placement);
    return (
        cellsInBounds(cells, grid.length)   &&
        cellsAreEmpty(grid, cells)           &&
        touchesMatchingTerrain(grid, cells)  &&
        fitsInKingdom(grid, cells)
    );
}

/**
 * Score a player's kingdom by summing `(tiles × crowns)` for every connected
 * region of same-terrain cells, excluding `"empty"` and `"castle"` cells.
 *
 * Uses a flood-fill (iterative DFS) to identify contiguous regions.
 *
 * @memberof KingdominoGame
 * @param {Grid} grid
 * @returns {number} Total score (≥ 0)
 *
 * @example
 * // A 3-tile forest region containing 2 crowns scores 3 × 2 = 6
 * const score = scoreGrid(state.players[0].grid);
 */
export function scoreGrid(grid) {
    const size    = grid.length;
    const visited = Array.from({ length: size }, () => Array(size).fill(false));
    let   total   = 0;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (visited[row][col]) continue;
            const { terrain } = grid[row][col];
            if (terrain === "empty" || terrain === "castle") {
                visited[row][col] = true;
                continue;
            }
            const region = floodFillRegion(grid, row, col, visited);
            const crowns = region.reduce((sum, [r, c]) => sum + grid[r][c].crowns, 0);
            total += region.length * crowns;
        }
    }
    return total;
}

/**
 * Return all legal placements of `domino` on `grid`.
 * Checks every cell, both orientations, and both flip states.
 *
 * @memberof KingdominoGame
 * @param {Grid}   grid
 * @param {Domino} domino
 * @returns {Placement[]} Array of valid placements (may be empty)
 *
 * @example
 * const moves = findLegalPlacements(player.grid, domino);
 * if (moves.length === 0) placeDomino(state, playerId, null); // must discard
 */
export function findLegalPlacements(grid, domino) {
    const placements = [];
    const size       = grid.length;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            for (const orientation of ["horizontal", "vertical"]) {
                for (const flipped of [false, true]) {
                    const p = { row, col, orientation, flipped };
                    if (isValidPlacement(grid, domino, p)) placements.push(p);
                }
            }
        }
    }
    return placements;
}
