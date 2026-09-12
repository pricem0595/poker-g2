#!/usr/bin/env bash
# Drive a full hand through the simulator's automation API and screenshot each
# state. Requires `npm run dev` and `evenhub-simulator --automation-port 9899`.
#
#   bash test/drive-hand.sh [outdir]
#
# Deals AA to hero, then a flop/turn/river, so the preflop number can be checked
# against the known 49.5% for aces six-handed.

set -u
PORT=${PORT:-9899}
API="http://127.0.0.1:$PORT/api"
OUT=${1:-.}

shot() { curl -s -m 15 "$API/screenshot/glasses" -o "$OUT/$1"; echo "  shot -> $1"; }
tap()  { curl -s -m 8 -X POST "$API/input" -H "Content-Type: application/json" -d '{"action":"click"}' -o /dev/null; sleep 0.35; }
up()   { curl -s -m 8 -X POST "$API/input" -H "Content-Type: application/json" -d '{"action":"up"}'    -o /dev/null; sleep 0.2; }
down() { curl -s -m 8 -X POST "$API/input" -H "Content-Type: application/json" -d '{"action":"down"}'  -o /dev/null; sleep 0.2; }

# Ranks list ascending 2..A, so one "up" wraps to the ace.
# Suits list in order: spade heart diamond club.
pick_ace_of() {           # $1 = suit steps down from spade
  for _ in $(seq 0 "$1"); do :; done
  for _ in $(seq 1 "$1"); do down; done
  tap                     # confirm suit
  up                      # wrap to ace
  tap                     # confirm rank
}

pick_card() {             # $1 = suit steps, $2 = rank steps up from deuce
  for _ in $(seq 1 "$1"); do down; done
  tap
  for _ in $(seq 1 "$2"); do down; done
  tap
}

# The player count is persisted, so the setup screen only appears on a device
# that has never run the app. Pass SETUP=1 when it is showing.
if [ "${SETUP:-0}" = "1" ]; then
  echo "1. confirm player count"
  tap; sleep 0.4
fi
shot poker-02-hole1-suit.png

echo "2. hole cards: A-spade, A-heart"
pick_ace_of 0
shot poker-03-hole2-suit.png
pick_ace_of 1

echo "   waiting for preflop simulation"
sleep 2.5
shot poker-04-preflop.png

echo "3. flop"
tap; sleep 0.4
pick_card 0 5      # spade, rank index 5 -> 7
pick_card 2 0      # diamond, 2
pick_card 3 9      # club, J
sleep 2.5
shot poker-05-flop.png

echo "4. turn"
tap; sleep 0.4
pick_card 1 7      # heart, 9
sleep 2.5
shot poker-06-turn.png

echo "5. river"
tap; sleep 0.4
pick_card 2 11     # diamond, K
sleep 2.5
shot poker-07-river.png

echo
echo "console (warn/error only):"
curl -s -m 8 "$API/console" | python -c "
import sys,json
d=json.load(sys.stdin)
bad=[e for e in d['entries'] if e['level'] in ('warn','error')]
print(f\"  {d['total']} entries, {len(bad)} warn/error\")
for e in bad: print('  !', e['message'][:140])
"
