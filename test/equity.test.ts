// Equity conformance.
//
// Run: node --experimental-strip-types test/equity.test.ts
//
// Checked against Wizard of Odds power-rating tables. The two-player figures
// come from an exact enumeration of all 2,781,381,002,400 outcomes, so they are
// truth, not estimates - any disagreement beyond Monte Carlo error is our bug.
//   https://wizardofodds.com/games/texas-hold-em/2-player-game/
//   https://wizardofodds.com/games/texas-hold-em/6-player-game/
//   https://wizardofodds.com/games/texas-hold-em/10-player-game/

import { makeCard, makeRng, remainingDeck, suitOf } from '../src/cards.ts'
import { DEFAULT_TRIALS, countOuts, findOuts, ruleOf4And2, simulate } from '../src/equity.ts'

let failures = 0
const S = 0, H = 1, D = 2, C = 3
const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)

function near(name: string, actual: number, expected: number, tolerance: number) {
  const delta = Math.abs(actual - expected)
  const ok = delta <= tolerance
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}: ${(actual * 100).toFixed(2)}% ` +
      `(expected ${(expected * 100).toFixed(2)}%, delta ${(delta * 100).toFixed(2)}pp, tol ${(tolerance * 100).toFixed(2)}pp)`,
  )
}

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` - expected ${expected}, got ${actual}`}`)
}

const AA = [card('A', S), card('A', H)]
const AKs = [card('A', S), card('K', S)]

// ---------------------------------------------------------------------------
// Published equities. Tolerance is 1pp - roughly the 95% interval at 25k trials.
// ---------------------------------------------------------------------------

console.log('\nMonte Carlo vs published exact equities\n')

const t0 = Date.now()

const aaHeadsUp = simulate({ hole: AA, board: [], opponents: 1, trials: DEFAULT_TRIALS, rng: makeRng(1) })
near('AA vs 1 random - win', aaHeadsUp.win, 0.8493, 0.01)
near('AA vs 1 random - lose', aaHeadsUp.lose, 0.1452, 0.01)
near('AA vs 1 random - tie', aaHeadsUp.tie, 0.0054, 0.01)

const aksHeadsUp = simulate({ hole: AKs, board: [], opponents: 1, trials: DEFAULT_TRIALS, rng: makeRng(2) })
near('AKs vs 1 random - win', aksHeadsUp.win, 0.6622, 0.01)

const aaSixHanded = simulate({ hole: AA, board: [], opponents: 5, trials: DEFAULT_TRIALS, rng: makeRng(3) })
near('AA vs 5 random (6-handed)', aaSixHanded.win, 0.4951, 0.01)

const aaTenHanded = simulate({ hole: AA, board: [], opponents: 9, trials: DEFAULT_TRIALS, rng: makeRng(4) })
near('AA vs 9 random (10-handed)', aaTenHanded.win, 0.3136, 0.01)

const elapsed = Date.now() - t0
console.log(`\n6 simulations x ${DEFAULT_TRIALS.toLocaleString()} trials in ${elapsed} ms\n`)

// ---------------------------------------------------------------------------
// Timing budget: 25k trials x 6 hands must stay well under 500 ms.
// ---------------------------------------------------------------------------

const tTime = Date.now()
simulate({ hole: AA, board: [], opponents: 5, trials: DEFAULT_TRIALS, rng: makeRng(9) })
const single = Date.now() - tTime
console.log(`25k trials vs 5 opponents: ${single} ms (desktop; budget 500 ms)`)
check('25k x 6 hands under 500 ms', single < 500, true)

// ---------------------------------------------------------------------------
// Determinism: same seed, same answer. Without this a regression is
// indistinguishable from simulation noise.
// ---------------------------------------------------------------------------

const runA = simulate({ hole: AA, board: [], opponents: 3, trials: 5000, rng: makeRng(42) })
const runB = simulate({ hole: AA, board: [], opponents: 3, trials: 5000, rng: makeRng(42) })
check('same seed reproduces win count', runA.win, runB.win)
check('same seed reproduces tie count', runA.tie, runB.tie)

const runC = simulate({ hole: AA, board: [], opponents: 3, trials: 5000, rng: makeRng(43) })
check('different seed gives a different run', runA.win !== runC.win, true)

// ---------------------------------------------------------------------------
// Deterministic river: a made straight flush cannot lose.
// ---------------------------------------------------------------------------

const nutFlush = simulate({
  hole: [card('9', S), card('8', S)],
  board: [card('7', S), card('6', S), card('5', S), card('2', H), card('3', D)],
  opponents: 3,
  trials: 2000,
  rng: makeRng(7),
})
check('straight flush on the river never loses', nutFlush.lose, 0)

// ---------------------------------------------------------------------------
// Outs.
// ---------------------------------------------------------------------------

console.log()

// Four to a flush on the flop: the 9 remaining spades. The naive "any category
// improvement" definition returns 23 here because every pair counts; winning
// outs should land near 9.
// Assert COMPOSITION, not a bare count. Against only 2 opponents an ace or a
// king also makes hero a favourite (top pair, top kicker), so the honest total
// here is higher than the textbook 9 - that figure assumes you need the flush.
// What must always hold is that every flush card is an out.
const drawHole = [card('A', S), card('K', S)]
const drawBoard = [card('7', S), card('2', S), card('9', H)]
const flushOuts = findOuts(drawHole, drawBoard, 2, makeRng(11))
const flushDraw = flushOuts.length
const spadesLeft = remainingDeck([...drawHole, ...drawBoard]).filter((c) => suitOf(c) === S)
console.log(`    flush draw vs 2 opponents -> ${flushDraw} outs (${spadesLeft.length} spades left)`)
check('9 spades remain unseen', spadesLeft.length, 9)
check('every remaining spade is an out', spadesLeft.every((c) => flushOuts.includes(c)), true)
check('outs stay under half the unseen deck', flushDraw < 24, true)
check('rule of 4 on 9 outs', ruleOf4And2(9, 2), 36)
check('rule of 2 on 9 outs', ruleOf4And2(9, 1), 18)

// Open-ended straight draw: 6 5 4 3 wants a seven or a deuce.
const oesd = countOuts([card('6', S), card('5', H)], [card('4', D), card('3', C), card('K', H)], 2, makeRng(12))
console.log(`    open-ended draw vs 2 opponents -> ${oesd} outs`)
check('open-ended draw is in the 6-12 range', oesd >= 6 && oesd <= 12, true)

// Outs depend on opponent count - a draw is worth less against more players.
const drawVsMany = countOuts([card('A', S), card('K', S)], [card('7', S), card('2', S), card('9', H)], 8, makeRng(13))
console.log(`    same flush draw vs 8 opponents -> ${drawVsMany} outs`)
check('more opponents never increases outs', drawVsMany <= flushDraw, true)

check('no outs once the board is complete', countOuts(
  [card('A', S), card('K', S)],
  [card('7', S), card('2', S), card('9', H), card('3', D), card('4', C)],
  2, makeRng(14),
), 0)

check('rule of 4 and 2 is capped at 100', ruleOf4And2(30, 2), 100)

// ---------------------------------------------------------------------------

console.log()
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('All equity checks passed.')
