// Opponent range conformance.
//   node --experimental-strip-types test/ranges.test.ts

import { formatCard, formatCards, makeCard, makeRng } from '../src/cards.ts'
import { evaluate } from '../src/evaluator.ts'
import { simulate } from '../src/equity.ts'
import {
  TIGHTNESS,
  availableCombos,
  describeRange,
  narrowToBoard,
  opponentPool,
  rangeFor,
  retentionFor,
} from '../src/ranges.ts'
import { HAND_RANKINGS } from '../src/rankings.ts'

let failures = 0
const S = 0, H = 1, D = 2, C = 3
const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)

function check(name: string, actual: unknown, want: unknown) {
  const ok = actual === want
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` - expected ${want}, got ${actual}`}`)
}

function assert(name: string, condition: boolean, detail = '') {
  if (!condition) failures++
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : ` - ${detail}`}`)
}

// ---------------------------------------------------------------------------
console.log('\nRanking table\n')

check('169 starting-hand classes', HAND_RANKINGS.length, 169)
check('aces rank first', HAND_RANKINGS[0], 'AA')
assert('kings rank second', HAND_RANKINGS[1] === 'KK', HAND_RANKINGS[1])
assert(
  'the premium hands are all in the top 15',
  ['AA', 'KK', 'QQ', 'JJ', 'AKs'].every((code) => HAND_RANKINGS.indexOf(code) < 15),
  HAND_RANKINGS.slice(0, 15).join(' '),
)
assert(
  'suited beats its offsuit twin',
  HAND_RANKINGS.indexOf('AKs') < HAND_RANKINGS.indexOf('AKo') &&
    HAND_RANKINGS.indexOf('87s') < HAND_RANKINGS.indexOf('87o'),
)
assert('no duplicate classes', new Set(HAND_RANKINGS).size === 169)

// ---------------------------------------------------------------------------
console.log('\nRange sizes (of 1326 combos)\n')

for (const key of ['any', 'loose', 'normal', 'tight'] as const) {
  const size = rangeFor(key).length
  const want = Math.max(1, Math.round((TIGHTNESS[key].pct / 100) * 1326))
  console.log(`  ${TIGHTNESS[key].label.padEnd(8)} ${String(size).padStart(4)} combos  (${TIGHTNESS[key].pct}%)`)
  check(`${key} range is the right size`, size, want)
}

assert('tighter ranges are strict subsets', (() => {
  const tight = new Set(rangeFor('tight').map(String))
  return rangeFor('normal').map(String).filter((c) => tight.has(c)).length === tight.size
})(), 'tight should be contained in normal')

// ---------------------------------------------------------------------------
console.log('\nBlocked cards\n')

const heroAA = [card('A', S), card('A', H)]
const withoutAces = availableCombos('tight', heroAA)
assert(
  'combos using our own cards are excluded',
  withoutAces.every((c) => !heroAA.includes(c[0]) && !heroAA.includes(c[1])),
)
assert('holding AA removes some of the tight range', withoutAces.length < rangeFor('tight').length)

// ---------------------------------------------------------------------------
console.log('\nBoard-aware narrowing\n')

// The defining property of narrowing: everything kept must be at least as
// strong as everything dropped, measured against the actual board.
const board = [card('7', H), card('6', D), card('2', C)]
const heroOnBoard = [...heroAA, ...board]
const allLegal = availableCombos('any', heroOnBoard)
const kept = narrowToBoard(allLegal, board, retentionFor(3))
const keptSet = new Set(kept.map((c) => `${c[0]}-${c[1]}`))
const dropped = allLegal.filter((c) => !keptSet.has(`${c[0]}-${c[1]}`))

const scoreOf = (c: readonly [number, number]) => evaluate([c[0], c[1], ...board])
const worstKept = Math.min(...kept.map(scoreOf))
const bestDropped = Math.max(...dropped.map(scoreOf))

console.log(`  board ${formatCards(board)}: kept ${kept.length} of ${allLegal.length}`)
assert('nothing dropped is stronger than anything kept', bestDropped <= worstKept)
assert('roughly 60% survives the flop', Math.abs(kept.length / allLegal.length - 0.6) < 0.02)

// A hand that connected with this board must be in the surviving half.
const twoPair: readonly [number, number] = [card('7', S), card('6', S)]
assert(
  'a flopped two pair survives',
  keptSet.has(`${twoPair[0]}-${twoPair[1]}`) || keptSet.has(`${twoPair[1]}-${twoPair[0]}`),
  `${formatCards(twoPair)} scored ${scoreOf(twoPair)}, cutoff ${worstKept}`,
)

// ...and the weakest possible holding must not be.
const airball: readonly [number, number] = [card('4', S), card('3', H)]
assert(
  'the weakest holding is cut',
  !keptSet.has(`${airball[0]}-${airball[1]}`) && !keptSet.has(`${airball[1]}-${airball[0]}`),
  formatCards(airball),
)

