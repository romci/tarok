import { canDiscard } from "./rules.js";
import { chooseAnnouncement as chooseStrategicAnnouncement } from "./ai/announcements.js";
import { chooseBestBid } from "./ai/bid.js";
import { chooseCalledKing as chooseStrategicCalledKing } from "./ai/kingCall.js";
import { chooseCard as chooseStrategicCard } from "./ai/play/universal.js";
import { chooseDiscard as chooseStrategicDiscard, chooseTalonGroup as chooseStrategicTalonGroup } from "./ai/talon.js";

export const AI_LEVELS = ["easy", "medium", "hard"];

export class SeatController {
  constructor(playerId) {
    this.playerId = playerId;
  }

  chooseBid() {
    return null;
  }

  chooseTalonGroup() {
    return 0;
  }

  chooseCalledKing() {
    return null;
  }

  chooseDiscard(player, count) {
    return player.hand.filter(canDiscard).slice(0, count);
  }

  chooseCard(game, legalCards) {
    return legalCards[0];
  }

  /** @returns {{ type: "pass" } | { type: "gameDouble" } | { type: "announce", bonus: string }} */
  chooseAnnouncement(game, player) {
    return { type: "pass" };
  }
}

export class HumanController extends SeatController {
  constructor(playerId) {
    super(playerId);
    this.assistant = new LocalAIController(playerId, "medium");
  }

  chooseBid(game, player) {
    return this.assistant.chooseBid(game, player);
  }

  chooseTalonGroup(game, player, groups) {
    return this.assistant.chooseTalonGroup(game, player, groups);
  }

  chooseCalledKing(tarokGame, player) {
    return this.assistant.chooseCalledKing(tarokGame, player);
  }

  chooseDiscard(game, player, count) {
    return this.assistant.chooseDiscard(game, player, count);
  }

  chooseCard() {
    return null;
  }

  chooseAnnouncement() {
    return null;
  }
}

export class LocalAIController extends SeatController {
  constructor(playerId, level = "medium") {
    super(playerId);
    this.level = AI_LEVELS.includes(level) ? level : "medium";
  }

  chooseBid(game, player) {
    return chooseBestBid(game, player, this.level);
  }

  chooseTalonGroup(game, player, groups) {
    return chooseStrategicTalonGroup(game, player, groups, this.level);
  }

  chooseCalledKing(tarokGame, player) {
    return chooseStrategicCalledKing(tarokGame, player, this.level);
  }

  chooseDiscard(game, player, count) {
    return chooseStrategicDiscard(game, player, count, this.level);
  }

  chooseCard(game, legalCards, player) {
    return chooseStrategicCard(game, player, legalCards, this.level);
  }

  chooseAnnouncement(game, player) {
    return chooseStrategicAnnouncement(game, player, this.level);
  }
}

export class NetworkSeatController extends SeatController {
  constructor(playerId, transport) {
    super(playerId);
    this.transport = transport;
  }

  chooseCard() {
    throw new Error("Network seat transport is not connected yet.");
  }
}
