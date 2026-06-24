/**
 * @file main.js
 * DOM layer for the 2-player Kingdomino web app.
 *
 * Responsibilities:
 *   - Import pure game logic from ./game-module1.js
 *   - Maintain one mutable `state` reference and one `pending` placement object
 *   - Re-render the entire UI after every user action
 *
 * No game logic lives here — all rules are enforced by game-module1.
 */

import {
    createInitialState,
    claimDomino,
    placeDomino,
    advanceRound,
    scoreGrid,
    isValidPlacement,
    findLegalPlacements,
} from './game-module1.js';

// ─── Module-level mutable state ───────────────────────────────────────────────

/** @type {import('./game-module1.js').GameState} */
let state = createInitialState();

/**
 * Tracks where the active player is hovering and which orientation they chose.
 * row/col update on mousemove; orientation cycles on right-click.
 * Reset to defaults after every place / discard / claim.
 * @type {{ row: number|null, col: number|null, orientation: number }}
 */
let pending = { row: null, col: null, orientation: 0 };

/** @type {'setup'|'game'} */
let appScreen = 'setup';

/** @type {string[]} Names for player 0 and player 1. */
let playerNames = ['Player 1', 'Player 2'];

/** @type {'2p'|'vs-ai'} */
let gameMode = '2p';

/** True after one player places but before the other player's turn begins. */
let pendingEndTurn = false;

// ─── Terrain display maps ─────────────────────────────────────────────────────

/** @type {Record<import('./game-module1.js').Terrain, string>} */
const TERRAIN_BG = {
    empty:  '#ddd9c4',
    castle: '#9e9e9e',
    wheat:  '#f5d060',
    forest: '#2e7d32',
    water:  '#1565c0',
    grass:  '#7cb342',
    swamp:  '#6d4c41',
    mine:   '#546e7a',
};

/** @type {Record<import('./game-module1.js').Terrain, string>} */
const TERRAIN_ICON = {
    empty:  '',
    castle: '🏰',
    wheat:  '🌾',
    forest: '🌲',
    water:  '🌊',
    grass:  '🍀',
    swamp:  '🌫️',
    mine:   '⛏️',
};

/** Terrains whose icon needs white text to be readable. */
const DARK_TERRAINS = new Set(['forest', 'water', 'swamp', 'mine']);

// ─── Pure helper functions ────────────────────────────────────────────────────

/**
 * Returns the id of the player who should act next.
 * Uses find-by-id so it is correct even when claimDomino reorders the array.
 * @param {import('./game-module1.js').GameState} st
 * @returns {number}
 */
function activePlayerId(st) {
    if (st.phase === 'first-claim') {
        return st.firstClaimer;
    }
    if (st.phase === 'placing' || st.phase === 'final-place') {
        const first = st.players.find(p => p.id === st.firstClaimer);
        return first.hasPlaced ? 1 - st.firstClaimer : st.firstClaimer;
    }
    return 0;
}

/**
 * Returns the position of the second tile given the first tile and orientation.
 * 0 = right, 1 = down, 2 = left, 3 = up.
 * @param {number} row
 * @param {number} col
 * @param {number} orientation
 * @returns {{ row: number, col: number }}
 */
function secondTile(row, col, orientation) {
    if (orientation === 0) { return { row,       col: col + 1 }; }
    if (orientation === 1) { return { row: row + 1, col       }; }
    if (orientation === 2) { return { row,       col: col - 1 }; }
    return                          { row: row - 1, col       };
}

/**
 * Returns per-region score breakdown for a grid.
 * Each entry is one connected component of same terrain.
 * @param {import('./game-module1.js').Grid} grid
 * @returns {{ terrain: string, size: number, crowns: number, score: number }[]}
 */
