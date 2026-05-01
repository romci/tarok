import { cardLabel, isTarok, maxTricks } from "./rules.js";

export class TarokView {
  constructor({ i18n, onCardClick }) {
    this.i18n = i18n;
    this.onCardClick = onCardClick;
    this.els = {
      title: document.querySelector("#app-title"),
      subtitle: document.querySelector("#subtitle"),
      playerCount: document.querySelector("#player-count"),
      aiLevel: document.querySelector("#ai-level"),
      language: document.querySelector("#language"),
      speed: document.querySelector("#speed"),
      newHand: document.querySelector("#new-hand"),
      step: document.querySelector("#step"),
      auto: document.querySelector("#auto"),
      actionPrompt: document.querySelector("#action-prompt"),
      scoreStrip: document.querySelector("#score-strip"),
      contract: document.querySelector("#contract-panel"),
      trick: document.querySelector("#trick-area"),
      talon: document.querySelector("#talon-panel"),
      log: document.querySelector("#log"),
      rules: document.querySelector("#rules-list"),
      handLogTitle: document.querySelector("#hand-log-title"),
      rulesTitle: document.querySelector("#rules-title"),
      seats: [...document.querySelectorAll(".seat")]
    };
  }

  render(model, autoRunning = false) {
    this.model = model;
    this.renderStaticText(autoRunning);
    this.renderScores(model);
    this.renderSeats(model);
    this.renderContract(model);
    this.renderTrick(model);
    this.renderTalon(model);
    this.renderActionPrompt(model);
    this.renderLog(model);
  }

  renderStaticText(autoRunning) {
    const t = this.t;
    this.els.title.textContent = t("ui.title");
    document.title = t("ui.title");
    this.els.subtitle.textContent = t("ui.subtitle");
    this.labelFor("player-count", t("ui.seats"));
    this.labelFor("ai-level", t("ui.aiLevel"));
    this.labelFor("language", t("ui.language"));
    this.labelFor("speed", t("ui.speed"));
    this.optionText(this.els.playerCount, "3", t("ui.players3"));
    this.optionText(this.els.playerCount, "4", t("ui.players4"));
    this.optionText(this.els.aiLevel, "easy", t("ai.easy"));
    this.optionText(this.els.aiLevel, "medium", t("ai.medium"));
    this.optionText(this.els.aiLevel, "hard", t("ai.hard"));
    this.optionText(this.els.speed, "1200", t("ui.study"));
    this.optionText(this.els.speed, "650", t("ui.table"));
    this.optionText(this.els.speed, "220", t("ui.fast"));
    this.els.newHand.textContent = t("ui.newHand");
    this.els.step.textContent = t("ui.step");
    this.els.auto.textContent = autoRunning ? t("ui.pause") : t("ui.auto");
    this.els.handLogTitle.textContent = t("ui.handLog");
    this.els.rulesTitle.textContent = t("ui.rulesModel");
    this.els.rules.innerHTML = [1, 2, 3, 4, 5].map((index) => `<li>${t(`ui.rules.${index}`)}</li>`).join("");
  }

  renderScores(model) {
    this.els.scoreStrip.innerHTML = model.players.map((player) => {
      const role = this.roleFor(model, player);
      return `
        <article class="score-card ${player.active ? "" : "off"}">
          <span>
            <span class="score-name">${this.playerName(player)}</span>
            <span class="score-role">${role}</span>
          </span>
          <span class="score-value">${model.scores[player.id]}</span>
        </article>
      `;
    }).join("");
  }

  renderSeats(model) {
    for (const seatEl of this.els.seats) {
      const playerId = Number(seatEl.id.replace("seat-", ""));
      const player = model.players[playerId];
      if (!player || !player.active) {
        seatEl.classList.add("hidden");
        continue;
      }
      const legalIds = new Set(model.legalCardsFor(player.id).map((card) => card.id));
      seatEl.classList.remove("hidden");
      seatEl.classList.toggle("current", model.game.activePlayer === playerId && !model.game.handDone);
      seatEl.classList.toggle("human-seat", player.human);
      seatEl.innerHTML = `
        <div class="seat-head">
          <span class="seat-name">${this.playerName(player)}</span>
          <span class="seat-meta">${this.seatMeta(player)}</span>
        </div>
        <div class="hand-row">${this.handHtml(player, legalIds)}</div>
      `;
      if (player.human) {
        seatEl.querySelectorAll("[data-card-id]").forEach((button) => {
          button.addEventListener("click", () => this.onCardClick(button.dataset.cardId));
        });
      }
    }
  }

  renderContract(model) {
    const game = model.game;
    const called = game.calledKing
      ? ` ${this.t("ui.calledKing")}: ${cardLabel(game.calledKing, this.t)}${game.calledKingInTalon ? ` (${this.t("ui.inTalon")})` : ""}.`
      : "";
    const partner = game.partner !== null
      ? ` ${this.t("ui.partner")}: ${this.playerName(model.players[game.partner])}.`
      : game.contract.solo || game.playerCount === 3
        ? ` ${this.t("ui.solo")}.`
        : "";
    const summary = game.handDone && game.summary ? this.formatLog(game.summary) : "";
    this.els.contract.innerHTML = `
      <div class="contract-title">
        <span>${this.contractName(game.contract)}</span>
        <span>${this.t("ui.trick", { current: Math.min(game.trickNumber + 1, maxTricks(game.playerCount)), total: maxTricks(game.playerCount) })}</span>
      </div>
      <p class="contract-detail">
        ${this.t("ui.declarer")}: ${this.playerName(model.players[game.declarer])}.${partner}${called}
        ${summary}
      </p>
    `;
  }

