// Card model.
//
// A card is an integer 0-51:  rank = card >> 2  (0 = deuce .. 12 = ace)
//                             suit = card & 3
// Integers keep the simulation hot loop allocation-free.

export const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const

// Suit glyphs are confirmed present in the G2 firmware font.
export const SUIT_LABELS = ['♠', '♥', '♦', '♣'] as const // spade heart diamond club

export const RANK_COUNT = 13
export const SUIT_COUNT = 4
export const DECK_SIZE = 52

export function makeCard(rank: number, suit: number): number {
  return (rank << 2) | suit
}

export function rankOf(card: number): number {
  return card >> 2
}

export function suitOf(card: number): number {
  return card & 3
}

export function formatCard(card: number): string {
  return RANK_LABELS[rankOf(card)] + SUIT_LABELS[suitOf(card)]
}

export function formatCards(cards: readonly number[]): string {
  return cards.map(formatCard).join(' ')
}

/** Every card not in `used`, in deck order. */
export function remainingDeck(used: readonly number[]): number[] {
  const taken = new Uint8Array(DECK_SIZE)
  for (const c of used) taken[c] = 1
  const deck: number[] = []
  for (let c = 0; c < DECK_SIZE; c++) if (!taken[c]) deck.push(c)
  return deck
}

/**
 * Deterministic PRNG (mulberry32). Seeded so a fixed seed reproduces a run
 * exactly - otherwise a regression is indistinguishable from simulation noise.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