function getScoreBreakdown(grid) {
    const GRID_SIZE = 9;
    const visited   = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    const regions   = [];

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (visited[r][c]) { continue; }
            const terrain = grid[r][c].terrain;
            if (terrain === 'empty' || terrain === 'castle') {
                visited[r][c] = true;
                continue;
            }

            // Flood fill this region
            const stack = [[r, c]];
            const cells = [];
            while (stack.length > 0) {
                const [row, col] = stack.pop();
                if (row < 0 || row >= GRID_SIZE ||
                    col < 0 || col >= GRID_SIZE) { continue; }
                if (visited[row][col]) { continue; }
                if (grid[row][col].terrain !== terrain) { continue; }
                visited[row][col] = true;
                cells.push(grid[row][col]);
                stack.push(
                    [row - 1, col], [row + 1, col],
                    [row, col - 1], [row, col + 1]
                );
            }

            const crowns = cells.reduce((s, cell) => s + cell.crowns, 0);
            regions.push({
                terrain,
                size:   cells.length,
                crowns,
                score:  cells.length * crowns,
            });
        }
    }

    return regions;
}

/**
 * If the active player has no legal placements for their held domino,
 * automatically discards it and advances the round if needed.
 * Loops until no more auto-discards are required.
 * This handles the "grid is full" case.
 */
function normalizeState() {
    let changed = true;
    while (changed) {
        changed = false;
        if (state.phase !== 'placing' && state.phase !== 'final-place') { break; }

        // Also stop if effective phase is game-over
        if (state.players.every(p => p.claimedDomino === null) &&
            state.nextDraft.length === 0 && state.deck.length === 0) { break; }

        const id     = activePlayerId(state);
        const player = state.players.find(p => p.id === id);
        if (!player || !player.claimedDomino) { break; }

        const legal = findLegalPlacements(player.grid, player.claimedDomino);
        if (legal.length === 0) {
            state = placeDomino(state, id, null);
            if (state.players.every(p => p.hasPlaced)) {
                state = advanceRound(state);
            }
            changed = true;
        }
    }
}

/**
 * Returns the 5×5 bounding box around all placed tiles (including castle).
 * Starts at the castle, expands to cover every non-empty cell,
 * then pads the smaller dimension until the box is exactly 5×5.
 * @param {import('./game-module1.js').Grid} grid
 * @returns {{ minR: number, maxR: number, minC: number, maxC: number }}
 */
function getKingdomBounds(grid) {
    let minR = 4, maxR = 4, minC = 4, maxC = 4;
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (grid[r][c].terrain !== 'empty') {
                minR = Math.min(minR, r); maxR = Math.max(maxR, r);
                minC = Math.min(minC, c); maxC = Math.max(maxC, c);
            }
        }
    }
    // Padding added to EACH side based on tight span:
    //   span 1–3  →  2 on each side
    //   span 4    →  1 on each side
    //   span 5    →  0
    function expandAxis(lo, hi) {
        const span = hi - lo + 1;
        const pad  = span <= 3 ? 2 : span === 4 ? 1 : 0;
        lo = Math.max(0, lo - pad);
        hi = Math.min(8, hi + pad);
        return [lo, hi];
    }
    [minR, maxR] = expandAxis(minR, maxR);
    [minC, maxC] = expandAxis(minC, maxC);
    return { minR, maxR, minC, maxC };
}

// ─── DOM builder functions ────────────────────────────────────────────────────

/**
 * Builds one 9×9 grid div for a player.
 *
 * During the active player's placing turn:
 *   - Hovering shows the domino preview on the board (actual terrain colours)
 *   - Green border = valid placement, red border = invalid
 *   - Left click  → place at current hover position (only if valid)
 *   - Right click → rotate orientation +1
 *   - Mouse leaving the grid clears the preview
 *
 * @param {import('./game-module1.js').Player} player
 * @param {boolean} isActive
 * @param {number} activeId
 * @param {'normal'|'large'|'small'} [size]
 * @returns {HTMLElement}
 */
