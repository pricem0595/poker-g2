// Back navigation (double-tap) and new round (long press).
//   node --experimental-strip-types test/nav.test.ts

import { HISTORY_LIMIT, type Nav, back, forward, startNewRound } from '../src/nav.ts'
import { type State, adjustLive, click, initialState, scroll } from '../src/state.ts'

let failures = 0

function expect(name: string, actual: unknown, want: unknown) {
  const ok = actual === want
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` - expected ${want}, got ${actual}`}`)
}

/** A click, as the app performs it: forward through history. */
const tap = (nav: Nav): Nav => forward(nav, click(nav.state))

/** Stand in for the simulation finishing - the app writes the result in place. */
function finish(nav: Nav, win: number): Nav {
  if (nav.state.phase !== 'computing') throw new Error(`expected computing, got ${nav.state.phase}`)
  return {
    ...nav,
    state: { ...nav.state, phase: 'result', equity: { win, tie: 0, lose: 1 - win, trials: 25000 } },
  }
}

function pop(nav: Nav): Nav {
  const outcome = back(nav)
  if (outcome.kind !== 'state') throw new Error('expected a state, got exit')
  return outcome.nav
}

// ---------------------------------------------------------------------------
console.log('\nWalking a hand forward\n')

// A returning user: players and style already saved, so the hand opens on style.
let nav: Nav = { state: initialState(6, 'normal'), history: [] }
expect('opens on the style screen', nav.state.phase, 'style')

nav = tap(nav) // accept style -> suit picker, hole card 1
nav = tap(nav) // spade -> rank picker
const rankPicker = nav.state
expect('reached the rank picker', rankPicker.phase, 'rank')

nav = tap(nav) // deuce of spades, back to suit picker for hole card 2
nav = tap(nav) // spade
// The app scrolls through advance(), not forward(): cursor moves are not
// decisions, so they must not become back-stops.
const beforeScroll = nav.history.length
nav = { ...nav, state: scroll(nav.state, 3) }
expect('scrolling adds no history', nav.history.length, beforeScroll)
nav = tap(nav) // five of spades -> street complete -> computing
expect('second hole card starts the simulation', nav.state.phase, 'computing')

nav = finish(nav, 0.31)
const preflop = nav.state
expect('preflop result shows', preflop.phase, 'result')

// Two players fold, then click through to the flop.
nav = { ...nav, state: adjustLive(nav.state, -2) }
nav = finish(nav, 0.44)
const folded = nav.state
expect('two folds leaves four live', folded.live, 4)

nav = tap(nav) // advance to the flop
expect('advancing locks the ceiling', nav.state.liveMax, 4)
expect('now picking flop cards', nav.state.street, 'flop')

// ---------------------------------------------------------------------------
console.log('\nGoing back\n')

nav = pop(nav)
expect('back from the flop returns to the preflop odds', nav.state.phase, 'result')
expect('...with the odds intact, not re-simulated', nav.state.equity?.win, 0.44)
expect('...and the folds intact', nav.state.live, 4)
expect('...and the ceiling restored so folds can be corrected', nav.state.liveMax, 6)

nav = pop(nav)
expect('back from a result returns to the last card entered', nav.state.phase, 'rank')
expect('...still holding only the first hole card', nav.state.hole.length, 1)

nav = pop(nav)
expect('back from a rank picker returns to its suit picker', nav.state.phase, 'suit')

nav = pop(nav) // first card's rank picker
expect('back again undoes the first card', nav.state.hole.length, 0)
nav = pop(nav) // first card's suit picker
nav = pop(nav)
expect('back past the first card returns to the style screen', nav.state.phase, 'style')
expect('history is now empty', nav.history.length, 0)

// ---------------------------------------------------------------------------
console.log('\nThe ends of the stack\n')

const toSetup = pop(nav)
expect('back from style with nothing behind it reaches player count', toSetup.state.phase, 'setup')
expect('...with the cursor on the saved count', toSetup.state.cursor, 6 - 2)
expect('back from player count asks to exit', back(toSetup).kind, 'exit')

// ---------------------------------------------------------------------------
console.log('\nLong press\n')

let midHand: Nav = { state: initialState(6, 'normal'), history: [] }
midHand = tap(tap(tap(midHand))) // style, suit, rank
const abandoned = midHand.state
expect('mid-hand with a card in', abandoned.hole.length, 1)

const fresh = startNewRound(midHand)
expect('long press deals a new hand', fresh.state.phase, 'style')
expect('...with no cards', fresh.state.hole.length + fresh.state.board.length, 0)
expect('...and the full table back', fresh.state.live, 6)
expect('...keeping exactly one step of history', fresh.history.length, 1)

const undone = pop(fresh)
expect('double-tap undoes an accidental long press', undone.state, abandoned)

const firstBoot: Nav = { state: initialState(null), history: [] }
expect('long press is ignored before setup is done', startNewRound(firstBoot), firstBoot)

// Mid-simulation: the abandoned screen is restored and re-simulated by the app.
const computing: State = { ...abandoned, phase: 'computing' }
expect('long press works mid-simulation', startNewRound({ state: computing, history: [] }).state.phase, 'style')

// ---------------------------------------------------------------------------
console.log('\nHistory is bounded\n')

let long: Nav = { state: initialState(6, 'normal'), history: [] }
for (let i = 0; i < HISTORY_LIMIT + 40; i++) {
  long = forward(long, { ...long.state, cursor: i + 1 })
}
expect(`history caps at ${HISTORY_LIMIT}`, long.history.length, HISTORY_LIMIT)
expect('a no-op move saves nothing', forward(long, long.state), long)

console.log()
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('All navigation checks passed.\n')
