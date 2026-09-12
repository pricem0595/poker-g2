// Is 72o really the worst starting hand, or is 32o?
//   node --experimental-strip-types scripts/worst-hand.ts

import { makeCard, makeRng } from '../src/cards.ts'
import { simulate } from '../src/equity.ts'

const RANKS = '23456789TJQKA'
const card = (label: string, suit: number) => makeCard(RANKS.indexOf(label), suit)
const TRIALS = 2000000

const hands: Record<string, number[]> = {
  '72o': [card('7', 0), card('2', 1)],
  '32o': [card('3', 0), card('2', 1)],
  '42o': [card('4', 0), card('2', 1)],
  '62o': [card('6', 0), card('2', 1)],
  '82o': [card('8', 0), card('2', 1)],
}

console.log(`\nHeads-up vs one random hand, ${TRIALS.toLocaleString()} trials each\n`)
console.log('  hand   win%    tie%    equity (win + tie/2)')
console.log('  ------------------------------------------')

const scored: Array<[string, number]> = []
for (const [name, hole] of Object.entries(hands)) {
  const e = simulate({ hole, board: [], opponents: 1, trials: TRIALS, rng: makeRng(99) })
  const equity = e.win + e.tie / 2
  scored.push([name, equity])
  console.log(
    `  ${name}   ${(e.win * 100).toFixed(2)}   ${(e.tie * 100).toFixed(2)}   ${(equity * 100).toFixed(2)}%`,
  )
}

scored.sort((a, b) => a[1] - b[1])
console.log(`\n  weakest: ${scored[0][0]} at ${(scored[0][1] * 100).toFixed(2)}%`)
console.log(`  margin over next: ${((scored[1][1] - scored[0][1]) * 100).toFixed(3)}pp`)
console.log(`  95% CI at ${TRIALS.toLocaleString()} trials: about +/-0.07pp\n`)