function buildGrid(player, isActive, activeId, size = 'normal') {
    const grid = document.createElement('div');
    const sizeClass = size === 'large' ? ' grid--large'
                    : size === 'small' ? ' grid--small' : '';
    grid.className = 'grid' + (isActive ? ' grid--active' : '') + sizeClass;

    const bounds = getKingdomBounds(player.grid);

    const canInteract = isActive &&
        (state.phase === 'placing' || state.phase === 'final-place') &&
        player.claimedDomino !== null;

    // Pre-compute preview data
    let tile2         = null;
    let tile2InBounds = false;
    let validPlace    = false;

    if (canInteract && pending.row !== null) {
        tile2 = secondTile(pending.row, pending.col, pending.orientation);
        tile2InBounds =
            tile2.row >= 0 && tile2.row < 9 &&
            tile2.col >= 0 && tile2.col < 9;
        validPlace = isValidPlacement(
            player.grid, player.claimedDomino,
            pending.row, pending.col, pending.orientation
        );
    }

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const cell    = player.grid[r][c];
            const div     = document.createElement('div');
            const isFaint = r < bounds.minR || r > bounds.maxR ||
                            c < bounds.minC || c > bounds.maxC;
            div.className = 'cell' + (isFaint ? ' cell--faint' : '');

            const isFirst  = canInteract && pending.row !== null &&
                             r === pending.row && c === pending.col;
            const isSecond = canInteract && tile2InBounds &&
                             r === tile2.row  && c === tile2.col;

            if (isFirst) {
                const half = player.claimedDomino.left;
                div.style.background = TERRAIN_BG[half.terrain];
                div.textContent = half.crowns > 0
                    ? '👑'.repeat(half.crowns)
                    : TERRAIN_ICON[half.terrain];
                div.classList.add(validPlace ? 'cell--preview-ok' : 'cell--preview-bad');

            } else if (isSecond) {
                const half = player.claimedDomino.right;
                div.style.background = TERRAIN_BG[half.terrain];
                div.textContent = half.crowns > 0
                    ? '👑'.repeat(half.crowns)
                    : TERRAIN_ICON[half.terrain];
                div.classList.add(validPlace ? 'cell--preview-ok' : 'cell--preview-bad');

            } else {
                div.style.background = TERRAIN_BG[cell.terrain];
                if (cell.crowns > 0) {
                    div.textContent = '👑'.repeat(cell.crowns);
                } else if (TERRAIN_ICON[cell.terrain]) {
                    div.textContent = TERRAIN_ICON[cell.terrain];
                }
            }

            grid.appendChild(div);
        }
    }

    if (canInteract) {
        grid.style.cursor = 'crosshair';

        grid.addEventListener('mousemove', (e) => {
            const rect = grid.getBoundingClientRect();
            const r = Math.floor((e.clientY - rect.top)  / (rect.height / 9));
            const c = Math.floor((e.clientX - rect.left) / (rect.width  / 9));
            if (r >= 0 && r < 9 && c >= 0 && c < 9) {
                if (pending.row !== r || pending.col !== c) {
                    pending.row = r;
                    pending.col = c;
                    render();
                }
            }
        });

        grid.addEventListener('mouseleave', () => {
            pending.row = null;
            pending.col = null;
            render();
        });

        // Left click → place (only when valid)
        grid.addEventListener('click', () => {
            if (pending.row === null) { return; }
            if (!isValidPlacement(
                player.grid, player.claimedDomino,
                pending.row, pending.col, pending.orientation
            )) { return; }

            state = placeDomino(state, activeId, {
                row: pending.row,
                col: pending.col,
                orientation: pending.orientation,
            });
            pending = { row: null, col: null, orientation: 0 };
            if (state.players.every(p => p.hasPlaced)) {
                state = advanceRound(state);
            } else {
                pendingEndTurn = true;
            }
            render();
        });

        // Right click → rotate orientation +1
        grid.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            pending.orientation = (pending.orientation + 1) % 4;
            render();
        });
    }

    return grid;
}

/**
 * Builds a live score breakdown table for a player.
 * Each row is one connected region; shows terrain, tiles, crowns, and score.
 * @param {import('./game-module1.js').Player} player
 * @returns {HTMLElement}
 */
