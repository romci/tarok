# Tarok Table

A browser implementation of Slovenian Tarok for 3 or 4 players, with a human south seat, local AI opponents, bilingual UI, animated card movement, generated card sprites, scoring, and a Hard-AI tutorial advisor.

The app is now a React + Vite project. It is not meant to be opened via `file://`.

## Quick Start

```bash
npm install
npm run dev
```

Vite starts on `http://127.0.0.1:5173` by default, or another local port if that one is busy.

Production build:

```bash
npm run build
npm run preview
```

## Current Features

- 3-player and 4-player Tarok.
- Human player is always the south seat: `You` / `Vi`.
- Local AI opponents with Easy, Medium, and Hard levels.
- Tutorial mode: a bottom-right advisor panel that uses Hard AI to suggest human actions and explain why.
- Slovenian and English UI.
- Interactive bidding, king calling, talon exchange, discards, announcements/kontras, and card play.
- Animated card play and trick collection using Motion for React.
- Sprite-based card faces from generated PNG assets.
- Session hand log with final per-player scoring details.
- Network-controller placeholder for future multiplayer seats.

## Game Flow

The engine models the hand as explicit phases:

1. Deal.
2. Bidding.
3. King call, when the contract requires a partner.
4. Talon exchange, when the contract allows it.
5. Announcements and game doubles.
6. Trick play.
7. Trick collection animation.
8. Hand scoring and cumulative score update.

Four-player bidding follows the Slovenian priority model: forehand has highest priority but waits while the other players bid first. `Klop` and `Three` are only available in the special forehand choice after the other three players pass.

## Rules Coverage

Implemented:

- 54-card deck: 22 taroks plus four 8-card suits.
- Mond is Tarok XXI; Škis is its own top figure, not T22.
- Anti-clockwise play.
- Follow suit if possible; otherwise play tarok if possible.
- Emperor trick: if Pagat, Mond, and Škis appear in one trick, Pagat wins.
- Standard three-card point counting.
- Positive contracts require at least 36 card points.
- Contracts: `klop`, `three`, `two`, `one`, `piccolo`, `solo three`, `solo two`, `solo one`, `beggar`, `solo without`, `open beggar`, `colour valat without`, and `valat without`.
- Called king and hidden partner logic for 4-player partner contracts.
- Called king can be in the talon, making declarer play alone.
- Talon grouping and human talon choice/discard.
- Discard restrictions: kings and trula cards cannot be discarded.
- Klop talon gifts in the first six tricks.
- Negative-contract “must win if possible” handling and Pagat restriction.
- Announcements for trula, kings, pagat ultimo, king ultimo, valat.
- Game doubles through kontra/rekontra/subkontra/mordkontra.
- Captured Mond penalty.
- Radlci and detailed score logging.

Still simplified or incomplete:

- Local table-rule variants are not configurable yet.
- Called-king-in-talon remainder capture is only partially modeled.
- Open beggar uses visibility hooks, but full perfect-information defender search is still future work.
- Colour valat and valat AI use heuristics rather than exhaustive proof search.
- Network play is only a controller boundary, not a connected transport.

## AI Model

AI code is split into focused modules under `src/ai/`:

- `handEvaluator.js`: shared hand features and composite strength scores.
- `bid.js`: contract-aware bidding and forehand choice.
- `kingCall.js`: called-king selection.
- `talon.js`: talon group and discard selection.
- `announcements.js`: bonus and kontra decisions.
- `inference.js`: played-card, talon, void, trump-void, and partner-state inference.
- `play/`: contract-family card-play strategies.

Difficulty levels:

- Easy: deliberately noisy and short-sighted.
- Medium: uses the same strategic modules with softer inference and fewer forward-looking penalties.
- Hard: uses inference for played cards, known talon cards, known discards, partner state, voids, trump voids, high-trump conservation, and defender point-denial pressure.

Tutorial mode always asks Hard AI for the human suggestion, even if opponents are Easy or Medium.

## Card Assets

Card faces and backs live in `assets/cards/`.

- `assets/cards/fronts-sprite.png` is the runtime face sprite.
- `assets/cards/back.png` is the runtime back image.
- `assets/cards/faces/` contains individual face PNGs.
- `assets/cards/source-sheets/` contains the provided source sprite sheets.
- `scripts/build-card-assets.py` rebuilds individual faces and the runtime sprite.

Rebuild assets:

```bash
python3 scripts/build-card-assets.py
```

The React card component uses sprite coordinates from `src/cardAssets.js`.

## Project Structure

```text
src/
  ai/                 AI evaluation, bidding, talon, inference, and play routers
  ui/                 React UI components, formatting, styles, tutorial advisor
  game.js             Phase engine, turn flow, bidding, talon, scoring
  rules.js            Deck, rules primitives, card legality, trick winner, scoring helpers
  i18n.js             English and Slovenian dictionaries
  cardAssets.js       Sprite coordinate map
  main.jsx            React entrypoint
assets/cards/         Card sprite, backs, faces, and source sheets
scripts/              Asset-generation scripts
```

## Development Notes

- Prefer changing rules in `src/rules.js` and phase/scoring behavior in `src/game.js`.
- Keep UI-only work in `src/ui/`.
- Keep strategy changes in `src/ai/` and avoid hard-coding for one observed hand.
- Run `npm run build` after code changes.

## Multiplayer Boundary

`SeatController`, `HumanController`, `LocalAIController`, and `NetworkSeatController` in `src/ai.js` define the seat-control boundary. A future network transport can replace one or more local controllers without moving rules into React components.
