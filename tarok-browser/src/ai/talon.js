import { canDiscard, isTarok, sortHand } from "../rules.js";
import { evaluateHand } from "./handEvaluator.js";
import { cardRisk, combinations, randomIndex, shuffle, sum } from "./utils.js";

export function chooseTalonGroup(game, player, groups, level = "medium") {
  if (!groups.length) return 0;
  if (level === "easy") {
    if (Math.random() < 0.35) return randomIndex(groups.length);
    return bestRawPointGroup(groups);
  }

  const scored = groups.map((group, index) => {
    const candidateHand = [...player.hand, ...group];
    sortHand(candidateHand);
    const discards = findBestLegalDiscard(candidateHand, game.contract.talonTake, game.contract, level);
    return {
      index,
      score: scoreTalonOutcome(candidateHand, discards, game.contract, level)
        + sum(group, (card) => card.value) * 0.45
    };
  });
  return scored.sort((a, b) => b.score - a.score)[0].index;
}

export function chooseDiscard(game, player, count, level = "medium") {
  if (level === "easy") {
    return shuffle(player.hand.filter(canDiscard)).slice(0, count);
  }
  return findBestLegalDiscard(player.hand, count, game.contract, level);
}

export function findBestLegalDiscard(hand, count, contract, level = "medium") {
  const candidates = hand.filter(canDiscard);
  if (count <= 0) return [];
  if (candidates.length <= count) return candidates.slice(0, count);

  const comboLimit = level === "hard" ? 5000 : 1500;
  return combinations(candidates, count, comboLimit)
    .map((discards) => ({
      discards,
      score: scoreTalonOutcome(hand, discards, contract, level)
    }))
    .sort((a, b) => b.score - a.score)[0].discards;
}

function scoreTalonOutcome(hand, discards, contract, level) {
  const discardIds = new Set(discards.map((card) => card.id));
  const finalHand = hand.filter((card) => !discardIds.has(card.id));
  const features = evaluateHand(finalHand, { contract });
  const discardPointsBanked = sum(discards, (card) => card.value) * 0.9;
  const createdVoidBonus = createdVoids(hand, finalHand) * (contract?.solo ? 2.4 : 1.8);
  const exposedTrumpDiscardPenalty = sum(discards.filter(isTarok), (card) => {
    const highPenalty = card.tarok >= 16 || card.id === "T1" ? 5 : 1.8;
    return highPenalty + Math.max(0, 5 - features.tarokCount) * 1.2;
  });
  const ultimoDamage = sum(discards, (card) => card.id === "T1" ? 20 : 0);
  const safety = contract?.mode === "positive" || contract?.mode === "valat" || contract?.mode === "colourValat"
    ? features.positiveStrength + features.soloStrength * (contract.solo ? 0.35 : 0.12)
    : features.negativeStrength;
  const hardControlBonus = level === "hard" ? features.pagatUltimoPotential * 0.25 + features.kingUltimoPotential * 0.15 : 0;
  return safety
    + discardPointsBanked
    + createdVoidBonus
    + hardControlBonus
    - exposedTrumpDiscardPenalty
    - ultimoDamage
    - sum(discards, cardRisk) * 0.03;
}

function createdVoids(before, after) {
  const beforeSuits = new Set(before.filter((card) => !isTarok(card)).map((card) => card.suit));
  const afterSuits = new Set(after.filter((card) => !isTarok(card)).map((card) => card.suit));
  let count = 0;
  beforeSuits.forEach((suit) => {
    if (!afterSuits.has(suit)) count += 1;
  });
  return count;
}

function bestRawPointGroup(groups) {
  return groups
    .map((group, index) => ({ index, score: sum(group, (card) => card.value) }))
    .sort((a, b) => b.score - a.score)[0].index;
}