function buildScoreTable(player) {
    const regions = getScoreBreakdown(player.grid);
    const total   = regions.reduce((s, r) => s + r.score, 0);

    const table       = document.createElement('table');
    table.className   = 'score-table';

    // ── Header ──
    const thead = document.createElement('thead');
    const hrow  = document.createElement('tr');
    ['Terrain', 'Tiles', '👑', 'Score'].forEach(text => {
        const th       = document.createElement('th');
        th.textContent = text;
        hrow.appendChild(th);
    });
    thead.appendChild(hrow);
    table.appendChild(thead);

    // ── Body ──
    const tbody = document.createElement('tbody');
    if (regions.length === 0) {
        const row  = document.createElement('tr');
        const td   = document.createElement('td');
        td.colSpan = 4;
        td.style.textAlign = 'center';
        td.textContent     = '—';
        row.appendChild(td);
        tbody.appendChild(row);
    } else {
        regions.forEach(({ terrain, size, crowns, score }) => {
            const row = document.createElement('tr');

            const terrainTd       = document.createElement('td');
            terrainTd.textContent = TERRAIN_ICON[terrain] + ' ' + terrain;
            terrainTd.style.background = TERRAIN_BG[terrain];
            if (DARK_TERRAINS.has(terrain)) {
                terrainTd.style.color = '#fff';
            }
            row.appendChild(terrainTd);

            [size, crowns, score].forEach(val => {
                const td       = document.createElement('td');
                td.textContent = val;
                row.appendChild(td);
            });

            tbody.appendChild(row);
        });
    }
    table.appendChild(tbody);

    // ── Footer ──
    const tfoot     = document.createElement('tfoot');
    const frow      = document.createElement('tr');
    const cells     = ['Total', '', '', total];
    cells.forEach(val => {
        const td       = document.createElement('td');
        td.textContent = val;
        frow.appendChild(td);
    });
    tfoot.appendChild(frow);
    table.appendChild(tfoot);

    return table;
}

/**
 * Builds a domino preview strip: two half-cell divs side by side.
 * @param {import('./game-module1.js').Domino} domino
 * @returns {HTMLElement}
 */
function buildDomino(domino) {
    const wrapper     = document.createElement('div');
    wrapper.className = 'domino';

    [domino.left, domino.right].forEach(half => {
        const div       = document.createElement('div');
        div.className   = 'domino-half';
        div.style.background = TERRAIN_BG[half.terrain];
        div.textContent = half.crowns > 0
            ? '👑'.repeat(half.crowns)
            : TERRAIN_ICON[half.terrain];
        wrapper.appendChild(div);
    });

    return wrapper;
}

/**
 * Builds the claim panel — shown when players need to pick from nextDraft.
 * Clicking a slot calls claimDomino for state.firstClaimer; the other player
 * is auto-assigned the remaining slot.
 * @returns {HTMLElement}
 */
function buildClaimPanel() {
    const panel       = document.createElement('div');
    panel.className   = 'claim-panel';

    const title       = document.createElement('p');
    title.textContent = `${playerNames[state.firstClaimer]}: pick a domino`;
    panel.appendChild(title);

    const row       = document.createElement('div');
    row.className   = 'slots-row';

    state.nextDraft.forEach((slot, i) => {
        const slotDiv     = document.createElement('div');
        slotDiv.className = 'draft-slot';

        const num       = document.createElement('p');
        num.textContent = `#${slot.domino.number}`;
        slotDiv.appendChild(num);
        slotDiv.appendChild(buildDomino(slot.domino));

        slotDiv.addEventListener('click', () => {
            state = claimDomino(state, state.firstClaimer, i);
            pending = { row: null, col: null, orientation: 0 };
            render();
        });

        row.appendChild(slotDiv);
    });

    panel.appendChild(row);
    return panel;
}

/**
 * Builds the placing controls: orientation hint + Discard button.
 * Placement is done by left-clicking the grid.
 * @param {number} activeId
 * @returns {HTMLElement}
 */
function buildControls(activeId) {
    const panel     = document.createElement('div');
    panel.className = 'controls';

    const hint       = document.createElement('span');
    hint.className   = 'orient-label';
    const arrows     = ['→', '↓', '←', '↑'];
    hint.textContent =
        `Orientation: ${arrows[pending.orientation]}` +
        `  |  left-click grid to place  |  right-click to rotate`;
    panel.appendChild(hint);

    const discardBtn       = document.createElement('button');
    discardBtn.textContent = 'Discard';
    discardBtn.addEventListener('click', () => {
        state = placeDomino(state, activeId, null);
        pending = { row: null, col: null, orientation: 0 };
        if (state.players.every(p => p.hasPlaced)) {
            state = advanceRound(state);
        } else {
            pendingEndTurn = true;
        }
        render();
    });
    panel.appendChild(discardBtn);

    return panel;
}

