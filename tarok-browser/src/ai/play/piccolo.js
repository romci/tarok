import { cardPower } from "../../rules.js";
import { losingCards, lowestBy, orderedLowToHigh, winningCards } from "../utils.js";

export function playPiccolo(tarokGame, player, legalCards) {
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  const isDeclarer = player.id === tarokGame.game.declarer;
  const winners = winningCards(legalCards, trick, contract);
  const losing = losingCards(legalCards, trick, contract);

  if (!isDeclarer) {
    if (trick.some((play) => play.playerId === tarokGame.game.declarer)) {
      return winners.length ? lowestBy(winners, cardPower) : orderedLowToHigh(legalCards)[0];
    }
    return losing[0] || lowestBy(winners, cardPower) || orderedLowToHigh(legalCards)[0];
  }

  if (player.tricks === 0) {
    if (winners.length && (tarokGame.game.trickNumber >= 5 || trick.length === tarokGame.playerCount - 1)) {
      return lowestBy(winners, (card) => cardPower(card) + card.value * 8);
    }
    return losing[0] || lowestBy(winners, (card) => cardPower(card) + card.value * 8);
  }
  return losing[0] || lowestBy(winners, (card) => cardPower(card) + card.value * 8);
}
