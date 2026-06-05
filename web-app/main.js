/**
 * @file main.js
 * DOM layer for the 2-player Kingdomino web app.
 *
 * Responsibilities:
 *   - Import pure game logic from ./game-module.js
 *   - Maintain one mutable `state` reference and one `pending` placement object
 *   - Re-render the entire UI after every user action
 *   - Wire all DOM events (new game, claim, grid-click, orientation, flip, place, discard)
 *
 * No game logic lives here — all rules are enforced by game-module.
 */

import {
    createInitialState,
    claimDomino,
    placeDomino,
    scoreGrid,
    isValidPlacement,
    findLegalPlacements,
} from './game-module1.js';

// ─── Module-level mutable state ───────────────────────────────────────────────

/** @type {import('./game-module.js').GameState} */
let state = createInitialState();

/**
 * Placement being assembled by the active player's grid clicks and controls.
 * Reset to defaults after every place / discard / claim that changes the active player.
 * @type {{ row: number|null, col: number|null, orientation: 'horizontal'|'vertical', flipped: boolean }}
 */
let pending = { row: null, col: null, orientation: 'horizontal', flipped: false };

// ─── Terrain display maps ─────────────────────────────────────────────────────

/** @type {Record<import('./game-module.js').Terrain, string>} */
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

/** @type {Record<import('./game-module.js').Terrain, string>} */
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

// ─── Root render ──────────────────────────────────────────────────────────────

/**
 * Rebuild the entire app UI from `state` and `pending`, then bind events.
 * Called once on load and once after every state change.
 */
function render() {
    document.getElementById('app').innerHTML = buildApp();
    bindEvents();
}

// ─── Page-level builder ───────────────────────────────────────────────────────

function buildApp() {
    return `
<header class="header">
    <h1 class="title">Kingdomino</h1>
    <div class="meta">
        <span>Round <b>${state.round}</b> / 12</span>
        <span>Phase: <b>${state.phase.replace(/-/g, ' ')}</b></span>
        ${state.phase !== 'game-over'
            ? `<span>Turn: <b>Player ${state.activePlayer + 1}</b></span>`
            : ''}
    </div>
    <button class="btn btn--secondary" id="btn-new-game">New Game</button>
</header>

<div class="board">
    ${state.players.map(p => buildPlayer(p)).join('')}
</div>

${state.phase !== 'game-over' ? buildDrafts()   : ''}
${state.phase !== 'game-over' ? buildControls() : ''}
${state.phase === 'game-over' ? buildGameOver() : ''}
    `.trim();
}

// ─── Player panel ─────────────────────────────────────────────────────────────

/**
 * @param {import('./game-module.js').Player} player
 */
function buildPlayer(player) {
    const isActive = state.activePlayer === player.id && state.phase !== 'game-over';
    const score    = scoreGrid(player.grid);
    const held     = player.claimedDomino;

    return `
<section class="player ${isActive ? 'player--active' : ''}" id="player-${player.id}">
    <header class="player-header">
        <h2>Player ${player.id + 1}</h2>
        <span class="player-score">${score} pts</span>
    </header>
    ${held
        ? `<div class="held-domino"><span class="held-label">Holding:</span>${buildDomino(held)}</div>`
        : ''}
    <div class="grid-wrap">${buildGrid(player.grid, player.id, isActive)}</div>
</section>`;
}

/**
 * Render the 9×9 grid as an HTML table.
 * When it is this player's turn to place, empty cells are clickable and legal
 * anchor positions are highlighted in green.
 *
 * @param {import('./game-module.js').Grid}   grid
 * @param {number}  playerId
 * @param {boolean} isActive  - Whether it is this player's turn
 */
function buildGrid(grid, playerId, isActive) {
    const activeDomino = state.players[state.activePlayer]?.claimedDomino ?? null;
    const placing      = isActive && activeDomino !== null &&
        (state.phase === 'place-and-claim' || state.phase === 'final-place');

    // Collect anchor cells that lead to at least one legal placement
    const legalAnchors = new Set();
    if (placing) {
        for (const p of findLegalPlacements(grid, activeDomino)) {
            legalAnchors.add(`${p.row},${p.col}`);
        }
    }

    let html = '<table class="grid"><tbody>';
    for (let r = 0; r < grid.length; r++) {
        html += '<tr>';
        for (let c = 0; c < grid[r].length; c++) {
            const cell      = grid[r][c];
            const key       = `${r},${c}`;
            const selected  = isActive && pending.row === r && pending.col === c;
            const legal     = placing && !selected && legalAnchors.has(key);
            const clickable = placing && cell.terrain === 'empty';

            const cls = [
                'cell',
                selected  ? 'cell--selected'  : '',
                legal     ? 'cell--legal'     : '',
                clickable ? 'cell--clickable' : '',
            ].filter(Boolean).join(' ');

            html += `<td
                class="${cls}"
                style="background:${TERRAIN_BG[cell.terrain]}"
                ${clickable ? `data-player="${playerId}" data-row="${r}" data-col="${c}"` : ''}
                title="${cell.terrain}${cell.crowns ? ` · ${cell.crowns}♕` : ''}">
                <span class="cell-icon">${TERRAIN_ICON[cell.terrain]}</span>
                ${cell.crowns ? `<span class="cell-crown">${'♕'.repeat(cell.crowns)}</span>` : ''}
            </td>`;
        }
        html += '</tr>';
    }
    return html + '</tbody></table>';
}

