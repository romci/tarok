import { HumanController, LocalAIController } from "./ai.js";
import {
  CONTRACTS,
  CONTRACT_SEQUENCE,
  NORMAL_CONTRACT_IDS,
  bonusSet,
  canDiscard,
  countTarokPoints,
  createDeck,
  formatPoints,
  isTarok,
  legalCards,
  maxTricks,
  removeCard,
  round5,
  shuffle,
  signed,
  sortHand,
  trickWinner
} from "./rules.js";

const PLAYER_NAME_KEYS = ["player.you", "player.boris", "player.cilka", "player.david"];

export class TarokGame {
  constructor({ playerCount = 4, aiLevel = "medium", humanId = 0 } = {}) {
    this.humanId = humanId;
    this.playerCount = Number(playerCount);
    this.aiLevel = aiLevel;
    this.players = [];
    this.controllers = [];
    this.scores = [0, 0, 0, 0];
    this.dealer = this.playerCount - 1;
    this.handNumber = 0;
    this.game = null;
    this.sessionLog = [];
    this.startSession({ playerCount, aiLevel });
  }

  startSession({ playerCount = this.playerCount, aiLevel = this.aiLevel } = {}) {
    this.playerCount = Number(playerCount);
    this.aiLevel = aiLevel;
    this.players = PLAYER_NAME_KEYS.map((nameKey, index) => ({
      id: index,
      nameKey,
      active: index < this.playerCount,
      hand: [],
      taken: [],
      tricks: 0,
      bid: null,
      radli: 0,
      human: index === this.humanId
    }));
    this.controllers = this.players.map((player) => (
      player.human ? new HumanController(player.id) : new LocalAIController(player.id, this.aiLevel)
    ));
    this.dealer = this.playerCount - 1;
    this.scores = [0, 0, 0, 0];
    this.handNumber = 0;
    this.sessionLog = [];
    this.startHand();
  }

  startHand() {
    this.handNumber += 1;
    this.dealer = this.nextActive(this.dealer);
    this.game = {
      phase: "bidding",
      handNumber: this.handNumber,
      playerCount: this.playerCount,
      dealer: this.dealer,
      forehand: this.nextActive(this.dealer),
      activePlayer: null,
      talon: [],
      talonTaken: [],
      talonRejected: [],
      talonDiscards: [],
      contract: null,
      declarer: null,
      partner: null,
      partnerKnownPublicly: false,
      openHandPlayerId: null,
      calledKing: null,
      calledKingInTalon: false,
      talonExchanged: false,
      talonExchange: null,
      announcementsDone: false,
      announcementContext: null,
      currentTrick: [],
      completedTricks: [],
      lastTrick: null,
      trickNumber: 0,
      leader: null,
      log: [],
      capturedMondPenalty: [],
      handDone: false,
      summary: null,
      waitingForHuman: false,
      bidding: null,
      animation: null,
      lastAction: null
    };

    for (const player of this.activePlayers()) {
      player.hand = [];
      player.taken = [];
      player.tricks = 0;
      player.bid = null;
    }

    this.deal();
    this.log("deal", {
      dealerId: this.game.dealer,
      hand: this.game.handNumber
    });
    this.startBidding();
    this.updateHumanWait();
  }

  setAiLevel(level) {
    this.aiLevel = level;
    this.controllers = this.players.map((player) => (
      player.human ? new HumanController(player.id) : new LocalAIController(player.id, this.aiLevel)
    ));
  }

  step() {
    if (!this.game || this.game.handDone) {
      this.startHand();
      return { advanced: true };
    }

    if (this.game.phase === "bidding") {
      if (this.isHumanBidTurn()) {
        this.game.waitingForHuman = true;
        return { advanced: false, waitingForHuman: true };
      }
      this.processAiBid();
      return { advanced: true, action: "bid" };
    }

    if (this.game.phase === "calling") {
      if (this.isHumanCallingTurn()) {
        this.game.waitingForHuman = true;
        return { advanced: false, waitingForHuman: true };
      }
      this.processCalling();
      return { advanced: true, action: "calling" };
    }

    if (this.game.phase === "talon") {
      if (this.isHumanTalonTurn()) {
        this.game.waitingForHuman = true;
        return { advanced: false, waitingForHuman: true };
      }
      this.processTalonExchange();
      return { advanced: true, action: "talon" };
    }

    if (this.game.phase === "announcements") {
      if (this.isHumanAnnouncementTurn()) {
        this.game.waitingForHuman = true;
        return { advanced: false, waitingForHuman: true };
      }
      this.processAnnouncementTurn();
      return { advanced: true, action: "announcements" };
    }

    if (this.game.phase === "trickComplete") {
      this.finishTrick();
      return { advanced: true, action: "collect" };
    }

    if (this.game.phase !== "play") return { advanced: false };
    if (this.isHumanTurn()) {
      this.game.waitingForHuman = true;
      return { advanced: false, waitingForHuman: true };
    }

    const player = this.players[this.game.activePlayer];
    const legal = this.legalCardsFor(player.id);
    const selected = this.controllers[player.id].chooseCard(this, legal, player);
    this.playCard(player.id, selected && legal.some((card) => card.id === selected.id) ? selected.id : legal[0].id);
    return { advanced: true };
  }

