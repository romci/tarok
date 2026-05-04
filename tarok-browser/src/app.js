import { TarokGame } from "./game.js";
import { I18n } from "./i18n.js";
import { TarokView } from "./view.js";

const i18n = new I18n("en");
const game = new TarokGame({ playerCount: 4, aiLevel: "medium" });
let autoTimer = null;
let autoKick = null;
let trickCollectKick = null;
let autoHoldUntil = 0;

const els = {
  playerCount: document.querySelector("#player-count"),
  aiLevel: document.querySelector("#ai-level"),
  language: document.querySelector("#language"),
  speed: document.querySelector("#speed"),
  newHand: document.querySelector("#new-hand"),
  step: document.querySelector("#step"),
  auto: document.querySelector("#auto")
};

const view = new TarokView({
  i18n,
  onAnnouncementAction(choice) {
    transition(() => game.commitHumanAnnouncement(choice));
    scheduleAutoTick();
  },
  onBidClick(contractId) {
    transition(() => game.placeHumanBid(contractId));
    scheduleAutoTick();
  },
  onKingCallClick(cardId) {
    transition(() => game.chooseHumanCalledKing(cardId));
    scheduleAutoTick();
  },
  onCardClick(cardId) {
    transition(() => (
      game.isHumanTalonDiscardTurn()
        ? game.toggleHumanTalonDiscard(cardId)
        : game.playHumanCard(cardId)
    ));
    scheduleAutoTick();
  },
  onTalonGroupClick(groupIndex) {
    transition(() => game.chooseHumanTalonGroup(groupIndex));
  },
  onTalonConfirm() {
    transition(() => game.finishHumanTalonExchange());
    scheduleAutoTick();
  }
});

function render(previousLayout = null) {
  document.documentElement.style.setProperty("--pace-ms", `${Number(els.speed.value)}ms`);
  view.render(game, Boolean(autoTimer), previousLayout);
}

function transition(action) {
  const previousLayout = view.captureCardLayout();
  const result = action();
  render(previousLayout);
  holdAutoForAnimation();
  scheduleTrickCollection();
  return result;
}

function stopAuto() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  if (autoKick) {
    clearTimeout(autoKick);
    autoKick = null;
  }
  els.auto.setAttribute("aria-pressed", "false");
}

function clearTrickCollection() {
  if (trickCollectKick) {
    clearTimeout(trickCollectKick);
    trickCollectKick = null;
  }
}

function runAutoTick() {
  if (Date.now() < autoHoldUntil) {
    return;
  }
  if (game.isWaitingForHuman()) {
    return;
  }
  if (game.game.handDone) {
    game.startHand();
    render();
    return;
  }
  transition(() => game.step());
}

function scheduleAutoTick(delay = 80) {
  if (!autoTimer || autoKick) return;
  const hold = Math.max(0, autoHoldUntil - Date.now());
  autoKick = setTimeout(() => {
    autoKick = null;
    runAutoTick();
  }, Math.max(delay, hold + 40));
}

function scheduleTrickCollection() {
  if (game.game.phase !== "trickComplete" || trickCollectKick) return;
  const hold = Math.max(0, autoHoldUntil - Date.now());
  trickCollectKick = setTimeout(() => {
    trickCollectKick = null;
    if (game.game.phase === "trickComplete") {
      transition(() => game.step());
      scheduleAutoTick();
    }
  }, hold + 60);
}

function holdAutoForAnimation() {
  const animation = game.game.animation;
  if (!animation) return;
  const pace = Number(els.speed.value);
  const multiplier = animation.type === "collect" ? 2.1 : animation.type === "play" ? 1.15 : 0;
  if (multiplier) autoHoldUntil = Date.now() + pace * multiplier;
}

function toggleAuto() {
  if (autoTimer) {
    stopAuto();
    render();
    return;
  }
  autoTimer = setInterval(runAutoTick, Number(els.speed.value));
  els.auto.setAttribute("aria-pressed", "true");
  runAutoTick();
}

els.playerCount.addEventListener("change", (event) => {
  stopAuto();
  clearTrickCollection();
  game.startSession({ playerCount: event.target.value, aiLevel: els.aiLevel.value });
  render();
});

els.aiLevel.addEventListener("change", (event) => {
  game.setAiLevel(event.target.value);
  render();
});

els.language.addEventListener("change", (event) => {
  i18n.setLanguage(event.target.value);
  render();
});

els.speed.addEventListener("change", () => {
  if (autoTimer) {
    stopAuto();
    toggleAuto();
  }
});

els.newHand.addEventListener("click", () => {
  stopAuto();
  clearTrickCollection();
  game.startHand();
  render();
});

els.step.addEventListener("click", () => {
  if (game.game.handDone) {
    game.startHand();
    render();
    return;
  }
  transition(() => {
    if (!game.isWaitingForHuman()) {
      game.step();
    }
  });
});

els.auto.addEventListener("click", toggleAuto);

render();
