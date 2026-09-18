// Navigation: back (double-tap) and new round (long press).
//
// Back is a history stack rather than a hand-written inverse of every
// transition. Each click saves the screen it left; double-tap restores it
// exactly - computed odds, cursor position and live-player ceiling included -
// so going back never re-simulates and never loses a folded-player count.
//
// Scrolling does not create history. Back undoes decisions, not cursor moves.
//
// Pure: no SDK, no rendering, so it is testable in isolation.

import { type State, MIN_PLAYERS, newHand } from './state.ts'

/** Deep enough for several full hands; each hand is about twenty clicks. */
export const HISTORY_LIMIT = 64

export interface Nav {
  state: State
  history: readonly State[]
}

/** Move forward, remembering where we came from. A no-op move saves nothing. */
export function forward(nav: Nav, next: State): Nav {
  if (next === nav.state) return nav
  return { state: next, history: [...nav.history, nav.state].slice(-HISTORY_LIMIT) }
}

export type BackResult = { kind: 'state'; nav: Nav } | { kind: 'exit' }

export function back(nav: Nav): BackResult {
  const { state, history } = nav

  if (history.length > 0) {
    return {
      kind: 'state',
      nav: { state: history[history.length - 1], history: history.slice(0, -1) },
    }
  }

  // At the start of a hand with nothing behind it, back leads to the seat
  // count - the only way to change it once first boot has saved a value.
  if (state.phase === 'style') {
    return {
      kind: 'state',
      nav: { state: { ...state, phase: 'setup', cursor: state.players - MIN_PLAYERS }, history: [] },
    }
  }

  // Nowhere left to go. The caller shows the system exit dialog, which the
  // user can still cancel.
  return { kind: 'exit' }
}

/**
 * Long press: abandon the current hand and deal a new one immediately.
 *
 * Keeps exactly one step of history - the hand just abandoned - so an
 * accidental hold is undone by a double-tap, without the new hand inheriting
 * the whole back-trail of the old one. Ignored before the table is set up,
 * because there is no round to restart yet.
 */
export function startNewRound(nav: Nav): Nav {
  if (nav.state.phase === 'setup') return nav
  return { state: newHand(nav.state), history: [nav.state] }
}
