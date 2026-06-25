import assert from 'assert';
import {
    scoreGrid,
    isValidPlacement,
    findLegalPlacements,
    getNextDraft,
    createInitialState,
    claimDomino,
    placeDomino,
    advanceRound,
} from '../Module.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Returns a fresh 9×9 grid with only the castle at the centre (4,4). */
function emptyGrid() {
    const g = Array.from({length: 9}, () =>
        Array.from({length: 9}, () => ({terrain: 'empty', crowns: 0}))
    );
    g[4][4] = {terrain: 'castle', crowns: 0};
    return g;
}

/**
 * Returns a new grid with one cell changed — does NOT mutate the original.
 * @param {object[][]} grid
 * @param {number} row
 * @param {number} col
 * @param {string} terrain
 * @param {number} [crowns]
 */
function withCell(grid, row, col, terrain, crowns = 0) {
    return grid.map((r, ri) =>
        r.map((cell, ci) =>
            ri === row && ci === col ? {terrain, crowns} : cell
        )
    );
}

/**
 * Builds a minimal domino object for use in tests.
 * @param {string} leftTerrain
 * @param {string} rightTerrain
 * @param {number} [leftCrowns]
 * @param {number} [rightCrowns]
 */
function makeDomino(leftTerrain, rightTerrain, leftCrowns = 0, rightCrowns = 0) {
    return {
        id: 99, number: 99,
        left:  {terrain: leftTerrain,  crowns: leftCrowns},
        right: {terrain: rightTerrain, crowns: rightCrowns},
    };
}

// ─── scoreGrid ────────────────────────────────────────────────────────────────

describe('scoreGrid', () => {
    it('returns 0 for a grid with only the castle', () => {
        assert.strictEqual(scoreGrid(emptyGrid()), 0);
    });

    it('returns 0 when a region has no crowns', () => {
        // Wheat tile adjacent to castle — no crowns anywhere
        const grid = withCell(emptyGrid(), 4, 5, 'wheat', 0);
        assert.strictEqual(scoreGrid(grid), 0);
    });

    it('scores a single-tile region: 1 tile × 2 crowns = 2', () => {
        const grid = withCell(emptyGrid(), 4, 5, 'wheat', 2);
        assert.strictEqual(scoreGrid(grid), 2);
    });

    it('scores a connected region: 2 tiles, 1 crown total = 2', () => {
        let grid = withCell(emptyGrid(), 4, 5, 'wheat', 1);
        grid     = withCell(grid,        4, 6, 'wheat', 0);
        // 2 tiles × 1 crown = 2
        assert.strictEqual(scoreGrid(grid), 2);
    });

    it('scores two separate regions independently', () => {
        // wheat region: 3 tiles, 1 crown → 3
        let grid = withCell(emptyGrid(), 4, 5, 'wheat', 1);
        grid     = withCell(grid,        4, 6, 'wheat', 0);
        grid     = withCell(grid,        4, 7, 'wheat', 0);
        // forest region (not connected to wheat): 2 tiles, 1 crown → 2
        grid     = withCell(grid,        3, 5, 'forest', 1);
        grid     = withCell(grid,        2, 5, 'forest', 0);
        // total = 3 + 2 = 5
        assert.strictEqual(scoreGrid(grid), 5);
    });
});

// ─── isValidPlacement ─────────────────────────────────────────────────────────

