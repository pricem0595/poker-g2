import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

import { makeRng } from './cards.ts'
import { DEFAULT_TRIALS, countOuts, createSimulation } from './equity.ts'
import { TIGHTNESS_ORDER, opponentPool, type Tightness } from './ranges.ts'
import {
  type State,
  MAX_PLAYERS,
  MIN_PLAYERS,
  adjustLive,
  click,
  initialState,
  opponentsOf,
  sanityCheck,
  scroll,
} from './state.ts'
import { isOversized, render } from './ui.ts'

const CONTAINER_ID = 1
const CONTAINER_NAME = 'poker'
const PLAYERS_KEY = 'poker.players'
const STYLE_KEY = 'poker.style'

// A single flaky BLE hop can hang for ~30s. Cap every call.
const BLE_TIMEOUT_MS = 5000
// Trials per chunk. Small enough that the progress bar moves, large enough that
// yielding does not dominate.
const CHUNK_TRIALS = 2500

const bridge = await waitForEvenAppBridge()

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

// Every bridge call shares one BLE link, and overlapping calls can crash the
// connection. All of them go through one promise chain. A failure is logged and
// swallowed so it cannot wedge the chain for every call behind it.
let chain: Promise<unknown> = Promise.resolve()

function bridgeCall<T>(label: string, call: () => Promise<T>): Promise<T | undefined> {
  const run = chain.then(async () => {
    try {
      return await withTimeout(call(), BLE_TIMEOUT_MS, label)
    } catch (error) {
      console.warn(`[bridge] ${label} failed:`, error)
      return undefined
    }
  })
  chain = run
  return run
}

// ---------------------------------------------------------------------------

let state: State = initialState(null)

function paint(): Promise<unknown> {
  const content = render(state)
  if (isOversized(content)) console.warn(`[ui] screen is ${content.length} chars, may overflow`)

  return bridgeCall('textContainerUpgrade', () =>
    bridge.textContainerUpgrade(
      new TextContainerUpgrade({
        containerID: CONTAINER_ID,
        containerName: CONTAINER_NAME,
        content,
        contentOffset: 0,
        contentLength: 0,
      }),
    ),
  )
}

/** Yield to the event loop so the display actually repaints between chunks. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Seed from the cards in play, so the same board always produces the same
 * number. A percentage that flickers between glances reads as broken.
 */
function seedFor(s: State): number {
  let seed = s.players * 31 + TIGHTNESS_ORDER.indexOf(s.tightness) * 101
  for (const card of [...s.hole, ...s.board]) seed = (seed * 33 + card + 7) >>> 0
  return seed || 1
}

// Adjusting the live player count restarts the simulation, and scrolling can
// do that faster than a run completes. Each run takes a token; a newer run
// supersedes an older one rather than the older one being dropped, so the
// displayed number always reflects the latest count.
let generation = 0

async function runSimulation(): Promise<void> {
  const mine = ++generation
  const opponents = opponentsOf(state)
  const seed = seedFor(state)

  // 'any' leaves the pool undefined, which keeps the validated random-hand path.
  const pool =
    state.tightness === 'any' ? undefined : opponentPool(state.tightness, state.hole, state.board)

  const sim = createSimulation({
    hole: state.hole,
    board: state.board,
    opponents,
    trials: DEFAULT_TRIALS,
    rng: makeRng(seed),
    pool,
  })

  while (!sim.done) {
    if (mine !== generation) return
    sim.step(CHUNK_TRIALS)
    state.progress = sim.progress
    await paint()
    await yieldToUi()
  }

  if (mine !== generation) return

  state.equity = sim.result()
  // Outs are only meaningful with a board and cards still to come; findOuts
  // returns nothing otherwise, so this is cheap on the preflop and river.
  state.outs = countOuts(state.hole, state.board, opponents, makeRng(seed ^ 0x5bf03635))

  if (mine !== generation) return
  state.phase = 'result'
  await paint()
}

