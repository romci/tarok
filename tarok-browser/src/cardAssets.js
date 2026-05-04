export const CARD_SPRITE_COLUMNS = 9;
export const CARD_SPRITE_ROWS = 6;

export const CARD_IDS = [
  ...Array.from({ length: 20 }, (_, index) => `T${index + 1}`),
  "T21",
  "SKIS",
  ...["C", "S"].flatMap((suit) => ["K", "Q", "N", "J", "10", "9", "8", "7"].map((rank) => `${suit}${rank}`)),
  ...["H", "D"].flatMap((suit) => ["K", "Q", "N", "J", "4", "3", "2", "1"].map((rank) => `${suit}${rank}`))
];

const CARD_INDEX = new Map(CARD_IDS.map((id, index) => [id, index]));

export function cardSpriteStyle(cardId) {
  const index = CARD_INDEX.get(cardId);
  if (index === undefined) return "";
  const column = index % CARD_SPRITE_COLUMNS;
  const row = Math.floor(index / CARD_SPRITE_COLUMNS);
  const x = column * (100 / (CARD_SPRITE_COLUMNS - 1));
  const y = row * (100 / (CARD_SPRITE_ROWS - 1));
  return `--sprite-x:${x}%;--sprite-y:${y}%;`;
}
