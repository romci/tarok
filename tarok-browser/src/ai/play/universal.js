import { cardPower } from "../../rules.js";
import { buildInference } from "../inference.js";
import { randomChoice, winningCards } from "../utils.js";
import { playColourValat } from "./colourValat.js";
import { playKlop } from "./klop.js";
import { playBeggarLike } from "./negative.js";
import { playPiccolo } from "./piccolo.js";
import { playPositive } from "./positive.js";
import { playValat } from "./valat.js";

export function chooseCard(tarokGame, player, legalCards, level = "medium") {
  if (!legalCards.length) return null;
  if (level === "easy") return chooseEasyCard(tarokGame, legalCards);
  const contract = tarokGame.game.contract;
  const inference = level === "easy" ? null : buildInference(tarokGame, player.id);

  if (contract.id === "klop") return playKlop(tarokGame, player, legalCards, level);
  if (contract.mode === "beggar") return playBeggarLike(tarokGame, player, legalCards, level, inference);
  if (contract.mode === "piccolo") return playPiccolo(tarokGame, player, legalCards, level, inference);
  if (contract.mode === "colourValat") return playColourValat(tarokGame, player, legalCards, level, inference);
  if (contract.mode === "valat") return playValat(tarokGame, player, legalCards, level, inference);
  return playPositive(tarokGame, player, legalCards, level, inference);
}

function chooseEasyCard(tarokGame, legalCards) {
  const trick = tarokGame.game.currentTrick;
  if (Math.random() < 0.28) return randomChoice(legalCards);
  if (!trick.length) return [...legalCards].sort((a, b) => cardPower(a) - cardPower(b))[0];
  const winners = winningCards(legalCards, trick, tarokGame.game.contract);
  if (winners.length && Math.random() < 0.45) return winners[winners.length - 1];
  return [...legalCards].sort((a, b) => cardPower(a) - cardPower(b))[0];
}
