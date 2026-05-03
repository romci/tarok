import { cardLabel, isTarok, maxTricks } from "./rules.js";
import { cardSpriteStyle } from "./cardAssets.js";

export class TarokView {
  constructor({ i18n, onBidClick, onCardClick }) {
    this.i18n = i18n;
    this.onBidClick = onBidClick;
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
      table: document.querySelector(".table-felt"),
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

  render(model, autoRunning = false, previousLayout = null) {
    this.model = model;
    this.renderStaticText(autoRunning);
    this.renderScores(model);
    this.renderSeats(model);
    this.renderContract(model);
    this.renderTrick(model);
    this.renderTalon(model);
    this.renderActionPrompt(model);
    this.renderLog(model);
    this.bindBidButtons();
    this.animateCardTransition(previousLayout, model.game.animation);
    this.animateLatestMove(model);
  }

  captureCardLayout() {
    if (!this.els.table) return new Map();
    const tableRect = this.els.table.getBoundingClientRect();
    const layout = new Map();
    this.els.table.querySelectorAll(".card[data-card-id]").forEach((node) => {
      if (!node.dataset.cardId || layout.has(node.dataset.cardId)) return;
      const rect = node.getBoundingClientRect();
      layout.set(node.dataset.cardId, {
        classes: [...node.classList].filter((name) => !["card-arriving", "dealt-card", "playable", "disabled"].includes(name)).join(" "),
        styleText: node.getAttribute("style") || "",
        label: node.getAttribute("aria-label") || node.title || "",
        zone: node.dataset.cardZone || "",
        left: rect.left - tableRect.left,
        top: rect.top - tableRect.top,
        width: rect.width,
        height: rect.height
      });
    });
    return layout;
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
    this.optionText(this.els.speed, "1800", t("ui.study"));
    this.optionText(this.els.speed, "1050", t("ui.table"));
    this.optionText(this.els.speed, "650", t("ui.fast"));
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
            <span class="score-role">${this.t("ui.radli", { count: player.radli || 0 })}</span>
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
      const taken = this.takenHtml(player);
      seatEl.innerHTML = `
        <div class="seat-head">
          <span class="seat-name">${this.playerName(player)}</span>
          <span class="seat-meta">${this.seatMeta(player)}</span>
        </div>
        <div class="hand-row">${this.handHtml(player, legalIds)}</div>
        ${taken ? `<div class="taken-row">${taken}</div>` : ""}
      `;
      if (player.human) {
        seatEl.querySelectorAll(".card-button[data-card-id]").forEach((button) => {
          button.addEventListener("click", () => this.onCardClick(button.dataset.cardId));
        });
      }
    }
  }