describe('isValidPlacement', () => {
    it('allows a wheat domino placed right of the castle (orientation 0)', () => {
        const domino = makeDomino('wheat', 'wheat');
        // First tile at (4,5), second at (4,6) — both adjacent to/touching castle
        assert.strictEqual(
            isValidPlacement(emptyGrid(), domino, 4, 5, 0),
            true
        );
    });

    it('rejects placement where second tile would be off the board', () => {
        const domino = makeDomino('wheat', 'wheat');
        // First tile at (4,8), orientation 0 → second at (4,9) — out of bounds
        assert.strictEqual(
            isValidPlacement(emptyGrid(), domino, 4, 8, 0),
            false
        );
    });

    it('rejects placement that overlaps an occupied cell', () => {
        const domino = makeDomino('wheat', 'wheat');
        const grid   = withCell(emptyGrid(), 4, 5, 'wheat', 0);
        // Try to place first tile exactly where wheat already sits
        assert.strictEqual(
            isValidPlacement(grid, domino, 4, 5, 0),
            false
        );
    });

    it('rejects placement with no matching adjacency', () => {
        const domino = makeDomino('forest', 'forest');
        // Castle is at (4,4). A forest domino at (3,4)/(2,4) has no
        // adjacent forest or castle neighbour except (4,4), but
        // placing at row=2, col=4 orientation=1 puts tiles at (2,4) and (3,4).
        // (3,4) is adjacent to castle but terrain is forest, not castle match…
        // Actually the rule is: touches castle OR matching terrain.
        // A forest tile next to the castle IS valid (castle counts as match).
        // Test: mine domino far from castle with no mine neighbours → false
        const mineDomino = makeDomino('mine', 'mine');
        assert.strictEqual(
            isValidPlacement(emptyGrid(), mineDomino, 0, 0, 0),
            false
        );
    });

    it('rejects placement that would push the kingdom beyond 5×5', () => {
        // Build a row of wheat from col 1 to col 5 (connected to castle at col 4)
        // Then try to extend to col 6 — that would span col 1–6 = 6 wide
        let grid = emptyGrid();
        grid = withCell(grid, 4, 5, 'wheat', 0);
        grid = withCell(grid, 4, 6, 'wheat', 0);
        grid = withCell(grid, 4, 3, 'wheat', 0);
        grid = withCell(grid, 4, 2, 'wheat', 0);
        grid = withCell(grid, 4, 1, 'wheat', 0);
        // Kingdom now spans cols 1–6 (castle at 4, wheat at 1,2,3,5,6)
        // Wait — col 1 to col 6 is 6 wide already (6-1+1=6). But fitsInKingdom
        // checks the new cells too. Let me build a 5-wide span and then try +1.
        // Cols 2,3,4(castle),5,6 = span 2–6 = 5 wide (exactly at limit).
        // Adding col 7 would make span 2–7 = 6 wide → invalid.
        let grid2 = emptyGrid();
        grid2 = withCell(grid2, 4, 5, 'wheat', 0);
        grid2 = withCell(grid2, 4, 6, 'wheat', 0);
        grid2 = withCell(grid2, 4, 3, 'wheat', 0);
        grid2 = withCell(grid2, 4, 2, 'wheat', 0);
        // Castle at (4,4), wheat at 2,3,5,6 → span cols 2–6 = 5 wide
        const domino = makeDomino('wheat', 'wheat');
        // Placing at (4,7) orientation=0 → second tile at (4,8), span would be 2–8 = 7 wide
        assert.strictEqual(
            isValidPlacement(grid2, domino, 4, 7, 0),
            false
        );
    });
});

// ─── findLegalPlacements ──────────────────────────────────────────────────────

describe('findLegalPlacements', () => {
    it('finds at least one placement on a fresh grid', () => {
        const domino   = makeDomino('wheat', 'wheat');
        const placements = findLegalPlacements(emptyGrid(), domino);
        assert.ok(placements.length > 0);
    });

    it('returns empty array when no legal moves exist', () => {
        // Mine domino on an otherwise-all-wheat board — no adjacent mine
        let grid = emptyGrid();
        // Surround the castle on all four sides with wheat so the whole
        // reachable area is wheat with no mine neighbour
        grid = withCell(grid, 4, 5, 'wheat', 0);
        grid = withCell(grid, 4, 3, 'wheat', 0);
        grid = withCell(grid, 3, 4, 'wheat', 0);
        grid = withCell(grid, 5, 4, 'wheat', 0);
        const mineDomino = makeDomino('mine', 'mine');
        const placements = findLegalPlacements(grid, mineDomino);
        assert.strictEqual(placements.length, 0);
    });

    it('only returns placements for the requested orientation', () => {
        const domino     = makeDomino('wheat', 'wheat');
        const placements = findLegalPlacements(emptyGrid(), domino, 0);
        assert.ok(placements.every(p => p.orientation === 0));
    });
});

// ─── getNextDraft ─────────────────────────────────────────────────────────────

describe('getNextDraft', () => {
    const fakeDeck = [
        {id:5,  number:5,  left:{terrain:'wheat',  crowns:0}, right:{terrain:'wheat',  crowns:0}},
        {id:3,  number:3,  left:{terrain:'forest', crowns:0}, right:{terrain:'forest', crowns:0}},
        {id:1,  number:1,  left:{terrain:'water',  crowns:0}, right:{terrain:'water',  crowns:0}},
        {id:9,  number:9,  left:{terrain:'grass',  crowns:0}, right:{terrain:'grass',  crowns:0}},
        {id:7,  number:7,  left:{terrain:'swamp',  crowns:0}, right:{terrain:'swamp',  crowns:0}},
    ];

    it('draws exactly 2 tiles into slots', () => {
        const {slots} = getNextDraft(fakeDeck);
        assert.strictEqual(slots.length, 2);
    });

    it('leaves the correct number of tiles remaining', () => {
        const {remain} = getNextDraft(fakeDeck);
        assert.strictEqual(remain.length, 3);
    });

    it('sorts drawn tiles by number ascending', () => {
        const {slots} = getNextDraft(fakeDeck);
        assert.ok(slots[0].domino.number < slots[1].domino.number);
    });

    it('sets claimedBy to null on every slot', () => {
        const {slots} = getNextDraft(fakeDeck);
        assert.ok(slots.every(s => s.claimedBy === null));
    });
});

// ─── createInitialState ───────────────────────────────────────────────────────