  autoplayTurnLimit(limit = 80) {
    let steps = 0;
    while (steps < limit && !this.game.handDone && !this.isWaitingForHuman()) {
      this.step();
      steps += 1;
    }
    this.updateHumanWait();
    return steps;
  }

  playHumanCard(cardId) {
    if (!this.isHumanTurn()) return false;
    const legal = this.legalCardsFor(this.humanId);
    if (!legal.some((card) => card.id === cardId)) return false;
    this.playCard(this.humanId, cardId);
    return true;
  }

  placeHumanBid(contractId) {
    if (!this.isHumanBidTurn()) return false;
    const contract = contractId ? CONTRACTS[contractId] : null;
    if (contract && !this.legalBidContracts().some((option) => option.id === contract.id)) return false;
    this.placeBid(this.humanId, contract);
    return true;
  }

  chooseHumanCalledKing(cardId) {
    if (!this.isHumanCallingTurn()) return false;
    const king = this.callableKings().find((card) => card.id === cardId);
    if (!king) return false;
    this.callKing(king);
    this.enterNextPostBiddingPhase();
    this.updateHumanWait();
    return true;
  }

  /**
   * @param {{ type: "pass" } | { type: "gameDouble" } | { type: "announce", bonus: string }} choice
   */
  commitHumanAnnouncement(choice) {
    if (!this.isHumanAnnouncementTurn()) return false;
    return this.applyAnnouncementChoice(this.humanId, choice);
  }

  legalAnnouncementActions() {
    if (!this.isHumanAnnouncementTurn()) return [];
    const id = this.humanId;
    const out = [{ type: "pass", id: "pass" }];
    if (this.canDoubleGame(id)) {
      out.push({ type: "gameDouble", id: "gameDouble", step: this.nextGameDoubleStepKey() });
    }
    for (const bonus of ["valat", "trula", "kings", "pagatUltimo", "kingUltimo"]) {
      if (this.canAnnounceBonus(id, bonus)) {
        out.push({ type: "announce", bonus, id: `ann-${bonus}` });
      }
    }
    return out;
  }

  chooseHumanTalonGroup(groupIndex) {
    if (!this.isHumanTalonGroupTurn()) return false;
    const exchange = this.game.talonExchange;
    const index = Number(groupIndex);
    const taken = exchange.groups[index];
    if (!taken) return false;
    const declarer = this.players[this.game.declarer];
    exchange.selectedIndex = index;
    exchange.taken = taken;
    exchange.rejected = exchange.groups.flatMap((group, currentIndex) => (currentIndex === index ? [] : group));
    exchange.discardIds = [];
    declarer.hand.push(...taken);
    sortHand(declarer.hand);
    this.updateHumanWait();
    return true;
  }

  toggleHumanTalonDiscard(cardId) {
    if (!this.isHumanTalonDiscardTurn()) return false;
    const exchange = this.game.talonExchange;
    const declarer = this.players[this.game.declarer];
    const card = declarer.hand.find((candidate) => candidate.id === cardId);
    if (!card || !canDiscard(card)) return false;
    const existing = exchange.discardIds.indexOf(cardId);
    if (existing >= 0) {
      exchange.discardIds.splice(existing, 1);
      return true;
    }
    if (exchange.discardIds.length >= this.game.contract.talonTake) return false;
    exchange.discardIds.push(cardId);
    return true;
  }

  finishHumanTalonExchange() {
    if (!this.isHumanTalonDiscardTurn()) return false;
    const exchange = this.game.talonExchange;
    if (exchange.discardIds.length !== this.game.contract.talonTake) return false;
    const declarer = this.players[this.game.declarer];
    const discards = exchange.discardIds
      .map((cardId) => declarer.hand.find((card) => card.id === cardId))
      .filter(Boolean);
    if (discards.length !== this.game.contract.talonTake || discards.some((card) => !canDiscard(card))) return false;
    this.finalizeTalonExchange(exchange.taken, exchange.rejected, discards);
    this.game.talonExchanged = true;
    this.game.talonExchange = null;
    this.enterNextPostBiddingPhase();
    this.updateHumanWait();
    return true;
  }

  legalCardsFor(playerId) {
    const player = this.players[playerId];
    if (!player || !this.game || this.game.phase !== "play") return [];
    return legalCards(player.hand, this.game.currentTrick, this.game.contract);
  }

  legalBidContracts() {
    if (!this.game || this.game.phase !== "bidding") return [];
    const bidding = this.game.bidding;
    if (bidding.forehandChoice) return CONTRACT_SEQUENCE;
    const currentRank = bidding.currentContract ? bidding.currentContract.rank : -1;
    if (this.playerCount === 3) {
      return CONTRACT_SEQUENCE.filter((contract) => contract.id !== "klop" && contract.id !== "three" && contract.rank > currentRank);
    }
    const higherPriority = bidding.highestBidder !== null && this.hasHigherBidPriority(this.game.activePlayer, bidding.highestBidder);
    const minimumRank = higherPriority ? currentRank : currentRank + 1;
    return CONTRACT_SEQUENCE.filter((contract) => {
      if (contract.id === "klop" || contract.id === "three") return false;
      return contract.rank >= minimumRank;
    });
  }