// ─── Draft panels ─────────────────────────────────────────────────────────────

function buildDrafts() {
    const activePlayer = state.players[state.activePlayer];
    // Claiming is valid when: in first-claim, OR in place-and-claim after the player has placed
    const canClaim =
        state.phase === 'first-claim' ||
        (state.phase === 'place-and-claim' && activePlayer.claimedDomino === null);

    const sections = [];

    if (state.currentDraft.length) {
        sections.push(`
<section class="draft">
    <h3>Current Draft <small>(tiles being placed this round)</small></h3>
    <div class="draft-slots">
        ${state.currentDraft.map(s => buildSlot(s, -1, false)).join('')}
    </div>
</section>`);
    }

    if (state.nextDraft.length) {
        sections.push(`
<section class="draft">
    <h3>Next Draft <small>(claim your tile)</small></h3>
    <div class="draft-slots">
        ${state.nextDraft.map((s, i) => buildSlot(s, i, canClaim)).join('')}
    </div>
</section>`);
    }

    return `<div class="drafts">${sections.join('')}</div>`;
}

/**
 * @param {import('./game-module.js').DraftSlot} slot
 * @param {number}  index     - Index into nextDraft; -1 for currentDraft (not claimable)
 * @param {boolean} canClaim
 */
function buildSlot(slot, index, canClaim) {
    const claimed   = slot.claimedBy !== null;
    const claimable = canClaim && !claimed;

    return `
<div class="draft-slot ${claimed ? 'draft-slot--claimed' : ''}">
    ${buildDomino(slot.domino)}
    <div class="slot-status">
        ${claimed
            ? `<span class="badge badge--claimed">Player ${slot.claimedBy + 1}</span>`
            : claimable
                ? `<button class="btn btn--claim" data-slot="${index}">Claim</button>`
                : '<span class="badge badge--free">Free</span>'}
    </div>
</div>`;
}

/**
 * @param {import('./game-module.js').Domino} domino
 */
function buildDomino(domino) {
    return `
<div class="domino" title="Tile #${domino.number}">
    <div class="domino-num">#${domino.number}</div>
    <div class="domino-halves">
        ${buildHalf(domino.left)}${buildHalf(domino.right)}
    </div>
</div>`;
}

/**
 * @param {import('./game-module.js').Cell} half
 */
function buildHalf(half) {
    const crowns = '♕'.repeat(half.crowns);
    return `
<div class="half" style="background:${TERRAIN_BG[half.terrain]}" title="${half.terrain}">
    <span class="half-icon">${TERRAIN_ICON[half.terrain]}</span>
    ${crowns ? `<span class="half-crown">${crowns}</span>` : ''}
</div>`;
}

// ─── Placement controls ───────────────────────────────────────────────────────

function buildControls() {
    const player   = state.players[state.activePlayer];
    const canPlace = player.claimedDomino !== null &&
        (state.phase === 'place-and-claim' || state.phase === 'final-place');

    if (!canPlace) return '';

    const { row, col, orientation, flipped } = pending;
    const hasPos = row !== null;
    const valid  = hasPos && isValidPlacement(
        player.grid,
        player.claimedDomino,
        { row, col, orientation, flipped },
    );

    return `
<section class="controls">
    <h3>Player ${state.activePlayer + 1} — Place your tile</h3>
    <p class="hint">
        Click a highlighted cell on your grid to set the anchor, then adjust orientation and flip.
    </p>
    <div class="control-row">
        <label>
            Orientation
            <select id="sel-orientation">
                <option value="horizontal" ${orientation === 'horizontal' ? 'selected' : ''}>Horizontal →</option>
                <option value="vertical"   ${orientation === 'vertical'   ? 'selected' : ''}>Vertical ↓</option>
            </select>
        </label>
        <label class="flip-label">
            <input type="checkbox" id="chk-flip" ${flipped ? 'checked' : ''}> Flip tile
        </label>
        <span class="pos-display">
            ${hasPos ? `Anchor: row&nbsp;${row + 1}, col&nbsp;${col + 1}` : 'No cell selected'}
        </span>
    </div>
    <div class="control-row">
        <button class="btn btn--primary" id="btn-place" ${valid ? '' : 'disabled'}>
            Place Tile
        </button>
        <button class="btn btn--danger" id="btn-discard">
            Discard (no valid move)
        </button>
    </div>
</section>`;
}

