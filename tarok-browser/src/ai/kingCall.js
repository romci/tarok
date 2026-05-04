import { evaluateHand } from "./handEvaluator.js";
import { highestBy } from "./utils.js";

export function chooseCalledKing(tarokGame, declarer, level = "medium") {
  const kings = tarokGame.callableKings();
  if (level === "easy") {
    return highestBy(kings, (king) => declarer.hand.some((card) => card.id === king.id) ? -4 : -suitLength(declarer.hand, king.suit));
  }
  const features = evaluateHand(declarer.hand);
  return highestBy(kings, (king) => kingCallScore(king, declarer.hand, features, level));
}

export function kingCallScore(king, hand, features, level = "medium") {
  const held = hand.some((card) => card.id === king.id);
  const length = suitLength(hand, king.suit);
  const middleCards = hand.filter((card) => card.suit === king.suit && card.value >= 2 && card.value < 5).length;
  const shortSuitBonus = length === 0 ? 3.2 : length === 1 ? 2.4 : length === 2 ? 1.1 : -1.1 * (length - 2);
  const abilityToTrumpSuitLater = features.tarokCount * 0.18 + features.lowTarokCount * 0.05 + features.highTarokCount * 0.25;
  const hidePartnerPotential = held ? -4 : length <= 1 ? 1.4 : 0.4;
  const dangerCalledKingCaptured = middleCards * 0.9 + Math.max(0, length - 3) * 0.6 - features.tarokCount * 0.08;
  const chanceKingInTalonForcedSolo = held ? 0 : 1 / 6;
  const hardRisk = level === "hard" ? features.talonDependency * 0.2 + features.mondCaptureRisk * 0.15 : 0;
  return 2.0 * shortSuitBonus
    + 1.5 * abilityToTrumpSuitLater
    + 1.0 * hidePartnerPotential
    - 2.0 * dangerCalledKingCaptured
    - 1.5 * chanceKingInTalonForcedSolo * (features.soloStrength < 40 ? 4 : 1)
    - hardRisk
    - (held ? 8 : 0);
}

function suitLength(hand, suit) {
  return hand.filter((card) => card.suit === suit).length;
}