  isHumanTurn() {
    return this.game && this.game.phase === "play" && !this.game.handDone && this.game.activePlayer === this.humanId;
  }

  isHumanBidTurn() {
    return this.game && this.game.phase === "bidding" && this.game.activePlayer === this.humanId;
  }

  isHumanCallingTurn() {
    return this.game
      && this.game.phase === "calling"
      && this.game.activePlayer === this.humanId
      && this.game.contract
      && this.game.contract.callsKing
      && this.playerCount === 4;
  }

  isHumanTalonTurn() {
    return this.game
      && this.game.phase === "talon"
      && this.game.activePlayer === this.humanId
      && this.game.contract
      && this.game.contract.talonTake > 0;
  }

  isHumanTalonGroupTurn() {
    return this.isHumanTalonTurn() && this.game.talonExchange && this.game.talonExchange.selectedIndex === null;
  }

  isHumanTalonDiscardTurn() {
    return this.isHumanTalonTurn() && this.game.talonExchange && this.game.talonExchange.selectedIndex !== null;
  }

  isHumanAnnouncementTurn() {
    return this.game
      && this.game.phase === "announcements"
      && this.game.activePlayer === this.humanId;
  }

  isWaitingForHuman() {
    return this.isHumanTurn()
      || this.isHumanBidTurn()
      || this.isHumanCallingTurn()
      || this.isHumanTalonTurn()
      || this.isHumanAnnouncementTurn();
  }

  isDeclarerSide(playerId) {
    if (!this.game || !this.game.contract || this.game.contract.id === "klop") return false;
    return playerId === this.game.declarer || playerId === this.game.partner;
  }

  activePlayers() {
    return this.players.filter((player) => player.active);
  }

  nextActive(playerId) {
    let next = playerId;
    do {
      next = (next + 1) % this.playerCount;
    } while (!this.players[next] || !this.players[next].active);
    return next;
  }

  maxTricks() {
    return maxTricks(this.playerCount);
  }

  deal() {
    const deck = shuffle(createDeck());
    this.game.talon = deck.splice(0, 6);
    const handSize = this.playerCount === 4 ? 12 : 16;
    const order = this.turnOrder(this.game.forehand);
    for (let round = 0; round < handSize; round += 1) {
      for (const playerId of order) {
        this.players[playerId].hand.push(deck.shift());
      }
    }
    this.activePlayers().forEach((player) => sortHand(player.hand));
    this.game.animation = { type: "deal", id: `deal-${this.game.handNumber}-${Date.now()}` };
  }

  startBidding() {
    this.game.bidding = {
      round: 1,
      currentContract: null,
      highestBidder: null,
      passesSinceRaise: 0,
      totalActions: 0,
      forehandChoice: false,
      passedPlayers: [],
      activeBidders: this.activePlayers().map((player) => player.id),
      history: []
    };
    this.game.contract = null;
    this.game.declarer = null;
    this.game.activePlayer = this.playerCount === 4 ? this.nextActive(this.game.forehand) : this.game.forehand;
    this.log("biddingStarts", { playerId: this.game.forehand });
  }

  processAiBid() {
    const player = this.players[this.game.activePlayer];
    let best = this.controllers[player.id].chooseBid(this.game, player);
    if (this.game.bidding.forehandChoice && !best) best = CONTRACTS.klop;
    const legal = this.legalBidContracts();
    const bid = best && legal.some((contract) => contract.id === best.id) ? best : null;
    this.placeBid(player.id, bid);
  }

  placeBid(playerId, contract) {
    if (this.game.phase !== "bidding" || this.game.activePlayer !== playerId) return false;
    const bidding = this.game.bidding;
    if (!contract && bidding.forehandChoice) contract = CONTRACTS.klop;
    if (contract) {
      const adapted = this.adaptContractForPlayers(contract);
      bidding.currentContract = adapted;
      bidding.highestBidder = playerId;
      bidding.passesSinceRaise = 0;
      this.players[playerId].bid = adapted;
      bidding.history.push({ playerId, contractId: adapted.id, round: bidding.round });
      this.log("bidContract", { playerId, contractId: adapted.id, round: bidding.round });
    } else {
      if (!bidding.passedPlayers.includes(playerId)) bidding.passedPlayers.push(playerId);
      bidding.passesSinceRaise += 1;
      bidding.history.push({ playerId, contractId: null, round: bidding.round });
      this.log("bidPass", { playerId, round: bidding.round });
    }

    bidding.totalActions += 1;
    if (this.isBiddingDone()) {
      this.finishBidding();
      return true;
    }
    this.advanceBidder();
    this.updateHumanWait();
    return true;
  }

