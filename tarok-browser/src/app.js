import { TarokGame } from "./game.js";
import { I18n } from "./i18n.js";
import { TarokView } from "./view.js";

const i18n = new I18n("en");
const game = new TarokGame({ playerCount: 4, aiLevel: "medium" });
let autoTimer = null;

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
  onCardClick(cardId) {
    game.playHumanCard(cardId);
    render();
  }
});

function render() {
  view.render(game, Boolean(autoTimer));
}

function stopAuto() {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  els.auto.setAttribute("aria-pressed", "false");
}

function runAutoTick() {
  if (game.game.handDone || game.isHumanTurn()) {
    stopAuto();
    render();
    return;
  }
  game.step();
  render();
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
  game.startSession({ playerCount: event.target.value, aiLevel: els.aiLevel.value });
  game.autoplayTurnLimit();
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
  game.startHand();
  game.autoplayTurnLimit();
  render();
});

els.step.addEventListener("click", () => {
  if (game.game.handDone) {
    game.startHand();
    game.autoplayTurnLimit();
  } else if (!game.isHumanTurn()) {
    game.step();
  }
  render();
});

els.auto.addEventListener("click", toggleAuto);

game.autoplayTurnLimit();
render();
