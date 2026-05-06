import { isTarok } from "../../rules.js";
import { highestBy, losingCards, orderedHighToLow, winningCards } from "../utils.js";

export function playValat(tarokGame, player, legalCards, level = "medium", inference = null) {
  const isDeclarer = player.id === tarokGame.game.declarer;
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  if (isDeclarer) {
    if (!trick.length) {
      const guaranteed = level === "hard" && inference
        ? legalCards.filter((card) => cardGuaranteedValatLead(card, inference))
        : [];
      const candidateLeads = guaranteed.length ? guaranteed : legalCards;
      const topTarok = highestBy(candidateLeads.filter(isTarok), (card) => card.tarok);
      return topTarok || orderedHighToLow(candidateLeads)[0];
    }
    const winners = winningCards(legalCards, trick, contract);
    return winners.length ? winners[0] : orderedHighToLow(legalCards)[0];
  }
  const winners = winningCards(legalCards, trick, contract);
  if (winners.length) {
    // Defenders only need one trick; spend the cheapest winning stopper first.
    return winners[winners.length - 1];
  }
  return losingCards(legalCards, trick, contract)[0] || orderedHighToLow(legalCards)[0];
}

function cardGuaranteedValatLead(card, inference) {
  if (!inference) return false;
  if (isTarok(card)) {
    return !inference.unknownCards.some((candidate) => isTarok(candidate) && candidate.tarok > card.tarok);
  }
  const unknownTarokExists = inference.unknownCards.some(isTarok);
  if (unknownTarokExists) return false;
  return !inference.unknownCards.some((candidate) => !isTarok(candidate) && candidate.suit === card.suit && candidate.suitStrength > card.suitStrength);
}
