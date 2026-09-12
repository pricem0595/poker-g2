// Does folding change your equity?
//
// Run: node --experimental-strip-types test/folding.test.ts
//
// Two separate questions that get conflated:
//   1. Fewer opponents reaching showdown  -> huge effect.
//   2. The 2 cards each folder took with them -> none, while they stay unknown.
// A third effect (folders are not random, so survivors hold stronger hands) is
// real but outside a random-hand model. This file measures 1 and 2.

import { formatCards, makeCard, makeRng, remainingDeck } from '../src/cards.ts'
import { evaluate } from '../src/evaluator.ts'
import { simulate } from '../src/equity.ts'
import { adjustLive, initialState, newHand, opponentsOf } from '../src/state.ts'

const S = 0, H = 1
const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)
const POCKET_FIVES = [card('5', S), card('5', H)]
const TRIALS = 200000

console.log(`\nPocket fives, preflop, ${TRIALS.toLocaleString()} trials each\n`)
console.log(`  hand: ${formatCards(POCKET_FIVES)}\n`)
console.log('  opponents   win      tie     lose')
console.log('  ---------------------------------')

for (const opponents of [9, 8, 5, 3, 2, 1]) {
  const e = simulate({ hole: POCKET_FIVES, board: [], opponents, trials: TRIALS, rng: makeRng(100 + opponents) })
  const label = `${opponents}`.padStart(5)
  console.log(
    `  ${label}     ${(e.win * 100).toFixed(1).padStart(5)}%  ${(e.tie * 100).toFixed(1).padStart(5)}%  ${(e.lose * 100).toFixed(1).padStart(5)}%`,
  )
}

// ---------------------------------------------------------------------------
// Do the folded cards themselves matter?
//
// Deal the 8 folders their two cards each, discard them face down, and play the
// hand out against the one remaining opponent. Compare with never dealing them
// at all. If unknown folded cards mattered, these would differ.
// ---------------------------------------------------------------------------

function simulateWithFolders(
  hole: readonly number[],
  opponents: number,
  folders: number,
  trials: number,
  rng: () => number,
): number {
  const deck = remainingDeck(hole)
  const draws = 5 + opponents * 2 + folders * 2
  const seven = new Array<number>(7)
  let wins = 0

  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < draws; i++) {
      const j = i + Math.floor(rng() * (deck.length - i))
      const tmp = deck[i]
      deck[i] = deck[j]
      deck[j] = tmp
    }

    // deck[0..1] go to the folders (discarded), then the board, then opponents.
    const folded = folders * 2
    seven[0] = hole[0]
    seven[1] = hole[1]
    for (let i = 0; i < 5; i++) seven[2 + i] = deck[folded + i]
    const hero = evaluate(seven)

    let best = -1
    let cursor = folded + 5
    for (let o = 0; o < opponents; o++) {
      seven[0] = deck[cursor++]
      seven[1] = deck[cursor++]
      const s = evaluate(seven)
      if (s > best) best = s
    }
    if (hero > best) wins++
  }
  return wins / trials
}

console.log('\nDoes burning the folders’ cards change anything?\n')

const noFolders = simulateWithFolders(POCKET_FIVES, 1, 0, TRIALS, makeRng(555))
const eightFolders = simulateWithFolders(POCKET_FIVES, 1, 8, TRIALS, makeRng(556))
const delta = Math.abs(noFolders - eightFolders)

console.log(`  heads-up, nobody else dealt in : ${(noFolders * 100).toFixed(2)}%`)
console.log(`  heads-up, 8 players folded     : ${(eightFolders * 100).toFixed(2)}%`)
console.log(`  difference                     : ${(delta * 100).toFixed(2)}pp`)

// At 200k trials the 95% interval is about +/-0.22pp, so two independent runs
// should sit within roughly 0.31pp of each other if the true values are equal.
const MC_NOISE = 0.0045
const verdict = delta <= MC_NOISE ? 'PASS' : 'FAIL'
console.log(`\n  ${verdict}  difference is within Monte Carlo noise (${(MC_NOISE * 100).toFixed(2)}pp)`)

if (verdict === 'FAIL') process.exit(1)
console.log('\n  => unknown folded cards do not change your equity.')
console.log('     Only the number of opponents still live does.\n')

// ---------------------------------------------------------------------------
// The live count is what feeds the simulation, and it must reset each hand.
// ---------------------------------------------------------------------------

let stateFailures = 0
function expect(name: string, actual: unknown, want: unknown) {
  const ok = actual === want
  if (!ok) stateFailures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` - expected ${want}, got ${actual}`}`)
}

console.log('Live-count state\n')

const seated = { ...initialState(10), phase: 'result' as const }
expect('opponents starts at table size', opponentsOf(seated), 9)

const folded = adjustLive(seated, -8)
expect('eight folds leaves one opponent', opponentsOf(folded), 1)
expect('adjusting restarts the simulation', folded.phase, 'computing')

expect('cannot drop below heads-up', adjustLive({ ...folded, phase: 'result' }, -5).live, 2)
expect('cannot exceed the table', adjustLive({ ...seated, live: 10 }, 3).live, 10)

const fresh = newHand({ ...folded, phase: 'result' })
expect('a new hand restores the full table', fresh.live, 10)

expect('scroll is ignored outside a result screen', adjustLive(initialState(10), -1).live, 10)

console.log()
if (stateFailures > 0) {
  console.error(`${stateFailures} state check(s) FAILED`)
  process.exit(1)
}
console.log('  All live-count checks passed.\n')
