// Every screen must fit the display.
//   node --experimental-strip-types test/layout.test.ts
//
// Added after an 11-line turn readout silently overflowed - the last row was
// cut off and only a screenshot revealed it. Character count is not the
// constraint; line count is.

import { makeCard } from '../src/cards.ts'
import { MAX_SCREEN_LINES, isOversized, lineCount, render } from '../src/ui.ts'
import {
  type State,
  MIN_PLAYERS,
  adjustLive,
  click,
  initialState,
} from '../src/state.ts'

let failures = 0
const card = (label: string, suit: number) => makeCard('23456789TJQKA'.indexOf(label), suit)

function fits(name: string, state: State) {
  const text = render(state)
  const lines = lineCount(text)
  const ok = !isOversized(text)
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} ${String(lines).padStart(2)} lines, ${String(text.length).padStart(3)} chars`,
  )
}

// Worst case: ten players, a full board, outs showing, a long hand name and a
// long range label all at once.
const base: State = {
  ...initialState(10, 'loose'),
  hole: [card('2', 0), card('2', 1)],
  board: [],
  street: 'hole',
  phase: 'result',
  live: 6,
  liveMax: 10,
  equity: { win: 0.4612, tie: 0.0231, lose: 0.5157, trials: 25000 },
  outs: 28,
}

console.log(`\nScreen sizes (limit ${MAX_SCREEN_LINES} lines)\n`)

fits('setup', { ...initialState(null), phase: 'setup' })
fits('style', { ...initialState(10, 'loose'), phase: 'style' })
fits('suit picker, hole card', { ...base, phase: 'suit', street: 'hole' })
fits('rank picker, hole card', { ...base, phase: 'rank', street: 'hole', pendingSuit: 2 })
fits('preflop result', base)

const flop = [card('3', 0), card('5', 1), card('2', 2)]
fits('flop result', { ...base, street: 'flop', board: flop })
fits('flop suit picker', { ...base, street: 'flop', board: flop, phase: 'suit' })
fits('flop rank picker', { ...base, street: 'flop', board: flop, phase: 'rank', pendingSuit: 2 })

const turn = [...flop, card('8', 2)]
fits('turn result (the overflow case)', { ...base, street: 'turn', board: turn })
fits('turn computing', { ...base, street: 'turn', board: turn, phase: 'computing', progress: 0.45 })

const river = [...turn, card('K', 3)]
fits('river result', { ...base, street: 'river', board: river, outs: 0 })

// ---------------------------------------------------------------------------
console.log('\nLive count ratchets down\n')

function expect(name: string, actual: unknown, want: unknown) {
  const ok = actual === want
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` - expected ${want}, got ${actual}`}`)
}

// Eight players, two fold preflop, advance to the flop.
let s: State = { ...initialState(8, 'normal'), phase: 'result', street: 'hole', live: 8, liveMax: 8 }
// Negative folds a player (matching scroll-up in the picker), positive restores.
s = adjustLive(s, -1)
s = adjustLive({ ...s, phase: 'result' }, -1)
expect('two folds leaves six', s.live, 6)

s = click({ ...s, phase: 'result' }) // advance to the flop
expect('advancing locks the ceiling at six', s.liveMax, 6)

// Now on the flop result, you cannot scroll back above six.
s = { ...s, phase: 'result', street: 'flop' }
const tryToRestore = adjustLive(s, 5)
expect('folded players cannot re-enter', tryToRestore.live, 6)

// You can still fold more.
const moreFolds = adjustLive(s, -2)
expect('more players can still fold', moreFolds.live, 4)

// And the ceiling follows down, never back up.
const afterFlop = click({ ...moreFolds, phase: 'result' })
expect('the ceiling follows down', afterFlop.liveMax, 4)
expect('never below heads-up', adjustLive({ ...afterFlop, phase: 'result' }, -9).live, MIN_PLAYERS)

// A new hand restores the full table.
const fresh = click({ ...afterFlop, phase: 'result', street: 'river' })
expect('a new hand restores the ceiling', fresh.liveMax, 8)
expect('a new hand restores the live count', fresh.live, 8)

console.log()
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('All layout and ratchet checks passed.\n')
