import { LocalAIController } from "../ai.js";
import { evaluateHand } from "../ai/handEvaluator.js";
import { buildInference } from "../ai/inference.js";
import { canDiscard, cardLabel, countTarokPoints, isTarok, wouldWin } from "../rules.js";
import { contractName, formatCardList } from "./formatters.js";

const hardAdvisor = new LocalAIController(0, "hard");

export function buildTutorialSuggestion(model, t) {
  const human = model.players[model.humanId];
  if (!human?.active || model.game.handDone) return null;
  if (model.isHumanBidTurn()) return bidSuggestion(model, human, t);
  if (model.isHumanCallingTurn()) return kingSuggestion(model, human, t);
  if (model.isHumanTalonGroupTurn()) return talonGroupSuggestion(model, human, t);
  if (model.isHumanTalonDiscardTurn()) return discardSuggestion(model, human, t);
  if (model.isHumanAnnouncementTurn()) return announcementSuggestion(model, human, t);
  if (model.isHumanTurn()) return cardSuggestion(model, human, t);
  return {
    phase: t("tutorial.phaseWatching"),
    action: t("tutorial.waitingAction"),
    reason: t("tutorial.waitingReason")
  };
}

function bidSuggestion(model, human, t) {
  const legal = model.legalBidContracts();
  const bid = hardAdvisor.chooseBid(model.game, human);
  const legalBid = bid && legal.some((contract) => contract.id === bid.id) ? bid : null;
  const features = evaluateHand(human.hand);
  const legalNames = legal.map((contract) => contractName(contract, t)).join(", ");
  return {
    phase: t("tutorial.phaseBidding"),
    action: legalBid ? t("tutorial.bidAction", { contract: contractName(legalBid, t) }) : t("tutorial.passAction"),
    reason: legalBid
      ? t("tutorial.bidReason", {
        taroks: features.tarokCount,
        high: features.highTarokCount,
        kings: features.kingsCount,
        strength: Math.round(features.positiveStrength),
        solo: Math.round(features.soloStrength),
        dependency: oneDecimal(features.talonDependency),
        legal: legalNames
      })
      : t("tutorial.passReason", {
        taroks: features.tarokCount,
        high: features.highTarokCount,
        kings: features.kingsCount,
        strength: Math.round(features.positiveStrength),
        dependency: oneDecimal(features.talonDependency),
        legal: legalNames
      })
  };
}

function kingSuggestion(model, human, t) {
  const king = hardAdvisor.chooseCalledKing(model, human);
  if (!king) return null;
  const suitCards = human.hand.filter((card) => card.suit === king.suit).length;
  const features = evaluateHand(human.hand);
  return {
    phase: t("tutorial.phaseCalling"),
    action: t("tutorial.kingAction", { card: cardLabel(king, t) }),
    reason: t("tutorial.kingReason", {
      suit: t(`suit.${king.suit}`),
      count: suitCards,
      taroks: features.tarokCount,
      voids: features.voidSuits,
      held: human.hand.some((card) => card.id === king.id) ? t("tutorial.yes") : t("tutorial.no")
    })
  };
}

function talonGroupSuggestion(model, human, t) {
  const exchange = model.game.talonExchange;
  if (!exchange?.groups?.length) return null;
  const index = hardAdvisor.chooseTalonGroup(model.game, human, exchange.groups);
  const group = exchange.groups[index] || exchange.groups[0];
  const before = evaluateHand(human.hand, { contract: model.game.contract });
  const after = evaluateHand([...human.hand, ...group], { contract: model.game.contract });
  return {
    phase: t("tutorial.phaseTalon"),
    action: t("tutorial.talonGroupAction", {
      index: index + 1,
      cards: formatCardList(group, t)
    }),
    reason: t("tutorial.talonGroupReason", {
      before: Math.round(before.positiveStrength),
      after: Math.round(after.positiveStrength),
      taroks: group.filter(isTarok).length,
      points: oneDecimal(countTarokPoints(group))
    })
  };
}

