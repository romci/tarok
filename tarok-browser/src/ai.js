import {
  CONTRACTS,
  canDiscard,
  cardPower,
  discardCost,
  isTarok,
  isTrula,
  wouldWin
} from "./rules.js";

export const AI_LEVELS = ["easy", "medium", "hard"];

export class SeatController {
  constructor(playerId) {
    this.playerId = playerId;
  }

  chooseBid() {
    return null;
  }

  chooseTalonGroup() {
    return 0;
  }

  chooseDiscard(player, count) {
    return player.hand.filter(canDiscard).slice(0, count);
  }

  chooseCard(game, legalCards) {
    return legalCards[0];
  }

  /** @returns {{ type: "pass" } | { type: "gameDouble" } | { type: "announce", bonus: string }} */
  chooseAnnouncement(game, player) {
    return { type: "pass" };
  }
}

export class HumanController extends SeatController {
  constructor(playerId) {
    super(playerId);
    this.assistant = new LocalAIController(playerId, "medium");
  }

  chooseBid(game, player) {
    return this.assistant.chooseBid(game, player);
  }

  chooseTalonGroup(game, player, groups) {
    return this.assistant.chooseTalonGroup(game, player, groups);
  }

  chooseDiscard(game, player, count) {
    return this.assistant.chooseDiscard(game, player, count);
  }

  chooseCard() {
    return null;
  }

  chooseAnnouncement() {
    return null;
  }
}

export class LocalAIController extends SeatController {
  constructor(playerId, level = "medium") {
    super(playerId);
    this.level = AI_LEVELS.includes(level) ? level : "medium";
  }

  chooseBid(game, player) {
    return pickContract(game, player, this.level);
  }

