import { cardPower, countTarokPoints, isTarok, isTrula, trickWinner } from "../../rules.js";
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
  const currentWinnerDeclarerSide = knownDeclarerSide(tarokGame, currentWinner, tarokGame.players[currentWinner], inference);
  const ownSideWinning = trick.length
    ? sameKnownSide(tarokGame, player.id, currentWinner, player, declarerSide, inference)
    : false;
  // Contest decisions are contextual: point load, side pressure, and trump reserve.
  const shouldWin = shouldContestTrick({
    tarokGame,
    declarerSide,
    currentWinnerDeclarerSide,
    ownSideWinning,
    currentPoints,
    lastToPlay,
    winners,
    level,
    inference
  });

  if (winners.length && shouldWin) {
    return lowestBy(winners, (card) => winCost(card, tarokGame, inference, {
      declarerSide,
      currentPoints,
      lastToPlay,
      level
    }) - currentPoints * defenderUrgency(tarokGame, declarerSide));
  }

  if (losing.length) {
    const canFeedPartner = ownSideWinning && currentPoints >= 4 && knownPartnerOrSelf(tarokGame, player.id, currentWinner, inference);
    if (canFeedPartner) {
      const counter = orderedHighToLow(losing).find((card) => card.value >= 3 && !isTrula(card));
      if (counter) return counter;
    }
    return lowestBy(losing, (card) => dumpCost(card, level));
  }

  return lowestBy(winners, (card) => winCost(card, tarokGame, inference, {
    declarerSide,
    currentPoints,
    lastToPlay,
    level
  }));
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
  if (inference) {
    return lowestBy(legalCards, (card) => defensiveLeadCost(card, tarokGame, player, inference, level));
  }
  return orderedLowToHigh(legalCards).find((card) => !isTarok(card)) || orderedLowToHigh(legalCards)[0];
}

function defensiveLeadCost(card, tarokGame, player, inference, level) {
  const declarerSideIds = knownDeclarerSideIds(tarokGame, player, inference);
  const suit = isTarok(card) ? "tarok" : card.suit;
  const knownVoidDanger = !isTarok(card)
    ? declarerSideIds.filter((id) => inference.voids.get(id)?.has(suit) && !inference.trumpVoids?.get(id)).length
    : 0;
  const suspectedVoidDanger = !isTarok(card) ? declarerDiscardedSuitCount(tarokGame, suit) : 0;
  const futurePlayers = playersAfter(tarokGame, player.id);
  const nextDeclarerCanTrump = !isTarok(card)
    && futurePlayers.some((id) => declarerSideIds.includes(id) && inference.voids.get(id)?.has(suit) && !inference.trumpVoids?.get(id));
  const pointLeak = card.value * (knownVoidDanger ? 12 : suspectedVoidDanger ? 6 : 2);
  const honourLeak = !isTarok(card) && card.value >= 3 ? card.value * (knownVoidDanger ? 7 : 2) : 0;
  const tarokControlCost = isTarok(card)
    ? cardRisk(card) * (card.id === "SKIS" || card.id === "T21" ? 0.75 : 0.24)
    : 0;
  const reserve = highTrumpReservePenalty(card, tarokGame, inference, {
    declarerSide: false,
    currentPoints: 0,
    lastToPlay: false,
    level
  });
  const lowExitBonus = !isTarok(card) && card.value === 1 && !knownVoidDanger ? -3 : 0;
  const immediateTrumpPenalty = nextDeclarerCanTrump ? 18 + card.value * 5 : 0;
  return pointLeak
    + honourLeak
    + tarokControlCost
    + reserve
    + immediateTrumpPenalty
    + suspectedVoidDanger * (4 + card.value * 2)
    + cardPower(card) * 0.025
    + lowExitBonus;
}