  isBiddingDone() {
    const bidding = this.game.bidding;
    const playerCount = this.activePlayers().length;
    if (bidding.forehandChoice) return Boolean(bidding.currentContract);
    if (!bidding.currentContract) {
      if (this.playerCount === 4 && bidding.totalActions >= playerCount - 1) {
        this.game.activePlayer = this.game.forehand;
        bidding.forehandChoice = true;
        bidding.round += 1;
        this.log("forehandChoice", { playerId: this.game.forehand });
        return false;
      }
      return bidding.totalActions >= playerCount;
    }
    const passedOpponents = this.activePlayers()
      .map((player) => player.id)
      .filter((id) => id !== bidding.highestBidder && bidding.passedPlayers.includes(id)).length;
    return passedOpponents >= playerCount - 1;
  }

  advanceBidder() {
    const bidding = this.game.bidding;
    const previous = this.game.activePlayer;
    let next = this.nextActive(previous);
    let guard = 0;
    while (bidding.passedPlayers.includes(next) && guard < this.playerCount) {
      next = this.nextActive(next);
      guard += 1;
    }
    this.game.activePlayer = next;
    if (this.turnDistance(this.game.forehand, previous) > this.turnDistance(this.game.forehand, this.game.activePlayer)) {
      bidding.round += 1;
    }
  }

  finishBidding() {
    const bidding = this.game.bidding;
    if (!bidding.currentContract) {
      this.game.contract = CONTRACTS.klop;
      this.game.declarer = this.game.forehand;
    } else {
      this.game.contract = bidding.currentContract;
      this.game.declarer = bidding.highestBidder;
    }
    this.game.animation = { type: "setup", id: `setup-${this.game.handNumber}-${Date.now()}` };
    this.log("contractSet", { declarerId: this.game.declarer, contractId: this.game.contract.id });
    this.enterNextPostBiddingPhase();
    this.updateHumanWait();
  }

  adaptContractForPlayers(contract) {
    if (this.playerCount === 3 && contract.callsKing) {
      return { ...contract, callsKing: false, solo: true };
    }
    return contract;
  }

  enterNextPostBiddingPhase() {
    if (this.game.contract.callsKing && this.playerCount === 4 && !this.game.calledKing) {
      this.game.phase = "calling";
      this.game.activePlayer = this.game.declarer;
      return;
    }
    if (!this.game.talonExchanged && this.needsTalonPhase()) {
      this.game.phase = "talon";
      this.game.activePlayer = this.game.declarer;
      this.startTalonPhase();
      return;
    }
    if (!this.game.announcementsDone) {
      if (this.needsAnnouncementsPhase()) {
        this.game.phase = "announcements";
        this.startAnnouncementsRound();
        this.game.activePlayer = this.game.declarer;
        return;
      }
      this.game.announcementsDone = true;
    }
    this.startPlay();
  }

  needsAnnouncementsPhase() {
    const c = this.game.contract;
    if (!c) return false;
    if (c.id === "klop") return false;
    if (c.mode === "beggar" || c.mode === "piccolo") return false;
    return true;
  }

  startAnnouncementsRound() {
    this.game.announcementContext = {
      consecutivePasses: 0,
      gameDoubles: 0,
      valatAnnounced: false,
      trulaAnnounced: false,
      kingsAnnounced: false,
      pagatUltimoAnnounced: false,
      kingUltimoAnnounced: false
    };
  }

  processAnnouncementTurn() {
    const player = this.players[this.game.activePlayer];
    const raw = this.controllers[player.id].chooseAnnouncement(this.game, player);
    const choice = raw && raw.type ? raw : { type: "pass" };
    this.applyAnnouncementChoice(player.id, choice);
  }

  /** Label for the next game-double action (before it is applied). */
  nextGameDoubleStepKey() {
    const keys = ["kontra", "rekontra", "subkontra", "mordkontra"];
    const ctx = this.game.announcementContext;
    const idx = ctx ? ctx.gameDoubles : 0;
    return keys[Math.min(idx, keys.length - 1)];
  }

  canDoubleGame(playerId) {
    const ctx = this.game.announcementContext;
    if (!ctx || ctx.gameDoubles >= 4) return false;
    const onDeclarerTeam = this.isDeclarerSide(playerId);
    const needDefenderMove = ctx.gameDoubles % 2 === 0;
    if (needDefenderMove && onDeclarerTeam) return false;
    if (!needDefenderMove && !onDeclarerTeam) return false;
    return true;
  }

  canAnnounceBonus(playerId, bonus) {
    if (!this.isDeclarerSide(playerId)) return false;
    const ctx = this.game.announcementContext;
    const c = this.game.contract;
    if (!ctx || !c || c.noBonuses) return false;
    if (bonus === "valat" && (c.mode === "valat" || c.mode === "colourValat")) return false;
    if (bonus === "kingUltimo" && (!this.game.calledKing || this.game.calledKingInTalon)) return false;
    const flag = `${bonus}Announced`;
    if (ctx[flag]) return false;
    return ["valat", "trula", "kings", "pagatUltimo", "kingUltimo"].includes(bonus);
  }

  advanceAnnouncementTurn() {
    this.game.activePlayer = this.nextActive(this.game.activePlayer);
  }

