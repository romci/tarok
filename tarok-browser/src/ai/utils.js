import { cardPower, isTarok, wouldWin } from "../rules.js";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sum(items, score = (item) => item) {
  return items.reduce((total, item) => total + score(item), 0);
}

export function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

export function randomChoice(items) {
  return items[randomIndex(items.length)];
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function lowestBy(items, score) {
  // Copy-before-sort avoids hidden mutations in callers that reuse original arrays.
  return [...items].sort((a, b) => score(a) - score(b))[0];
}

export function highestBy(items, score) {
  return [...items].sort((a, b) => score(b) - score(a))[0];
}

export function orderedLowToHigh(cards) {
  return [...cards].sort((a, b) => cardPower(a) - cardPower(b));
}

export function orderedHighToLow(cards) {
  return [...cards].sort((a, b) => cardPower(b) - cardPower(a));
}

export function trickPoints(trick) {
  return sum(trick, (play) => play.card.value);
}

export function cardWins(card, trick, contract) {
  if (!trick.length) return false;
  return wouldWin(card, trick, contract);
}

export function winningCards(cards, trick, contract) {
  return orderedLowToHigh(cards).filter((card) => cardWins(card, trick, contract));
}

export function losingCards(cards, trick, contract) {
  if (!trick.length) return orderedLowToHigh(cards);
  return orderedLowToHigh(cards).filter((card) => !cardWins(card, trick, contract));
}

export function isNegativeContract(contract) {
  return ["klop", "beggar", "openBeggar", "piccolo"].includes(contract?.id);
}

export function isUltimoCard(card, game) {
  return card.id === "T1" || (game.calledKing && card.id === game.calledKing.id);
}

export function cardRisk(card) {
  // Risk intentionally overweights point cards so dump logic protects scoring equity.
  if (isTarok(card)) return 6 + card.tarok / 4;
  return card.value * 4 + card.suitStrength;
}

export function combinations(items, count, limit = 3000) {
  const out = [];
  const buffer = [];

  // Hard cap protects against exponential blowups in discard search.
  function visit(start) {
    if (out.length >= limit) return;
    if (buffer.length === count) {
      out.push([...buffer]);
      return;
    }
    const needed = count - buffer.length;
    for (let i = start; i <= items.length - needed; i += 1) {
      buffer.push(items[i]);
      visit(i + 1);
      buffer.pop();
      if (out.length >= limit) return;
    }
  }

  if (count <= 0) return [[]];
  visit(0);
  return out;
}