  renderTrick(model) {
    if (!model.game.currentTrick.length) {
      const active = model.players[model.game.activePlayer];
      this.els.trick.innerHTML = `<div class="played-card">${this.t("ui.waiting", { player: active ? this.playerName(active) : "" })}</div>`;
      return;
    }
    this.els.trick.innerHTML = model.game.currentTrick.map((play) => `
      <div class="played-card">
        ${this.cardHtml(play.card)}
        <span>${this.playerName(model.players[play.playerId])}</span>
      </div>
    `).join("");
  }

  renderTalon(model) {
    const game = model.game;
    const hiddenTalon = game.handDone ? game.talonRejected : game.talonRejected.map(() => null);
    this.els.talon.innerHTML = `
      <div class="contract-title">
        <span>Talon</span>
        <span>${this.t("ui.rejected", { count: game.talonRejected.length })}</span>
      </div>
      <p class="contract-detail">${this.t("ui.talonHelp")}</p>
      <div class="talon-cards">
        ${game.talon.map((card) => this.cardHtml(card, "small")).join("")}
        ${hiddenTalon.map((card) => (card ? this.cardHtml(card, "small") : this.cardBackHtml("small"))).join("")}
      </div>
    `;
  }

  renderActionPrompt(model) {
    const game = model.game;
    let text = "";
    if (game.handDone) {
      text = this.t("ui.actionHandDone");
    } else if (model.isHumanTurn()) {
      text = this.t("ui.actionYourTurn");
    } else {
      text = this.t("ui.actionAiTurn", { player: this.playerName(model.players[game.activePlayer]) });
    }
    this.els.actionPrompt.textContent = `${text} ${this.t("ui.actionAutoAssist")}`;
  }

  renderLog(model) {
    this.els.log.innerHTML = model.game.log.slice(0, 90).map((item) => `<li>${this.formatLog(item)}</li>`).join("");
  }

  handHtml(player, legalIds) {
    if (!player.human) {
      return player.hand.map(() => this.cardBackHtml("small")).join("");
    }
    return player.hand.map((card) => {
      const legal = legalIds.has(card.id) && this.model.isHumanTurn();
      return `
        <button class="card-button" type="button" data-card-id="${card.id}" ${legal ? "" : "disabled"}>
          ${this.cardHtml(card, "small", legal ? "playable" : "disabled")}
        </button>
      `;
    }).join("");
  }

  cardHtml(card, size = "", stateClass = "") {
    const classes = ["card", size, stateClass, isTarok(card) ? "tarok" : "", card.color === "red" ? "red" : ""].filter(Boolean).join(" ");
    return `
      <span class="${classes}" title="${cardLabel(card, this.t)}">
        <span class="card-corner">${card.suitShort}</span>
        <span class="card-main">
          <span class="card-value">${card.rank}</span>
          <span class="card-suit">${card.suitShort}</span>
        </span>
      </span>
    `;
  }

  cardBackHtml(size = "") {
    return `<span class="card back ${size}" aria-label="Hidden card"></span>`;
  }

  formatLog(item) {
    const vars = item.vars || {};
    if (item.key === "log.deal") {
      return this.t(item.key, {
        dealer: this.playerName(this.model.players[vars.dealerId]),
        hand: vars.hand,
        declarer: this.playerName(this.model.players[vars.declarerId]),
        contract: this.contractNameById(vars.contractId)
      });
    }
    if (item.key === "log.play") {
      return this.t(item.key, {
        player: this.playerName(this.model.players[vars.playerId]),
        card: cardLabel(vars.card, this.t)
      });
    }
    if (item.key === "log.winTrick") {
      return this.t(item.key, {
        player: this.playerName(this.model.players[vars.playerId]),
        trick: vars.trick
      });
    }
    if (item.key === "log.beggarSummary") {
      return this.t(item.key, {
        declarer: this.playerName(this.model.players[vars.declarerId]),
        result: this.t(vars.result),
        delta: vars.delta
      });
    }
    if (item.key === "log.pointsSummary") {
      return this.t(item.key, {
        declarer: this.playerName(this.model.players[vars.declarerId]),
        declarerPoints: vars.declarerPoints,
        defenderPoints: vars.defenderPoints
      });
    }
    if (item.key === "log.scoreChange") {
      const entries = vars.entries.map((entry) => `${this.playerName(this.model.players[entry.playerId])} ${entry.delta}`).join(", ");
      return this.t(item.key, { entries });
    }
    return this.t(item.key, vars);
  }

  roleFor(model, player) {
    if (!player.active) return this.t("ui.sittingOut");
    if (player.id === model.game.dealer) return this.t("role.dealer");
    if (player.id === model.game.declarer) return this.t("role.declarer");
    if (model.game.partner === player.id) return this.t("role.calledPartner");
    if (model.isDeclarerSide(player.id)) return this.t("role.declarerSide");
    return this.t("role.defender");
  }

  seatMeta(player) {
    const bid = player.bid ? this.contractName(player.bid) : this.t("ui.passed");
    return [
      this.t("ui.cards", { count: player.hand.length }),
      this.t("ui.tricks", { count: player.tricks }),
      bid
    ].join(" / ");
  }

  playerName(player) {
    return player ? this.t(player.nameKey) : "";
  }

  contractName(contract) {
    return this.t(contract.nameKey);
  }

  contractNameById(contractId) {
    return this.t(`contract.${contractId}`);
  }

  labelFor(controlId, text) {
    const label = document.querySelector(`[data-label-for="${controlId}"]`);
    if (label) label.firstChild.textContent = text;
  }

  optionText(select, value, text) {
    const option = [...select.options].find((item) => item.value === value);
    if (option) option.textContent = text;
  }

  get t() {
    return this.i18n.t.bind(this.i18n);
  }
}
