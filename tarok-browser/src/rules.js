export const SUITS = [
  { id: "clubs", labelKey: "suit.clubs", short: "C", color: "black", order: ["K", "Q", "N", "J", "10", "9", "8", "7"] },
  { id: "spades", labelKey: "suit.spades", short: "S", color: "black", order: ["K", "Q", "N", "J", "10", "9", "8", "7"] },
  { id: "hearts", labelKey: "suit.hearts", short: "H", color: "red", order: ["K", "Q", "N", "J", "1", "2", "3", "4"] },
  { id: "diamonds", labelKey: "suit.diamonds", short: "D", color: "red", order: ["K", "Q", "N", "J", "1", "2", "3", "4"] }
];

export const CONTRACTS = {
  klop: { id: "klop", nameKey: "contract.klop", base: 0, talonTake: 0, mode: "negative", rank: 0 },
  three: { id: "three", nameKey: "contract.three", base: 10, talonTake: 3, mode: "positive", rank: 1, callsKing: true },
  two: { id: "two", nameKey: "contract.two", base: 20, talonTake: 2, mode: "positive", rank: 2, callsKing: true },
  one: { id: "one", nameKey: "contract.one", base: 30, talonTake: 1, mode: "positive", rank: 3, callsKing: true },
  soloThree: { id: "soloThree", nameKey: "contract.soloThree", base: 40, talonTake: 3, mode: "positive", rank: 4, solo: true },
  soloTwo: { id: "soloTwo", nameKey: "contract.soloTwo", base: 50, talonTake: 2, mode: "positive", rank: 5, solo: true },
  soloOne: { id: "soloOne", nameKey: "contract.soloOne", base: 60, talonTake: 1, mode: "positive", rank: 6, solo: true },
  beggar: { id: "beggar", nameKey: "contract.beggar", base: 70, talonTake: 0, mode: "beggar", rank: 7, solo: true },
  soloWithout: { id: "soloWithout", nameKey: "contract.soloWithout", base: 80, talonTake: 0, mode: "positive", rank: 8, solo: true, noBonuses: true }
};

export const NORMAL_CONTRACT_IDS = new Set(["three", "two", "one", "soloThree", "soloTwo", "soloOne"]);

export function createDeck() {
  const cards = [];
  for (let tarok = 1; tarok <= 22; tarok += 1) {
    const name = tarok === 22 ? "Skis" : tarok === 21 ? "Mond" : tarok === 1 ? "Pagat" : roman(tarok);
    cards.push({
      id: `T${tarok}`,
      type: "tarok",
      tarok,
      rank: name,
      suit: "tarok",
      suitShort: "T",
      value: isTrulaId(`T${tarok}`) ? 5 : 1
    });
  }

  for (const suit of SUITS) {
    suit.order.forEach((rank, index) => {
      cards.push({
        id: `${suit.short}${rank}`,
        type: "suit",
        suit: suit.id,
        suitShort: suit.short,
        suitLabelKey: suit.labelKey,
        color: suit.color,
        rank,
        suitStrength: suit.order.length - index,
        value: cardValue(rank)
      });
    });
  }
  return cards;
}

export function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sortHand(hand) {
  hand.sort((a, b) => {
    if (isTarok(a) && isTarok(b)) return b.tarok - a.tarok;
    if (isTarok(a)) return -1;
    if (isTarok(b)) return 1;
    if (a.suit !== b.suit) return suitIndex(a.suit) - suitIndex(b.suit);
    return b.suitStrength - a.suitStrength;
  });
}

export function legalCards(hand, trick, contract) {
  if (!trick.length) return [...hand];
  const led = trick[0].card;
  const ledSuit = isTarok(led) ? "tarok" : led.suit;
  const follow = hand.filter((card) => (ledSuit === "tarok" ? isTarok(card) : card.suit === ledSuit));
  if (follow.length) return negativeLegalSubset(follow, trick, contract);
  const taroks = hand.filter(isTarok);
  if (taroks.length) return negativeLegalSubset(taroks, trick, contract);
  return negativeLegalSubset([...hand], trick, contract);
}

export function trickWinner(trick) {
  const tarokIds = new Set(trick.filter((play) => isTarok(play.card)).map((play) => play.card.id));
  if (tarokIds.has("T1") && tarokIds.has("T21") && tarokIds.has("T22")) {
    return trick.find((play) => play.card.id === "T1").playerId;
  }
  const taroks = trick.filter((play) => isTarok(play.card));
  if (taroks.length) {
    return taroks.sort((a, b) => b.card.tarok - a.card.tarok)[0].playerId;
  }
  const ledSuit = trick[0].card.suit;
  return trick
    .filter((play) => play.card.suit === ledSuit)
    .sort((a, b) => b.card.suitStrength - a.card.suitStrength)[0].playerId;
}

export function wouldWin(card, trick) {
  return trickWinner([...trick, { playerId: -1, card }]) === -1;
}

export function countTarokPoints(cards) {
  const total = cards.reduce((sum, card) => sum + card.value, 0);
  const groups = Math.floor(cards.length / 3);
  const remainder = cards.length % 3;
  return total - groups * 2 - (remainder ? 1 : 0);
}

export function cardLabel(card, t) {
  if (isTarok(card)) return `${card.rank} ${t("card.tarok")}`;
  return `${rankLabel(card.rank, t)} ${t(card.suitLabelKey)}`;
}

export function rankLabel(rank, t) {
  const key = `rank.${rank}`;
  const translated = t(key);
  return translated === key ? rank : translated;
}

export function cardValue(rank) {
  if (rank === "K") return 5;
  if (rank === "Q") return 4;
  if (rank === "N") return 3;
  if (rank === "J") return 2;
  return 1;
}

export function canDiscard(card) {
  return card.value !== 5;
}

export function discardCost(card) {
  return card.value * 12 + cardPower(card) / 10 + (isTarok(card) ? 18 : 0);
}

export function cardPower(card) {
  if (isTarok(card)) return 100 + card.tarok;
  return card.suitStrength;
}

export function removeCard(hand, cardId) {
  const index = hand.findIndex((card) => card.id === cardId);
  if (index >= 0) hand.splice(index, 1);
}

export function isTarok(card) {
  return card.type === "tarok";
}

export function isTrula(card) {
  return isTrulaId(card.id);
}

export function maxTricks(playerCount) {
  return playerCount === 4 ? 12 : 16;
}

export function round5(value) {
  return Math.round(value / 5) * 5;
}

export function formatPoints(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function signed(value) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function bonusSet(cards) {
  return {
    trula: ["T1", "T21", "T22"].every((id) => cards.some((card) => card.id === id)),
    kings: SUITS.every((suit) => cards.some((card) => card.id === `${suit.short}K`))
  };
}

function negativeLegalSubset(cards, trick, contract) {
  if (!["klop", "beggar"].includes(contract.id)) return cards;
  const winning = cards.filter((card) => wouldWin(card, trick));
  let restricted = winning.length ? winning : cards;
  const withoutPagat = restricted.filter((card) => card.id !== "T1");
  if (withoutPagat.length) restricted = withoutPagat;
  return restricted;
}

function isTrulaId(id) {
  return id === "T1" || id === "T21" || id === "T22";
}

function suitIndex(suitId) {
  return SUITS.findIndex((suit) => suit.id === suitId);
}

function roman(value) {
  const numerals = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  let remaining = value;
  let out = "";
  for (const [amount, glyph] of numerals) {
    while (remaining >= amount) {
      out += glyph;
      remaining -= amount;
    }
  }
  return out;
}
