// Seven-card hand evaluator.
//
// Hand-rolled rather than pulled from npm: the fastest published evaluator ships
// a 130 MB lookup table and is Node-only, the most popular one allocates an
// object per evaluation (unusable for Monte Carlo), and the best typed option is
// a very young single-maintainer package. This is ~150 lines, adds nothing to the
// bundle, and - the part that matters - is verifiable against published equity
// tables and the 7,462 equivalence-class count.
//
// THIS IS THE SWAPPABLE BOUNDARY. Everything else depends only on `evaluate()`
// returning a number where bigger = better, comparable across hands.

// Explicit .ts extension: Vite resolves extensionless imports, Node's ESM loader
// does not, and the tests run under plain `node --experimental-strip-types`.
import { RANK_COUNT, RANK_LABELS, SUIT_COUNT } from './cards.ts'

// A const object rather than an `enum`. The template sets `isolatedModules: true`
// (no cross-file const-enum inlining), and Node's type-stripping mode rejects
// enums outright because they emit runtime code - which would make the tests
// unrunnable without a build step.
export const Category = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const

export type Category = (typeof Category)[keyof typeof Category]

export const CATEGORY_NAMES: Record<Category, string> = {
  [Category.HighCard]: 'High card',
  [Category.Pair]: 'Pair',
  [Category.TwoPair]: 'Two pair',
  [Category.Trips]: 'Three of a kind',
  [Category.Straight]: 'Straight',
  [Category.Flush]: 'Flush',
  [Category.FullHouse]: 'Full house',
  [Category.Quads]: 'Four of a kind',
  [Category.StraightFlush]: 'Straight flush',
}

// score = category << 20, then up to five 4-bit tiebreak ranks, most significant
// first. Five ranks is always enough to separate any two five-card hands.
function score(category: Category, ranks: readonly number[]): number {
  let s = category << 20
  for (let i = 0; i < 5; i++) s |= (ranks[i] ?? 0) << (16 - i * 4)
  return s
}

export function categoryOf(score: number): Category {
  return (score >>> 20) as Category
}

/**
 * Top rank index of a straight in a 13-bit rank mask, or -1.
 * Handles the wheel (A-2-3-4-5), whose high card is the five.
 */
function straightTop(rankMask: number): number {
  // bit 0 = ace playing low, bit 1 = deuce, ... bit 13 = ace.
  const v = (rankMask << 1) | ((rankMask >>> 12) & 1)
  for (let top = 13; top >= 4; top--) {
    if (((v >>> (top - 4)) & 0x1f) === 0x1f) return top - 1
  }
  return -1
}

/** The `n` highest rank indices set in `mask`, descending. */
function topRanks(mask: number, n: number): number[] {
  const out: number[] = []
  for (let r = RANK_COUNT - 1; r >= 0 && out.length < n; r--) {
    if (mask & (1 << r)) out.push(r)
  }
  return out
}

const rankCount = new Uint8Array(RANK_COUNT)
const suitCount = new Uint8Array(SUIT_COUNT)
const suitMask = new Uint16Array(SUIT_COUNT)

/**
 * Evaluate 5, 6 or 7 cards. Returns a comparable score; bigger wins, equal ties.
 *
 * Uses module-level scratch arrays, so it allocates nothing per call and is NOT
 * reentrant - fine for a single-threaded simulation loop.
 */
export function evaluate(cards: readonly number[]): number {
  rankCount.fill(0)
  suitCount.fill(0)
  suitMask.fill(0)
  let rankMask = 0

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const r = card >> 2
    const s = card & 3
    rankCount[r]++
    suitCount[s]++
    suitMask[s] |= 1 << r
    rankMask |= 1 << r
  }

  let flushSuit = -1
  for (let s = 0; s < SUIT_COUNT; s++) {
    if (suitCount[s] >= 5) {
      flushSuit = s
      break // only one suit can have five of seven cards
    }
  }

  // Straight flush outranks everything, so it must be tested before quads.
  if (flushSuit >= 0) {
    const sfTop = straightTop(suitMask[flushSuit])
    if (sfTop >= 0) return score(Category.StraightFlush, [sfTop])
  }

  // Group ranks by count, descending so index 0 is always the highest.
  const quads: number[] = []
  const trips: number[] = []
  const pairs: number[] = []
  for (let r = RANK_COUNT - 1; r >= 0; r--) {
    const c = rankCount[r]
    if (c === 4) quads.push(r)
    else if (c === 3) trips.push(r)
    else if (c === 2) pairs.push(r)
  }

  if (quads.length > 0) {
    const quad = quads[0]
    const kicker = topRanks(rankMask & ~(1 << quad), 1)[0] ?? 0
    return score(Category.Quads, [quad, kicker])
  }

  // With seven cards you can hold two trips; the lower one plays as the pair.
  if (trips.length > 0 && (trips.length > 1 || pairs.length > 0)) {
    const trip = trips[0]
    const pair = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? -1) : pairs[0]
    return score(Category.FullHouse, [trip, pair])
  }

  if (flushSuit >= 0) return score(Category.Flush, topRanks(suitMask[flushSuit], 5))

  const stTop = straightTop(rankMask)
  if (stTop >= 0) return score(Category.Straight, [stTop])

  if (trips.length > 0) {
    const trip = trips[0]
    return score(Category.Trips, [trip, ...topRanks(rankMask & ~(1 << trip), 2)])
  }

  if (pairs.length >= 2) {
    const [hi, lo] = pairs
    const kicker = topRanks(rankMask & ~(1 << hi) & ~(1 << lo), 1)[0] ?? 0
    return score(Category.TwoPair, [hi, lo, kicker])
  }

  if (pairs.length === 1) {
    const pair = pairs[0]
    return score(Category.Pair, [pair, ...topRanks(rankMask & ~(1 << pair), 3)])
  }

  return score(Category.HighCard, topRanks(rankMask, 5))
}

/** The i-th tiebreak rank packed into a score (0 = most significant). */
export function tiebreakRank(score: number, index: number): number {
  return (score >>> (16 - index * 4)) & 0xf
}

/**
 * Short, rank-aware hand name for the readout. "Pair of A" beats a bare "Pair"
 * when you are glancing at a HUD and already know you hold aces.
 */
export function describeHand(cards: readonly number[]): string {
  const score = evaluate(cards)
  const category = categoryOf(score)
  const r = (i: number) => RANK_LABELS[tiebreakRank(score, i)]

  switch (category) {
    case Category.StraightFlush:
      return `Straight flush to ${r(0)}`
    case Category.Quads:
      return `Quads, ${r(0)}`
    case Category.FullHouse:
      return `${r(0)} full of ${r(1)}`
    case Category.Flush:
      return `Flush, ${r(0)} high`
    case Category.Straight:
      return `Straight to ${r(0)}`
    case Category.Trips:
      return `Trips, ${r(0)}`
    case Category.TwoPair:
      return `Two pair, ${r(0)} & ${r(1)}`
    case Category.Pair:
      return `Pair of ${r(0)}`
    default:
      return `${r(0)} high`
  }
}

export function describe(cards: readonly number[]): string {
  return CATEGORY_NAMES[categoryOf(evaluate(cards))]
}
