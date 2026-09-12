// Application state and transitions.
//
// Pure: no SDK imports, no rendering. Everything here is driven by three
// gestures - scroll up, scroll down, click - because that is the entire input
// vocabulary once double-click is reserved for the system exit dialog.

import { DECK_SIZE, RANK_COUNT, SUIT_COUNT, makeCard, rankOf, suitOf } from './cards.ts'
import type { Equity } from './equity.ts'

export type Phase = 'setup' | 'suit' | 'rank' | 'computing' | 'result'
export type Street = 'hole' | 'flop' | 'turn' | 'river'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

export interface State {
  phase: Phase
  street: Street
  players: number
  hole: number[]
  board: number[]
  /** Index into the current option list. */
  cursor: number
  /** Suit chosen for the card currently being entered. */
  pendingSuit: number
  equity: Equity | null
  outs: number
  /** 0..1 while phase is 'computing'. */
  progress: number
}

export function initialState(players: number | null): State {
  return {
    phase: players === null ? 'setup' : 'suit',
    street: 'hole',
    players: players ?? 6,
    hole: [],
    board: [],
    cursor: players === null ? clampPlayers(6) - MIN_PLAYERS : 0,
    pendingSuit: 0,
    equity: null,
    outs: 0,
    progress: 0,
  }
}

function clampPlayers(n: number): number {
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, n))
}

export function opponentsOf(state: State): number {
  return clampPlayers(state.players) - 1
}

/** Every card already committed this hand. */
export function usedCards(state: State): number[] {
  return [...state.hole, ...state.board]
}

/**
 * Values selectable in the current phase. Ranks exclude cards already in play,
 * which both prevents impossible hands and shortens the list as the hand runs.
 */
export function optionsFor(state: State): number[] {
  switch (state.phase) {
    case 'setup': {
      const out: number[] = []
      for (let p = MIN_PLAYERS; p <= MAX_PLAYERS; p++) out.push(p)
      return out
    }
    case 'suit': {
      const used = usedCards(state)
      const out: number[] = []
      for (let s = 0; s < SUIT_COUNT; s++) {
        const anyLeft = used.filter((c) => suitOf(c) === s).length < RANK_COUNT
        if (anyLeft) out.push(s)
      }
      return out
    }
    case 'rank': {
      const used = new Set(usedCards(state))
      const out: number[] = []
      for (let r = 0; r < RANK_COUNT; r++) {
        if (!used.has(makeCard(r, state.pendingSuit))) out.push(r)
      }
      return out
    }
    default:
      return []
  }
}

export function selectedOption(state: State): number {
  const options = optionsFor(state)
  if (options.length === 0) return 0
  return options[Math.min(state.cursor, options.length - 1)]
}

/** Scroll wraps - with at most 13 options, wrapping always beats clamping. */
export function scroll(state: State, delta: number): State {
  const count = optionsFor(state).length
  if (count === 0) return state
  const cursor = (((state.cursor + delta) % count) + count) % count
  return { ...state, cursor }
}

/** How many board cards this street should end with. */
export function boardTarget(street: Street): number {
  switch (street) {
    case 'hole':
      return 0
    case 'flop':
      return 3
    case 'turn':
      return 4
    case 'river':
      return 5
  }
}

/** True once the current street has all the cards it needs. */
export function streetComplete(state: State): boolean {
  return state.street === 'hole' ? state.hole.length >= 2 : state.board.length >= boardTarget(state.street)
}

export function nextStreet(street: Street): Street | null {
  switch (street) {
    case 'hole':
      return 'flop'
    case 'flop':
      return 'turn'
    case 'turn':
      return 'river'
    case 'river':
      return null
  }
}

/**
 * Apply a click. Returns the next state; the caller starts a simulation
 * whenever the result's phase is 'computing'.
 */
export function click(state: State): State {
  switch (state.phase) {
    case 'setup': {
      const players = selectedOption(state)
      return { ...state, players, phase: 'suit', cursor: 0 }
    }

    case 'suit':
      return { ...state, pendingSuit: selectedOption(state), phase: 'rank', cursor: 0 }

    case 'rank': {
      const card = makeCard(selectedOption(state), state.pendingSuit)
      const next: State = { ...state, cursor: 0, phase: 'suit' }
      if (state.street === 'hole') next.hole = [...state.hole, card]
      else next.board = [...state.board, card]

      if (streetComplete(next)) return { ...next, phase: 'computing', progress: 0 }
      return next
    }

    case 'computing':
      return state // ignore input mid-simulation

    case 'result': {
      const following = nextStreet(state.street)
      if (following === null) return newHand(state)
      return { ...state, street: following, phase: 'suit', cursor: 0, equity: null, outs: 0 }
    }
  }
}

/** Fresh hand, same table. */
export function newHand(state: State): State {
  return {
    ...initialState(state.players),
    players: state.players,
  }
}

export function sanityCheck(state: State): string | null {
  const used = usedCards(state)
  if (new Set(used).size !== used.length) return 'duplicate card'
  if (used.some((c) => c < 0 || c >= DECK_SIZE)) return 'card out of range'
  if (state.hole.length > 2) return 'too many hole cards'
  if (state.board.length > 5) return 'too many board cards'
  return null
}

export { rankOf, suitOf }