// ─── Game over ────────────────────────────────────────────────────────────────

function buildGameOver() {
    const scores  = state.players.map(p => ({ id: p.id, score: scoreGrid(p.grid) }));
    const best    = Math.max(...scores.map(s => s.score));
    const winners = scores.filter(s => s.score === best);
    const winText = winners.length === 1
        ? `Player ${winners[0].id + 1} wins!`
        : `Tie — Players ${winners.map(w => w.id + 1).join(' & ')}!`;

    return `
<section class="game-over">
    <h2>Game Over</h2>
    <div class="final-scores">
        ${scores.map(s => `
        <div class="final-score ${s.score === best ? 'final-score--winner' : ''}">
            <span class="player-label">Player ${s.id + 1}</span>
            <span class="score-val">${s.score} pts</span>
            ${s.score === best ? '<span class="trophy">🏆</span>' : ''}
        </div>`).join('')}
    </div>
    <p class="win-text">${winText}</p>
    <button class="btn btn--primary" id="btn-new-game">Play Again</button>
</section>`;
}

// ─── Event binding ────────────────────────────────────────────────────────────

/**
 * Attach all event listeners to freshly rendered DOM nodes.
 * Called after every `render()` because innerHTML replaces nodes and drops old listeners.
 */
function bindEvents() {
    // ── New game ──────────────────────────────────────────────────────────────
    document.getElementById('btn-new-game')?.addEventListener('click', () => {
        state   = createInitialState();
        pending = { row: null, col: null, orientation: 'horizontal', flipped: false };
        render();
    });

    // ── Claim a draft slot ────────────────────────────────────────────────────
    document.querySelectorAll('.btn--claim').forEach(btn => {
        btn.addEventListener('click', () => {
            const slotIndex = Number(btn.dataset.slot);
            try {
                state   = claimDomino(state, state.activePlayer, slotIndex);
                pending = { ...pending, row: null, col: null };
                render();
            } catch (err) {
                showError(err.message);
            }
        });
    });

    // ── Click a grid cell to set placement anchor ─────────────────────────────
    document.querySelectorAll('.cell--clickable').forEach(td => {
        td.addEventListener('click', () => {
            pending = { ...pending, row: Number(td.dataset.row), col: Number(td.dataset.col) };
            render();
        });
    });

    // ── Orientation selector ──────────────────────────────────────────────────
    document.getElementById('sel-orientation')?.addEventListener('change', e => {
        pending = { ...pending, orientation: /** @type {'horizontal'|'vertical'} */ (e.target.value) };
        render();
    });

    // ── Flip checkbox ─────────────────────────────────────────────────────────
    document.getElementById('chk-flip')?.addEventListener('change', e => {
        pending = { ...pending, flipped: /** @type {HTMLInputElement} */ (e.target).checked };
        render();
    });

    // ── Place tile ────────────────────────────────────────────────────────────
    document.getElementById('btn-place')?.addEventListener('click', () => {
        const { row, col, orientation, flipped } = pending;
        try {
            state   = placeDomino(state, state.activePlayer, { row, col, orientation, flipped });
            pending = { row: null, col: null, orientation: 'horizontal', flipped: false };
            render();
        } catch (err) {
            showError(err.message);
        }
    });

    // ── Discard tile (no legal placement exists) ──────────────────────────────
    document.getElementById('btn-discard')?.addEventListener('click', () => {
        try {
            state   = placeDomino(state, state.activePlayer, null);
            pending = { row: null, col: null, orientation: 'horizontal', flipped: false };
            render();
        } catch (err) {
            showError(err.message);
        }
    });
}

// ─── Error toast ──────────────────────────────────────────────────────────────

/**
 * Display a temporary error banner at the bottom of the screen.
 * Auto-dismisses after 3.5 seconds.
 * @param {string} message
 */
function showError(message) {
    document.getElementById('error-toast')?.remove();
    const toast = Object.assign(document.createElement('div'), {
        id:          'error-toast',
        className:   'error-toast',
        textContent: message,
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

render();
