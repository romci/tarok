import { CONTRACTS, CONTRACT_SEQUENCE, NORMAL_CONTRACT_IDS } from "../rules.js";
import { evaluateHand } from "./handEvaluator.js";
import { clamp, randomChoice, shuffle } from "./utils.js";

const GATES = {
  three: { positive: 18, taroks: 5, highTaroks: 0 },
  two: { positive: 23, taroks: 6, highTaroks: 1 },
  one: { positive: 29, taroks: 7, highTaroks: 2 },
  piccolo: { piccoloShape: 1 },
  soloThree: { solo: 39, taroks: 8, highTaroks: 2 },
  soloTwo: { solo: 45, taroks: 8, highTaroks: 3 },
  soloOne: { solo: 51, taroks: 9, highTaroks: 3 },
  beggar: { negative: -4, unavoidable: 1.2, taroksMax: 3, kingsMax: 0 },
  soloWithout: { solo: 55, taroks: 9, highTaroks: 3 },
  openBeggar: { negative: 1, unavoidable: 0.8, taroksMax: 2, kingsMax: 0 },
  colourValatWithout: { valat: 66, taroks: 9, highTaroks: 4 },
  valatWithout: { valat: 78, taroks: 10, highTaroks: 5 }
};

const RISK_MARGIN = {
  easy: 5,
  medium: 2,
  hard: 0
};

export function chooseBestBid(game, player, level = "medium") {
  const legal = legalBidContractsFromSnapshot(game);
  if (!legal.length) return null;
  if (game.bidding?.forehandChoice && legal.some((contract) => contract.id === "klop")) {
    return chooseForehandContract(game, player, level, legal);
  }

  const features = evaluateHand(player.hand);
  const scored = legal
    .filter((contract) => contract.id !== "klop")
    .map((contract) => ({
      contract,
      ev: estimateContractEV(contract, game, player, level, features),
      gate: passesContractGate(contract, features, game.playerCount, level)
    }))
    .filter((item) => item.gate || (level === "easy" && item.contract.rank <= CONTRACTS.soloOne.rank))
    .sort((a, b) => b.ev - a.ev);

  if (!scored.length) return null;

  if (level === "easy") {
    const plausible = scored.filter((item) => item.ev > RISK_MARGIN.easy);
    if (!plausible.length) return null;
    if (Math.random() < 0.2) return randomChoice(plausible).contract;
    if (Math.random() < 0.18) return null;
    return plausible[0].contract;
  }

  const best = scored[0];
  return best.ev > RISK_MARGIN[level] ? best.contract : null;
}

export function estimateContractEV(contract, game, player, level = "medium", existingFeatures = null) {
  const features = existingFeatures || evaluateHand(player.hand, { contract });
  const gate = contractGateScore(contract, features, game.playerCount);
  const winProbability = estimateWinProbability(contract, features, gate, level);
  const bonusEV = estimateBonusEV(contract, features, level);
  const radlAdjustment = player.radli > 0 ? (winProbability - 0.5) * 8 : 0;
  const riskPenalty = estimateRiskPenalty(contract, features, level);
  const expectedDifference = NORMAL_CONTRACT_IDS.has(contract.id)
    ? clamp(features.positiveStrength - 22, 0, 25)
    : 0;
  const expectedWinScore = contract.base + expectedDifference + bonusEV;
  const expectedLoseScore = contract.base + expectedDifference * 0.65 + riskPenalty;
  return winProbability * expectedWinScore - (1 - winProbability) * expectedLoseScore + radlAdjustment - riskPenalty;
}

export function legalBidContractsFromSnapshot(game) {
  const bidding = game.bidding;
  if (!bidding) return [];
  if (bidding.forehandChoice) return CONTRACT_SEQUENCE;
  const currentRank = bidding.currentContract ? bidding.currentContract.rank : -1;
  if (game.playerCount === 3) {
    return CONTRACT_SEQUENCE.filter((contract) => contract.id !== "klop" && contract.id !== "three" && contract.rank > currentRank);
  }
  const higherPriority = bidding.highestBidder !== null
    && turnDistance(game.forehand, game.activePlayer, game.playerCount) < turnDistance(game.forehand, bidding.highestBidder, game.playerCount);
  const minimumRank = higherPriority ? currentRank : currentRank + 1;
  return CONTRACT_SEQUENCE.filter((contract) => contract.id !== "klop" && contract.id !== "three" && contract.rank >= minimumRank);
}

function chooseForehandContract(game, player, level, legal) {
  const best = chooseBestBid({ ...game, bidding: { ...game.bidding, forehandChoice: false, currentContract: null } }, player, level);
  if (best && legal.some((contract) => contract.id === best.id)) return best;
  const features = evaluateHand(player.hand);
  if (features.klopRisk < (level === "hard" ? 11 : 8) || features.negativeStrength > -4) return CONTRACTS.klop;
  const nonKlop = legal.filter((contract) => contract.id !== "klop");
  return nonKlop.find((contract) => contract.id === "three") || nonKlop[0] || CONTRACTS.klop;
}

