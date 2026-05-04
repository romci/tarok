import { cardPower, isTarok, isTrula, trickWinner } from "../../rules.js";
import { evaluateHand } from "../handEvaluator.js";
import { remainingHigherTaroks } from "../inference.js";
import { cardRisk, losingCards, lowestBy, orderedHighToLow, orderedLowToHigh, trickPoints, winningCards } from "../utils.js";

export function playPositive(tarokGame, player, legalCards, level = "medium", inference = null) {
  const declarerSide = knownDeclarerSide(tarokGame, player.id, player, inference);
  const trick = tarokGame.game.currentTrick;
  const contract = tarokGame.game.contract;
  if (!trick.length) return leadPositive(tarokGame, player, legalCards, declarerSide, level, inference);

  const winners = winningCards(legalCards, trick, contract);
  const losing = losingCards(legalCards, trick, contract);
  const currentPoints = trickPoints(trick);
  const lastToPlay = trick.length === tarokGame.playerCount - 1;
  const currentWinner = currentWinnerId(tarokGame, trick);
  const ownSideWinning = trick.length
    ? sameKnownSide(tarokGame, player.id, currentWinner, player, declarerSide, inference)
    : false;
  const shouldWin = lastToPlay
    ? !ownSideWinning && currentPoints >= (declarerSide ? 4 : 6)
    : currentPoints >= (declarerSide ? 7 : 9);

  if (winners.length && shouldWin) {
    return lowestBy(winners, (card) => winCost(card, tarokGame, inference) - currentPoints * 0.35);
  }

  if (losing.length) {
    const canFeedPartner = ownSideWinning && currentPoints >= 4 && knownPartnerOrSelf(tarokGame, player.id, currentWinner, inference);
    if (canFeedPartner) {
      const counter = orderedHighToLow(losing).find((card) => card.value >= 3 && !isTrula(card));
      if (counter) return counter;
    }
    return lowestBy(losing, (card) => dumpCost(card, level));
  }

  return lowestBy(winners, (card) => winCost(card, tarokGame, inference));
}

function leadPositive(tarokGame, player, legalCards, declarerSide, level, inference) {
  const features = evaluateHand(player.hand, { contract: tarokGame.game.contract });
  if (declarerSide && features.tarokCount >= 7 && features.highTarokCount >= 2) {
    const drawTrump = orderedHighToLow(legalCards).find((card) => isTarok(card) && card.id !== "T1");
    if (drawTrump) return drawTrump;
  }
  if (declarerSide) {
    const safeKing = legalCards.find((card) => card.rank === "K" && suitLength(player.hand, card.suit) >= 2);
    if (safeKing) return safeKing;
    const controlledSuit = orderedHighToLow(legalCards).find((card) => !isTarok(card) && card.value >= 3);
    if (controlledSuit) return controlledSuit;
  }
  if (level === "hard" && inference) {
    const safeLowSuit = orderedLowToHigh(legalCards)
      .find((card) => !isTarok(card) && !inference.voids.get(nextPlayerId(tarokGame, player.id))?.has(card.suit));
    if (safeLowSuit) return safeLowSuit;
  }
  return orderedLowToHigh(legalCards).find((card) => !isTarok(card)) || orderedLowToHigh(legalCards)[0];
}

function winCost(card, tarokGame, inference) {
  const ultimoPenalty = card.id === "T1" && tarokGame.game.trickNumber < tarokGame.maxTricks() - 1 ? 15 : 0;
  const mondRisk = card.id === "T21" && inference ? remainingHigherTaroks(card, inference) * 1.3 : 0;
  return cardPower(card) * 0.12 + card.value * 2.5 + ultimoPenalty + mondRisk;
}

function dumpCost(card, level) {
  const pointLeak = card.value * 4.5;
  const hardControl = level === "hard" && isTarok(card) ? cardRisk(card) * 0.2 : 0;
  const highSuitLeak = !isTarok(card) && card.value >= 3 ? card.value * 3 : 0;
  return pointLeak + highSuitLeak + hardControl + cardPower(card) * 0.02;
}

function currentWinnerId(tarokGame, trick) {
  const candidate = [...trick];
  candidate.contract = tarokGame.game.contract;
  return trickWinner(candidate);
}

function suitLength(hand, suit) {
  return hand.filter((card) => card.suit === suit).length;
}

function nextPlayerId(tarokGame, playerId) {
  let next = playerId;
  do {
    next = (next + 1) % tarokGame.playerCount;
  } while (!tarokGame.players[next]?.active);
  return next;
}

function knownDeclarerSide(tarokGame, playerId, player, inference) {
  const game = tarokGame.game;
  if (playerId === game.declarer) return true;
  if (!game.calledKing || game.partnerKnownPublicly) return tarokGame.isDeclarerSide(playerId);
  if (inference?.knownPartnerId === game.declarer) return true;
  return player.hand.some((card) => card.id === game.calledKing.id);
}

function sameKnownSide(tarokGame, playerId, otherId, player, playerDeclarerSide, inference) {
  if (playerId === otherId) return true;
  const otherDeclarerSide = knownDeclarerSide(tarokGame, otherId, tarokGame.players[otherId], inference);
  if (playerDeclarerSide && otherDeclarerSide) return true;
  if (!playerDeclarerSide && !otherDeclarerSide && partnershipKnownEnough(tarokGame, player, inference)) return true;
  return false;
}

function knownPartnerOrSelf(tarokGame, playerId, otherId, inference) {
  if (playerId === otherId) return true;
  if (tarokGame.game.partnerKnownPublicly) return tarokGame.isDeclarerSide(playerId) === tarokGame.isDeclarerSide(otherId);
  return inference?.knownPartnerId === otherId;
}

function partnershipKnownEnough(tarokGame, player, inference) {
  return tarokGame.game.partnerKnownPublicly
    || !tarokGame.game.calledKing
    || player.id === tarokGame.game.declarer
    || inference?.knownPartnerId !== null;
}
