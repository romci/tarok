import { isTarok } from "../../rules.js";
import { highestBy, losingCards, orderedHighToLow, winningCards } from "../utils.js";

export function playColourValat(tarokGame, player, legalCards) {
  const isDeclarer = player.id === tarokGame.game.declarer;
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  if (isDeclarer) {
    if (!trick.length) {
      return highestBy(legalCards, (card) => guaranteedColourLeadScore(card, player.hand));
    }
    const winners = winningCards(legalCards, trick, contract);
    return winners[0] || orderedHighToLow(legalCards)[0];
  }
  const winners = winningCards(legalCards, trick, contract);
  return winners.length
    ? winners[0]
    : (losingCards(legalCards, trick, contract)[0] || orderedHighToLow(legalCards)[0]);
}

function guaranteedColourLeadScore(card, hand) {
  if (isTarok(card)) return card.tarok - 6;
  const sameSuit = hand.filter((candidate) => candidate.suit === card.suit);
  const sequenceControl = sameSuit.filter((candidate) => candidate.suitStrength >= card.suitStrength).length;
  return card.suitStrength * 3 + sequenceControl;
}