  renderContract(model) {
    const game = model.game;
    if (game.phase === "bidding") {
      const current = game.bidding.currentContract ? this.contractName(game.bidding.currentContract) : this.t("ui.noBidYet");
      const active = model.players[game.activePlayer];
      this.els.contract.innerHTML = `
        <div class="contract-title">
          <span>${this.t("ui.bidding")}</span>
          <span>${this.t("ui.biddingRound", { round: game.bidding.round })}</span>
        </div>
        <p class="contract-detail">
          ${this.t("ui.biddingTurn", { player: this.playerName(active) })}
          ${this.t("ui.highBid", { contract: current })}
        </p>
        ${this.bidControls(model)}
      `;
      return;
    }

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
        ${this.cardHtml(play.card, "", "", "trick")}
        <span>${this.playerName(model.players[play.playerId])}</span>
      </div>
    `).join("");
  }

  renderTalon(model) {
    const game = model.game;
    if (game.phase === "bidding") {
      this.els.talon.innerHTML = `
        <div class="contract-title">
          <span>Talon</span>
          <span>${this.t("ui.hidden")}</span>
        </div>
        <p class="contract-detail">${this.t("ui.talonHidden")}</p>
        <div class="talon-cards">${game.talon.map((card) => this.cardBackHtml("small", card.id, "talon")).join("")}</div>
      `;
      return;
    }
    if (game.contract && game.contract.id === "klop") {
      this.els.talon.innerHTML = `
        <div class="contract-title">
          <span>Talon</span>
          <span>${this.t("ui.hidden")}</span>
        </div>
        <p class="contract-detail">${this.t("ui.talonKlop")}</p>
        <div class="talon-cards">
          ${game.talon.map((card) => (game.handDone ? this.cardHtml(card, "small", "", "talon") : this.cardBackHtml("small", card.id, "talon"))).join("")}
        </div>
      `;
      return;
    }
    this.els.talon.innerHTML = `
      <div class="contract-title">
        <span>Talon</span>
        <span>${this.t("ui.rejected", { count: game.talonRejected.length })}</span>
      </div>
      <p class="contract-detail">${this.t("ui.talonHelp")}</p>
      <div class="talon-cards">
        ${game.talon.map((card) => this.cardHtml(card, "small", "", "talon")).join("")}
        ${game.talonRejected.map((card) => (game.handDone ? this.cardHtml(card, "small", "", "talon") : this.cardBackHtml("small", card.id, "talon"))).join("")}
      </div>
    `;
  }

  renderActionPrompt(model) {
    const game = model.game;
    let text = "";
    if (game.handDone) {
      text = this.t("ui.actionHandDone");
    } else if (model.isHumanBidTurn()) {
      text = this.t("ui.actionYourBid");
    } else if (game.phase === "bidding") {
      text = this.t("ui.actionAiBid", { player: this.playerName(model.players[game.activePlayer]) });
    } else if (model.isHumanTurn()) {
      text = this.t("ui.actionYourTurn");
    } else {
      text = this.t("ui.actionAiTurn", { player: this.playerName(model.players[game.activePlayer]) });
    }
    this.els.actionPrompt.textContent = text;
  }

  renderLog(model) {
    this.els.log.innerHTML = model.game.log.slice(0, 90).map((item) => `<li>${this.formatLog(item)}</li>`).join("");
  }

  handHtml(player, legalIds) {
    if (!player.human) {
      return player.hand.map((card) => this.cardBackHtml("small", card.id, `hand-${player.id}`)).join("");
    }
    return player.hand.map((card) => {
      const legal = legalIds.has(card.id) && this.model.isHumanTurn();
      return `
        <button class="card-button" type="button" data-card-id="${card.id}" ${legal ? "" : "disabled"}>
          ${this.cardHtml(card, "small", legal ? "playable" : "disabled", `hand-${player.id}`)}
        </button>
      `;
    }).join("");
  }

  cardHtml(card, size = "", stateClass = "", zone = "") {
    const classes = ["card", "face", size, stateClass, isTarok(card) ? "tarok" : "", card.color === "red" ? "red" : ""].filter(Boolean).join(" ");
    const label = cardLabel(card, this.t);
    const zoneData = zone ? ` data-card-zone="${zone}"` : "";
    return `<span class="${classes}" role="img" aria-label="${label}" title="${label}" style="${cardSpriteStyle(card.id)}" data-card-id="${card.id}"${zoneData}></span>`;
  }

  cardBackHtml(size = "", cardId = "", zone = "") {
    const data = cardId ? ` data-card-id="${cardId}"` : "";
    const zoneData = zone ? ` data-card-zone="${zone}"` : "";
    return `<span class="card back ${size}" role="img" aria-label="Hidden card"${data}${zoneData}></span>`;
  }

  takenHtml(player) {
    const cards = player.taken.slice(-6);
    if (!cards.length) return "";
    return `
      <div class="taken-label">${this.t("ui.takenPile")}</div>
      <div class="taken-cards">${cards.map((card) => this.cardHtml(card, "mini", "", `taken-${player.id}`)).join("")}</div>
    `;
  }

  bidControls(model) {
    if (!model.isHumanBidTurn()) return "";
    const legal = model.legalBidContracts();
    return `
      <div class="bid-controls">
        <button type="button" class="bid-button pass" data-bid-id="">${this.t("ui.pass")}</button>
        ${legal.map((contract) => `
          <button type="button" class="bid-button" data-bid-id="${contract.id}">${this.contractName(contract)}</button>
        `).join("")}
      </div>
    `;
  }

  bindBidButtons() {
    this.els.contract.querySelectorAll("[data-bid-id]").forEach((button) => {
      button.addEventListener("click", () => this.onBidClick(button.dataset.bidId || null));
    });
  }

  animateLatestMove(model) {
    const animation = model.game.animation;
    if (!animation || animation.id === this.lastAnimationId) return;
    this.lastAnimationId = animation.id;
    if (animation.type === "deal") this.animateDeal();
    if (animation.type === "setup") this.pulseTable();
    if (animation.type === "play") this.pulseTable();
    if (animation.type === "collect") this.pulseWinnerSeat(animation.playerId);
  }

  formatLog(item) {
    const vars = item.vars || {};
    if (item.key === "log.deal") {
      return this.t(item.key, {
        dealer: this.playerName(this.model.players[vars.dealerId]),
        hand: vars.hand
      });
    }
    if (item.key === "log.biddingStarts") {
      return this.t(item.key, { player: this.playerName(this.model.players[vars.playerId]) });
    }
    if (item.key === "log.bidContract") {
      if (vars.playerId === this.model.humanId) {
        return this.t("log.bidContractHuman", {
          contract: this.contractNameById(vars.contractId),
          round: vars.round
        });
      }
      return this.t(item.key, {
        player: this.playerName(this.model.players[vars.playerId]),
        contract: this.contractNameById(vars.contractId),
        round: vars.round
      });
    }
    if (item.key === "log.bidPass") {
      if (vars.playerId === this.model.humanId) {
        return this.t("log.bidPassHuman", { round: vars.round });
      }
      return this.t(item.key, {
        player: this.playerName(this.model.players[vars.playerId]),
        round: vars.round
      });
    }
    if (item.key === "log.forehandChoice") {
      return this.t(item.key, { player: this.playerName(this.model.players[vars.playerId]) });
    }
    if (item.key === "log.contractSet") {
      return this.t(item.key, {
        declarer: this.playerName(this.model.players[vars.declarerId]),
        contract: this.contractNameById(vars.contractId)
      });
    }
    if (item.key === "log.play") {
      if (vars.playerId === this.model.humanId) {
        return this.t("log.playHuman", { card: cardLabel(vars.card, this.t) });
      }
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
    if (item.key === "log.klopGift") {
      return this.t(item.key, {
        player: this.playerName(this.model.players[vars.playerId]),
        card: cardLabel(vars.card, this.t)
      });
    }
    if (item.key === "log.beggarSummary") {
      return this.t(item.key, {
        declarer: this.playerName(this.model.players[vars.declarerId]),
        result: this.t(vars.result),
        delta: vars.delta
      });
    }
    if (item.key === "log.piccoloSummary" || item.key === "log.valatContractSummary") {
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
    if (item.key === "log.radliAwarded") {
      return this.t(item.key);
    }
    return this.t(item.key, vars);
  }

  roleFor(model, player) {
    if (!player.active) return this.t("ui.sittingOut");
    if (player.id === model.game.dealer) return this.t("role.dealer");
    if (model.game.phase === "bidding" && player.id === model.game.activePlayer) return this.t("role.bidding");
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

  animateDeal() {
    const cards = [...this.els.table.querySelectorAll(".seat:not(.hidden) .card")];
    cards.forEach((card, index) => {
      card.classList.remove("dealt-card");
      card.style.setProperty("--deal-delay", `${Math.min(index, 52) * 18}ms`);
      requestAnimationFrame(() => card.classList.add("dealt-card"));
    });
  }

  pulseTable() {
    this.els.table.classList.remove("table-pulse");
    requestAnimationFrame(() => this.els.table.classList.add("table-pulse"));
  }

  pulseWinnerSeat(playerId) {
    const seat = document.querySelector(`#seat-${playerId}`);
    if (!seat) return;
    seat.classList.remove("trick-winner-pulse");
    requestAnimationFrame(() => seat.classList.add("trick-winner-pulse"));
  }

