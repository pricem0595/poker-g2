# Poker Odds for Even G2

A Texas Hold'em odds display for [Even Realities G2](https://www.evenrealities.com/) smart
glasses. Enter your hole cards and the board with the touchpad, and the glasses show how often
your hand wins against the players still in, what you're holding, and your outs.

```
A♠ K♠  ·  4 of 6 live · Normal (~12%)
FLOP  Q♠ J♥ 2◆

WIN 18%   TIE 6%
A high
10 outs · ~40% by river

scroll players · click turn
```

*A real result screen, rendered by the app's own code. On the flop the Normal range has
narrowed from 20% to about 12% of hands.*

## Install

Find **Poker Odds** in Even Hub in the Even app, and install it onto your G2 glasses.

## What it does

- **Win and tie percentage** from 25,000 Monte Carlo showdowns, recomputed on every street
  (about 400 ms on the phone).
- **Opponents play ranges, not random cards.** Pick how the table plays: *Any two* (100% of
  hands), *Loose* (40%), *Normal* (20%) or *Tight* (10%). After the flop the ranges narrow by
  how well each hand connects with the board, the way real players fold. The style is shown
  next to every result, so a percentage is never read against the wrong assumptions.
- **Folds count.** Scroll on any result screen to set how many players are still in. Pocket
  fives are 12% against nine opponents and 59% against one, so this is the biggest swing in
  the number. Folded players can't come back in during the hand.
- **Your made hand** ("Pair of A", "Trips, 9") and **outs**, with the rule-of-4-and-2 estimate.
  Outs are hidden once you're the favourite, since you're no longer chasing.
- Cards already in play can't be picked again, so you can't enter an impossible hand.
- The same cards always give the same number (the simulation is seeded from the cards in play),
  so the percentage doesn't flicker between glances.

## Controls

| Gesture | Action |
|---|---|
| Swipe up / down | Move the selection; on a result screen, change how many players are in |
| Tap | Confirm, or deal the next street |
| Double-tap | Back one step (restores the exact previous screen) |
| Long press | New hand, from anywhere (double-tap undoes an accidental one) |
| Tap and hold | The glasses' own exit dialog |

A hand runs: table size (first launch only) → table style → your two cards → flop → turn →
river → new hand. Each card is entered as suit, then rank.

## Accuracy

The equity engine is checked against published exact figures (Wizard of Odds' full
enumeration of two-player outcomes). When it was built it landed within 0.4 percentage
points, and `test/equity.test.ts` fails if it drifts more than 1 point from the exact figures:

| Hand | This app | Exact |
|---|---|---|
| AA heads-up | 85.01% | 84.93% |
| AKs heads-up | 66.57% | 66.22% |
| AA six-handed | 49.13% | 49.51% |
| AA ten-handed | 31.16% | 31.36% |

The seven-card hand evaluator is written from scratch (~200 lines, no dependencies). It's
tested against all 2,598,960 five-card hands, which must produce exactly 7,462 distinct hand
ranks at the textbook frequency of each category.

**The number is only as good as its assumptions.** Against *Any two* it's the textbook
random-hands equity. The range styles are a model of how people play, tuned on published
tracking-software statistics, not a read on the actual players at your table.

## Fair play

This is a study and training aid. Many card rooms and casinos ban electronic devices at the
table, and using one to get an edge in a real game can break house rules or the law. Check
before you play.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md): free for personal, hobby, research and other
noncommercial use; commercial use is not permitted.
