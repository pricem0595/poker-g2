// Conformance tests for the hand evaluator.
//
// Run: node --experimental-strip-types test/evaluator.test.ts
//
// These are the load-bearing checks. A silently wrong evaluator produces
// plausible-looking equity numbers that are simply false, so the evaluator is
// pinned against exhaustively-known truths rather than spot checks.

import { CATEGORY_NAMES, Category, categoryOf, evaluate } from '../src/evaluator.ts'
import { DECK_SIZE, formatCards, makeCard } from '../src/cards.ts'

let failures = 0

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        expected ${expected}, got ${actual}`}`)
}

// ---------------------------------------------------------------------------
// 1. Exhaustive five-card enumeration.
//
// All C(52,5) = 2,598,960 hands. Two invariants:
//   - exactly 7,462 distinct scores (the standard equivalence-class count)
//   - the textbook frequency of each category
// If the tables or tiebreak packing are wrong, these will not both hold.
// ---------------------------------------------------------------------------

const EXPECTED_FREQUENCIES: Record<Category, number> = {
  [Category.StraightFlush]: 40,
  [Category.Quads]: 624,
  [Category.FullHouse]: 3744,
  [Category.Flush]: 5108,
  [Category.Straight]: 10200,
  [Category.Trips]: 54912,
  [Category.TwoPair]: 123552,
  [Category.Pair]: 1098240,
  [Category.HighCard]: 1302540,
}

const distinct = new Set<number>()
const frequency = new Map<Category, number>()
let total = 0

const t0 = Date.now()
const hand = [0, 0, 0, 0, 0]
for (let a = 0; a < DECK_SIZE - 4; a++) {
  hand[0] = a
  for (let b = a + 1; b < DECK_SIZE - 3; b++) {
    hand[1] = b
    for (let c = b + 1; c < DECK_SIZE - 2; c++) {
      hand[2] = c
      for (let d = c + 1; d < DECK_SIZE - 1; d++) {
        hand[3] = d
        for (let e = d + 1; e < DECK_SIZE; e++) {
          hand[4] = e
          const s = evaluate(hand)
          distinct.add(s)
          const cat = categoryOf(s)
          frequency.set(cat, (frequency.get(cat) ?? 0) + 1)
          total++
        }
      }
    }
  }
}
const elapsed = Date.now() - t0

console.log(`\nEnumerated ${total.toLocaleString()} five-card hands in ${elapsed} ms`)
console.log(`(${Math.round(total / (elapsed / 1000) / 1000).toLocaleString()}k evals/sec)\n`)

check('total five-card hands', total, 2598960)
check('distinct equivalence classes', distinct.size, 7462)

for (const key of Object.keys(EXPECTED_FREQUENCIES)) {
  const cat = Number(key) as Category
  check(`frequency ${CATEGORY_NAMES[cat]}`, frequency.get(cat) ?? 0, EXPECTED_FREQUENCIES[cat])
}

// ---------------------------------------------------------------------------
// 2. Ordering spot checks, including the traps.
// ---------------------------------------------------------------------------

const S = 0, H = 1, D = 2, C = 3
const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)
const hand5 = (spec: Array<[string, number]>) => spec.map(([r, s]) => card(r, s))

function cmp(a: number[], b: number[]): number {
  const ea = evaluate(a), eb = evaluate(b)
  return ea > eb ? 1 : ea < eb ? -1 : 0
}

// The wheel: A-2-3-4-5 is a straight, and the LOWEST one.
const wheel = hand5([['A', S], ['2', H], ['3', D], ['4', C], ['5', S]])
check('wheel is a straight', CATEGORY_NAMES[categoryOf(evaluate(wheel))], 'Straight')
const sixHigh = hand5([['2', S], ['3', H], ['4', D], ['5', C], ['6', S]])
check('six-high straight beats the wheel', cmp(sixHigh, wheel), 1)

// A wheel must not be mistaken for an ace-high straight.
const broadway = hand5([['T', S], ['J', H], ['Q', D], ['K', C], ['A', S]])
check('broadway beats the wheel', cmp(broadway, wheel), 1)

// Steel wheel is a straight flush.
const steelWheel = hand5([['A', S], ['2', S], ['3', S], ['4', S], ['5', S]])
check('steel wheel is a straight flush', CATEGORY_NAMES[categoryOf(evaluate(steelWheel))], 'Straight flush')

// Category ordering.
check('quads beat a full house', cmp(
  hand5([['9', S], ['9', H], ['9', D], ['9', C], ['2', S]]),
  hand5([['A', S], ['A', H], ['A', D], ['K', C], ['K', S]]),
), 1)
check('flush beats a straight', cmp(
  hand5([['2', S], ['5', S], ['9', S], ['J', S], ['K', S]]),
  hand5([['9', S], ['T', H], ['J', D], ['Q', C], ['K', S]]),
), 1)

// Seven-card cases: the best five must be found among seven.
// Two trips is a full house using the lower trip as the pair.
const twoTrips = [
  ...hand5([['9', S], ['9', H], ['9', D], ['5', C], ['5', S]]),
  card('5', H), card('2', C),
]
check('two trips makes a full house', CATEGORY_NAMES[categoryOf(evaluate(twoTrips))], 'Full house')

// Three pairs: only the top two play.
const threePair = [
  ...hand5([['K', S], ['K', H], ['9', D], ['9', C], ['4', S]]),
  card('4', H), card('A', C),
]
const twoPairScore = evaluate(threePair)
check('three pairs is scored as two pair', CATEGORY_NAMES[categoryOf(twoPairScore)], 'Two pair')
check('three pairs uses the ace kicker', twoPairScore, evaluate(
  [...hand5([['K', S], ['K', H], ['9', D], ['9', C], ['A', C]]), card('2', S), card('7', H)],
))

// A six-card straight scores as its top five.
const sixStraight = [
  ...hand5([['5', S], ['6', H], ['7', D], ['8', C], ['9', S]]),
  card('T', H), card('2', C),
]
check('six-card run scores the top five', evaluate(sixStraight), evaluate(
  hand5([['6', S], ['7', H], ['8', D], ['9', C], ['T', H]]),
))

// ---------------------------------------------------------------------------

console.log()
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('All evaluator checks passed.')
