// What does opponent style actually cost you?
//   node --experimental-strip-types scripts/style-comparison.ts

import { formatCards, makeCard, makeRng } from '../src/cards.ts'
import { simulate } from '../src/equity.ts'
import { TIGHTNESS, TIGHTNESS_ORDER, opponentPool } from '../src/ranges.ts'

const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)
const TRIALS = 120000

const hands: Array<[string, number[]]> = [
  ['AA ', [card('A', 0), card('A', 1)]],
  ['AKs', [card('A', 0), card('K', 0)]],
  ['KJo', [card('K', 0), card('J', 2)]],
  ['55 ', [card('5', 0), card('5', 1)]],
  ['72o', [card('7', 0), card('2', 2)]],
]

for (const opponents of [5, 1]) {
  console.log(`\nPreflop win%, ${opponents} opponent${opponents === 1 ? '' : 's'}, ${TRIALS.toLocaleString()} trials\n`)
  console.log('  hand   ' + TIGHTNESS_ORDER.map((t) => TIGHTNESS[t].label.padStart(8)).join(''))
  console.log('  ' + '-'.repeat(9 + 8 * TIGHTNESS_ORDER.length))

  for (const [name, hole] of hands) {
    const cells = TIGHTNESS_ORDER.map((t) => {
      const { win } = simulate({
        hole,
        board: [],
        opponents,
        trials: TRIALS,
        rng: makeRng(2026),
        pool: t === 'any' ? undefined : opponentPool(t, hole, []),
      })
      return `${(win * 100).toFixed(1)}%`.padStart(8)
    })
    console.log(`  ${name}  ${cells.join('')}`)
  }
}

console.log('\n  Reading it: strong hands barely move because they already beat')
console.log('  premium holdings. Marginal hands collapse, because a tight')
console.log('  opponent no longer turns up with junk.\n')
