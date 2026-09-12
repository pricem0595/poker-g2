// Screen rendering. Every string the glasses display is built here.
//
// Layout notes that drive the choices below:
//   - 576 x 288, ~400-500 characters fills the screen. Stay well under.
//   - The firmware font is NOT monospaced and there is no text alignment, so
//     nothing may depend on columns lining up. Options are listed inline with
//     [brackets] marking the selection instead of a cursor column.
//   - Spade, heart and club are in the firmware font; U+2666 DIAMOND is NOT and
//     renders as nothing. See SUIT_LABELS in cards.ts.

import { RANK_LABELS, SUIT_LABELS, formatCard } from './cards.ts'
import { describeHand } from './evaluator.ts'
import { cardsToCome, ruleOf4And2 } from './equity.ts'
import { TIGHTNESS, TIGHTNESS_ORDER, describeRange } from './ranges.ts'
import {
  type State,
  boardTarget,
  optionsFor,
  opponentsOf,
  selectedOption,
} from './state.ts'

const FOOTER = 'scroll · click · dbl-tap exits'

/** Render a list of labels with the current one bracketed. */
function inlineOptions(labels: string[], selectedIndex: number): string {
  return labels
    .map((label, i) => (i === selectedIndex ? `[${label}]` : ` ${label} `))
    .join('')
    .trim()
}

function tableLine(state: State): string {
  // Once anyone has folded, the live count is the number that matters, so say
  // both rather than quietly showing a figure computed against a stale table.
  const players =
    state.live < state.players
      ? `${state.live} of ${state.players} live`
      : `${state.players} players`
  if (state.hole.length === 0) return players
  return `${state.hole.map(formatCard).join(' ')}  ·  ${players}`
}

function boardLine(state: State): string {
  if (state.board.length === 0) return ''
  const label = state.board.length >= 5 ? 'RIVER' : state.board.length === 4 ? 'TURN' : 'FLOP'
  return `${label}  ${state.board.map(formatCard).join(' ')}`
}

function streetPrompt(state: State): string {
  if (state.street === 'hole') return `YOUR HAND  card ${state.hole.length + 1} of 2`
  const target = boardTarget(state.street)
  const have = state.board.length
  const name = state.street.toUpperCase()
  if (state.street === 'flop') return `${name}  card ${have + 1} of ${target}`
  return name
}

function progressBar(fraction: number, width = 18): string {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width)
  return '━'.repeat(filled) + '─'.repeat(width - filled)
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function render(state: State): string {
  switch (state.phase) {
    case 'setup':
      return [
        'POKER ODDS',
        '',
        'How many players at the table?',
        '(including you)',
        '',
        inlineOptions(optionsFor(state).map(String), state.cursor),
        '',
        FOOTER,
      ].join('\n')

    case 'style':
      return [
        `${state.players} players`,
        '',
        'How do they play?',
        '',
        inlineOptions(TIGHTNESS_ORDER.map((t) => TIGHTNESS[t].label), state.cursor),
        '',
        `${TIGHTNESS[TIGHTNESS_ORDER[state.cursor] ?? 'normal'].pct}% of hands played`,
        '',
        'scroll · click to deal',
      ].join('\n')

    case 'suit': {
      const labels = optionsFor(state).map((s) => SUIT_LABELS[s])
      return [
        tableLine(state),
        boardLine(state),
        '',
        streetPrompt(state),
        'Suit?',
        '',
        inlineOptions(labels, state.cursor),
        '',
        FOOTER,
      ]
        .filter((line, i) => !(i === 1 && line === ''))
        .join('\n')
    }

    case 'rank': {
      const labels = optionsFor(state).map((r) => RANK_LABELS[r])
      const suit = SUIT_LABELS[state.pendingSuit]
      return [
        tableLine(state),
        boardLine(state),
        '',
        streetPrompt(state),
        `Rank?  ( ${suit} )`,
        '',
        inlineOptions(labels, state.cursor),
        '',
        FOOTER,
      ]
        .filter((line, i) => !(i === 1 && line === ''))
        .join('\n')
    }

    case 'computing':
      return [
        tableLine(state),
        boardLine(state),
        '',
        `Simulating vs ${opponentsOf(state)} opponent${opponentsOf(state) === 1 ? '' : 's'}…`,
        '',
        progressBar(state.progress),
      ]
        .filter((line, i) => !(i === 1 && line === ''))
        .join('\n')

    case 'result':
      return renderResult(state)
  }
}

/**
 * Eight lines maximum. Roughly ten fit on the 288px display, and by the turn
 * this screen carries the most content of any - table, board, equity, made
 * hand, outs and the range it was all computed against. The usage hint is one
 * row, not two, which is what bought the headroom.
 */
function renderResult(state: State): string {
  const equity = state.equity
  const lines: string[] = []

  // Range lives on the table line so the number is always attributed without
  // costing a row of its own.
  lines.push(`${tableLine(state)} · ${describeRange(state.tightness, state.board.length)}`)

  const board = boardLine(state)
  if (board) lines.push(board)
  lines.push('')

  if (equity) {
    const tie = equity.tie >= 0.005 ? `   TIE ${pct(equity.tie)}` : ''
    lines.push(`WIN ${pct(equity.win)}${tie}`)
  } else {
    lines.push('WIN --')
  }

  // Name the made hand once there is a board to make one with.
  if (state.board.length >= 3) {
    lines.push(describeHand([...state.hole, ...state.board]))
  }

  const toCome = cardsToCome(state.board)
  if (state.outs > 0 && toCome > 0 && state.board.length >= 3) {
    const approx = ruleOf4And2(state.outs, toCome)
    lines.push(`${state.outs} outs · ~${approx}% by ${toCome >= 2 ? 'river' : 'the river'}`)
  }

  lines.push('')
  const next = state.street === 'river' ? 'new hand' : nextLabel(state)
  lines.push(`scroll players · click ${next}`)
  return lines.join('\n')
}

function nextLabel(state: State): string {
  switch (state.street) {
    case 'hole':
      return 'flop'
    case 'flop':
      return 'turn'
    case 'turn':
      return 'river'
    default:
      return 'next hand'
  }
}

/**
 * Guard against overrunning the display.
 *
 * The binding constraint is LINES, not characters. An 11-line turn readout
 * overflowed at about 150 characters, so the old 400-character check never
 * fired and the last row was silently cut off with a scrollbar. About ten rows
 * fit; nine leaves room for a long line wrapping.
 */
export const MAX_SCREEN_LINES = 9
export const MAX_SCREEN_CHARS = 400

export function isOversized(text: string): boolean {
  return text.split('\n').length > MAX_SCREEN_LINES || text.length > MAX_SCREEN_CHARS
}

/** Longest screen this state can produce, for tests. */
export function lineCount(text: string): number {
  return text.split('\n').length
}

export { selectedOption }
