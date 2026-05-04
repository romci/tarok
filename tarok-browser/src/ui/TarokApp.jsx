import { Brain, Gauge, Languages, Pause, Play, Plus, StepForward, Users } from "lucide-react";
import { MotionConfig, LayoutGroup, motion } from "motion/react";
import { useEffect, useReducer, useRef, useState } from "react";
import { TarokGame } from "../game.js";
import { I18n, LANGUAGES } from "../i18n.js";
import { canDiscard, cardLabel } from "../rules.js";
import { Card, CardButton } from "./Card.jsx";
import {
  contractName,
  contractStatus,
  formatLog,
  isHiddenTalonContract,
  phaseName,
  playerName,
  roleFor,
  seatMeta,
  seatPosition
} from "./formatters.js";

const DEFAULT_SETTINGS = {
  playerCount: "4",
  aiLevel: "medium",
  language: "sl",
  speed: "1050"
};

export function TarokApp() {
  const [, refresh] = useReducer((value) => value + 1, 0);
  const gameRef = useRef(null);
  const i18nRef = useRef(null);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const autoRunningRef = useRef(false);
  const autoTimerRef = useRef(null);
  const autoKickRef = useRef(null);
  const trickCollectKickRef = useRef(null);
  const autoHoldUntilRef = useRef(0);
  const runAutoTickRef = useRef(() => {});
  const scheduleAutoTickRef = useRef(() => {});
  const scheduleTrickCollectionRef = useRef(() => {});
  const executeTransitionRef = useRef((action) => action());

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [autoRunning, setAutoRunning] = useState(false);

  if (!gameRef.current) {
    gameRef.current = new TarokGame({
      playerCount: DEFAULT_SETTINGS.playerCount,
      aiLevel: DEFAULT_SETTINGS.aiLevel
    });
  }
  if (!i18nRef.current) {
    i18nRef.current = new I18n(DEFAULT_SETTINGS.language);
    i18nRef.current.setLanguage(DEFAULT_SETTINGS.language);
  }

  const model = gameRef.current;
  const i18n = i18nRef.current;
  const t = i18n.t.bind(i18n);

  useEffect(() => {
    settingsRef.current = settings;
    i18nRef.current.setLanguage(settings.language);
    document.documentElement.style.setProperty("--pace-ms", `${Number(settings.speed)}ms`);
    document.title = i18nRef.current.t("ui.title");
  }, [settings]);

  useEffect(() => {
    if (!autoTimerRef.current) return;
    clearInterval(autoTimerRef.current);
    autoTimerRef.current = setInterval(() => runAutoTickRef.current(), Number(settings.speed));
  }, [settings.speed]);

  useEffect(() => () => {
    clearAutoTimers();
    clearTrickCollection();
  }, []);

  function forceRender() {
    refresh();
  }

  function setSetting(name, value) {
    const nextSettings = { ...settingsRef.current, [name]: value };
    settingsRef.current = nextSettings;
    setSettings(nextSettings);

    if (name === "playerCount") {
      stopAuto();
      clearTrickCollection();
      gameRef.current.startSession({ playerCount: value, aiLevel: nextSettings.aiLevel });
      forceRender();
      return;
    }

    if (name === "aiLevel") {
      gameRef.current.setAiLevel(value);
      forceRender();
    }
  }

  function clearAutoTimers() {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    if (autoKickRef.current) clearTimeout(autoKickRef.current);
    autoTimerRef.current = null;
    autoKickRef.current = null;
  }

  function clearTrickCollection() {
    if (trickCollectKickRef.current) clearTimeout(trickCollectKickRef.current);
    trickCollectKickRef.current = null;
  }

  function stopAuto() {
    clearAutoTimers();
    autoRunningRef.current = false;
    setAutoRunning(false);
  }

  function startAuto() {
    if (autoTimerRef.current) return;
    autoRunningRef.current = true;
    setAutoRunning(true);
    autoTimerRef.current = setInterval(() => runAutoTickRef.current(), Number(settingsRef.current.speed));
    runAutoTickRef.current();
  }

  function toggleAuto() {
    if (autoRunningRef.current) {
      stopAuto();
      return;
    }
    startAuto();
  }

  function holdAutoForAnimation() {
    const animation = gameRef.current.game.animation;
    if (!animation) return;
    const pace = Number(settingsRef.current.speed);
    const multiplier = animation.type === "collect" ? 2.2 : animation.type === "play" ? 1.25 : 0.45;
    autoHoldUntilRef.current = Math.max(autoHoldUntilRef.current, Date.now() + pace * multiplier);
  }

  function executeTransition(action) {
    const result = action();
    holdAutoForAnimation();
    forceRender();
    window.setTimeout(() => scheduleTrickCollectionRef.current(), 0);
    return result;
  }

  function runAutoTick() {
    if (Date.now() < autoHoldUntilRef.current) {
      scheduleAutoTickRef.current();
      return;
    }
    const game = gameRef.current;
    if (game.isWaitingForHuman()) return;
    if (game.game.handDone) {
      game.startHand();
      holdAutoForAnimation();
      forceRender();
      return;
    }
    executeTransitionRef.current(() => game.step());
  }

  function scheduleAutoTick(delay = 80) {
    if (!autoRunningRef.current || autoKickRef.current) return;
    const hold = Math.max(0, autoHoldUntilRef.current - Date.now());
    autoKickRef.current = window.setTimeout(() => {
      autoKickRef.current = null;
      runAutoTickRef.current();
    }, Math.max(delay, hold + 60));
  }

  function scheduleTrickCollection() {
    const game = gameRef.current;
    if (game.game.phase !== "trickComplete" || trickCollectKickRef.current) return;
    const hold = Math.max(0, autoHoldUntilRef.current - Date.now());
    trickCollectKickRef.current = window.setTimeout(() => {
      trickCollectKickRef.current = null;
      if (gameRef.current.game.phase === "trickComplete") {
        executeTransitionRef.current(() => gameRef.current.step());
        scheduleAutoTickRef.current();
      }
    }, hold + 80);
  }

  runAutoTickRef.current = runAutoTick;
  scheduleAutoTickRef.current = scheduleAutoTick;
  scheduleTrickCollectionRef.current = scheduleTrickCollection;
  executeTransitionRef.current = executeTransition;

  function handleNewHand() {
    clearTrickCollection();
    model.startHand();
    holdAutoForAnimation();
    forceRender();
    if (autoRunningRef.current) {
      scheduleAutoTick();
    } else {
      startAuto();
    }
  }

  function handleStep() {
    if (model.game.handDone) {
      model.startHand();
      holdAutoForAnimation();
      forceRender();
      return;
    }
    executeTransition(() => {
      if (!model.isWaitingForHuman()) model.step();
    });
  }

  const actions = {
    onAnnouncementAction(choice) {
      executeTransition(() => model.commitHumanAnnouncement(choice));
      scheduleAutoTick();
    },
    onBidClick(contractId) {
      executeTransition(() => model.placeHumanBid(contractId));
      scheduleAutoTick();
    },
    onKingCallClick(cardId) {
      executeTransition(() => model.chooseHumanCalledKing(cardId));
      scheduleAutoTick();
    },
    onCardClick(cardId) {
      executeTransition(() => (
        model.isHumanTalonDiscardTurn()
          ? model.toggleHumanTalonDiscard(cardId)
          : model.playHumanCard(cardId)
      ));
      scheduleAutoTick();
    },
    onTalonGroupClick(groupIndex) {
      executeTransition(() => model.chooseHumanTalonGroup(groupIndex));
    },
    onTalonConfirm() {
      executeTransition(() => model.finishHumanTalonExchange());
      scheduleAutoTick();
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <main className="app-shell">
        <TopBar
          autoRunning={autoRunning}
          onAutoToggle={toggleAuto}
          onNewHand={handleNewHand}
          onSettingChange={setSetting}
          onStep={handleStep}
          settings={settings}
          t={t}
        />
        <ScoreStrip model={model} t={t} />
        <ActionPrompt model={model} t={t} />
        <TarokTable actions={actions} model={model} t={t} />
        <SidePanel model={model} t={t} />
      </main>
    </MotionConfig>
  );
}

function TopBar({ autoRunning, onAutoToggle, onNewHand, onSettingChange, onStep, settings, t }) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <h1>{t("ui.title")}</h1>
        <p>{t("ui.subtitle")}</p>
      </div>
      <div aria-label="Game controls" className="toolbar">
        <IconSelect
          icon={<Users size={15} />}
          id="player-count"
          label={t("ui.seats")}
          onChange={(value) => onSettingChange("playerCount", value)}
          value={settings.playerCount}
        >
          <option value="4">{t("ui.players4")}</option>
          <option value="3">{t("ui.players3")}</option>
        </IconSelect>
        <IconSelect
          icon={<Brain size={15} />}
          id="ai-level"
          label={t("ui.aiLevel")}
          onChange={(value) => onSettingChange("aiLevel", value)}
          value={settings.aiLevel}
        >
          <option value="easy">{t("ai.easy")}</option>
          <option value="medium">{t("ai.medium")}</option>
          <option value="hard">{t("ai.hard")}</option>
        </IconSelect>
        <IconSelect
          icon={<Languages size={15} />}
          id="language"
          label={t("ui.language")}
          onChange={(value) => onSettingChange("language", value)}
          value={settings.language}
        >
          {Object.entries(LANGUAGES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </IconSelect>
        <IconSelect
          icon={<Gauge size={15} />}
          id="speed"
          label={t("ui.speed")}
          onChange={(value) => onSettingChange("speed", value)}
          value={settings.speed}
        >
          <option value="1800">{t("ui.study")}</option>
          <option value="1050">{t("ui.table")}</option>
          <option value="650">{t("ui.fast")}</option>
        </IconSelect>
        <button className="tool-button" onClick={onNewHand} type="button">
          <Plus size={16} />
          <span>{t("ui.newHand")}</span>
        </button>
        <button className="tool-button" onClick={onStep} type="button">
          <StepForward size={16} />
          <span>{t("ui.step")}</span>
        </button>
        <button aria-pressed={autoRunning} className="tool-button" onClick={onAutoToggle} type="button">
          {autoRunning ? <Pause size={16} /> : <Play size={16} />}
          <span>{autoRunning ? t("ui.pause") : t("ui.auto")}</span>
        </button>
      </div>
    </header>
  );
}

function IconSelect({ children, icon, id, label, onChange, value }) {
  return (
    <label className="select-label" htmlFor={id}>
      <span>{icon}{label}</span>
      <select id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {children}
      </select>
    </label>
  );
}

function ScoreStrip({ model, t }) {
  return (
    <section aria-label="Scoreboard" className="score-strip">
      {model.players.map((player) => (
        <motion.article className={`score-card ${player.active ? "" : "off"}`} key={player.id} layout>
          <span>
            <span className="score-name">{playerName(player, t)}</span>
            <span className="score-role">{roleFor(model, player, t)}</span>
            <span className="score-role">{t("ui.radli", { count: player.radli || 0 })}</span>
          </span>
          <span className="score-value">{model.scores[player.id]}</span>
        </motion.article>
      ))}
    </section>
  );
}

function ActionPrompt({ model, t }) {
  return (
    <section aria-live="polite" className="action-prompt">
      {actionText(model, t)}
    </section>
  );
}

function actionText(model, t) {
  const game = model.game;
  if (game.handDone) return t("ui.actionHandDone");
  if (model.isHumanBidTurn()) return t("ui.actionYourBid");
  if (game.phase === "bidding") return t("ui.actionAiBid", { player: playerName(model.players[game.activePlayer], t) });
  if (game.phase === "calling") {
    return model.isHumanCallingTurn()
      ? t("ui.actionYourCalling")
      : t("ui.actionCalling", { player: playerName(model.players[game.activePlayer], t) });
  }
  if (game.phase === "talon") {
    return model.isHumanTalonTurn()
      ? t("ui.actionYourTalon")
      : t("ui.actionTalon", { player: playerName(model.players[game.activePlayer], t) });
  }
  if (game.phase === "announcements") {
    return model.isHumanAnnouncementTurn()
      ? t("ui.actionYourAnnouncements")
      : t("ui.actionAnnouncements", { player: playerName(model.players[game.activePlayer], t) });
  }
  if (game.phase === "trickComplete") return t("ui.actionTrickComplete");
  if (model.isHumanTurn()) return t("ui.actionYourTurn");
  return t("ui.actionAiTurn", { player: playerName(model.players[game.activePlayer], t) });
}

function TarokTable({ actions, model, t }) {
  const animation = model.game.animation;
  const talonStep = model.game.phase === "talon" && model.game.talonExchange?.selectedIndex !== null ? "discard" : "group";
  return (
    <section aria-label="Tarok table" className="table-wrap">
      <LayoutGroup id="tarok-table">
        <motion.div
          className="table-felt"
          data-animation={animation?.type || ""}
          data-phase={model.game.phase}
          data-talon-step={talonStep}
        >
          {model.players.map((player) => (
            <Seat
              key={player.id}
              model={model}
              onCardClick={actions.onCardClick}
              player={player}
              t={t}
              winnerPulse={animation?.type === "collect" && animation.playerId === player.id ? animation.id : ""}
            />
          ))}
          <section aria-label="Current trick and contract" className="center-state">
            <ContractPanel actions={actions} model={model} t={t} />
            <TrickArea model={model} t={t} />
            <TalonPanel actions={actions} model={model} t={t} />
          </section>
        </motion.div>
      </LayoutGroup>
    </section>
  );
}

function Seat({ model, onCardClick, player, t, winnerPulse }) {
  if (!player.active) return null;
  const legalIds = new Set(model.legalCardsFor(player.id).map((card) => card.id));
  const position = seatPosition(player.id);
  const classes = [
    "seat",
    `seat-${position}`,
    model.game.activePlayer === player.id && !model.game.handDone ? "current" : "",
    player.human ? "human-seat" : ""
  ].filter(Boolean).join(" ");

  return (
    <motion.section
      animate={winnerPulse ? { boxShadow: ["0 0 0 rgba(0,0,0,0)", "0 0 0 5px rgba(185,133,47,0.28)", "0 0 0 rgba(0,0,0,0)"] } : {}}
      className={classes}
      id={`seat-${player.id}`}
      transition={{ duration: 1.2 }}
    >
      <div className="seat-head">
        <span className="seat-name">{playerName(player, t)}</span>
        <span className="seat-meta">{seatMeta(model, player, t)}</span>
      </div>
      <HandRow legalIds={legalIds} model={model} onCardClick={onCardClick} player={player} t={t} />
      <TakenRow player={player} t={t} />
    </motion.section>
  );
}

function HandRow({ legalIds, model, onCardClick, player, t }) {
  const openHand = model.game.openHandPlayerId === player.id;
  if (!player.human && !openHand) {
    return (
      <div className="hand-row">
        {player.hand.map((card) => (
          <Card back card={card} key={card.id} size="small" t={t} zone={`hand-${player.id}`} />
        ))}
      </div>
    );
  }

  if (openHand && !player.human) {
    return (
      <div className="hand-row">
        {player.hand.map((card) => (
          <Card card={card} key={card.id} size="small" t={t} zone={`hand-${player.id}`} />
        ))}
      </div>
    );
  }

  const humanTurn = model.isHumanTurn();
  const humanTalonDiscard = player.id === model.humanId && model.isHumanTalonDiscardTurn();
  const exchange = model.game.talonExchange;
  const showDisabled = humanTurn || humanTalonDiscard;

  return (
    <div className="hand-row">
      {player.hand.map((card) => {
        const selected = humanTalonDiscard && exchange.discardIds.includes(card.id);
        const legal = humanTurn ? legalIds.has(card.id) : humanTalonDiscard && canDiscard(card);
        const state = [
          legal ? "is-playable" : "",
          showDisabled && !legal ? "is-disabled" : "",
          selected ? "is-selected-discard" : ""
        ].filter(Boolean).join(" ");
        return (
          <CardButton
            card={card}
            disabled={!legal}
            key={card.id}
            onClick={() => onCardClick(card.id)}
            state={state}
            t={t}
            zone={`hand-${player.id}`}
          />
        );
      })}
    </div>
  );
}

function TakenRow({ player, t }) {
  const cards = player.taken.slice(-6);
  if (!cards.length) return null;
  return (
    <div className="taken-row">
      <div className="taken-label">{t("ui.takenPile")}</div>
      <div className="taken-cards">
        {cards.map((card) => (
          <Card card={card} key={card.id} size="mini" t={t} zone={`taken-${player.id}`} />
        ))}
      </div>
    </div>
  );
}

function ContractPanel({ actions, model, t }) {
  const game = model.game;
  if (game.phase === "bidding") {
    const current = game.bidding.currentContract ? contractName(game.bidding.currentContract, t) : t("ui.noBidYet");
    const active = model.players[game.activePlayer];
    return (
      <motion.div className="contract-panel" layout>
        <PanelTitle left={t("ui.bidding")} right={t("ui.biddingRound", { round: game.bidding.round })} />
        <p className="contract-detail">
          {t("ui.biddingTurn", { player: playerName(active, t) })}
          {t("ui.highBid", { contract: current })}
        </p>
        {model.isHumanBidTurn() && <BidControls model={model} onBidClick={actions.onBidClick} t={t} />}
      </motion.div>
    );
  }

  if (game.phase === "announcements") {
    const active = model.players[game.activePlayer];
    const multLabel = game.announcementContext?.gameDoubles > 0 ? ` x${2 ** game.announcementContext.gameDoubles}` : "";
    return (
      <motion.div className="contract-panel" layout>
        <PanelTitle left={t("ui.phaseAnnouncements")} right={playerName(active, t)} />
        <p className="contract-detail">{t("ui.announcementsDetail")}{multLabel}</p>
        {model.isHumanAnnouncementTurn() && (
          <AnnouncementControls model={model} onAnnouncementAction={actions.onAnnouncementAction} t={t} />
        )}
      </motion.div>
    );
  }

  const called = game.calledKing
    ? ` ${t("ui.calledKing")}: ${cardLabel(game.calledKing, t)}${game.calledKingInTalon ? ` (${t("ui.inTalon")})` : ""}.`
    : "";
  const partner = game.partnerKnownPublicly === true && game.partner !== null
    ? ` ${t("ui.partner")}: ${playerName(model.players[game.partner], t)}.`
    : game.contract?.solo || game.playerCount === 3
      ? ` ${t("ui.solo")}.`
      : "";
  const summary = game.handDone && game.summary ? ` ${formatLog(game.summary, model, t)}` : "";

  return (
    <motion.div className="contract-panel" layout>
      <PanelTitle left={contractName(game.contract, t)} right={contractStatus(game, t)} />
      <p className="contract-detail">
        {t("ui.declarer")}: {playerName(model.players[game.declarer], t)}.{partner}{called}{summary}
      </p>
      {model.isHumanCallingTurn() && <KingCallControls model={model} onKingCallClick={actions.onKingCallClick} t={t} />}
    </motion.div>
  );
}

function PanelTitle({ left, right }) {
  return (
    <div className="contract-title">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function BidControls({ model, onBidClick, t }) {
  return (
    <div className="bid-controls">
      <button className="bid-button pass" onClick={() => onBidClick(null)} type="button">{t("ui.pass")}</button>
      {model.legalBidContracts().map((contract) => (
        <button className="bid-button" key={contract.id} onClick={() => onBidClick(contract.id)} type="button">
          {contractName(contract, t)}
        </button>
      ))}
    </div>
  );
}

function KingCallControls({ model, onKingCallClick, t }) {
  return (
    <div className="king-call-controls">
      {model.callableKings().map((card) => (
        <button className="king-call-button" key={card.id} onClick={() => onKingCallClick(card.id)} type="button">
          <Card card={card} size="small" state="is-playable" t={t} tracked={false} zone="king-call" />
          <span>{cardLabel(card, t)}</span>
        </button>
      ))}
    </div>
  );
}

function AnnouncementControls({ model, onAnnouncementAction, t }) {
  return (
    <div className="bid-controls announcement-controls">
      {model.legalAnnouncementActions().map((action) => {
        if (action.type === "pass") {
          return (
            <button className="bid-button pass" key="pass" onClick={() => onAnnouncementAction({ type: "pass" })} type="button">
              {t("ui.announcePass")}
            </button>
          );
        }
        if (action.type === "gameDouble") {
          return (
            <button className="bid-button" key="gameDouble" onClick={() => onAnnouncementAction({ type: "gameDouble" })} type="button">
              {t(`announce.step.${action.step}`)}
            </button>
          );
        }
        return (
          <button className="bid-button" key={action.id} onClick={() => onAnnouncementAction({ type: "announce", bonus: action.bonus })} type="button">
            {t(`announce.bonus.${action.bonus}`)}
          </button>
        );
      })}
    </div>
  );
}

function TrickArea({ model, t }) {
  const game = model.game;
  if (game.phase !== "play" && !game.currentTrick.length) {
    return (
      <div className="trick-area">
        <div className="played-card waiting-card">{t("ui.waitingPhase", { phase: phaseName(game.phase, t) })}</div>
      </div>
    );
  }
  if (!game.currentTrick.length) {
    const active = model.players[game.activePlayer];
    return (
      <div className="trick-area">
        <div className="played-card waiting-card">{t("ui.waiting", { player: active ? playerName(active, t) : "" })}</div>
      </div>
    );
  }
  return (
    <div className="trick-area">
      {game.currentTrick.map((play) => (
        <motion.div className={`played-card trick-seat-${seatPosition(play.playerId)}`} key={play.card.id}>
          <Card card={play.card} t={t} zone="trick" />
          <span>{playerName(model.players[play.playerId], t)}</span>
        </motion.div>
      ))}
    </div>
  );
}

function TalonPanel({ actions, model, t }) {
  const game = model.game;
  if (game.phase === "bidding" || game.phase === "calling") {
    return (
      <motion.div className="talon-panel" layout>
        <PanelTitle left="Talon" right={t("ui.hidden")} />
        <p className="contract-detail">{t("ui.talonHidden")}</p>
        <CardRow cards={game.talon} className="talon-cards" t={t} variant="back" />
      </motion.div>
    );
  }

  if (game.phase === "talon") {
    if (model.isHumanTalonTurn() && game.talonExchange) {
      return <HumanTalon actions={actions} model={model} t={t} />;
    }
    return (
      <motion.div className="talon-panel" layout>
        <PanelTitle left="Talon" right={phaseName(game.phase, t)} />
        <p className="contract-detail">{t("ui.talonExchange")} {t("ui.actionAutoAssist")}</p>
        <CardRow cards={game.talon} className="talon-cards" t={t} tracked={false} />
      </motion.div>
    );
  }

  if (game.contract?.id === "klop") {
    return (
      <motion.div className="talon-panel" layout>
        <PanelTitle left="Talon" right={t("ui.hidden")} />
        <p className="contract-detail">{t("ui.talonKlop")}</p>
        <CardRow
          cards={game.talon}
          className="talon-cards"
          t={t}
          tracked={false}
          variant={game.handDone ? "face" : "back"}
        />
      </motion.div>
    );
  }

  if (isHiddenTalonContract(game)) {
    return (
      <motion.div className="talon-panel" layout>
        <PanelTitle left="Talon" right={t("ui.hidden")} />
        <p className="contract-detail">{t("ui.talonHidden")}</p>
        <CardRow cards={game.talon} className="talon-cards" t={t} tracked={false} variant="back" />
      </motion.div>
    );
  }

  return (
    <motion.div className="talon-panel" layout>
      <PanelTitle
        left="Talon"
        right={`${t("ui.talonTaken", { count: game.talonTaken.length })} · ${t("ui.rejected", { count: game.talonRejected.length })}`}
      />
      <p className="contract-detail">{t("ui.talonHelp")}</p>
      <CardRow
        cards={game.talonRejected}
        className="talon-cards"
        t={t}
        tracked={false}
        variant={game.handDone ? "face" : "back"}
      />
    </motion.div>
  );
}

function HumanTalon({ actions, model, t }) {
  const exchange = model.game.talonExchange;
  const count = model.game.contract.talonTake;
  const selectedCount = exchange.discardIds.length;
  const ready = exchange.selectedIndex !== null && selectedCount === count;

  return (
    <motion.div className="talon-panel" layout>
      <PanelTitle
        left="Talon"
        right={exchange.selectedIndex === null
          ? t("ui.talonChooseGroup", { count })
          : t("ui.talonChooseDiscards", { selected: selectedCount, count })}
      />
      <p className="contract-detail">
        {exchange.selectedIndex === null ? t("ui.talonPickPrompt") : t("ui.talonDiscardPrompt")}
      </p>
      {exchange.selectedIndex === null ? (
        <div className="talon-groups">
          {exchange.groups.map((group, index) => (
            <button
              className="talon-group"
              key={index}
              onClick={() => actions.onTalonGroupClick(index)}
              type="button"
            >
              {group.map((card) => <Card card={card} key={card.id} size="small" t={t} tracked={false} zone="talon" />)}
            </button>
          ))}
        </div>
      ) : (
        <div className="talon-summary-groups">
          {exchange.groups.map((group, index) => {
            const selected = index === exchange.selectedIndex;
            return (
              <div className={`talon-summary-group ${selected ? "selected" : "rejected"}`} key={index}>
                {group.map((card) => <Card card={card} key={card.id} size="mini" t={t} tracked={false} zone="talon" />)}
              </div>
            );
          })}
        </div>
      )}
      {exchange.selectedIndex !== null && (
        <button className="talon-confirm" disabled={!ready} onClick={actions.onTalonConfirm} type="button">
          {t("ui.confirmTalon")}
        </button>
      )}
    </motion.div>
  );
}

function CardRow({ cards, className, t, tracked = false, variant = "face" }) {
  return (
    <div className={className}>
      {cards.map((card) => (
        <Card
          back={variant === "back"}
          card={card}
          key={card.id}
          size="small"
          t={t}
          tracked={tracked}
          zone="talon"
        />
      ))}
    </div>
  );
}

function SidePanel({ model, t }) {
  return (
    <aside className="side-panel">
      <section className="panel-section">
        <h2>{t("ui.handLog")}</h2>
        <ol className="log">
          {model.game.log.slice(0, 90).map((item, index) => (
            <li key={`${item.key}-${index}`}>{formatLog(item, model, t)}</li>
          ))}
        </ol>
      </section>
      <section className="panel-section">
        <h2>{t("ui.rulesModel")}</h2>
        <ul className="rule-list">
          {[1, 2, 3, 4, 5].map((index) => <li key={index}>{t(`ui.rules.${index}`)}</li>)}
        </ul>
      </section>
    </aside>
  );
}
