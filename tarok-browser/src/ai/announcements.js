import { evaluateHand } from "./handEvaluator.js";

export function chooseAnnouncement(game, player, level = "medium") {
  if (level === "easy") return { type: "pass" };
  const ctx = game.announcementContext;
  const contract = game.contract;
  if (!ctx || !contract || contract.noBonuses) return { type: "pass" };

  const declarerSide = player.id === game.declarer || player.id === game.partner;
  const features = evaluateHand(player.hand, { contract });

  if (!declarerSide && canDoubleNow(ctx, declarerSide) && shouldKontra(features, contract, level)) {
    return { type: "gameDouble" };
  }
  if (declarerSide && canDoubleNow(ctx, declarerSide) && shouldRekontra(features, contract, level)) {
    return { type: "gameDouble" };
  }
  if (declarerSide) {
    const bonus = chooseBonusAnnouncement(features, ctx, contract, level);
    if (bonus) return { type: "announce", bonus };
  }
  return { type: "pass" };
}

function canDoubleNow(ctx, declarerSide) {
  if (ctx.gameDoubles >= 4) return false;
  const defenderMove = ctx.gameDoubles % 2 === 0;
  return defenderMove ? !declarerSide : declarerSide;
}

function shouldKontra(features, contract, level) {
  if (contract.mode === "beggar" || contract.mode === "piccolo") return false;
  const threshold = level === "hard" ? 34 : 39;
  return features.positiveStrength >= threshold && features.highTarokCount >= 2;
}

function shouldRekontra(features, contract, level) {
  if (contract.mode === "beggar" || contract.mode === "piccolo") return false;
  const threshold = level === "hard" ? 43 : 48;
  return features.soloStrength >= threshold && features.trulaCount >= 2;
}

function chooseBonusAnnouncement(features, ctx, contract, level) {
  if (!ctx.trulaAnnounced && features.trulaCount >= (level === "hard" ? 2 : 3) && features.positiveStrength >= 34) {
    return "trula";
  }
  if (!ctx.kingsAnnounced && features.kingsCount >= (level === "hard" ? 3 : 4) && features.positiveStrength >= 30) {
    return "kings";
  }
  if (!ctx.pagatUltimoAnnounced && features.pagatUltimoPotential >= (level === "hard" ? 7.2 : 8.2)) {
    return "pagatUltimo";
  }
  if (!ctx.kingUltimoAnnounced && contract.callsKing && features.kingUltimoPotential >= (level === "hard" ? 5.8 : 6.8)) {
    return "kingUltimo";
  }
  if (!ctx.valatAnnounced && features.soloStrength >= (level === "hard" ? 58 : 66) && features.highTarokCount >= 4) {
    return "valat";
  }
  return null;
}