function estimateWinProbability(contract, features, gateScore, level) {
  const scale = level === "hard" ? 7 : level === "medium" ? 9 : 12;
  const base = sigmoid(gateScore / scale);
  if (contract.id === "valatWithout" || contract.id === "colourValatWithout") {
    return clamp(base * 0.72 + guaranteedWinnerPressure(features) * 0.12, 0.02, 0.94);
  }
  if (contract.mode === "beggar" || contract.mode === "piccolo") {
    return clamp(base, 0.04, 0.92);
  }
  return clamp(base + features.trulaCount * 0.025 + features.voidSuits * 0.02, 0.05, 0.95);
}

function estimateBonusEV(contract, features, level) {
  if (contract.noBonuses) return 0;
  let ev = 0;
  if (features.trulaCount >= 2) ev += level === "hard" ? 5 : 3;
  if (features.kingsCount >= 3) ev += level === "hard" ? 4 : 2;
  if (features.pagatUltimoPotential >= 7) ev += level === "hard" ? 5 : 1;
  if (features.kingUltimoPotential >= 5 && contract.callsKing) ev += 2;
  return ev;
}

function estimateRiskPenalty(contract, features, level) {
  const riskBias = level === "easy" ? 0.65 : level === "medium" ? 1 : 1.25;
  let risk = contract.base / 18;
  if (contract.solo) risk += Math.max(0, 4 - features.highTarokCount) * 1.4;
  if (contract.mode === "beggar") risk += features.unavoidableWinnerEstimate * 5;
  if (contract.mode === "valat" || contract.mode === "colourValat") risk += 10 - guaranteedWinnerPressure(features);
  risk += features.mondCaptureRisk * 2;
  risk += features.talonDependency * (contract.talonTake ? 0.6 : 1.1);
  return risk * riskBias;
}

function passesContractGate(contract, features, playerCount, level) {
  const loosen = level === "easy" ? 5 : level === "hard" ? -1 : 0;
  const gate = GATES[contract.id];
  if (!gate) return false;
  if (playerCount === 3 && contract.callsKing) return features.soloStrength >= gate.positive + 8 + loosen;
  if (gate.piccoloShape) return piccoloShape(features) >= (level === "hard" ? 2.2 : 1.6);
  if (gate.negative !== undefined) {
    return features.negativeStrength >= gate.negative + loosen * 0.5
      && features.unavoidableWinnerEstimate <= gate.unavoidable + (level === "easy" ? 0.8 : 0)
      && features.tarokCount <= gate.taroksMax + (level === "easy" ? 1 : 0)
      && features.kingsCount <= gate.kingsMax + (level === "easy" ? 1 : 0);
  }
  if (gate.valat !== undefined) {
    return features.soloStrength >= gate.valat + loosen
      && features.tarokCount >= gate.taroks
      && features.highTarokCount >= gate.highTaroks
      && guaranteedWinnerPressure(features) >= (contract.id === "valatWithout" ? 9 : 7);
  }
  if (gate.solo !== undefined) {
    return features.soloStrength >= gate.solo + loosen
      && features.tarokCount >= gate.taroks
      && features.highTarokCount >= gate.highTaroks;
  }
  return features.positiveStrength >= gate.positive + loosen
    && features.tarokCount >= gate.taroks
    && features.highTarokCount >= gate.highTaroks;
}

function contractGateScore(contract, features, playerCount) {
  const gate = GATES[contract.id];
  if (!gate) return -Infinity;
  if (gate.piccoloShape) return (piccoloShape(features) - 1.8) * 8;
  if (gate.negative !== undefined) {
    return (features.negativeStrength - gate.negative) * 2
      + (gate.unavoidable - features.unavoidableWinnerEstimate) * 6
      + (gate.taroksMax - features.tarokCount) * 2;
  }
  if (gate.valat !== undefined) {
    return (features.soloStrength - gate.valat)
      + (features.tarokCount - gate.taroks) * 2
      + (features.highTarokCount - gate.highTaroks) * 3
      + guaranteedWinnerPressure(features);
  }
  if (gate.solo !== undefined || playerCount === 3) {
    return (features.soloStrength - (gate.solo || gate.positive + 8))
      + (features.tarokCount - gate.taroks) * 2
      + (features.highTarokCount - gate.highTaroks) * 3;
  }
  return (features.positiveStrength - gate.positive)
    + (features.tarokCount - gate.taroks) * 2
    + (features.highTarokCount - gate.highTaroks) * 3
    - features.talonDependency;
}

function piccoloShape(features) {
  const oneWinner = 2.6 - Math.abs(features.unavoidableWinnerEstimate - 1.1) * 1.8;
  return oneWinner + features.lowExitCards * 0.45 - features.highTarokCount * 0.8 - features.kingsCount * 0.9;
}

function guaranteedWinnerPressure(features) {
  return features.highTarokCount * 1.7
    + Number(features.hasSkis) * 2
    + Number(features.hasMond) * 1.4
    + features.kingsCount * 0.55
    + features.tarokCount * 0.25;
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function turnDistance(start, target, playerCount) {
  if (target === null || target === undefined) return Infinity;
  return (target - start + playerCount) % playerCount;
}
