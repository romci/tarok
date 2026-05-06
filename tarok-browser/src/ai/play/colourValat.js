import { isTarok } from "../../rules.js";
import { highestBy, losingCards, orderedHighToLow, winningCards } from "../utils.js";

export function playColourValat(tarokGame, player, legalCards, level = "medium", inference = null) {
  const isDeclarer = player.id === tarokGame.game.declarer;
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  if (isDeclarer) {
    if (!trick.length) {
      // In colour valat, opening with guaranteed winners reduces accidental one-trick leaks.
      const guaranteed = level === "hard" && inference
        ? legalCards.filter((card) => cardIsGuaranteedWinnerInLedSuit(card, inference, contract))
        : [];
      const leads = guaranteed.length ? guaranteed : legalCards;
      return highestBy(leads, (card) => guaranteedColourLeadScore(card, player.hand));
    }
    const winners = winningCards(legalCards, trick, contract);
    return winners[0] || orderedHighToLow(legalCards)[0];
  }
  const winners = winningCards(legalCards, trick, contract);
  if (winners.length) {
    // Defenders need one stopper only; preserve higher stoppers if possible.
    return winners[winners.length - 1];
  }
  return losingCards(legalCards, trick, contract)[0] || orderedHighToLow(legalCards)[0];
}

function guaranteedColourLeadScore(card, hand) {
  if (isTarok(card)) return card.tarok - 6;
  const sameSuit = hand.filter((candidate) => candidate.suit === card.suit);
  const sequenceControl = sameSuit.filter((candidate) => candidate.suitStrength >= card.suitStrength).length;
  return card.suitStrength * 3 + sequenceControl;
}

function cardIsGuaranteedWinnerInLedSuit(card, inference, contract) {
  if (!inference) return false;
  if (isTarok(card)) {
    if (contract.mode === "colourValat") {
      const higherTaroks = inference.unknownCards.filter((candidate) => isTarok(candidate) && candidate.tarok > card.tarok);
      return higherTaroks.length === 0;
    }
    return false;
  }
  const unseenInSuit = inference.unknownCards.filter((candidate) => !isTarok(candidate) && candidate.suit === card.suit);
  const anyHigherSuit = unseenInSuit.some((candidate) => candidate.suitStrength > card.suitStrength);
  return !anyHigherSuit;
}