// ─── End-turn handoff screen ─────────────────────────────────────────────────

/**
 * Shown after one player places and before the other player's turn begins.
 * Hides both boards so the next player can take the device privately.
 * @param {number} nextPlayerId
 * @returns {HTMLElement}
 */
function buildEndTurnScreen(nextPlayerId) {
    const screen       = document.createElement('div');
    screen.className   = 'end-turn-screen';

    const msg       = document.createElement('p');
    msg.textContent = `Pass the device to ${playerNames[nextPlayerId]}`;
    screen.appendChild(msg);

    const btn       = document.createElement('button');
    btn.className   = 'btn--active';
    btn.textContent = `Start ${playerNames[nextPlayerId]}'s turn`;
    btn.addEventListener('click', () => {
        pendingEndTurn = false;
        pending = { row: null, col: null, orientation: 0 };
        render();
    });
    screen.appendChild(btn);

    return screen;
}

// ─── Setup screen ────────────────────────────────────────────────────────────

/**
 * Builds the start-of-game setup screen.
 * Player names and game mode are written to module-level variables on "Start".
 * @returns {HTMLElement}
 */
function buildSetupScreen() {
    const screen       = document.createElement('div');
    screen.className   = 'setup-screen';

    const title       = document.createElement('h1');
    title.textContent = 'Kingdomino';
    screen.appendChild(title);

    const sub       = document.createElement('p');
    sub.className   = 'setup-subtitle';
    sub.textContent = 'Build your kingdom — domino by domino';
    screen.appendChild(sub);

    // ── Player 1 name ──
    const p1field     = document.createElement('div');
    p1field.className = 'setup-field';
    const p1label       = document.createElement('label');
    p1label.textContent = 'Player 1 name';
    const p1input   = document.createElement('input');
    p1input.type    = 'text';
    p1input.value   = playerNames[0];
    p1field.appendChild(p1label);
    p1field.appendChild(p1input);
    screen.appendChild(p1field);

        // ── Mode toggle ──
    const modeDiv     = document.createElement('div');
    modeDiv.className = 'setup-mode';
    const twoPlayerBtn       = document.createElement('button');
    twoPlayerBtn.textContent = '2 Players';
    const vsAiBtn       = document.createElement('button');
    vsAiBtn.textContent = 'vs Computer';
    modeDiv.appendChild(twoPlayerBtn);
    modeDiv.appendChild(vsAiBtn);
    screen.appendChild(modeDiv);

    // ── Player 2 name ──
    const p2field     = document.createElement('div');
    p2field.className = 'setup-field';
    const p2label     = document.createElement('label');
    const p2input     = document.createElement('input');
    p2input.type      = 'text';
    p2field.appendChild(p2label);
    p2field.appendChild(p2input);
    screen.appendChild(p2field);

    // Apply mode without re-rendering the whole page
    function applyMode(mode) {
        gameMode = mode;
        twoPlayerBtn.classList.toggle('btn--active', mode === '2p');
        vsAiBtn.classList.toggle('btn--active',      mode === 'vs-ai');
        p2label.textContent = mode === '2p' ? 'Player 2 name' : 'Opponent';
        p2input.disabled    = mode === 'vs-ai';
        p2input.value       = mode === 'vs-ai' ? 'Computer' : playerNames[1];
    }
    twoPlayerBtn.addEventListener('click', () => applyMode('2p'));
    vsAiBtn.addEventListener('click',      () => applyMode('vs-ai'));
    applyMode(gameMode);

    // ── Start Game ──
    const startBtn       = document.createElement('button');
    startBtn.textContent = 'Start Game';
    startBtn.addEventListener('click', () => {
        playerNames[0] = p1input.value.trim() || 'Player 1';
        playerNames[1] = gameMode === 'vs-ai'
            ? 'Computer'
            : (p2input.value.trim() || 'Player 2');
        state          = createInitialState();
        pending        = { row: null, col: null, orientation: 0 };
        pendingEndTurn = false;
        appScreen      = 'game';
        render();
    });
    screen.appendChild(startBtn);

    return screen;
}