  finishAnnouncementsPhase() {
    const ctx = this.game.announcementContext;
    const had = ctx && (
      ctx.gameDoubles > 0
      || ctx.valatAnnounced
      || ctx.trulaAnnounced
      || ctx.kingsAnnounced
      || ctx.pagatUltimoAnnounced
      || ctx.kingUltimoAnnounced
    );
    if (!had) {
      this.log("announcementsPassed", { playerId: this.game.declarer });
    }
    this.game.announcementsDone = true;
    this.enterNextPostBiddingPhase();
    this.updateHumanWait();
  }

  /**
   * @param {{ type: "pass" } | { type: "gameDouble" } | { type: "announce", bonus: string }} choice
   */
  applyAnnouncementChoice(playerId, choice) {
    if (this.game.phase !== "announcements" || playerId !== this.game.activePlayer) return false;
    const ctx = this.game.announcementContext;
    if (!ctx || !choice || !choice.type) return false;

    if (choice.type === "pass") {
      ctx.consecutivePasses += 1;
      this.log("announcementPass", { playerId });
      const passesNeeded = this.activePlayers().length;
      if (ctx.consecutivePasses >= passesNeeded) {
        this.finishAnnouncementsPhase();
        return true;
      }
      this.advanceAnnouncementTurn();
      this.updateHumanWait();
      return true;
    }

    ctx.consecutivePasses = 0;

    if (choice.type === "gameDouble") {
      if (!this.canDoubleGame(playerId)) return false;
      ctx.gameDoubles += 1;
      const stepNames = ["kontra", "rekontra", "subkontra", "mordkontra"];
      this.log("announcementGameDouble", {
        playerId,
        stepKey: stepNames[ctx.gameDoubles - 1]
      });
      this.advanceAnnouncementTurn();
      this.updateHumanWait();
      return true;
    }

    if (choice.type === "announce") {
      if (!this.canAnnounceBonus(playerId, choice.bonus)) return false;
      ctx[`${choice.bonus}Announced`] = true;
      this.log("announcementBonus", { playerId, bonus: choice.bonus });
      this.advanceAnnouncementTurn();
      this.updateHumanWait();
      return true;
    }

    return false;
  }

  scoreAnnouncedBonusAdjustments(declarerCards) {
    const ctx = this.game.announcementContext;
    if (!ctx || this.game.contract.noBonuses) return 0;
    const has = bonusSet(declarerCards);
    let d = 0;
    if (ctx.trulaAnnounced && !has.trula) d -= 10;
    if (ctx.kingsAnnounced && !has.kings) d -= 10;
    return d;
  }

  needsTalonPhase() {
    if (!this.game.contract) return false;
    return this.game.contract.talonTake > 0 || this.game.contract.mode === "positive" || this.game.contract.mode === "valat" || this.game.contract.mode === "colourValat";
  }

  startTalonPhase() {
    this.game.talonExchange = null;
    if (this.isHumanTalonTurn()) {
      this.game.talonExchange = {
        groups: this.talonGroups(this.game.contract.talonTake),
        selectedIndex: null,
        taken: [],
        rejected: [],
        discardIds: []
      };
    }
  }

  processCalling() {
    const player = this.players[this.game.activePlayer];
    const selectedKing = this.controllers[player.id].chooseCalledKing?.(this, player) || null;
    this.callKing(selectedKing);
    this.enterNextPostBiddingPhase();
    this.updateHumanWait();
  }

  callKing(selectedKing = null) {
    const contract = this.game.contract;
    if (!contract.callsKing || this.playerCount !== 4) {
      this.game.partner = null;
      this.log("callKingSkipped", { declarerId: this.game.declarer });
      return;
    }

    this.game.calledKing = selectedKing || this.autoCalledKing();
    const holder = this.activePlayers().find((player) => player.hand.some((card) => card.id === this.game.calledKing.id));
    this.game.partner = holder ? holder.id : null;
    this.game.calledKingInTalon = !holder && this.game.talon.some((card) => card.id === this.game.calledKing.id);
    this.game.partnerKnownPublicly = false;
    this.log("callKing", {
      declarerId: this.game.declarer,
      card: this.game.calledKing,
      inTalon: this.game.calledKingInTalon
    });
  }

  autoCalledKing() {
    const declarer = this.players[this.game.declarer];
    const preferred = this.callableKings()
      .map((king) => ({
        king,
        held: declarer.hand.some((card) => card.id === king.id),
        suitCount: declarer.hand.filter((card) => card.suit === king.suit).length
      }))
      .sort((a, b) => Number(a.held) - Number(b.held) || a.suitCount - b.suitCount);
    return preferred[0].king;
  }

  callableKings() {
    return createDeck().filter((card) => card.rank === "K");
  }

  processTalonExchange() {
    this.exchangeTalon();
    this.game.talonExchanged = true;
    this.game.talonExchange = null;
    this.enterNextPostBiddingPhase();
    this.updateHumanWait();
  }

