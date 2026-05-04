import { cardLabel, maxTricks } from "../rules.js";

export function formatCardList(cards, t) {
  if (!cards || cards.length === 0) return "—";
  return cards.map((card) => cardLabel(card, t)).join(", ");
}

export function playerName(player, t) {
  return player ? t(player.nameKey) : "";
}

export function contractName(contract, t) {
  return contract ? t(contract.nameKey) : "";
}

export function contractNameById(contractId, t) {
  return contractId ? t(`contract.${contractId}`) : "";
}

export function phaseName(phase, t) {
  const names = {
    calling: t("ui.phaseCalling"),
    talon: t("ui.phaseTalon"),
    announcements: t("ui.phaseAnnouncements"),
    trickComplete: t("ui.phaseTrickComplete"),
    done: t("ui.phaseDone")
  };
  return names[phase] || "";
}

export function contractStatus(game, t) {
  if (game.phase === "play" || game.phase === "trickComplete") {
    return t("ui.trick", {
      current: Math.min(game.trickNumber + 1, maxTricks(game.playerCount)),
      total: maxTricks(game.playerCount)
    });
  }
  return phaseName(game.phase, t);
}

export function roleFor(model, player, t) {
  if (!player.active) return t("ui.sittingOut");
  if (player.id === model.game.dealer) return t("role.dealer");
  if (model.game.phase === "bidding" && player.id === model.game.activePlayer) return t("role.bidding");
  if (player.id === model.game.declarer) return t("role.declarer");
  if (model.game.partnerKnownPublicly === true && model.game.partner === player.id) {
    return t("role.calledPartner");
  }
  if (model.game.partnerKnownPublicly !== true && model.game.partner === player.id) {
    return t("role.defender");
  }
  if (model.isDeclarerSide(player.id)) return t("role.declarerSide");
  return t("role.defender");
}

export function seatMeta(model, player, t) {
  const bid = player.bid ? contractName(player.bid, t) : t("ui.passed");
  return [
    t("ui.cards", { count: player.hand.length }),
    t("ui.tricks", { count: player.tricks }),
    bid
  ].join(" / ");
}

export function seatPosition(playerId) {
  return ["south", "east", "north", "west"][playerId] || "south";
}

export function isHiddenTalonContract(game) {
  if (!game.contract || game.handDone || game.talonExchanged) return false;
  return ["beggar", "openBeggar", "piccolo"].includes(game.contract.id);
}

export function formatLog(item, model, t) {
  const vars = item.vars || {};
  if (item.key === "log.deal") {
    return t(item.key, {
      dealer: playerName(model.players[vars.dealerId], t),
      hand: vars.hand
    });
  }
  if (item.key === "log.biddingStarts") {
    return t(item.key, { player: playerName(model.players[vars.playerId], t) });
  }
  if (item.key === "log.bidContract") {
    if (vars.playerId === model.humanId) {
      return t("log.bidContractHuman", {
        contract: contractNameById(vars.contractId, t),
        round: vars.round
      });
    }
    return t(item.key, {
      player: playerName(model.players[vars.playerId], t),
      contract: contractNameById(vars.contractId, t),
      round: vars.round
    });
  }
  if (item.key === "log.bidPass") {
    if (vars.playerId === model.humanId) {
      return t("log.bidPassHuman", { round: vars.round });
    }
    return t(item.key, {
      player: playerName(model.players[vars.playerId], t),
      round: vars.round
    });
  }
  if (item.key === "log.forehandChoice") {
    return t(item.key, { player: playerName(model.players[vars.playerId], t) });
  }
  if (item.key === "log.contractSet") {
    return t(item.key, {
      declarer: playerName(model.players[vars.declarerId], t),
      contract: contractNameById(vars.contractId, t)
    });
  }
  if (item.key === "log.callKing") {
    const tail = vars.inTalon ? ` (${t("ui.inTalon")}).` : ".";
    return t(item.key, {
      declarer: playerName(model.players[vars.declarerId], t),
      card: cardLabel(vars.card, t),
      tail
    });
  }
  if (item.key === "log.callKingSkipped") {
    return t(item.key, {
      declarer: playerName(model.players[vars.declarerId], t)
    });
  }
  if (item.key === "log.talonExchange") {
    return t(item.key, {
      declarer: playerName(model.players[vars.declarerId], t),
      talon: formatCardList(vars.talonBefore, t),
      taken: formatCardList(vars.taken, t),
      discards: formatCardList(vars.discards, t),
      rejected: formatCardList(vars.rejected, t)
    });
  }
  if (item.key === "log.talonNoExchange") {
    return t(item.key, { count: vars.count });
  }
  if (item.key === "log.announcementPass") {
    if (vars.playerId === model.humanId) return t("log.announcementPassHuman");
    return t(item.key, { player: playerName(model.players[vars.playerId], t) });
  }
  if (item.key === "log.announcementGameDouble") {
    const step = t(`announce.step.${vars.stepKey}`);
    if (vars.playerId === model.humanId) return t("log.announcementGameDoubleHuman", { step });
    return t(item.key, {
      player: playerName(model.players[vars.playerId], t),
      step
    });
  }
  if (item.key === "log.announcementBonus") {
    const bonus = t(`announce.bonus.${vars.bonus}`);
    if (vars.playerId === model.humanId) return t("log.announcementBonusHuman", { bonus });
    return t(item.key, {
      player: playerName(model.players[vars.playerId], t),
      bonus
    });
  }
  if (item.key === "log.announcementsPassed" || item.key === "log.playStarts") {
    return t(item.key, { player: playerName(model.players[vars.playerId], t) });
  }
  if (item.key === "log.play") {
    if (vars.playerId === model.humanId) return t("log.playHuman", { card: cardLabel(vars.card, t) });
    return t(item.key, {
      player: playerName(model.players[vars.playerId], t),
      card: cardLabel(vars.card, t)
    });
  }
  if (item.key === "log.winTrick") {
    return t(item.key, {
      player: playerName(model.players[vars.playerId], t),
      trick: vars.trick
    });
  }
  if (item.key === "log.klopGift") {
    return t(item.key, {
      player: playerName(model.players[vars.playerId], t),
      card: cardLabel(vars.card, t)
    });
  }
  if (item.key === "log.beggarSummary") {
    return t(item.key, {
      declarer: playerName(model.players[vars.declarerId], t),
      result: t(vars.result),
      delta: vars.delta
    });
  }
  if (item.key === "log.piccoloSummary" || item.key === "log.valatContractSummary") {
    return t(item.key, {
      declarer: playerName(model.players[vars.declarerId], t),
      result: t(vars.result),
      delta: vars.delta
    });
  }
  if (item.key === "log.pointsSummary") {
    return t(item.key, {
      declarer: playerName(model.players[vars.declarerId], t),
      declarerPoints: vars.declarerPoints,
      defenderPoints: vars.defenderPoints
    });
  }
  if (item.key === "log.scoreChange") {
    const entries = vars.entries
      .map((entry) => `${playerName(model.players[entry.playerId], t)} ${entry.delta}`)
      .join(", ");
    return t(item.key, { entries });
  }
  if (item.key === "log.radliAwarded") return t(item.key);
  return t(item.key, vars);
}
