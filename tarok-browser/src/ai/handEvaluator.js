import { SUITS, cardPower, isTarok, isTrula } from "../rules.js";
import { clamp, sum } from "./utils.js";

export const HAND_EVALUATOR_WEIGHTS = {
  // Shared feature weights keep bidding/announcements/play aligned around one
  // interpretation of hand quality.
  positive: {
    tarokCount: 2.0,
    highTarokCount: 3.0,
    hasSkis: 4.0,
    hasMond: 3.0,
    trulaCount: 2.0,
    kingsCount: 1.5,
    voidSuits: 1.0,
    mondCaptureRisk: -1.5,
    talonDependency: -1.0
  },
  negative: {
    weakSuitExits: 2.0,
    sureWinnersEstimate: -3.0,
    tarokCount: -2.5,
    kingsCount: -3.0,
    queensCount: -2.0,
    hasSkis: -4.0,
    hasMond: -3.0
  },
  solo: {
    tarokCount: 2.0,
    highTarokCount: 2.0,
    voidSuits: 1.5,
    relianceOnPartner: -2.0
  },
  klopRisk: {
    unavoidableWinnerEstimate: 4.0,
    highTarokCount: 3.0,
    kingsCount: 3.0,
    queensCount: 2.0,
    suitShortageWithTaroks: 1.5,
    lowExitCards: -2.0,
    longLowSuits: -1.5
  }
};

export function evaluateHand(hand, options = {}) {
  const suitGroups = Object.fromEntries(SUITS.map((suit) => [suit.id, hand.filter((card) => card.suit === suit.id)]));
  const taroks = hand.filter(isTarok);
  const highTarokCount = taroks.filter((card) => card.id === "SKIS" || card.tarok >= 16).length;
  const midTarokCount = taroks.filter((card) => card.id !== "SKIS" && card.tarok >= 8 && card.tarok <= 15).length;
  const lowTarokCount = taroks.filter((card) => card.id !== "SKIS" && card.tarok <= 7).length;
  const kings = hand.filter((card) => card.rank === "K");
  const queens = hand.filter((card) => card.rank === "Q");
  const trulaCount = hand.filter(isTrula).length;
  const suitLengths = Object.fromEntries(SUITS.map((suit) => [suit.id, suitGroups[suit.id].length]));
  const suitHighCards = Object.fromEntries(SUITS.map((suit) => [
    suit.id,
    suitGroups[suit.id].filter((card) => ["K", "Q", "N", "J"].includes(card.rank)).length
  ]));
  const voidSuits = SUITS.filter((suit) => suitLengths[suit.id] === 0).length;
  const singletonSuits = SUITS.filter((suit) => suitLengths[suit.id] === 1).length;
  const lowExitCards = hand.filter((card) => !isTarok(card) && card.value === 1 && card.suitStrength <= 3).length
    + taroks.filter((card) => card.tarok <= 5 && card.id !== "T1").length * 0.35;
  const longLowSuits = SUITS.filter((suit) => {
    const cards = suitGroups[suit.id];
    return cards.length >= 4 && cards.filter((card) => card.value <= 2).length >= 3;
  }).length;
  const weakSuitExits = hand.filter((card) => !isTarok(card) && card.value <= 2 && card.suitStrength <= 4).length
    + Math.max(0, lowTarokCount - 1) * 0.25;
  const pointCardsValue = sum(hand.filter((card) => card.value >= 3 || isTrula(card) || (isTarok(card) && card.tarok >= 19)), (card) => {
    if (isTrula(card)) return 5.5;
    if (isTarok(card) && card.tarok >= 19) return 2.25;
    return card.value;
  });
  const hasSkis = hand.some((card) => card.id === "SKIS");
  const hasMond = hand.some((card) => card.id === "T21");
  const hasPagat = hand.some((card) => card.id === "T1");
  const suitShortageWithTaroks = taroks.length >= 5
    ? SUITS.filter((suit) => suitLengths[suit.id] <= 1).length
    : 0;
  const sureWinnersEstimate = estimateSureWinners(hand, suitGroups, taroks);
  const unavoidableWinnerEstimate = estimateUnavoidableWinners(hand, suitGroups, taroks);
  const mondCaptureRisk = estimateMondCaptureRisk({ hasMond, hasSkis, taroks, highTarokCount }, options);
  const talonDependency = estimateTalonDependency({
    taroks,
    highTarokCount,
    kingsCount: kings.length,
    voidSuits,
    singletonSuits,
    suitHighCards,
    weakSuitExits
  });
  const pagatUltimoPotential = hasPagat
    ? clamp(taroks.length * 0.55 + highTarokCount * 0.9 + Number(hasSkis) + Number(hasMond) - mondCaptureRisk, 0, 10)
    : 0;
  const kingUltimoPotential = clamp(kings.length * 0.85 + voidSuits * 0.6 + taroks.length * 0.18, 0, 8);
  const relianceOnPartner = options.contract?.solo ? 0 : clamp(3.5 - highTarokCount - taroks.length / 5, 0, 3.5);

  // Build a normalized feature vector first so callers can reuse both raw signals
  // and aggregated strengths.
  const features = {
    tarokCount: taroks.length,
    highTarokCount,
    midTarokCount,
    lowTarokCount,
    hasSkis,
    hasMond,
    hasPagat,
    trulaCount,
    kingsCount: kings.length,
    queensCount: queens.length,
    pointCardsValue,
    suitLengths,
    suitHighCards,
    voidSuits,
    singletonSuits,
    weakSuitExits,
    sureWinnersEstimate,
    unavoidableWinnerEstimate,
    pagatUltimoPotential,
    kingUltimoPotential,
    mondCaptureRisk,
    talonDependency,
    suitShortageWithTaroks,
    lowExitCards,
    longLowSuits,
    relianceOnPartner
  };

  const positiveStrength = weighted(features, HAND_EVALUATOR_WEIGHTS.positive);
  const negativeStrength = weighted(features, HAND_EVALUATOR_WEIGHTS.negative);
  const soloStrength = positiveStrength
    + features.tarokCount * HAND_EVALUATOR_WEIGHTS.solo.tarokCount
    + features.highTarokCount * HAND_EVALUATOR_WEIGHTS.solo.highTarokCount
    + features.voidSuits * HAND_EVALUATOR_WEIGHTS.solo.voidSuits
    + features.relianceOnPartner * HAND_EVALUATOR_WEIGHTS.solo.relianceOnPartner;
  const klopRisk = weighted(features, HAND_EVALUATOR_WEIGHTS.klopRisk);

  return {
    ...features,
    positiveStrength,
    negativeStrength,
    soloStrength,
    klopRisk
  };
}

