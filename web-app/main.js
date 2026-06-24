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
    advanceRound,
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
let pending = { row: null, col: null, orientation: 0 };

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
   * Returns the id of the player who should act next.
   * - "first-claim" or no claimedDominos → state.firstClaimer
   * - "placing": firstClaimer goes first (their hasPlaced is false first),
   *   then the other player once firstClaimer.hasPlaced is true.
   * - "final-place": same logic as placing.
   * - "game-over": return 0 (doesn't matter).
   * @param {import('./game-module1.js').GameState} state
   * @returns {number}
   */
  function activePlayerId(state) {
      // hint: check state.phase, then state.players[state.firstClaimer].hasPlaced
  }

  ---
  /**
   * Builds one 9×9 grid <div> for a player.
   * Each cell is a <div> coloured by TERRAIN_BG[terrain].
   * If the cell has crowns > 0, put the count as text inside.
   * If isActive is true AND state.phase is "placing" or "final-place":
   *   clicking a cell sets pending.row and pending.col, then calls render().
   * Highlight the cell at pending.row/col with a visible border or outline.
   * @param {import('./game-module1.js').Player} player
   * @param {boolean} isActive
   * @returns {HTMLElement}
   */
  function buildGrid(player, isActive) {
      // hint: create a wrapper div, use two nested for-loops (r then c)
      // hint: cellDiv.addEventListener('click', ...) only when isActive
  }

  ---
  /**
   * Builds a small domino preview: two half-cell <div>s side by side.
   * Each half shows its terrain colour and crown count.
   * @param {import('./game-module1.js').Domino} domino
   * @returns {HTMLElement}
   */
  function buildDomino(domino) {
      // hint: create a flex container, then two child divs using domino.left and domino.right
  }

  ---
  /**
   * Builds the claim panel shown when players need to pick from nextDraft.
   * Renders each DraftSlot in state.nextDraft as a clickable domino.
   * Clicking slot i calls:
   *   state = claimDomino(state, state.firstClaimer, i);
   *   pending = { row: null, col: null, orientation: 0 };
   *   render();
   * @returns {HTMLElement}
   */
  function buildClaimPanel() {
      // hint: iterate state.nextDraft with forEach or a for-loop
      // hint: use buildDomino(slot.domino) inside each slot wrapper
  }

  ---
  /**
   * Builds the placement controls for the active player:
   *   - Four orientation buttons labelled →, ↓, ←, ↑ (orientations 0–3).
   *     Clicking one sets pending.orientation and calls render().
   *   - A "Place" button: calls placeDomino, then checks if both players
   *     have hasPlaced === true → if so calls advanceRound. Then render().
   *     Only enabled when pending.row !== null.
   *   - A "Discard" button: calls placeDomino(state, activeId, null),
   *     same advance check, then render().
   * @param {number} activeId
   * @returns {HTMLElement}
   */
  function buildControls(activeId) {
      // hint: ['→','↓','←','↑'].forEach((label, o) => { ... })
      // hint: for Place, the placement object is
      //       { row: pending.row, col: pending.col, orientation: pending.orientation }
  }

  ---
  /**
   * Wipes #app and rebuilds the whole UI from scratch using `state` and `pending`.
   *
   * Layout order:
   *  1. <h2> header — "Round X | Player N's turn | <phase>"
   *  2. A row with both grids: buildGrid(state.players[0], ...) and buildGrid(state.players[1], ...)
   *  3. If needs-to-claim (both claimedDomino null AND nextDraft has slots): buildClaimPanel()
   *  4. Else if placing/final-place: show active player's held domino + buildControls(activeId)
   *  5. If game-over: show both players' scores from scoreGrid()
   */
  function render() {
      const app = document.querySelector('#app');
      app.innerHTML = '';
      // build and appendChild each section in order
  }

  render(); // kick off the first render