  exchangeTalon() {
    const count = this.game.contract.talonTake;
    if (!count) {
      const talonCount = this.game.talon.length;
      this.game.talonTaken = [];
      if (this.game.contract.id === "klop") {
        this.log("talonNoExchange", { declarerId: this.game.declarer, count: talonCount });
        return;
      }
      this.game.talonRejected = [...this.game.talon];
      this.game.talon = [];
      this.log("talonNoExchange", { declarerId: this.game.declarer, count: talonCount });
      return;
    }

    const declarer = this.players[this.game.declarer];
    const groups = this.talonGroups(count);
    const choice = this.controllers[declarer.id].chooseTalonGroup(this.game, declarer, groups);
    const taken = groups[choice] || groups[0];
    const rejected = groups.flatMap((group, index) => (index === choice ? [] : group));
    declarer.hand.push(...taken);
    sortHand(declarer.hand);

    const discards = this.controllers[declarer.id]
      .chooseDiscard(this.game, declarer, count)
      .filter((card) => canDiscard(card))
      .slice(0, count);
    this.finalizeTalonExchange(taken, rejected, discards);
  }

  talonGroups(count) {
    const groups = [];
    for (let i = 0; i < this.game.talon.length; i += count) {
      groups.push(this.game.talon.slice(i, i + count));
    }
    return groups;
  }

  finalizeTalonExchange(taken, rejected, discards) {
    const declarer = this.players[this.game.declarer];
    const talonBefore = [...this.game.talon];
    discards.forEach((discard) => removeCard(declarer.hand, discard.id));
    declarer.taken.push(...discards);
    this.game.talon = [];
    this.game.talonTaken = taken;
    this.game.talonRejected = rejected;
    this.game.talonDiscards = discards;
    if (rejected.some((card) => card.id === "T21") && this.isCapturedMondTalonPenaltyContract()) {
      this.game.capturedMondPenalty.push(this.game.declarer);
    }
    this.log("talonExchange", {
      declarerId: this.game.declarer,
      takenCount: taken.length,
      rejectedCount: rejected.length,
      discardCount: discards.length,
      talonBefore,
      taken,
      rejected,
      discards
    });
  }

  startPlay() {
    this.game.leader = this.firstLeader();
    this.game.activePlayer = this.game.leader;
    this.game.phase = "play";
    this.game.animation = { type: "setup", id: `play-${this.game.handNumber}-${Date.now()}` };
    this.log("playStarts", { playerId: this.game.leader });
    this.updateHumanWait();
  }

  isCapturedMondTalonPenaltyContract() {
    if (!this.game.contract) return false;
    if (this.playerCount === 3) return ["three", "two", "one"].includes(this.game.contract.id);
    return [...NORMAL_CONTRACT_IDS, "soloWithout"].includes(this.game.contract.id);
  }

  firstLeader() {
    if (this.game.contract.rank >= CONTRACTS.beggar.rank || this.game.contract.mode === "colourValat") return this.game.declarer;
    return this.game.forehand;
  }

  playCard(playerId, cardId) {
    const player = this.players[playerId];
    const legal = this.legalCardsFor(playerId);
    const card = legal.find((candidate) => candidate.id === cardId);
    if (!card) return false;

    removeCard(player.hand, card.id);
    this.game.currentTrick.push({ playerId, card });
    if (this.game.calledKing && card.id === this.game.calledKing.id) {
      this.game.partnerKnownPublicly = true;
      if (this.game.partner === null && playerId !== this.game.declarer) {
        this.game.partner = playerId;
      }
    }
    this.game.animation = {
      type: "play",
      id: `play-${this.game.handNumber}-${this.game.trickNumber}-${playerId}-${card.id}-${Date.now()}`,
      playerId,
      card
    };
    this.log("play", { playerId, card });

    if (this.game.currentTrick.length === this.playerCount) {
      this.game.phase = "trickComplete";
      this.game.activePlayer = null;
      this.updateHumanWait();
    } else {
      this.game.activePlayer = this.nextActive(this.game.activePlayer);
      this.updateHumanWait();
    }
    return true;
  }

  finishTrick() {
    this.game.currentTrick.contract = this.game.contract;
    const winnerId = trickWinner(this.game.currentTrick);
    const winner = this.players[winnerId];
    this.collectKlopGift(winner);
    const cards = this.game.currentTrick.map((play) => play.card);
    winner.taken.push(...cards);
    winner.tricks += 1;

    const mondPlay = this.game.currentTrick.find((play) => play.card.id === "T21");
    const skisPlay = this.game.currentTrick.find((play) => play.card.id === "SKIS");
    if (mondPlay && skisPlay && this.game.contract.mode === "positive") {
      this.game.capturedMondPenalty.push(mondPlay.playerId);
    }

    this.log("winTrick", { playerId: winnerId, trick: this.game.trickNumber + 1 });
    if (this.game.contract.openHand && this.game.trickNumber === 0) {
      this.game.openHandPlayerId = this.game.declarer;
    }
    this.game.animation = {
      type: "collect",
      id: `collect-${this.game.handNumber}-${this.game.trickNumber}-${winnerId}-${Date.now()}`,
      playerId: winnerId,
      cards
    };
    this.game.trickNumber += 1;
    this.game.leader = winnerId;
    this.game.activePlayer = winnerId;
    this.game.lastTrick = {
      winnerId,
      plays: this.game.currentTrick.map((play) => ({ ...play }))
    };
    this.game.completedTricks.push(this.game.lastTrick);
    this.game.currentTrick = [];

    if (this.activePlayers().every((player) => player.hand.length === 0)) {
      this.scoreHand();
      this.game.handDone = true;
      this.game.phase = "done";
      this.game.waitingForHuman = false;
    } else {
      this.game.phase = "play";
      this.updateHumanWait();
    }
  }

