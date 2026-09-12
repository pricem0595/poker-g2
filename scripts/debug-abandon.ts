// Is rejection sampling biasing multi-opponent range simulations?
//   node --experimental-strip-types scripts/debug-abandon.ts

import { makeCard, makeRng } from '../src/cards.ts'
import { createSimulation } from '../src/equity.ts'
import { TIGHTNESS_ORDER, TIGHTNESS, opponentPool } from '../src/ranges.ts'

const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)
const AA = [card('A', 0), card('A', 1)]
const TRIALS = 50000

console.log(`\nAbandoned trials by style and opponent count (${TRIALS.toLocaleString()} attempted)\n`)
console.log('  opponents  style     pool   abandoned   counted    win%')
console.log('  ---------------------------------------------------------')

for (const opponents of [1, 3, 5, 9]) {
  for (const t of TIGHTNESS_ORDER) {
    const pool = t === 'any' ? undefined : opponentPool(t, AA, [])
    const sim = createSimulation({
      hole: AA, board: [], opponents, trials: TRIALS, rng: makeRng(7), pool,
    })
    sim.step(TRIALS)
    const r = sim.result()
    const pct = ((sim.abandoned / TRIALS) * 100).toFixed(1)
    console.log(
      `  ${String(opponents).padStart(9)}  ${TIGHTNESS[t].label.padEnd(8)} ` +
        `${String(pool?.length ?? 1326).padStart(5)}  ${String(sim.abandoned).padStart(7)} (${pct.padStart(4)}%)  ` +
        `${String(r.trials).padStart(7)}  ${(r.win * 100).toFixed(1)}%`,
    )
  }
  console.log()
}
