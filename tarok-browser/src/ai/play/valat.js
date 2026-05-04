import { isTarok } from "../../rules.js";
import { highestBy, losingCards, orderedHighToLow, winningCards } from "../utils.js";

export function playValat(tarokGame, player, legalCards) {
  const isDeclarer = player.id === tarokGame.game.declarer;
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  if (isDeclarer) {
    if (!trick.length) {
      const topTarok = highestBy(legalCards.filter(isTarok), (card) => card.tarok);
      return topTarok || orderedHighToLow(legalCards)[0];
    }
    const winners = winningCards(legalCards, trick, contract);
    return winners.length ? winners[0] : orderedHighToLow(legalCards)[0];
  }
  const winners = winningCards(legalCards, trick, contract);
  return winners.length ? winners[0] : (losingCards(legalCards, trick, contract)[0] || orderedHighToLow(legalCards)[0]);
}