  collectKlopGift(winner) {
    if (this.game.contract.id !== "klop") return;
    if (this.game.trickNumber >= 6) return;
    const gift = this.game.talon.shift();
    if (gift) {
      this.game.currentTrick.push({ playerId: winner.id, card: gift, talonGift: true });
      this.log("klopGift", { playerId: winner.id, card: gift });
    }
  }

  scoreHand() {
    const deltas = [0, 0, 0, 0];
    const declarerSide = this.activePlayers().filter((player) => this.isDeclarerSide(player.id));
    const defenders = this.activePlayers().filter((player) => !this.isDeclarerSide(player.id));
    const declarerCards = declarerSide.flatMap((player) => player.taken);
    const defenderCards = [
      ...defenders.flatMap((player) => player.taken),
      ...this.rejectedTalonForDefenders()
    ];
    const declarerPoints = countTarokPoints(declarerCards);
    const defenderPoints = countTarokPoints(defenderCards);
    const allTricks = declarerSide.reduce((sum, player) => sum + player.tricks, 0);
    let declarerSuccess = false;
    let radliTrigger = false;

    if (this.game.contract.id === "klop") {
      this.scoreKlop(deltas);
      this.game.summary = { key: "log.klopSummary" };
      radliTrigger = true;
    } else if (this.game.contract.mode === "beggar") {
      declarerSuccess = this.players[this.game.declarer].tricks === 0;
      const delta = declarerSuccess ? this.game.contract.base : -this.game.contract.base;
      deltas[this.game.declarer] += delta;
      this.game.summary = { key: "log.beggarSummary", vars: { declarerId: this.game.declarer, result: declarerSuccess ? "made" : "failed", delta } };
      radliTrigger = true;
    } else if (this.game.contract.mode === "piccolo") {
      declarerSuccess = this.players[this.game.declarer].tricks === 1;
      const delta = declarerSuccess ? this.game.contract.base : -this.game.contract.base;
      deltas[this.game.declarer] += delta;
      this.game.summary = { key: "log.piccoloSummary", vars: { declarerId: this.game.declarer, result: declarerSuccess ? "made" : "failed", delta } };
    } else if (this.game.contract.mode === "valat" || this.game.contract.mode === "colourValat") {
      declarerSuccess = allTricks === this.maxTricks();
      const mult = 2 ** (this.game.announcementContext?.gameDoubles || 0);
      const delta = (declarerSuccess ? this.game.contract.base : -this.game.contract.base) * mult;
      deltas[this.game.declarer] += delta;
      this.game.summary = { key: "log.valatContractSummary", vars: { declarerId: this.game.declarer, result: declarerSuccess ? "made" : "failed", delta } };
      radliTrigger = true;
    } else {
      declarerSuccess = declarerPoints >= 36;
      const rawDifference = Math.abs(declarerPoints - 35);
      const difference = this.playerCount === 3 ? rawDifference : round5(rawDifference);
      const mult = 2 ** (this.game.announcementContext?.gameDoubles || 0);
      let gameValue = this.game.contract.base + (!this.game.contract.noDifference && NORMAL_CONTRACT_IDS.has(this.game.contract.id) ? difference : 0);
      if (allTricks === this.maxTricks()) {
        gameValue = 250;
        this.game.summary = { key: "log.valatSummary" };
        radliTrigger = true;
      } else {
        this.game.summary = {
          key: "log.pointsSummary",
          vars: { declarerId: this.game.declarer, declarerPoints: formatPoints(declarerPoints), defenderPoints: formatPoints(defenderPoints) }
        };
      }
      gameValue *= mult;
      this.applyTeamDelta(deltas, declarerSide, declarerSuccess ? gameValue : -gameValue);

      if (this.game.announcementContext?.valatAnnounced && allTricks !== this.maxTricks()) {
        this.applyTeamDelta(deltas, declarerSide, -250);
      }

      if (!this.game.contract.noBonuses && allTricks !== this.maxTricks()) {
        const bonusTotal = this.scoreBonuses(declarerCards, defenderCards)
          + this.scoreAnnouncedBonusAdjustments(declarerCards);
        this.applyTeamDelta(deltas, declarerSide, bonusTotal);
      }
    }

    for (const playerId of this.game.capturedMondPenalty) {
      deltas[playerId] -= this.playerCount === 3 ? 21 : 20;
    }

    this.applyRadli(deltas, declarerSide, declarerSuccess, radliTrigger);
    deltas.forEach((delta, index) => {
      this.scores[index] += delta;
    });
    this.game.log.unshift(this.game.summary);
    this.log("scoreChange", {
      entries: this.activePlayers().map((player) => ({ playerId: player.id, delta: signed(deltas[player.id]) }))
    });
    this.log("handScoreDetails", {
      hand: this.game.handNumber,
      contractId: this.game.contract?.id,
      entries: this.activePlayers().map((player) => ({
        playerId: player.id,
        delta: signed(deltas[player.id]),
        total: this.scores[player.id],
        tricks: player.tricks,
        points: formatPoints(countTarokPoints(player.taken)),
        roundedPoints: round5(countTarokPoints(player.taken)),
        radli: player.radli
      }))
    });
  }