  animateCardTransition(previousLayout, animation) {
    if (!animation || !previousLayout || !previousLayout.size) return;
    const cards = animation.type === "collect" ? animation.cards || [] : animation.card ? [animation.card] : [];
    if (!cards.length) return;
    this.els.table.querySelectorAll(".card-flyer").forEach((flyer) => flyer.remove());
    this.els.table.querySelectorAll(".card-arriving").forEach((card) => card.classList.remove("card-arriving"));
    cards.forEach((card, index) => this.animateOneCard(previousLayout, card.id, animation, index));
  }

  animateOneCard(previousLayout, cardId, animation, index) {
    const previous = previousLayout.get(cardId);
    if (!previous) return;
    const node = this.els.table.querySelector(`.card[data-card-id="${CSS.escape(cardId)}"]`);
    if (!node) return;
    const tableRect = this.els.table.getBoundingClientRect();
    const nextRect = node.getBoundingClientRect();
    const next = {
      left: nextRect.left - tableRect.left,
      top: nextRect.top - tableRect.top,
      width: nextRect.width,
      height: nextRect.height
    };
    const dx = previous.left - next.left;
    const dy = previous.top - next.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(previous.width - next.width) < 2) return;
    const collect = animation.type === "collect";
    const delay = collect ? index * 110 : 0;
    const duration = collect ? 1420 : null;
    this.createCardFlyer(previous, next, { collect, delay, duration });
    node.classList.add("card-arriving");
    if (collect) {
      node.style.setProperty("--arrive-ms", `${duration}ms`);
      node.style.setProperty("--arrive-delay", `${delay}ms`);
    }
    node.addEventListener("animationend", () => node.classList.remove("card-arriving"), { once: true });
  }

  createCardFlyer(previous, next, options = {}) {
    const tableRect = this.els.table.getBoundingClientRect();
    const flyer = document.createElement("span");
    flyer.className = `${previous.classes} card-flyer`;
    flyer.setAttribute("role", "img");
    flyer.setAttribute("aria-label", previous.label);
    if (previous.label) flyer.title = previous.label;
    if (previous.styleText) flyer.setAttribute("style", previous.styleText);
    flyer.style.left = `${previous.left}px`;
    flyer.style.top = `${previous.top}px`;
    flyer.style.width = `${previous.width}px`;
    flyer.style.height = `${previous.height}px`;
    flyer.style.setProperty("--fly-x", `${next.left - previous.left}px`);
    flyer.style.setProperty("--fly-y", `${next.top - previous.top}px`);
    flyer.style.setProperty("--fly-scale-x", `${next.width / previous.width}`);
    flyer.style.setProperty("--fly-scale-y", `${next.height / previous.height}`);
    if (options.duration) flyer.style.setProperty("--fly-ms", `${options.duration}ms`);
    if (options.delay) flyer.style.setProperty("--fly-delay", `${options.delay}ms`);
    if (options.collect) flyer.classList.add("collect-flyer");
    this.els.table.appendChild(flyer);
    flyer.addEventListener("animationend", () => flyer.remove(), { once: true });
  }
}
