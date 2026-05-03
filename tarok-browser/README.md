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
- Human bidding and card play are interactive; talon exchange and discards are currently auto-assisted.
- Contract bidding is now turn-based and interactive for the human seat.
- Card deal/play events use DOM animation hooks so cards move across the table instead of snapping instantly.
- English and Slovenian UI text are available from the language selector.

## Card Assets

- Card faces are PNG assets in `assets/cards/faces`.
- Card backs are in `assets/cards/back.png`.
- `assets/cards/generated-template-sheet.png` is the image-generator source sheet.
- Rebuild the full deck with:

```bash
python3 tarok-browser/scripts/build-card-assets.py
```

## Current Rules Model

Rules are tracked against Briskula.si's Tarok rules at https://briskula.si/tarok.

- 54-card Tarok deck: 22 taroks and four 8-card suits.
- Four-player and three-player deals with a six-card talon.
- Anti-clockwise trick play.
- Follow suit if possible; otherwise play a tarok if possible.
- Emperor trick: if Tarok I, Mond, and Škis appear in one trick, Tarok I wins.
- Traditional three-card point counting with 70 total card points.
- Positive contracts need at least 36 card points.
- Turn-based bidding covers klop, three/two/one, piccolo, solo three/two/one, beggar, solo without, open beggar, colour valat without, and valat without.
- Four-player normal contracts call a king for a hidden partner; three-player contracts are solo.
- Talon exchange and discards are automated.
- Point system includes contract value, point difference, unannounced trula/kings/pagat ultimo/king ultimo, valat, captured Mond, radlci, and klop scoring.
- Klop uses talon gifts on the first six tricks.
- Negative contracts apply must-win-if-possible and pagat restrictions.

Still intentionally simplified: announcements/kontra UI and the special called-king-in-talon remainder capture are not fully modeled yet. Local table variations are intentionally isolated in `src/rules.js`, `src/game.js`, and the scoring helpers.

## Network Placeholder

`SeatController`, `HumanController`, `LocalAIController`, and `NetworkSeatController` define the future control boundary. A network transport can later replace one or more controllers without moving rules into the renderer.
