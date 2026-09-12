// Opponent hand ranges.
//
// Replaces "opponents hold two uniformly random cards" with "opponents hold a
// hand they would actually have played". Random-hand mode is kept as the
// `any` tightness, because every published equity table assumes it and it is
// what the conformance tests are pinned against.

import { DECK_SIZE, RANK_COUNT, makeCard, rankOf, suitOf } from './cards.ts'
import { evaluate } from './evaluator.ts'
import { HAND_RANKINGS } from './rankings.ts'

export type Tightness = 'any' | 'loose' | 'normal' | 'tight'

export const TIGHTNESS_ORDER: readonly Tightness[] = ['any', 'loose', 'normal', 'tight']

export const TIGHTNESS: Record<Tightness, { label: string; pct: number }> = {
  any: { label: 'Any two', pct: 100 },
  loose: { label: 'Loose', pct: 40 },
  normal: { label: 'Normal', pct: 20 },
  tight: { label: 'Tight', pct: 10 },
}

/**
 * Fraction of a player's PREFLOP range still in the hand by each street.
 *
 * Anchored on two published HUD statistics rather than invented:
 *   - fold-to-flop-c-bet of 35-45% for a solid player, so ~60% continue past
 *     the flop
 *   - went-to-showdown of 27-32%, target 30%
 * 0.60 x 0.70 x 0.71 = 0.298, which lands on that WTSD figure.
 *
 * These are population averages across all boards and bet sizes, not a read on
 * any particular opponent. They are the softest numbers in this app.
 */
export const STREET_RETENTION = {
  preflop: 1,
  flop: 0.6,
  turn: 0.42,
  river: 0.3,
} as const

/**
 * KNOWN LIMITATION, measured not assumed.
 *
 * HAND_RANKINGS orders by raw heads-up equity, which undervalues suited
 * connectors: 76s ranks 115/169 and so falls outside even the Loose range,
 * though a real loose player certainly plays it.
 *
 * That skews these ranges toward big cards, and big cards are exactly what a
 * big pair wants to face. Measured heads-up: AA beats AKo 92.6% of the time and
 * 76s only 77.0%. So "Loose" can show HIGHER equity for aces than "Any two" -
 * not a bug, but a consequence of ranking by equity rather than playability.
 * The effect is about a point, and it shrinks as ranges tighten.
 */
export type Combo = readonly [number, number]

const TOTAL_COMBOS = (DECK_SIZE * (DECK_SIZE - 1)) / 2 // 1326

/** Expand a class code such as 'AA', 'AKs' or 'AKo' into its concrete combos. */
function expand(code: string): Combo[] {
  const RANKS = '23456789TJQKA'
  const hi = RANKS.indexOf(code[0])
  const lo = RANKS.indexOf(code[1])
  const combos: Combo[] = []

  if (hi === lo) {
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) combos.push([makeCard(hi, a), makeCard(lo, b)])
    }
    return combos
  }

  const suited = code[2] === 's'
  for (let a = 0; a < 4; a++) {
    if (suited) {
      combos.push([makeCard(hi, a), makeCard(lo, a)])
    } else {
      for (let b = 0; b < 4; b++) if (a !== b) combos.push([makeCard(hi, a), makeCard(lo, b)])
    }
  }
  return combos
}

// Built once. 1326 combos in ranking order, so any "top N%" is a prefix.
const ORDERED_COMBOS: Combo[] = HAND_RANKINGS.flatMap(expand)

if (ORDERED_COMBOS.length !== TOTAL_COMBOS) {
  throw new Error(`expected ${TOTAL_COMBOS} combos, built ${ORDERED_COMBOS.length}`)
}

/**
 * The top `pct` percent of starting hands, by combination count rather than by
 * class - pocket aces are 6 combos and AKo is 12, so counting classes would
 * badly distort what "top 20%" means.
 */
export function rangeFor(tightness: Tightness): readonly Combo[] {
  const pct = TIGHTNESS[tightness].pct
  if (pct >= 100) return ORDERED_COMBOS
  return ORDERED_COMBOS.slice(0, Math.max(1, Math.round((pct / 100) * TOTAL_COMBOS)))
}

function conflicts(combo: Combo, blocked: Uint8Array): boolean {
  return blocked[combo[0]] === 1 || blocked[combo[1]] === 1
}

/**
 * The combos an opponent can still hold: in range, and not using a card that is
 * already visible.
 */
export function availableCombos(tightness: Tightness, known: readonly number[]): Combo[] {
  const blocked = new Uint8Array(DECK_SIZE)
  for (const card of known) blocked[card] = 1
  return rangeFor(tightness).filter((combo) => !conflicts(combo, blocked))
}

/**
 * Narrow a range to the hands that would still be in on this street.
 *
 * Crucially this ranks by strength AGAINST THE BOARD, not by preflop rank. A
 * player who flopped two pair with 7-6 suited keeps going; ace-king that missed
 * everything folds. Narrowing by preflop rank would keep exactly the wrong half.
 */
export function narrowToBoard(
  combos: readonly Combo[],
  board: readonly number[],
  retention: number,
): Combo[] {
  if (retention >= 1 || board.length === 0 || combos.length === 0) return [...combos]

  const keep = Math.max(1, Math.round(combos.length * retention))
  if (keep >= combos.length) return [...combos]

  const seven: number[] = new Array(2 + board.length)
  for (let i = 0; i < board.length; i++) seven[2 + i] = board[i]

  const scored = combos.map((combo) => {
    seven[0] = combo[0]
    seven[1] = combo[1]
    return { combo, score: evaluate(seven) }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, keep).map((entry) => entry.combo)
}

export function retentionFor(boardLength: number): number {
  if (boardLength >= 5) return STREET_RETENTION.river
  if (boardLength === 4) return STREET_RETENTION.turn
  if (boardLength >= 3) return STREET_RETENTION.flop
  return STREET_RETENTION.preflop
}

/**
 * The pool an opponent draws from, given the visible cards. Falls back to every
 * legal combo if narrowing leaves nothing usable.
 */
export function opponentPool(
  tightness: Tightness,
  hole: readonly number[],
  board: readonly number[],
): Combo[] {
  const known = [...hole, ...board]
  const available = availableCombos(tightness, known)
  if (available.length === 0) return availableCombos('any', known)

  const narrowed = narrowToBoard(available, board, retentionFor(board.length))
  return narrowed.length > 0 ? narrowed : available
}

export function describeRange(tightness: Tightness, boardLength: number): string {
  const base = TIGHTNESS[tightness]
  if (tightness === 'any') return base.label
  const effective = Math.round(base.pct * retentionFor(boardLength))
  return boardLength === 0 ? `${base.label} (${base.pct}%)` : `${base.label} (~${effective}%)`
}

export { rankOf, suitOf, RANK_COUNT }