  chooseTalonGroup(game, player, groups) {
    if (this.level === "easy") return randomIndex(groups.length);

    let bestIndex = 0;
    let bestScore = -Infinity;
    groups.forEach((group, index) => {
      const score = group.reduce((sum, card) => {
        const trulaBoost = this.level === "hard" && isTrula(card) ? 6 : 0;
        return sum + card.value + cardPower(card) / 18 + trulaBoost;
      }, 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  chooseDiscard(game, player, count) {
    const candidates = [...player.hand].filter(canDiscard);
    if (this.level === "easy") return shuffle(candidates).slice(0, count);

    return candidates
      .sort((a, b) => discardCost(a) - discardCost(b))
      .slice(0, count);
  }

  chooseCard(game, legalCards, player) {
    if (this.level === "easy") return randomChoice(legalCards);
    if (this.level === "hard") return pickHardCard(game, player, legalCards);
    return pickMediumCard(game, player, legalCards);
  }
}

export class NetworkSeatController extends SeatController {
  constructor(playerId, transport) {
    super(playerId);
    this.transport = transport;
  }

  chooseCard() {
    throw new Error("Network seat transport is not connected yet.");
  }
}

function pickContract(game, player, level) {
  const strength = evaluateHand(player.hand);
  const weakHand = strength.taroks <= 2 && strength.highTaroks === 0 && strength.counters <= 2;
  if (weakHand && level !== "hard") return Math.random() > 0.35 ? CONTRACTS.beggar : CONTRACTS.piccolo;

  const thresholds = {
    easy: game.playerCount === 3
      ? [[78, CONTRACTS.openBeggar], [66, CONTRACTS.soloWithout], [49, CONTRACTS.one], [41, CONTRACTS.two], [34, CONTRACTS.three]]
      : [[82, CONTRACTS.openBeggar], [72, CONTRACTS.soloWithout], [58, CONTRACTS.soloOne], [49, CONTRACTS.one], [41, CONTRACTS.two], [34, CONTRACTS.three]],
    medium: game.playerCount === 3
      ? [[84, CONTRACTS.valatWithout], [72, CONTRACTS.openBeggar], [56, CONTRACTS.soloWithout], [47, CONTRACTS.one], [39, CONTRACTS.two], [31, CONTRACTS.three]]
      : [[88, CONTRACTS.valatWithout], [76, CONTRACTS.openBeggar], [63, CONTRACTS.soloWithout], [54, CONTRACTS.soloOne], [46, CONTRACTS.one], [38, CONTRACTS.two], [30, CONTRACTS.three]],
    hard: game.playerCount === 3
      ? [[88, CONTRACTS.valatWithout], [76, CONTRACTS.openBeggar], [60, CONTRACTS.soloWithout], [49, CONTRACTS.one], [41, CONTRACTS.two], [33, CONTRACTS.three]]
      : [[92, CONTRACTS.valatWithout], [80, CONTRACTS.openBeggar], [66, CONTRACTS.soloWithout], [57, CONTRACTS.soloOne], [49, CONTRACTS.one], [41, CONTRACTS.two], [33, CONTRACTS.three]]
  };

  for (const [minimum, contract] of thresholds[level]) {
    if (strength.score >= minimum) {
      return contract;
    }
  }
  return null;
}

function evaluateHand(hand) {
  const taroks = hand.filter(isTarok);
  const highTaroks = taroks.filter((card) => card.tarok >= 17).length;
  const trula = hand.filter(isTrula).length;
  const kings = hand.filter((card) => card.rank === "K").length;
  const counters = hand.filter((card) => card.value >= 4).length;
  const losers = hand.filter((card) => !isTarok(card) && card.value === 1).length;
  const score = taroks.length * 3 + highTaroks * 4 + trula * 6 + kings * 3 - losers;
  return { score, taroks: taroks.length, highTaroks, counters };
}

function pickMediumCard(game, player, legalCards) {
  const ordered = [...legalCards].sort((a, b) => cardPower(a) - cardPower(b));
  const trick = game.game.currentTrick;
  if (!trick.length) {
    if (isNegativeContract(game)) return ordered[0];
    const suits = ordered.filter((card) => !isTarok(card));
    return suits[0] || ordered[0];
  }

  const winningCards = ordered.filter((card) => wouldWin(card, trick, game.game.contract));
  const trickValue = trick.reduce((sum, play) => sum + play.card.value, 0);
  const wantsTrick = game.isDeclarerSide(player.id) && trickValue >= 7;
  if (isNegativeContract(game)) return ordered[0];
  if (winningCards.length && (wantsTrick || trick.length === game.playerCount - 1)) return winningCards[0];
  return ordered.find((card) => !wouldWin(card, trick, game.game.contract)) || ordered[0];
}

function pickHardCard(game, player, legalCards) {
  const ordered = [...legalCards].sort((a, b) => cardPower(a) - cardPower(b));
  const trick = game.game.currentTrick;
  if (isNegativeContract(game)) return ordered[0];
  if (!trick.length) {
    const lowSuit = ordered.find((card) => !isTarok(card) && card.value <= 2);
    return lowSuit || ordered[0];
  }

  const trickValue = trick.reduce((sum, play) => sum + play.card.value, 0);
  const winningCards = ordered.filter((card) => wouldWin(card, trick, game.game.contract));
  const lastToPlay = trick.length === game.playerCount - 1;
  const declarerSide = game.isDeclarerSide(player.id);
  const shouldWin = trickValue >= (declarerSide ? 5 : 8) || lastToPlay;
  if (winningCards.length && shouldWin) return winningCards[0];

  const safeLosing = ordered.filter((card) => !wouldWin(card, trick, game.game.contract));
  const throwCounter = safeLosing.find((card) => card.value >= 4 && !isTrula(card));
  if (!declarerSide && throwCounter) return throwCounter;
  return safeLosing[0] || winningCards[0] || ordered[0];
}

function isNegativeContract(game) {
  return ["klop", "beggar", "openBeggar", "piccolo"].includes(game.game.contract.id);
}

function randomChoice(items) {
  return items[randomIndex(items.length)];
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
