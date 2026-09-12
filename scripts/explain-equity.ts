// What exactly does the WIN % mean?
//   node --experimental-strip-types scripts/explain-equity.ts
//
// Reproduces the on-screen spot (2s2h on 4s 6h 2d 9d, 4 live = 3 opponents)
// under each opponent style, to show that the range really does feed the number.

import { formatCards, makeCard, makeRng } from '../src/cards.ts'
import { simulate } from '../src/equity.ts'
import { TIGHTNESS, TIGHTNESS_ORDER, describeRange, opponentPool } from '../src/ranges.ts'

const S = 0, H = 1, D = 2, C = 3
const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)

const hole = [card('2', S), card('2', H)]
const board = [card('4', S), card('6', H), card('2', D), card('9', D)]
const OPPONENTS = 3
const TRIALS = 200000

console.log(`\n  your hand : ${formatCards(hole)}   (trip deuces)`)
console.log(`  board     : ${formatCards(board)}`)
console.log(`  opponents : ${OPPONENTS}`)
console.log(`  trials    : ${TRIALS.toLocaleString()}\n`)
console.log('  style     assumed range      pool    WIN%')
console.log('  ---------------------------------------------')

for (const t of TIGHTNESS_ORDER) {
  const pool = t === 'any' ? undefined : opponentPool(t, hole, board)
  const { win } = simulate({
    hole, board, opponents: OPPONENTS, trials: TRIALS, rng: makeRng(4242), pool,
  })
  const label = TIGHTNESS[t].label.padEnd(8)
  const range = describeRange(t, board.length).padEnd(17)
  const size = String(pool?.length ?? 'all').padStart(5)
  console.log(`  ${label}  ${range}  ${size}   ${(win * 100).toFixed(1)}%`)
}

console.log('\n  The WIN% is against opponents drawing from that pool - not')
console.log('  against arbitrary hands. Tighter assumption, lower number.\n')
