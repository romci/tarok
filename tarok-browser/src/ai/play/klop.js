import { cardPower } from "../../rules.js";
import { cardRisk, losingCards, lowestBy, orderedLowToHigh, trickPoints, winningCards } from "../utils.js";

export function playKlop(tarokGame, player, legalCards, level = "medium") {
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  // In klop, avoiding trick captures usually dominates card-preservation concerns.
  const losing = losingCards(legalCards, trick, contract);
  if (losing.length) {
    return lowestBy(losing, (card) => klopLoseScore(card, tarokGame, level));
  }
  const winners = winningCards(legalCards, trick, contract);
  return lowestBy(winners.length ? winners : orderedLowToHigh(legalCards), (card) => {
    const earlyGiftPenalty = tarokGame.game.trickNumber < 6 ? 8 : 0;
    return cardRisk(card) + trickPoints(trick) * 2 + earlyGiftPenalty + cardPower(card) * 0.03;
  });
}

function klopLoseScore(card, tarokGame, level) {
  // Early tricks are weighted higher because klop talon gifts can snowball quickly.
  const early = tarokGame.game.trickNumber < 6 ? card.value * 1.8 : card.value;
  const hardExitValue = level === "hard" ? cardRisk(card) * 0.15 : 0;
  return early + hardExitValue;
}
