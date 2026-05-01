# Tarok Table

A self-contained browser prototype of Slovenian-style Tarok for 3 or 4 players.

Serve this folder with any static server and open the local URL. The app uses ES modules, so `file://` double-clicking is not the target path.

```bash
python3 -m http.server 8787 -d tarok-browser
```

Then open `http://127.0.0.1:8787`.

## Player Model

- Seat 0 is the human south seat: "You" / "Vi".
- Opponents are local AI seats.
- AI levels: Easy, Medium, Hard.
- Human card play is interactive; bidding, talon exchange, and discards are currently auto-assisted.
- English and Slovenian UI text are available from the language selector.

## Current Rules Model

- 54-card Tarok deck: 22 taroks and four 8-card suits.
- Four-player and three-player deals with a six-card talon.
- Anti-clockwise trick play.
- Follow suit if possible; otherwise play a tarok if possible.
- Emperor trick: if Tarok I, XXI, and Skis appear in one trick, Tarok I wins.
- Traditional three-card point counting with 70 total card points.
- Positive contracts need at least 36 card points.
- AI/human-assisted bidding covers klop, one/two/three, solo one/two/three, solo without, and beggar.
- Four-player normal contracts call a king for a hidden partner; three-player contracts are solo.
- Talon exchange and discards are automated.
- Point system includes contract value, rounded point difference, unannounced trula/kings/pagat ultimo/king ultimo, valat, captured Mond, and klop scoring.

The rules are modeled from the Slovenian Tarok reference at https://www.pagat.com/tarot/sltarok.html. Local table variations are intentionally isolated in `src/rules.js`, `src/game.js`, and the scoring helpers.

## Network Placeholder

`SeatController`, `HumanController`, `LocalAIController`, and `NetworkSeatController` define the future control boundary. A network transport can later replace one or more controllers without moving rules into the renderer.
