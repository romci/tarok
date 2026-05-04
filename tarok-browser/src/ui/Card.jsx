import { motion } from "motion/react";
import { cardSpriteVars } from "../cardAssets.js";
import { cardLabel, isTarok } from "../rules.js";

const CARD_TRANSITION = {
  type: "spring",
  stiffness: 420,
  damping: 38,
  mass: 0.8
};

export function Card({
  card,
  t,
  back = false,
  size = "",
  state = "",
  zone = "",
  tracked = true,
  className = ""
}) {
  const cardId = card?.id;
  const label = back ? "Hidden card" : cardLabel(card, t);
  const classes = [
    "card",
    back ? "back" : "face",
    size,
    state,
    !back && isTarok(card) ? "tarok" : "",
    !back && card.color === "red" ? "red" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <motion.span
      aria-label={label}
      className={classes}
      data-card-id={tracked && cardId ? cardId : undefined}
      data-card-zone={zone || undefined}
      layout
      layoutId={tracked && cardId ? `card-${cardId}` : undefined}
      role="img"
      style={back ? undefined : cardSpriteVars(cardId)}
      title={label}
      transition={CARD_TRANSITION}
    />
  );
}

export function CardButton({ card, t, disabled, onClick, state, zone }) {
  return (
    <button
      className="card-button"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Card card={card} size="small" state={state} t={t} zone={zone} />
    </button>
  );
}