function shouldContestTrick({
  tarokGame,
  declarerSide,
  currentWinnerDeclarerSide,
  ownSideWinning,
  currentPoints,
  lastToPlay,
  winners,
  level,
  inference
}) {
  if (!winners.length || ownSideWinning) return false;
  const pressure = defenderPressure(tarokGame);
  if (declarerSide) {
    return lastToPlay
      ? currentPoints >= 4 || pressure.declarerPoints < 20
      : currentPoints >= 7;
  }
  if (!currentWinnerDeclarerSide) return false;
  const cheapestWinner = lowestBy(winners, (card) => winCost(card, tarokGame, inference, {
    declarerSide,
    currentPoints,
    lastToPlay,
    level
  }));
  const reserve = highTrumpReservePenalty(cheapestWinner, tarokGame, inference, {
    declarerSide,
    currentPoints,
    lastToPlay,
    level
  });
  const threshold = pressure.declarerNearGame ? 3 : lastToPlay ? 5 : 8;
  if (reserve >= 20 && currentPoints < 8 && !pressure.declarerNearGame) return false;
  return currentPoints >= threshold || (lastToPlay && reserve < 12 && currentPoints >= 4);
}

function winCost(card, tarokGame, inference, context = {}) {
  const ultimoPenalty = card.id === "T1" && tarokGame.game.trickNumber < tarokGame.maxTricks() - 1 ? 15 : 0;
  const mondRisk = card.id === "T21" && inference ? remainingHigherTaroks(card, inference) * 1.3 : 0;
  return cardPower(card) * 0.12
    + card.value * 2.5
    + ultimoPenalty
    + mondRisk
    + highTrumpReservePenalty(card, tarokGame, inference, context);
}

function highTrumpReservePenalty(card, tarokGame, inference, context = {}) {
  if (!isTarok(card)) return 0;
  const levelWeight = context.level === "hard" ? 1 : 0.55;
  const late = tarokGame.game.trickNumber >= tarokGame.maxTricks() - 3;
  const pointPressure = Math.max(0, Number(context.currentPoints || 0) - 6);
  const pressureDiscount = pointPressure * 1.8 + (late ? 10 : 0) + (context.lastToPlay ? 3 : 0);
  const defenderMultiplier = context.declarerSide ? 0.45 : 1;
  // Reserve premium keeps SKIS/Mond available for late high-leverage tricks.
  let reserve = 0;
  if (card.id === "SKIS") reserve = 34;
  else if (card.id === "T21") reserve = 28 + (inference ? remainingHigherTaroks(card, inference) * 2.5 : 0);
  else if (card.tarok >= 18) reserve = 15;
  else if (card.tarok >= 15) reserve = 8;
  return Math.max(0, reserve - pressureDiscount) * defenderMultiplier * levelWeight;
}

function dumpCost(card, level) {
  const pointLeak = card.value * 4.5;
  const hardControl = level === "hard" && isTarok(card) ? cardRisk(card) * 0.2 : 0;
  const highSuitLeak = !isTarok(card) && card.value >= 3 ? card.value * 3 : 0;
  return pointLeak + highSuitLeak + hardControl + cardPower(card) * 0.02;
}

function defenderUrgency(tarokGame, declarerSide) {
  if (declarerSide) return 0.35;
  const pressure = defenderPressure(tarokGame);
  if (pressure.declarerNearGame) return 1.25;
  if (pressure.declarerPoints >= 20) return 0.9;
  return 0.55;
}

function defenderPressure(tarokGame) {
  const declarerCards = tarokGame.activePlayers()
    .filter((candidate) => tarokGame.isDeclarerSide(candidate.id))
    .flatMap((candidate) => candidate.taken);
  const declarerPoints = countTarokPoints(declarerCards);
  return {
    declarerPoints,
    declarerNearGame: declarerPoints >= 28
  };
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

function playersAfter(tarokGame, playerId) {
  const out = [];
  let current = playerId;
  for (let i = 1; i < tarokGame.playerCount; i += 1) {
    current = nextPlayerId(tarokGame, current);
    out.push(current);
  }
  return out;
}

function knownDeclarerSideIds(tarokGame, player, inference) {
  return tarokGame.activePlayers()
    .filter((candidate) => knownDeclarerSide(tarokGame, candidate.id, candidate, inference))
    .filter((candidate) => candidate.id !== player.id)
    .map((candidate) => candidate.id);
}

function declarerDiscardedSuitCount(tarokGame, suit) {
  if (!suit || suit === "tarok") return 0;
  return (tarokGame.game.talonDiscards || [])
    .filter((card) => !isTarok(card) && card.suit === suit)
    .length;
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