function advance(next: State): void {
  const problem = sanityCheck(next)
  if (problem) {
    console.error(`[state] rejected transition: ${problem}`)
    return
  }
  state = next
  if (state.phase === 'computing') void runSimulation()
  else void paint()
}

// ---------------------------------------------------------------------------

const savedPlayers = await bridgeCall('getLocalStorage', () => bridge.getLocalStorage(PLAYERS_KEY))
const parsed = Number.parseInt(String(savedPlayers ?? ''), 10)
const knownPlayers =
  Number.isFinite(parsed) && parsed >= MIN_PLAYERS && parsed <= MAX_PLAYERS ? parsed : null
const savedStyle = await bridgeCall('getLocalStorage', () => bridge.getLocalStorage(STYLE_KEY))
const knownStyle = TIGHTNESS_ORDER.includes(String(savedStyle ?? '') as Tightness)
  ? (String(savedStyle) as Tightness)
  : 'normal'
state = initialState(knownPlayers, knownStyle)

const page = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 288,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 4,
  containerID: CONTAINER_ID,
  containerName: CONTAINER_NAME,
  content: render(state),
  isEventCapture: 1,
})

const CREATE_ERRORS: Record<number, string> = {
  1: 'invalid parameters',
  2: 'oversize - content too large',
  3: 'out of memory',
}

const result = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [page] }),
)

// Bail rather than register a handler against a container that does not exist.
if (result !== 0) {
  throw new Error(
    `createStartUpPageContainer failed (${result}: ${CREATE_ERRORS[result] ?? 'unknown'})`,
  )
}

console.log('Page created: success')

// ---------------------------------------------------------------------------

const unsubscribe = bridge.onEvenHubEvent((event) => {
  // Scroll gestures arrive on textEvent (1 = up, 2 = down). Clicks, double
  // clicks and every lifecycle event arrive on sysEvent - never the reverse.
  if (event.textEvent) {
    const type = event.textEvent.eventType ?? 0
    const delta =
      type === OsEventTypeList.SCROLL_TOP_EVENT
        ? -1
        : type === OsEventTypeList.SCROLL_BOTTOM_EVENT
          ? 1
          : 0
    if (delta === 0) return
    // On a result screen scroll has no list to move, so it adjusts how many
    // players are still in the hand - the largest single influence on equity.
    // Direction matches the setup picker: up counts down toward heads-up.
    advance(state.phase === 'result' ? adjustLive(state, delta) : scroll(state, delta))
    return
  }

  if (!event.sysEvent) return

  // CLICK_EVENT is 0 and protobuf omits zero-value fields, so a single tap
  // arrives with no eventType at all. Resolve the default only after confirming
  // the envelope exists.
  const type = event.sysEvent.eventType ?? OsEventTypeList.CLICK_EVENT

  switch (type) {
    case OsEventTypeList.DOUBLE_CLICK_EVENT:
      // Show the system exit dialog. Do NOT clean up here - the user can still
      // cancel, and an app on screen with no listener is unusable.
      bridgeCall('shutDownPageContainer', () => bridge.shutDownPageContainer(1))
      return

    case OsEventTypeList.CLICK_EVENT: {
      const before = state.phase
      advance(click(state))
      if (before === 'setup') {
        bridgeCall('setLocalStorage', () => bridge.setLocalStorage(PLAYERS_KEY, String(state.players)))
      } else if (before === 'style') {
        bridgeCall('setLocalStorage', () => bridge.setLocalStorage(STYLE_KEY, state.tightness))
      }
      return
    }

    case OsEventTypeList.FOREGROUND_ENTER_EVENT:
      // The display is not guaranteed to survive backgrounding; repaint from
      // the state we still hold.
      void paint()
      return

    case OsEventTypeList.FOREGROUND_EXIT_EVENT:
      return

    case OsEventTypeList.SYSTEM_EXIT_EVENT:
    case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      unsubscribe()
      return

    default:
      return
  }
})