  applyRadli(deltas, declarerSide, declarerSuccess, radliTrigger) {
    if (this.game.contract.id === "klop") {
      this.activePlayers().forEach((player) => {
        if (player.radli > 0) {
          deltas[player.id] *= 2;
          if (deltas[player.id] > 0) player.radli -= 1;
        }
      });
    } else if (this.players[this.game.declarer].radli > 0) {
      declarerSide.forEach((player) => {
        deltas[player.id] *= 2;
      });
      if (declarerSuccess) this.players[this.game.declarer].radli -= 1;
    }
    if (radliTrigger || this.game.contract.rank >= CONTRACTS.beggar.rank) {
      this.activePlayers().forEach((player) => {
        player.radli += 1;
      });
      this.log("radliAwarded");
    }
  }

  scoreKlop(deltas) {
    const playerResults = this.activePlayers().map((player) => ({
      player,
      points: countTarokPoints(player.taken),
      roundedPoints: round5(countTarokPoints(player.taken)),
      won: player.tricks === 0,
      lost: countTarokPoints(player.taken) > 35
    }));
    const hasWinnerOrLoser = playerResults.some((result) => result.won || result.lost);

    playerResults.forEach((result) => {
      if (hasWinnerOrLoser) {
        if (result.won) deltas[result.player.id] += 70;
        if (result.lost) deltas[result.player.id] -= 70;
        return;
      }
      deltas[result.player.id] -= result.roundedPoints;
    });
  }

  scoreBonuses(declarerCards, defenderCards) {
    let delta = 0;
    const declarerHas = bonusSet(declarerCards);
    const defendersHave = bonusSet(defenderCards);
    if (declarerHas.trula) delta += 10;
    if (defendersHave.trula) delta -= 10;
    if (declarerHas.kings) delta += 10;
    if (defendersHave.kings) delta -= 10;

    delta += this.scoreUltimoBonuses();
    return delta;
  }

  scoreUltimoBonuses() {
    if (!this.game.lastTrick) return 0;
    const plays = this.game.lastTrick.plays.filter((play) => !play.talonGift);
    const winnerId = this.game.lastTrick.winnerId;
    let delta = 0;

    const pagatPlay = plays.find((play) => play.card.id === "T1");
    if (pagatPlay) {
      const attemptedByDeclarerSide = this.isDeclarerSide(pagatPlay.playerId);
      const succeeded = winnerId === pagatPlay.playerId;
      delta += this.sideBonusDelta(attemptedByDeclarerSide, succeeded, 25);
    }

    const kingPlay = this.game.calledKing
      ? plays.find((play) => play.card.id === this.game.calledKing.id)
      : null;
    if (kingPlay) {
      const attemptedByDeclarerSide = this.isDeclarerSide(kingPlay.playerId);
      const succeeded = attemptedByDeclarerSide === this.isDeclarerSide(winnerId);
      delta += this.sideBonusDelta(attemptedByDeclarerSide, succeeded, 10);
    }

    return delta;
  }

  sideBonusDelta(attemptedByDeclarerSide, succeeded, value) {
    if (attemptedByDeclarerSide) return succeeded ? value : -value;
    return succeeded ? -value : value;
  }

  getOpponentPile() {
    const opponent = this.activePlayers().find((player) => !this.isDeclarerSide(player.id));
    return opponent ? opponent.taken : this.players[this.game.declarer].taken;
  }

  rejectedTalonForDefenders() {
    if (!this.game.contract) return [];
    if (this.game.contract.id === "klop") return [];
    if (this.game.contract.mode === "beggar" || this.game.contract.mode === "piccolo") return [];
    return this.game.talonRejected || [];
  }

  applyTeamDelta(deltas, team, delta) {
    team.forEach((player) => {
      deltas[player.id] += delta;
    });
  }

  turnOrder(start) {
    const order = [];
    let current = start;
    for (let i = 0; i < this.playerCount; i += 1) {
      order.push(current);
      current = this.nextActive(current);
    }
    return order;
  }

  turnDistance(start, target) {
    return this.turnOrder(start).indexOf(target);
  }

  hasHigherBidPriority(playerId, otherPlayerId) {
    return this.turnDistance(this.game.forehand, playerId) < this.turnDistance(this.game.forehand, otherPlayerId);
  }

  updateHumanWait() {
    if (this.game) this.game.waitingForHuman = this.isWaitingForHuman();
  }

  log(key, vars = {}) {
    const item = { key: `log.${key}`, vars };
    this.game.log.unshift(item);
    this.sessionLog.unshift(item);
  }
}