// ─── Round tracker ───────────────────────────────────────────────────────────

/**
 * Builds a row of 12 numbered dots showing game progress.
 * Completed rounds are grey, the current round is gold, future rounds are empty.
 * @param {'first-claim'|'placing'|'final-place'|'game-over'} effectivePhase
 * @returns {HTMLElement}
 */
function buildRoundTracker(effectivePhase) {
    const TOTAL_ROUNDS = 12;
    const nav       = document.createElement('div');
    nav.className   = 'round-tracker';

    const label       = document.createElement('span');
    label.className   = 'round-tracker__label';
    label.textContent = 'Rounds:';
    nav.appendChild(label);

    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
        const dot     = document.createElement('div');
        const isDone  = effectivePhase === 'game-over' || r < state.round;
        const isNow   = effectivePhase !== 'game-over' && r === state.round;
        dot.className = 'round-dot' +
            (isDone ? ' round-dot--done' : isNow ? ' round-dot--active' : ' round-dot--future');
        dot.textContent = r;
        nav.appendChild(dot);
    }

    return nav;
}

// ─── Root render ──────────────────────────────────────────────────────────────

/**
 * Wipes #app and rebuilds the whole UI from state and pending.
 *
 * Layout:
 *  1. Header — round, active player, New Game button
 *  2. Both grids side by side; score table next to each grid;
 *     each player's held domino shown below their grid
 *  3. Claim panel  (when players have no held domino and nextDraft has slots)
 *  4. Placing controls (orientation hint + Discard)
 *  5. Game-over banner
 */
