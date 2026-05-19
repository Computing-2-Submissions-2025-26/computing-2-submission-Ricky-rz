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

/**
 * Score a single grid using flood-fill to find connected terrain areas and count crowns. Returns total score.
 * @memberOf KingdominoGame
 * @param {Grid} grid
 * @returns {number} Total score
 */
export function scoreGrid(grid) {
    const size = grid.length;
    const visited = Array.from({length: size}, () => Array(size).fill(false)); // Tracks the cell, with False as default value
    let total = 0;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (visited[row][col])continue;
            const terrain = grid[row][col].terrain;
            if (terrain === "empty" || terrain === "castle") {
                visited[row][col] = true;
                continue 
            }
            const region =  floodFillRegion(grid, row, col, visited); // Get all connected cells of the same terrain
            const tiles = region.length;
            const crowns = region.reduce(
                (sum,[r,c]) => sum + grid[r][c].crowns,
                0
            );
            total += tiles * crowns; // Score for this region is tiles × crowns
        }
    }
    return total;
}
//Function to perform flood-fill and return all connected cells of the same terrain type
function floodFillRegion(grid, startRow, startCol, visited) {
    const size = grid.length;
    const terrain = grid[startRow][startCol].terrain;
    const region = [];
    const stack = [[startRow, startCol]];

    while (stack.length > 0){
        const [row, col] = stack.pop();
        if (row < 0 || row >= size || col < 0 || col >= size) continue; // Out of bounds
        if (visited[row][col]) continue; // Already visited
        if (grid[row][col].terrain !== terrain) continue; // Different terrain

        visited[row][col] = true;
        region.push([row, col]); // Add to current region
        stack.push([row,col]); // Check neighbors
        stack.push([row+1,col]);
        stack.push([row-1,col]);
        stack.push([row,col+1]);
        stack.push([row,col-1]);
    }
    return region;
}

/**
 * Find all legal placements of a domino on the given grid 
 * @memberof KingdominoGame
 * @param {Grid} grid
 * @param {Domino} domino
 * @return {Placement[]} Array of legal placements
 */
export function findLegalPlacements(grid, domino) {
    const placements = [];
    const size = grid.length;

    for (let row = 0; row < size; row++){
        for (let col = 0; col < size; col++){
            for (const orientation of ["horizontal", "vertical"]){
                for (const flipped of [false, true]){
                    const placement = {row, col, orientation, flipped};//
                    if (isLegalPlacement(grid, domino, placement)){
                        placements.push(placement);
                    }
                }
             }
        }
    }
    return placements;
}

// ==== Private helpers ====

// Returns the state of legality - true or false, based on the rules of the placement
function isLegalPlacement(grid, domino, placement){
    const placed = getPlacedCells(domino, placement);
    return cellsInBounds(placed, grid.length)
        && cellsAreEmpty(grid, placed)
        && touchesMatchingTerrain(grid, placed)
        && fitsInKingdom(grid, placed);
}

function getPlacedCells(domino, {row, col, orientation, flipped}){
    const { row, col, orientation, flipped } = placement;
    const [firstHalf, secondHalf] = flipped
        ? [domino.right, domino.left] // If flipped, the "right" half is placed first at (row, col), and the "left" half is placed adjacent to it
        : [domino.left, domino.right]; // Normal orientation, "left" half is at (row, col) and "right" half is adjacent
    
    //Coordinates of the two halves based on orientation
    if (orientation === "horizontal"){
        return [
            {row, col, half:firstHalf},
            {row, col: col + 1, half:secondHalf}
        ];
    }
    // vertical
    return [
        {row, col, half:firstHalf},
        {row: row + 1, col, half:secondHalf}
    ];
}

// Check if all placed cells are within the bounds of the grid
function cellsInBounds(cells, size){
    return placed.every(({row, col}) =>
        row >= 0 && row < size && col >= 0 && col < size
    );  
}

// Check if any of the placed cells overlap with non-empty terrain
function cellsAreEmpty(grid, cells){
    return placed.every(({row, col}) => grid[row][col].terrain === "empty");
}

function touchesMatchingTerrain(grid, cells){
    const size = grid.length;
    const itSelf = (r, c) => placed.some(package.row === r && p.col === c);

    return placed.some(({row,col,half}) => {
        const neighbors = [
            [row - 1, col], [row + 1, col],
            [row, col - 1], [row, col + 1]
        ];
        return neighbors.some(([r,c]) => {
            if (r < 0 || r >= size || c < 0 || c >= size) return false; // Out of bounds
            if (itSelf(r,c)) return false; // Don't count the other half of the same domino
            const terrain = grid[r][c].terrain; //matching terrain is either castle or same as the half being placed
            return terrain === "castle" || terrain === half.terrain;
        });
    });
}

// Check if the bounding box of all occupied cells (existing terrain + new placement) fits within KINGDOM_SIZE
function fitsInKingdomBox(grid, placed) {
    const allOccupied = [...placed.map(p => ({ row: p.row, col: p.col }))];
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid.length; c++) {
            if (grid[r][c].terrain !== "empty") {
                allOccupied.push({ row: r, col: c });
            }
        }
    }
    const rows = allOccupied.map(c => c.row);
    const cols = allOccupied.map(c => c.col);
    const rowSpan = Math.max(...rows) - Math.min(...rows);
    const colSpan = Math.max(...cols) - Math.min(...cols);
    return rowSpan < KINGDOM_SIZE && colSpan < KINGDOM_SIZE;
}


/**
 * Create a new game state.
 * @memberof KingdominoGame
 * @param {number} numPlayers - Must be 2 in this implementation.
 * @param {() => number} [rng=Math.random] - Optional RNG; pass a fake for deterministic tests.
 * @returns {GameState}
 */