function weighted(features, weights) {
  return Object.entries(weights).reduce((score, [key, weight]) => {
    const raw = features[key];
    return score + (typeof raw === "boolean" ? Number(raw) : Number(raw || 0)) * weight;
  }, 0);
}

function estimateSureWinners(hand, suitGroups, taroks) {
  const topTaroks = taroks.filter((card) => card.id === "SKIS" || card.tarok >= 20).length;
  const guardedKings = SUITS.filter((suit) => {
    const cards = suitGroups[suit.id];
    return cards.some((card) => card.rank === "K") && cards.length >= 2;
  }).length;
  const veryHighSuitCards = hand.filter((card) => !isTarok(card) && card.suitStrength >= 7).length * 0.35;
  return topTaroks + guardedKings * 0.7 + veryHighSuitCards;
}

function estimateUnavoidableWinners(hand, suitGroups, taroks) {
  const heavyTaroks = taroks.filter((card) => card.id === "SKIS" || card.tarok >= 18).length * 0.8;
  const bareHonours = SUITS.reduce((total, suit) => {
    const cards = suitGroups[suit.id];
    if (cards.length > 2) return total;
    return total + cards.filter((card) => card.value >= 4).length * 0.8;
  }, 0);
  const highPower = hand.filter((card) => cardPower(card) >= 120 || (!isTarok(card) && card.suitStrength >= 7)).length * 0.18;
  return heavyTaroks + bareHonours + highPower;
}

function estimateMondCaptureRisk({ hasMond, hasSkis, taroks, highTarokCount }, options) {
  if (!hasMond) return 0;
  if (hasSkis) return options.playedSkis ? 0 : 0.15;
  const lengthProtection = clamp(taroks.length / 10, 0, 1);
  const highProtection = clamp(highTarokCount / 4, 0, 1);
  return clamp(1.65 - lengthProtection - highProtection + (options.skirKnownOut ? 0.45 : 0), 0.1, 2.1);
}

function estimateTalonDependency({ taroks, highTarokCount, kingsCount, voidSuits, singletonSuits, suitHighCards, weakSuitExits }) {
  const suitHoles = SUITS.filter((suit) => suitHighCards[suit.id] === 0).length;
  return clamp(
    suitHoles * 0.55
      + singletonSuits * 0.35
      + Math.max(0, 6 - taroks.length) * 0.7
      + Math.max(0, 2 - highTarokCount) * 0.8
      + Math.max(0, 2 - kingsCount) * 0.25
      - voidSuits * 0.45
      - weakSuitExits * 0.08,
    0,
    8
  );
}
