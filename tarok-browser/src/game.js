import { HumanController, LocalAIController } from "./ai.js";
import {
  CONTRACTS,
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
      human: index === this.humanId
    }));
    this.controllers = this.players.map((player) => (
      player.human ? new HumanController(player.id) : new LocalAIController(player.id, this.aiLevel)
    ));
    this.dealer = this.playerCount - 1;
    this.scores = [0, 0, 0, 0];
    this.handNumber = 0;
    this.startHand();
  }

  startHand() {
    this.handNumber += 1;
    this.dealer = this.nextActive(this.dealer);
    this.game = {
      phase: "ready",
      handNumber: this.handNumber,
      playerCount: this.playerCount,
      dealer: this.dealer,
      forehand: this.nextActive(this.dealer),
      activePlayer: null,
      talon: [],
      talonRejected: [],
      contract: null,
      declarer: null,
      partner: null,
      calledKing: null,
      calledKingInTalon: false,
      currentTrick: [],
      trickNumber: 0,
      leader: null,
      log: [],
      capturedMondPenalty: [],
      handDone: false,
      summary: null,
      waitingForHuman: false
    };

    for (const player of this.activePlayers()) {
      player.hand = [];
      player.taken = [];
      player.tricks = 0;
      player.bid = null;
    }

    this.deal();
    this.bid();
    this.callKing();
    this.exchangeTalon();
    this.game.leader = this.firstLeader();
    this.game.activePlayer = this.game.leader;
    this.game.phase = "play";
    this.log("deal", {
      dealerId: this.game.dealer,
      hand: this.game.handNumber,
      declarerId: this.game.declarer,
      contractId: this.game.contract.id
    });
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
    while (steps < limit && !this.game.handDone && !this.isHumanTurn()) {
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
    this.autoplayTurnLimit();
    return true;
  }

  legalCardsFor(playerId) {
    const player = this.players[playerId];
    if (!player || !this.game || this.game.phase !== "play") return [];
    return legalCards(player.hand, this.game.currentTrick, this.game.contract);
  }

  isHumanTurn() {
    return this.game && this.game.phase === "play" && !this.game.handDone && this.game.activePlayer === this.humanId;
  }

  isDeclarerSide(playerId) {
    if (!this.game || this.game.contract.id === "klop") return false;
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
  }

  bid() {
    const bids = this.activePlayers().map((player) => {
      const bidContract = this.controllers[player.id].chooseBid(this.game, player);
      player.bid = bidContract;
      return { playerId: player.id, contract: bidContract };
    }).filter((entry) => entry.contract);

    if (!bids.length) {
      this.game.contract = CONTRACTS.klop;
      this.game.declarer = this.game.forehand;
      return;
    }

    bids.sort((a, b) => {
      if (a.contract.rank !== b.contract.rank) return b.contract.rank - a.contract.rank;
      return this.turnDistance(this.game.forehand, a.playerId) - this.turnDistance(this.game.forehand, b.playerId);
    });
    this.game.declarer = bids[0].playerId;
    this.game.contract = this.adaptContractForPlayers(bids[0].contract);
  }

  adaptContractForPlayers(contract) {
    if (this.playerCount === 3 && contract.callsKing) {
      return { ...contract, callsKing: false, solo: true };
    }
    return contract;
  }

  callKing() {
    const contract = this.game.contract;
    if (!contract.callsKing || this.playerCount !== 4) {
      this.game.partner = null;
      return;
    }

    const declarer = this.players[this.game.declarer];
    const kingCards = createDeck().filter((card) => card.rank === "K");
    const preferred = kingCards
      .map((king) => ({
        king,
        held: declarer.hand.some((card) => card.id === king.id),
        suitCount: declarer.hand.filter((card) => card.suit === king.suit).length
      }))
      .sort((a, b) => Number(a.held) - Number(b.held) || a.suitCount - b.suitCount);

    this.game.calledKing = preferred[0].king;
    const holder = this.activePlayers().find((player) => player.hand.some((card) => card.id === this.game.calledKing.id));
    this.game.partner = holder ? holder.id : null;
    this.game.calledKingInTalon = !holder && this.game.talon.some((card) => card.id === this.game.calledKing.id);
  }

  exchangeTalon() {
    const count = this.game.contract.talonTake;
    if (!count) {
      this.game.talonRejected = this.game.contract.id === "klop" ? [...this.game.talon] : [];
      return;
    }

    const declarer = this.players[this.game.declarer];
    const groups = [];
    for (let i = 0; i < this.game.talon.length; i += count) {
      groups.push(this.game.talon.slice(i, i + count));
    }
    const choice = this.controllers[declarer.id].chooseTalonGroup(this.game, declarer, groups);
    const taken = groups[choice] || groups[0];
    const rejected = groups.flatMap((group, index) => (index === choice ? [] : group));
    declarer.hand.push(...taken);
    sortHand(declarer.hand);

    const discards = this.controllers[declarer.id]
      .chooseDiscard(this.game, declarer, count)
      .filter((card) => canDiscard(card))
      .slice(0, count);
    discards.forEach((discard) => removeCard(declarer.hand, discard.id));
    declarer.taken.push(...discards);
    this.game.talon = taken;
    this.game.talonRejected = rejected;
    if (this.game.contract.mode === "positive") {
      this.getOpponentPile().push(...rejected);
    }
  }

  firstLeader() {
    if (["beggar", "soloWithout"].includes(this.game.contract.id)) return this.game.declarer;
    return this.game.forehand;
  }

  playCard(playerId, cardId) {
    const player = this.players[playerId];
    const legal = this.legalCardsFor(playerId);
    const card = legal.find((candidate) => candidate.id === cardId);
    if (!card) return false;

    removeCard(player.hand, card.id);
    this.game.currentTrick.push({ playerId, card });
    this.log("play", { playerId, card });

    if (this.game.currentTrick.length === this.playerCount) {
      this.finishTrick();
    } else {
      this.game.activePlayer = this.nextActive(this.game.activePlayer);
      this.updateHumanWait();
    }
    return true;
  }

  finishTrick() {
    const winnerId = trickWinner(this.game.currentTrick);
    const winner = this.players[winnerId];
    const cards = this.game.currentTrick.map((play) => play.card);
    winner.taken.push(...cards);
    winner.tricks += 1;

    const mondPlay = this.game.currentTrick.find((play) => play.card.id === "T21");
    const skisPlay = this.game.currentTrick.find((play) => play.card.id === "T22");
    if (mondPlay && skisPlay && this.game.contract.mode === "positive") {
      this.game.capturedMondPenalty.push(mondPlay.playerId);
    }

    this.log("winTrick", { playerId: winnerId, trick: this.game.trickNumber + 1 });
    this.game.trickNumber += 1;
    this.game.leader = winnerId;
    this.game.activePlayer = winnerId;
    this.game.currentTrick = [];

    if (this.activePlayers().every((player) => player.hand.length === 0)) {
      this.scoreHand();
      this.game.handDone = true;
      this.game.phase = "done";
      this.game.waitingForHuman = false;
    } else {
      this.updateHumanWait();
    }
  }

  scoreHand() {
    const deltas = [0, 0, 0, 0];
    const declarerSide = this.activePlayers().filter((player) => this.isDeclarerSide(player.id));
    const defenders = this.activePlayers().filter((player) => !this.isDeclarerSide(player.id));
    const declarerCards = declarerSide.flatMap((player) => player.taken);
    const defenderCards = defenders.flatMap((player) => player.taken);
    const declarerPoints = countTarokPoints(declarerCards);
    const defenderPoints = countTarokPoints(defenderCards);
    const allTricks = declarerSide.reduce((sum, player) => sum + player.tricks, 0);

    if (this.game.contract.id === "klop") {
      this.activePlayers().forEach((player) => {
        const points = round5(countTarokPoints(player.taken));
        deltas[player.id] += player.tricks === 0 ? 70 : -points;
      });
      this.game.summary = { key: "log.klopSummary" };
    } else if (this.game.contract.mode === "beggar") {
      const success = this.players[this.game.declarer].tricks === 0;
      const delta = success ? this.game.contract.base : -this.game.contract.base;
      deltas[this.game.declarer] += delta;
      this.game.summary = { key: "log.beggarSummary", vars: { declarerId: this.game.declarer, result: success ? "made" : "failed", delta } };
    } else {
      const success = declarerPoints >= 36;
      const difference = round5(Math.abs(declarerPoints - 35));
      let gameValue = this.game.contract.base + (NORMAL_CONTRACT_IDS.has(this.game.contract.id) ? difference : 0);
      if (allTricks === this.maxTricks()) {
        gameValue = 250;
        this.game.summary = { key: "log.valatSummary" };
      } else {
        this.game.summary = {
          key: "log.pointsSummary",
          vars: { declarerId: this.game.declarer, declarerPoints: formatPoints(declarerPoints), defenderPoints: formatPoints(defenderPoints) }
        };
      }
      this.applyTeamDelta(deltas, declarerSide, success ? gameValue : -gameValue);

      if (!this.game.contract.noBonuses && allTricks !== this.maxTricks()) {
        this.applyTeamDelta(deltas, declarerSide, this.scoreBonuses(declarerCards, defenderCards));
      }
    }

    for (const playerId of this.game.capturedMondPenalty) {
      deltas[playerId] -= this.playerCount === 3 ? 21 : 20;
    }

    deltas.forEach((delta, index) => {
      this.scores[index] += delta;
    });
    this.log(this.game.summary.key, this.game.summary.vars || {});
    this.log("scoreChange", {
      entries: this.activePlayers().map((player) => ({ playerId: player.id, delta: signed(deltas[player.id]) }))
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

    const lastWinner = this.players[this.game.leader];
    const lastTrickCards = lastWinner ? lastWinner.taken.slice(-this.playerCount) : [];
    if (lastTrickCards.some((card) => card.id === "T1")) {
      delta += this.isDeclarerSide(this.game.leader) ? 25 : -25;
    }
    if (this.game.calledKing && lastTrickCards.some((card) => card.id === this.game.calledKing.id)) {
      delta += this.isDeclarerSide(this.game.leader) ? 10 : -10;
    }
    return delta;
  }

  getOpponentPile() {
    const opponent = this.activePlayers().find((player) => !this.isDeclarerSide(player.id));
    return opponent ? opponent.taken : this.players[this.game.declarer].taken;
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

  updateHumanWait() {
    if (this.game) this.game.waitingForHuman = this.isHumanTurn();
  }

  log(key, vars = {}) {
    this.game.log.unshift({ key: `log.${key}`, vars });
  }
}