describe('createInitialState', () => {
    let state;
    before(() => { state = createInitialState(); });

    it('starts in first-claim phase', () => {
        assert.strictEqual(state.phase, 'first-claim');
    });

    it('starts at round 1', () => {
        assert.strictEqual(state.round, 1);
    });

    it('each player grid has a castle at (4,4)', () => {
        state.players.forEach(p => {
            assert.strictEqual(p.grid[4][4].terrain, 'castle');
        });
    });

    it('draws exactly 2 tiles into nextDraft', () => {
        assert.strictEqual(state.nextDraft.length, 2);
    });

    it('deck has 22 tiles remaining (24 used in game, 2 already in draft)', () => {
        assert.strictEqual(state.deck.length, 22);
    });
});

// ─── claimDomino ─────────────────────────────────────────────────────────────

describe('claimDomino', () => {
    let base;
    before(() => {
        base = createInitialState();
        // Force player 0 to go first for deterministic tests
        base = {...base, firstClaimer: 0};
    });

    it('gives the chosen domino to the claiming player', () => {
        const chosen = base.nextDraft[0].domino;
        const next   = claimDomino(base, 0, 0);
        assert.strictEqual(next.players.find(p => p.id === 0).claimedDomino, chosen);
    });

    it('auto-assigns the other domino to the opponent', () => {
        const other = base.nextDraft[1].domino;
        const next  = claimDomino(base, 0, 0);
        assert.strictEqual(next.players.find(p => p.id === 1).claimedDomino, other);
    });

    it('transitions phase to placing', () => {
        const next = claimDomino(base, 0, 0);
        assert.strictEqual(next.phase, 'placing');
    });

    it('sets firstClaimer to the player who took the lower-numbered tile', () => {
        // nextDraft is sorted ascending, so slot 0 always has the lower number
        const next = claimDomino(base, 0, 0); // player 0 takes slot 0 (lower number)
        assert.strictEqual(next.firstClaimer, 0);
    });
});

// ─── placeDomino ─────────────────────────────────────────────────────────────

describe('placeDomino', () => {
    let placing;
    before(() => {
        let s = createInitialState();
        s = {...s, firstClaimer: 0};
        placing = claimDomino(s, 0, 0); // phase = 'placing'
    });

    it('sets hasPlaced to true for the placing player', () => {
        const player = placing.players.find(p => p.id === 0);
        const moves  = findLegalPlacements(player.grid, player.claimedDomino);
        const next   = placeDomino(placing, 0, moves[0]);
        assert.strictEqual(next.players.find(p => p.id === 0).hasPlaced, true);
    });

    it('clears claimedDomino after placing', () => {
        const player = placing.players.find(p => p.id === 0);
        const moves  = findLegalPlacements(player.grid, player.claimedDomino);
        const next   = placeDomino(placing, 0, moves[0]);
        assert.strictEqual(next.players.find(p => p.id === 0).claimedDomino, null);
    });

    it('updates the grid cell to the correct terrain', () => {
        const player = placing.players.find(p => p.id === 0);
        const domino = player.claimedDomino;
        const moves  = findLegalPlacements(player.grid, domino);
        const m      = moves[0];
        const next   = placeDomino(placing, 0, m);
        const newGrid = next.players.find(p => p.id === 0).grid;
        assert.strictEqual(newGrid[m.row][m.col].terrain, domino.left.terrain);
    });

    it('discards cleanly when placement is null', () => {
        const next = placeDomino(placing, 0, null);
        assert.strictEqual(next.players.find(p => p.id === 0).claimedDomino, null);
        assert.strictEqual(next.players.find(p => p.id === 0).hasPlaced, true);
    });

    it('throws when placement position is invalid', () => {
        // (0,0) orientation 0 → (0,1): far from castle, no adjacency
        assert.throws(() => placeDomino(placing, 0, {row: 0, col: 0, orientation: 0}));
    });
});

// ─── advanceRound ─────────────────────────────────────────────────────────────

describe('advanceRound', () => {
    /** Builds a state where both players have placed. */
    function bothPlacedState(deckOverride) {
        let s = createInitialState();
        s = {...s, firstClaimer: 0};
        if (deckOverride !== undefined) { s = {...s, deck: deckOverride}; }
        s = claimDomino(s, 0, 0);

        const p0 = s.players.find(p => p.id === 0);
        const p1 = s.players.find(p => p.id === 1);
        const m0 = findLegalPlacements(p0.grid, p0.claimedDomino)[0];
        s = placeDomino(s, 0, m0 ?? null);
        const m1 = findLegalPlacements(p1.grid, p1.claimedDomino)[0];
        s = placeDomino(s, 1, m1 ?? null);
        return s;
    }

    it('increments the round counter when deck still has tiles', () => {
        const s    = bothPlacedState();
        const next = advanceRound(s);
        assert.strictEqual(next.round, s.round + 1);
    });

    it('transitions to final-place when the deck is empty', () => {
        const s    = bothPlacedState([]);   // force empty deck
        const next = advanceRound(s);
        assert.strictEqual(next.phase, 'final-place');
    });

    it('transitions to game-over from final-place when both have placed', () => {
        const finalState = {
            ...bothPlacedState([]),
            phase: 'final-place',
            players: bothPlacedState([]).players.map(p => ({...p, hasPlaced: true})),
        };
        const next = advanceRound(finalState);
        assert.strictEqual(next.phase, 'game-over');
    });
});
