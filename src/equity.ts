// Equity by Monte Carlo, plus outs.
//
// Opponents are modelled as holding two uniformly random unseen cards and all
// staying to showdown - the standard assumption behind published equity tables,
// and the one this app's numbers are validated against.

import { DECK_SIZE, remainingDeck } from './cards.ts'
import { categoryOf, evaluate } from './evaluator.ts'

export interface Equity {
  /** Fractions in 0..1, summing to 1. */
  win: number
  tie: number
  lose: number
  trials: number
}

export interface SimulationInput {
  hole: readonly number[] // exactly 2
  board: readonly number[] // 0, 3, 4 or 5
  opponents: number // 1..9
  trials: number
  rng: () => number
}

/**
 * Runs `trials` showdowns. Synchronous - callers that need a responsive UI
 * should drive `createSimulation` instead.
 */
export function simulate(input: SimulationInput): Equity {
  const sim = createSimulation(input)
  sim.step(input.trials)
  return sim.result()
}

/**
 * A simulation that can be advanced in chunks, so the UI thread can repaint a
 * progress bar between them. Deliberately not a Web Worker: worker availability
 * inside the Even WebView is unverified, and at this trial count chunking is
 * enough.
 */
export function createSimulation(input: SimulationInput) {
  const { hole, board, opponents, trials, rng } = input

  const known = [...hole, ...board]
  const deck = remainingDeck(known)
  const boardToCome = 5 - board.length
  const draws = boardToCome + opponents * 2

  if (hole.length !== 2) throw new Error(`expected 2 hole cards, got ${hole.length}`)
  if (draws > deck.length) throw new Error(`cannot draw ${draws} from ${deck.length} cards`)

  // Scratch buffers, reused every trial so the hot loop allocates nothing.
  const fullBoard = new Array<number>(5)
  const seven = new Array<number>(7)
  for (let i = 0; i < board.length; i++) fullBoard[i] = board[i]

  let wins = 0
  let ties = 0
  let losses = 0
  let done = 0

  function playOne() {
    // Partial Fisher-Yates: shuffling only the first `draws` slots of a
    // persistent deck still yields a uniform random sample each trial.
    for (let i = 0; i < draws; i++) {
      const j = i + Math.floor(rng() * (deck.length - i))
      const tmp = deck[i]
      deck[i] = deck[j]
      deck[j] = tmp
    }

    for (let i = 0; i < boardToCome; i++) fullBoard[board.length + i] = deck[i]

    seven[0] = hole[0]
    seven[1] = hole[1]
    for (let i = 0; i < 5; i++) seven[2 + i] = fullBoard[i]
    const heroScore = evaluate(seven)

    let bestOpponent = -1
    let cursor = boardToCome
    for (let o = 0; o < opponents; o++) {
      seven[0] = deck[cursor++]
      seven[1] = deck[cursor++]
      const s = evaluate(seven)
      if (s > bestOpponent) bestOpponent = s
    }

    if (heroScore > bestOpponent) wins++
    else if (heroScore === bestOpponent) ties++
    else losses++
  }

  return {
    get done() {
      return done >= trials
    },
    get progress() {
      return trials === 0 ? 1 : done / trials
    },
    /** Advance by up to `n` trials. */
    step(n: number) {
      const limit = Math.min(done + n, trials)
      while (done < limit) {
        playOne()
        done++
      }
    },
    result(): Equity {
      const t = done || 1
      return { win: wins / t, tie: ties / t, lose: losses / t, trials: done }
    },
  }
}

/** Hero must be at least this likely to win after the card lands. */
const OUT_WIN_THRESHOLD = 0.5
/** ...and it must be a real improvement, not noise. */
const OUT_IMPROVEMENT = 0.05
const OUT_TRIALS_PER_CARD = 800
const OUT_BASELINE_TRIALS = 4000

/**
 * Winning outs: unseen cards that turn hero into a favourite.
 *
 * The naive definition - "any card that raises my hand category" - is wrong in
 * the way that matters. Holding AK on a board of 7 2 9, every card that pairs
 * anything raises the category from high-card to pair, giving 23 "outs" when a
 * player would say 9. So a card counts here only if, after it lands, hero
 * actually wins more often than not AND is meaningfully better off than before.
 *
 * That makes outs depend on opponent count, which is correct: a flush draw is
 * worth far less against eight players than against one.
 *
 * Still an approximation - it assumes opponents hold random cards and see the
 * hand to showdown. Label it as such wherever it is shown.
 */
export function findOuts(
  hole: readonly number[],
  board: readonly number[],
  opponents: number,
  rng: () => number,
): number[] {
  if (board.length === 0 || board.length >= 5) return []

  const baseline = simulate({
    hole,
    board,
    opponents,
    trials: OUT_BASELINE_TRIALS,
    rng,
  }).win

  const outs: number[] = []
  const extended = [...board, 0]

  for (const card of remainingDeck([...hole, ...board])) {
    extended[extended.length - 1] = card
    const { win } = simulate({
      hole,
      board: extended,
      opponents,
      trials: OUT_TRIALS_PER_CARD,
      rng,
    })
    if (win >= OUT_WIN_THRESHOLD && win >= baseline + OUT_IMPROVEMENT) outs.push(card)
  }
  return outs
}

export function countOuts(
  hole: readonly number[],
  board: readonly number[],
  opponents: number,
  rng: () => number,
): number {
  return findOuts(hole, board, opponents, rng).length
}

/**
 * The rule of 4 and 2: multiply outs by 4 with two cards to come, by 2 with one.
 * Overestimates above ~14 outs. Always label the result as approximate.
 */
export function ruleOf4And2(outs: number, cardsToCome: number): number {
  const pct = outs * (cardsToCome >= 2 ? 4 : 2)
  return Math.min(pct, 100)
}

export function cardsToCome(board: readonly number[]): number {
  return Math.max(0, 5 - board.length)
}

export const MAX_OPPONENTS = 9
export const DEFAULT_TRIALS = 25000

export { DECK_SIZE }
