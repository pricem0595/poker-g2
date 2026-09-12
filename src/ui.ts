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
  const players = `${state.players} players`
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

function renderResult(state: State): string {
  const equity = state.equity
  const lines: string[] = [tableLine(state)]

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
    const by = toCome >= 2 ? 'by river' : 'on river'
    lines.push('')
    lines.push(`${state.outs} outs · ~${approx}% ${by} (approx)`)
  }

  lines.push('')
  lines.push(state.street === 'river' ? 'click for a new hand' : `click for the ${nextLabel(state)}`)
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

/** Guard against overrunning the display. */
export const MAX_SCREEN_CHARS = 400

export function isOversized(text: string): boolean {
  return text.length > MAX_SCREEN_CHARS
}

export { selectedOption }
