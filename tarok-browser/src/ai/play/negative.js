import { cardPower, isTarok } from "../../rules.js";
import { evaluateHand } from "../handEvaluator.js";
import { cardRisk, losingCards, lowestBy, orderedLowToHigh, trickPoints, winningCards } from "../utils.js";

export function playBeggarLike(tarokGame, player, legalCards, level = "medium") {
  const isDeclarer = player.id === tarokGame.game.declarer;
  return isDeclarer
    ? playNegativeDeclarer(tarokGame, player, legalCards, level)
    : playNegativeDefense(tarokGame, player, legalCards, level);
}

function playNegativeDeclarer(tarokGame, player, legalCards, level) {
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  const losing = losingCards(legalCards, trick, contract);
  const candidates = losing.length ? losing : legalCards;
  return lowestBy(candidates, (card) => {
    const wouldTake = !losing.length || winningCards([card], trick, contract).length > 0;
    const remainingHand = player.hand.filter((candidate) => candidate.id !== card.id);
    const future = evaluateHand(remainingHand, { contract }).unavoidableWinnerEstimate;
    const openBeggarPenalty = contract.id === "openBeggar" && level === "hard"
      ? openBeggarForcedWinRisk(remainingHand)
      : 0;
    return (wouldTake ? 100 : 0)
      + future * (level === "hard" ? 5 : 3)
      + openBeggarPenalty * 8
      - exitPreservation(card, remainingHand) * 2
      + cardRisk(card) * 0.15;
  });
}

function playNegativeDefense(tarokGame, player, legalCards, level) {
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  if (!trick.length) {
    return lowestBy(legalCards, (card) => {
      const lowTrap = !isTarok(card) ? card.suitStrength : card.tarok + 4;
      return lowTrap + card.value * 0.5;
    });
  }
  const losing = losingCards(legalCards, trick, contract);
  const winners = winningCards(legalCards, trick, contract);
  if (tarokGame.game.currentTrick.some((play) => play.playerId === tarokGame.game.declarer)) {
    return winners.length
      ? lowestBy(winners, (card) => cardPower(card) + card.value * 4)
      : lowestBy(legalCards, (card) => cardRisk(card));
  }
  return losing.length
    ? lowestBy(losing, (card) => card.value + cardRisk(card) * (level === "hard" ? 0.08 : 0.02))
    : lowestBy(winners, (card) => cardPower(card) + trickPoints(trick));
}

function exitPreservation(card, remainingHand) {
  if (isTarok(card)) return 0;
  const sameSuitLow = remainingHand.filter((candidate) => candidate.suit === card.suit && candidate.value <= 2).length;
  return sameSuitLow;
}

function openBeggarForcedWinRisk(remainingHand) {
  // Approximate minimax signal: count cards that are likely forced winners later.
  // Open hand gives defenders perfect info, so isolated high cards are dangerous.
  const bySuit = new Map();
  for (const card of remainingHand) {
    const key = isTarok(card) ? "tarok" : card.suit;
    if (!bySuit.has(key)) bySuit.set(key, []);
    bySuit.get(key).push(card);
  }
  let risk = 0;
  for (const [group, cards] of bySuit.entries()) {
    const sorted = [...cards].sort((a, b) => cardPower(b) - cardPower(a));
    if (group === "tarok") {
      risk += sorted.filter((card) => card.id === "SKIS" || card.tarok >= 18).length * 1.2;
      risk += sorted.length <= 2 ? 0.9 : 0;
      continue;
    }
    const honourCount = sorted.filter((card) => card.value >= 3).length;
    risk += honourCount * (cards.length <= 2 ? 1.1 : 0.5);
    if (cards.length === 1) risk += 1.2;
  }
  return risk;
}