function discardSuggestion(model, human, t) {
  const exchange = model.game.talonExchange;
  const count = model.game.contract?.talonTake || 0;
  const discards = hardAdvisor.chooseDiscard(model.game, human, count)
    .filter((card) => canDiscard(card))
    .slice(0, count);
  const finalHand = human.hand.filter((card) => !discards.some((discard) => discard.id === card.id));
  const before = evaluateHand(human.hand, { contract: model.game.contract });
  const after = evaluateHand(finalHand, { contract: model.game.contract });
  return {
    phase: t("tutorial.phaseTalon"),
    action: t("tutorial.discardAction", { cards: formatCardList(discards, t) }),
    reason: t("tutorial.discardReason", {
      selected: exchange?.selectedIndex === null ? "" : t("tutorial.afterGroup"),
      points: oneDecimal(countTarokPoints(discards)),
      taroks: discards.filter(isTarok).length,
      before: Math.round(before.positiveStrength),
      after: Math.round(after.positiveStrength)
    })
  };
}

function announcementSuggestion(model, human, t) {
  const legal = model.legalAnnouncementActions();
  const choice = hardAdvisor.chooseAnnouncement(model.game, human);
  const normalized = legalAnnouncementChoice(choice, legal);
  const features = evaluateHand(human.hand, { contract: model.game.contract });
  const legalNames = legal.map((action) => announcementActionText(action, t)).join(", ");
  return {
    phase: t("tutorial.phaseAnnouncements"),
    action: announcementActionText(normalized, t),
    reason: normalized.type === "pass"
      ? t("tutorial.announcePassReason", announcementVars(features, legalNames))
      : t("tutorial.announceReason", announcementVars(features, legalNames))
  };
}

function cardSuggestion(model, human, t) {
  const legal = model.legalCardsFor(human.id);
  const card = hardAdvisor.chooseCard(model, legal, human) || legal[0];
  const trick = model.game.currentTrick;
  const contract = model.game.contract;
  const inference = buildInference(model, human.id);
  const winsNow = trick.length ? wouldWin(card, trick, contract) : false;
  const trickPointLoad = oneDecimal(countTarokPoints([...trick.map((play) => play.card), card]));
  const legalCount = legal.length;
  return {
    phase: t("tutorial.phasePlay"),
    action: t("tutorial.cardAction", { card: cardLabel(card, t) }),
    reason: trick.length
      ? t("tutorial.cardFollowReason", {
        contract: contractName(contract, t),
        legal: legalCount,
        wins: winsNow ? t("tutorial.yes") : t("tutorial.no"),
        points: trickPointLoad,
        current: trick.length,
        played: inference.playedCards.length,
        talon: inference.knownTalonCards.length,
        partner: partnerStatus(model, inference, t)
      })
      : t("tutorial.cardLeadReason", {
        contract: contractName(contract, t),
        legal: legalCount,
        tarok: isTarok(card) ? t("tutorial.yes") : t("tutorial.no"),
        points: oneDecimal(countTarokPoints([card])),
        played: inference.playedCards.length,
        talon: inference.knownTalonCards.length,
        partner: partnerStatus(model, inference, t)
      })
  };
}

function legalAnnouncementChoice(choice, legal) {
  if (!choice || !choice.type) return { type: "pass" };
  if (choice.type === "pass") return choice;
  if (choice.type === "gameDouble" && legal.some((action) => action.type === "gameDouble")) return choice;
  if (choice.type === "announce" && legal.some((action) => action.type === "announce" && action.bonus === choice.bonus)) return choice;
  return { type: "pass" };
}

function announcementActionText(choice, t) {
  if (choice.type === "gameDouble") return t("tutorial.doubleAction");
  if (choice.type === "announce") return t("tutorial.bonusAction", { bonus: t(`announce.bonus.${choice.bonus}`) });
  return t("tutorial.passAction");
}

function announcementVars(features, legalNames) {
  return {
    legal: legalNames,
    strength: Math.round(features.positiveStrength),
    solo: Math.round(features.soloStrength),
    trula: features.trulaCount,
    kings: features.kingsCount,
    pagat: oneDecimal(features.pagatUltimoPotential),
    king: oneDecimal(features.kingUltimoPotential)
  };
}

function oneDecimal(value) {
  return Number(value || 0).toFixed(1);
}

function partnerStatus(model, inference, t) {
  if (!model.game.calledKing) return t("tutorial.partnerNone");
  if (inference.calledKingOuted) return t("tutorial.partnerOuted");
  if (inference.knownPartnerId !== null && inference.knownPartnerId !== undefined) return t("tutorial.partnerKnownSelf");
  return t("tutorial.partnerHidden");
}
