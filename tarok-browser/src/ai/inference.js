import { createDeck, isTarok } from "../rules.js";

export function buildInference(tarokGame, playerId) {
  const game = tarokGame.game;
  const self = tarokGame.players[playerId];
  const visible = visibleCards(tarokGame, playerId);
  const visibleIds = new Set(visible.map((card) => card.id));
  const unknownCards = createDeck().filter((card) => !visibleIds.has(card.id));
  const voids = inferVoids(tarokGame);
  const playedCards = [
    ...tarokGame.activePlayers().flatMap((player) => player.taken),
    ...game.currentTrick.map((play) => play.card),
    ...(game.lastTrick?.plays || []).map((play) => play.card)
  ];
  const playedIds = new Set(playedCards.map((card) => card.id));
  const playedTaroks = playedCards.filter(isTarok);
  return {
    self,
    visible,
    visibleIds,
    unknownCards,
    voids,
    playedCards,
    playedIds,
    playedTaroks,
    remainingTarokCount: 22 - playedTaroks.length - self.hand.filter(isTarok).length,
    partnerProbability: partnerProbability(tarokGame, playerId, unknownCards)
  };
}

export function remainingHigherTaroks(card, inference) {
  if (!isTarok(card)) return 0;
  return inference.unknownCards.filter((candidate) => isTarok(candidate) && candidate.tarok > card.tarok).length;
}

function visibleCards(tarokGame, playerId) {
  const game = tarokGame.game;
  const visible = [
    ...tarokGame.players[playerId].hand,
    ...tarokGame.activePlayers().flatMap((player) => player.taken),
    ...game.currentTrick.map((play) => play.card),
    ...(game.talonRejected || []),
    ...(game.talonTaken || [])
  ];
  if (game.openHandPlayerId !== null && game.openHandPlayerId !== undefined) {
    visible.push(...tarokGame.players[game.openHandPlayerId].hand);
  }
  return visible;
}

function inferVoids(tarokGame) {
  const voids = new Map();
  const tricks = [];
  if (tarokGame.game.lastTrick) tricks.push(tarokGame.game.lastTrick.plays);
  if (tarokGame.game.currentTrick.length) tricks.push(tarokGame.game.currentTrick);

  for (const trick of tricks) {
    if (!trick.length) continue;
    const led = trick[0].card;
    const ledSuit = isTarok(led) ? "tarok" : led.suit;
    for (const play of trick.slice(1)) {
      const followed = ledSuit === "tarok" ? isTarok(play.card) : play.card.suit === ledSuit;
      if (!followed) {
        if (!voids.has(play.playerId)) voids.set(play.playerId, new Set());
        voids.get(play.playerId).add(ledSuit);
      }
    }
  }
  return voids;
}

function partnerProbability(tarokGame, playerId, unknownCards) {
  const game = tarokGame.game;
  const out = new Map();
  tarokGame.activePlayers().forEach((player) => out.set(player.id, 0));
  if (!game.calledKing || game.partnerKnownPublicly) {
    if (game.partner !== null && game.partner !== undefined) out.set(game.partner, 1);
    return out;
  }
  const selfHasKing = tarokGame.players[playerId].hand.some((card) => card.id === game.calledKing.id);
  if (selfHasKing) {
    out.set(playerId, 1);
    return out;
  }
  const possibleHolders = tarokGame.activePlayers()
    .filter((player) => player.id !== game.declarer)
    .filter((player) => player.id !== playerId);
  const kingUnknown = unknownCards.some((card) => card.id === game.calledKing.id);
  if (!kingUnknown || !possibleHolders.length) return out;
  const probability = 1 / possibleHolders.length;
  possibleHolders.forEach((player) => out.set(player.id, probability));
  return out;
}