function render() {
    const app = document.querySelector('#app');
    app.innerHTML = '';

    if (appScreen === 'setup') {
        app.appendChild(buildSetupScreen());
        return;
    }

    if (pendingEndTurn) {
        app.appendChild(buildEndTurnScreen(activePlayerId(state)));
        return;
    }

    // Auto-discard when the active player has no legal placements (grid full)
    normalizeState();

    const activeId = activePlayerId(state);

    // final-place with no held dominos → treat as game-over
    const effectivePhase =
        state.phase === 'final-place' &&
        state.players.every(p => p.claimedDomino === null)
            ? 'game-over'
            : state.phase;

    const needsToClaim =
        effectivePhase !== 'game-over' &&
        state.players.every(p => p.claimedDomino === null) &&
        state.nextDraft.length > 0;

    // ── 1. Header ──
    const header     = document.createElement('div');
    header.className = 'header';

    const logo       = document.createElement('span');
    logo.className   = 'header__logo';
    logo.textContent = 'Kingdomino';
    header.appendChild(logo);

    const info       = document.createElement('h2');
    info.textContent = effectivePhase === 'game-over'
        ? 'Game Over!'
        : `Round ${state.round} / 12 — ${playerNames[activeId]}'s turn`;
    header.appendChild(info);

    const newGameBtn       = document.createElement('button');
    newGameBtn.textContent = 'New Game';
    newGameBtn.addEventListener('click', () => {
        appScreen = 'setup';
        pending   = { row: null, col: null, orientation: 0 };
        render();
    });
    header.appendChild(newGameBtn);
    app.appendChild(header);
    app.appendChild(buildRoundTracker(effectivePhase));

    // ── Game-over: normal side-by-side layout + banner ──
    if (effectivePhase === 'game-over') {
        const gridsRow     = document.createElement('div');
        gridsRow.className = 'grids-row';
        state.players.forEach(player => {
            const wrapper     = document.createElement('div');
            wrapper.className = 'grid-wrapper';
            const label       = document.createElement('p');
            label.className   = 'player-label';
            label.textContent = playerNames[player.id];
            wrapper.appendChild(label);
            const gridAndTable     = document.createElement('div');
            gridAndTable.className = 'grid-and-table';
            gridAndTable.appendChild(buildGrid(player, false, activeId));
            gridAndTable.appendChild(buildScoreTable(player));
            wrapper.appendChild(gridAndTable);
            gridsRow.appendChild(wrapper);
        });
        app.appendChild(gridsRow);

        const banner     = document.createElement('div');
        banner.className = 'game-over-banner';
        const scores = state.players
            .map(p => ({ id: p.id, score: scoreGrid(p.grid) }))
            .sort((a, b) => b.score - a.score);
        const winnerText = scores[0].score > scores[1].score
            ? `${playerNames[scores[0].id]} wins!`
            : 'It\'s a draw!';
        const msg       = document.createElement('p');
        msg.textContent = winnerText;
        banner.appendChild(msg);
        scores.forEach(({ id, score }) => {
            const p       = document.createElement('p');
            p.textContent = `${playerNames[id]}: ${score} points`;
            banner.appendChild(p);
        });
        app.appendChild(banner);
        return;
    }

    // ── Claiming: normal side-by-side layout + claim panel ──
    if (needsToClaim || effectivePhase === 'first-claim') {
        const gridsRow     = document.createElement('div');
        gridsRow.className = 'grids-row';
        state.players.forEach(player => {
            const isActive = player.id === activeId;
            const wrapper     = document.createElement('div');
            wrapper.className = 'grid-wrapper';
            const label       = document.createElement('p');
            label.className   = 'player-label';
            label.textContent = playerNames[player.id];
            wrapper.appendChild(label);
            const gridAndTable     = document.createElement('div');
            gridAndTable.className = 'grid-and-table';
            gridAndTable.appendChild(buildGrid(player, isActive, activeId));
            gridAndTable.appendChild(buildScoreTable(player));
            wrapper.appendChild(gridAndTable);
            gridsRow.appendChild(wrapper);
        });
        app.appendChild(gridsRow);
        app.appendChild(buildClaimPanel());
        return;
    }

    // ── Placing / final-place: focus layout ──
    const activePlayer   = state.players.find(p => p.id === activeId);
    const opponentPlayer = state.players.find(p => p.id !== activeId);

    const layout     = document.createElement('div');
    layout.className = 'layout--placing';

    // Opponent panel — small grid on the left
    const opponentPanel     = document.createElement('div');
    opponentPanel.className = 'opponent-panel';
    const oppLabel       = document.createElement('p');
    oppLabel.className   = 'player-label';
    oppLabel.textContent =
        `${playerNames[opponentPlayer.id]} — ${scoreGrid(opponentPlayer.grid)} pts`;
    opponentPanel.appendChild(oppLabel);
    opponentPanel.appendChild(buildGrid(opponentPlayer, false, activeId, 'small'));
    if (opponentPlayer.claimedDomino) {
        const waitLabel       = document.createElement('p');
        waitLabel.className   = 'hold-label';
        waitLabel.textContent = '⏳ Waiting to place:';
        opponentPanel.appendChild(waitLabel);
        opponentPanel.appendChild(buildDomino(opponentPlayer.claimedDomino));
    }
    opponentPanel.appendChild(buildScoreTable(opponentPlayer));
    layout.appendChild(opponentPanel);

    // Active panel — large grid on the right
    const activePanel     = document.createElement('div');
    activePanel.className = 'active-panel';
    const actLabel       = document.createElement('p');
    actLabel.className   = 'player-label';
    actLabel.textContent = `${playerNames[activeId]} — Your turn`;
    activePanel.appendChild(actLabel);
    activePanel.appendChild(buildGrid(activePlayer, true, activeId, 'large'));
    if (activePlayer.claimedDomino) {
        const holdLabel       = document.createElement('p');
        holdLabel.className   = 'hold-label';
        holdLabel.textContent = '▶ Hover to place, right-click to rotate:';
        activePanel.appendChild(holdLabel);
        activePanel.appendChild(buildDomino(activePlayer.claimedDomino));
        activePanel.appendChild(buildControls(activeId));
    }
    activePanel.appendChild(buildScoreTable(activePlayer));
    layout.appendChild(activePanel);
    app.appendChild(layout);
}

render();