// Narrowing by preflop rank instead would be BACKWARDS: 76s ranks 115/169 by
// raw equity and would be dropped despite flopping two pair, while ace-king
// would be kept despite missing everything. Board-awareness is the whole point.
assert(
  '76s ranks poorly preflop yet still survives this board',
  HAND_RANKINGS.indexOf('76s') > 100 &&
    (keptSet.has(`${twoPair[0]}-${twoPair[1]}`) || keptSet.has(`${twoPair[1]}-${twoPair[0]}`)),
)

check('retention: preflop', retentionFor(0), 1)
check('retention: flop', retentionFor(3), 0.6)
check('retention: turn', retentionFor(4), 0.42)
check('retention: river', retentionFor(5), 0.3)

assert('narrowToBoard is a no-op preflop', narrowToBoard(rangeFor('tight'), [], 0.5).length === rangeFor('tight').length)

// ---------------------------------------------------------------------------
console.log('\nEffect on equity\n')

// Random-hand mode must be unchanged - it is the validated baseline.
const baseline = simulate({ hole: heroAA, board: [], opponents: 1, trials: 50000, rng: makeRng(1) })
console.log(`  AA vs 1 random hand        ${(baseline.win * 100).toFixed(1)}%  (published 84.93%)`)
assert('random mode still matches published equity', Math.abs(baseline.win - 0.8493) < 0.01)

const equities: Array<[string, number]> = []
for (const key of ['any', 'loose', 'normal', 'tight'] as const) {
  const e = simulate({
    hole: heroAA,
    board: [],
    opponents: 1,
    trials: 50000,
    rng: makeRng(2),
    pool: key === 'any' ? undefined : opponentPool(key, heroAA, []),
  })
  equities.push([key, e.win])
  console.log(`  AA vs 1 ${TIGHTNESS[key].label.padEnd(8)} ${(e.win * 100).toFixed(1)}%`)
}

// NOT monotonic, and that is correct. Aces do best against dominated big cards
// (AA vs AKo is 92.6%) and worst against suited connectors (AA vs 76s is 77.0%).
// A top-40% range ordered by raw equity is full of the former and short of the
// latter, so "Loose" can genuinely beat "Any two" for aces specifically.
// Only the tight end is required to cost us.
assert(
  'a tight field reduces our equity relative to random',
  equities[3][1] < equities[0][1],
  equities.map(([k, w]) => `${k}:${(w * 100).toFixed(1)}`).join(' '),
)
// Aces lose surprisingly little to a tight field - they dominate even premium
// hands (AA vs KK is about 81%), so a point or so is the correct magnitude.
assert(
  'a tight range costs AA something, but not much',
  equities[0][1] - equities[3][1] > 0.004 && equities[0][1] - equities[3][1] < 0.05,
  `any ${(equities[0][1] * 100).toFixed(1)} vs tight ${(equities[3][1] * 100).toFixed(1)}`,
)

// A marginal hand is where ranges really bite.
const marginal = [card('K', S), card('J', D)]
const kjAny = simulate({ hole: marginal, board: [], opponents: 1, trials: 50000, rng: makeRng(5) })
const kjTight = simulate({
  hole: marginal, board: [], opponents: 1, trials: 50000, rng: makeRng(5),
  pool: opponentPool('tight', marginal, []),
})
console.log(`
  KJo vs 1 random          ${(kjAny.win * 100).toFixed(1)}%`)
console.log(`  KJo vs 1 tight opponent  ${(kjTight.win * 100).toFixed(1)}%`)
assert('a tight range hurts KJo far more than AA', kjAny.win - kjTight.win > 0.10)

// A trash hand should suffer even more against a tight field.
const trash = [card('7', S), card('2', D)]
const trashAny = simulate({ hole: trash, board: [], opponents: 1, trials: 50000, rng: makeRng(3) })
const trashTight = simulate({
  hole: trash, board: [], opponents: 1, trials: 50000, rng: makeRng(3),
  pool: opponentPool('tight', trash, []),
})
console.log(`\n  72o vs 1 random           ${(trashAny.win * 100).toFixed(1)}%`)
console.log(`  72o vs 1 tight opponent  ${(trashTight.win * 100).toFixed(1)}%`)
assert('72o is punished harder by a tight range', trashAny.win - trashTight.win > 0.05)

// ---------------------------------------------------------------------------
console.log('\nLabels\n')

check('preflop label shows the raw percentage', describeRange('normal', 0), 'Normal (20%)')
check('flop label shows the narrowed percentage', describeRange('normal', 3), 'Normal (~12%)')
check('any two is never decorated', describeRange('any', 3), 'Any two')

// ---------------------------------------------------------------------------
console.log()
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('All range checks passed.\n')
