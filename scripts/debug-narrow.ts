// Why did 76s not survive narrowing?
//   node --experimental-strip-types scripts/debug-narrow.ts

import { formatCards, makeCard } from '../src/cards.ts'
import { CATEGORY_NAMES, categoryOf, evaluate } from '../src/evaluator.ts'
import { availableCombos, opponentPool, rangeFor } from '../src/ranges.ts'
import { HAND_RANKINGS } from '../src/rankings.ts'

const S = 0, H = 1, D = 2, C = 3
const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)

for (const code of ['76s', '76o', 'KQo', 'KQs', 'AA', '22']) {
  const idx = HAND_RANKINGS.indexOf(code)
  const pctile = ((idx / 169) * 100).toFixed(0)
  console.log(`  ${code.padEnd(4)} class rank ${String(idx + 1).padStart(3)}/169  (~${pctile}th percentile)`)
}

const hero = [card('A', S), card('A', H)]
const board = [card('7', H), card('6', D), card('2', C)]

console.log(`\nboard: ${formatCards(board)}`)

const loose = rangeFor('loose')
const has76s = loose.some((c) => {
  const ranks = [c[0] >> 2, c[1] >> 2].sort()
  return ranks[0] === 4 && ranks[1] === 5 && (c[0] & 3) === (c[1] & 3)
})
console.log(`  76s present in the loose range: ${has76s}`)

const available = availableCombos('loose', [...hero, ...board])
const pool = opponentPool('loose', hero, board)
console.log(`  loose combos available: ${available.length}, surviving: ${pool.length}`)

// What does 76s actually make here, and where does it rank?
const candidates = [
  ['7s6s', [card('7', S), card('6', S)]],
  ['7c6c', [card('7', C), card('6', C)]],
  ['KdQh', [card('K', D), card('Q', H)]],
  ['AcKc', [card('A', C), card('K', C)]],
] as const

const scored = available
  .map((c) => ({ combo: c, score: evaluate([c[0], c[1], ...board]) }))
  .sort((a, b) => b.score - a.score)

console.log()
for (const [name, combo] of candidates) {
  const score = evaluate([combo[0], combo[1], ...board])
  const position = scored.findIndex((e) => e.score === score)
  const inPool = pool.some((c) => (c[0] === combo[0] && c[1] === combo[1]) || (c[0] === combo[1] && c[1] === combo[0]))
  const legal = available.some((c) => (c[0] === combo[0] && c[1] === combo[1]) || (c[0] === combo[1] && c[1] === combo[0]))
  console.log(
    `  ${name}  ${CATEGORY_NAMES[categoryOf(score)].padEnd(16)} ` +
      `rank ~${position + 1}/${scored.length}  legal=${legal}  survives=${inPool}`,
  )
}
