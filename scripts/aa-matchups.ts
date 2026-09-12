// Does AA really prefer facing a big pair over a suited connector?
//   node --experimental-strip-types scripts/aa-matchups.ts
//
// If so, a range that excludes suited connectors would RAISE hero's equity,
// which would explain why "Loose" beats "Any two" for pocket aces.

import { formatCards, makeCard, makeRng, remainingDeck } from '../src/cards.ts'
import { evaluate } from '../src/evaluator.ts'

const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)
const S = 0, H = 1, D = 2, C = 3
const AA = [card('A', S), card('A', H)]
const TRIALS = 400000

/** Hero vs one SPECIFIC opponent hand, board fully dealt. */
function headsUp(hero: number[], villain: number[], trials: number, rng: () => number): number {
  const deck = remainingDeck([...hero, ...villain])
  const seven = new Array<number>(7)
  let score = 0
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < 5; i++) {
      const j = i + Math.floor(rng() * (deck.length - i))
      const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp
    }
    seven[0] = hero[0]; seven[1] = hero[1]
    for (let i = 0; i < 5; i++) seven[2 + i] = deck[i]
    const a = evaluate(seven)
    seven[0] = villain[0]; seven[1] = villain[1]
    const b = evaluate(seven)
    if (a > b) score += 1
    else if (a === b) score += 0.5
  }
  return score / trials
}

const villains: Array<[string, number[]]> = [
  ['KK  (big pair)      ', [card('K', D), card('K', C)]],
  ['QQ  (big pair)      ', [card('Q', D), card('Q', C)]],
  ['AKo (dominated)     ', [card('A', D), card('K', C)]],
  ['KQo (two big cards) ', [card('K', D), card('Q', C)]],
  ['76s (suited conn.)  ', [card('7', C), card('6', C)]],
  ['54s (suited conn.)  ', [card('5', C), card('4', C)]],
  ['J9s (suited gapper) ', [card('J', C), card('9', C)]],
]

console.log(`\nAA equity heads-up vs a known hand, ${TRIALS.toLocaleString()} trials each\n`)
const rows: Array<[string, number]> = []
for (const [name, villain] of villains) {
  const eq = headsUp(AA, villain, TRIALS, makeRng(11))
  rows.push([name, eq])
  console.log(`  AA vs ${name} ${(eq * 100).toFixed(2)}%`)
}

rows.sort((a, b) => b[1] - a[1])
console.log(`\n  AA does best against:  ${rows[0][0].trim()} (${(rows[0][1] * 100).toFixed(2)}%)`)
console.log(`  AA does worst against: ${rows[rows.length - 1][0].trim()} (${(rows[rows.length - 1][1] * 100).toFixed(2)}%)`)
console.log(`  spread: ${((rows[0][1] - rows[rows.length - 1][1]) * 100).toFixed(2)}pp\n`)
