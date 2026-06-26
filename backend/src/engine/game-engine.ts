import { v4 as uuidv4 } from 'uuid';
import {
  Card, GameState, GamePhase, GameAction, Player, PlayerAction,
  PlayerStatus, Pot, WinnerInfo, Position, AIType,
} from '../types';
import { createDeck, shuffleDeck, dealCards } from './deck';
import { awardPots } from './hand-evaluator';

export interface CreateGameOptions {
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  fastFold: boolean;
  players: Array<{ id: string; name: string; aiType: AIType | null }>;
}

const POSITION_NAMES_BY_COUNT: Record<number, Position[]> = {
  2: ['BTN', 'BB'],                           // HU: BTN = SB
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'UTG', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG', 'UTG', 'HJ', 'CO'],
};

export class GameEngine {
  private state: GameState;

  constructor(options: CreateGameOptions) {
    const players = this.initPlayers(options);
    this.state = {
      id: uuidv4(),
      players,
      communityCards: [],
      pots: [],
      pot: 0,
      currentBet: 0,
      phase: 'waiting',
      activePlayerIndex: 0,
      dealerIndex: 0,
      smallBlindIndex: 1,
      bigBlindIndex: 2,
      smallBlind: options.smallBlind,
      bigBlind: options.bigBlind,
      lastRaiseAmount: options.bigBlind,
      handNumber: 0,
      fastFold: options.fastFold,
      actionHistory: [],
      winners: undefined,
    };
  }

  private initPlayers(options: CreateGameOptions): Player[] {
    return options.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      chips: options.startingChips,
      cards: [],
      status: 'waiting' as PlayerStatus,
      currentBet: 0,
      totalBetInHand: 0,
      isDealer: idx === 0,
      isSB: false,
      isBB: false,
      position: idx,
      positionName: null,
      hasActed: false,
      aiType: p.aiType,
      isHuman: p.aiType === null,
    }));
  }

  getState(): GameState {
    return { ...this.state };
  }

  startHand(): GameState {
    const { players } = this.state;
    const activePlayers = players.filter(p => p.chips > 0);
    if (activePlayers.length < 2) {
      throw new Error('Not enough players to start hand');
    }

    // Advance dealer
    this.state.handNumber++;
    this.state.dealerIndex = this.nextActivePlayerIndex(this.state.dealerIndex);
    this.assignPositions();

    // Reset state
    this.state.communityCards = [];
    this.state.pots = [];
    this.state.pot = 0;
    this.state.currentBet = 0;
    this.state.lastRaiseAmount = this.state.bigBlind;
    this.state.actionHistory = [];
    this.state.winners = undefined;

    // Deal deck
    let deck = shuffleDeck(createDeck());
    for (const p of this.state.players) {
      p.cards = [];
      p.currentBet = 0;
      p.totalBetInHand = 0;
      p.hasActed = false;
      p.status = p.chips > 0 ? 'active' : 'waiting';
    }

    // Deal 2 cards per active player
    for (const p of this.state.players) {
      if (p.status === 'active') {
        const { cards, remainingDeck } = dealCards(deck, 2);
        p.cards = cards;
        deck = remainingDeck;
      }
    }
    this.state.phase = 'pre-flop';

    // Post blinds
    this.postBlind(this.state.smallBlindIndex, this.state.smallBlind);
    this.postBlind(this.state.bigBlindIndex, this.state.bigBlind);
    this.state.currentBet = this.state.bigBlind;
    this.state.lastRaiseAmount = this.state.bigBlind;

    // First to act preflop = UTG (left of BB)
    this.state.activePlayerIndex = this.nextActivePlayerIndex(this.state.bigBlindIndex);

    return this.getState();
  }

  private assignPositions(): void {
    const { players, dealerIndex } = this.state;
    const active = players.filter(p => p.chips > 0);
    const n = active.length;
    const posNames = POSITION_NAMES_BY_COUNT[n] ?? POSITION_NAMES_BY_COUNT[6];

    // Reset
    for (const p of players) {
      p.isDealer = false;
      p.isSB = false;
      p.isBB = false;
      p.positionName = null;
    }

    players[dealerIndex].isDealer = true;

    if (n === 2) {
      // HU: dealer is SB/BTN
      this.state.smallBlindIndex = dealerIndex;
      this.state.bigBlindIndex = this.nextActivePlayerIndex(dealerIndex);
      players[this.state.smallBlindIndex].isSB = true;
      players[this.state.bigBlindIndex].isBB = true;
      players[this.state.smallBlindIndex].positionName = 'BTN';
      players[this.state.bigBlindIndex].positionName = 'BB';
    } else {
      this.state.smallBlindIndex = this.nextActivePlayerIndex(dealerIndex);
      this.state.bigBlindIndex = this.nextActivePlayerIndex(this.state.smallBlindIndex);
      players[this.state.smallBlindIndex].isSB = true;
      players[this.state.bigBlindIndex].isBB = true;

      // Assign position names clockwise from BTN
      let idx = dealerIndex;
      for (let i = 0; i < n; i++) {
        players[idx].positionName = posNames[i] ?? null;
        idx = this.nextActivePlayerIndex(idx);
      }
    }
  }

  private postBlind(playerIndex: number, amount: number): void {
    const player = this.state.players[playerIndex];
    const actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.currentBet += actual;
    player.totalBetInHand += actual;
    this.state.pot += actual;
    if (player.chips === 0) player.status = 'all-in';
  }

  processAction(playerId: string, action: GameAction, amount?: number): GameState {
    const playerIdx = this.state.players.findIndex(p => p.id === playerId);
    if (playerIdx !== this.state.activePlayerIndex) {
      throw new Error('Not this player\'s turn');
    }

    const player = this.state.players[playerIdx];
    if (!this.isValidAction(player, action, amount)) {
      throw new Error(`Invalid action: ${action}`);
    }

    const actionRecord: PlayerAction = {
      playerId,
      action,
      amount,
      timestamp: new Date(),
    };
    this.state.actionHistory.push(actionRecord);

    switch (action) {
      case 'fold':
        player.status = 'folded';
        player.hasActed = true;
        break;

      case 'check':
        player.hasActed = true;
        break;

      case 'call': {
        const toCall = Math.min(this.state.currentBet - player.currentBet, player.chips);
        player.chips -= toCall;
        player.currentBet += toCall;
        player.totalBetInHand += toCall;
        this.state.pot += toCall;
        player.hasActed = true;
        if (player.chips === 0) player.status = 'all-in';
        break;
      }

      case 'raise': {
        const raiseAmount = amount ?? this.state.currentBet * 2;
        const raiseTotal = Math.min(raiseAmount, player.chips + player.currentBet);
        const actualRaise = raiseTotal - player.currentBet;
        player.chips -= actualRaise;
        player.currentBet = raiseTotal;
        player.totalBetInHand += actualRaise;
        this.state.pot += actualRaise;
        this.state.lastRaiseAmount = raiseTotal - this.state.currentBet;
        this.state.currentBet = raiseTotal;
        player.hasActed = true;
        if (player.chips === 0) player.status = 'all-in';
        // Reset hasActed for others
        for (const p of this.state.players) {
          if (p.id !== playerId && p.status === 'active') p.hasActed = false;
        }
        break;
      }

      case 'all-in': {
        const allInAmount = player.chips;
        player.totalBetInHand += allInAmount;
        player.currentBet += allInAmount;
        this.state.pot += allInAmount;
        if (player.currentBet > this.state.currentBet) {
          this.state.lastRaiseAmount = player.currentBet - this.state.currentBet;
          this.state.currentBet = player.currentBet;
          for (const p of this.state.players) {
            if (p.id !== playerId && p.status === 'active') p.hasActed = false;
          }
        }
        player.chips = 0;
        player.status = 'all-in';
        player.hasActed = true;
        break;
      }
    }

    // Advance game state
    this.advance();
    return this.getState();
  }

  private advance(): void {
    const activePlayers = this.state.players.filter(p =>
      p.status === 'active' || p.status === 'all-in'
    );
    const foldedOut = activePlayers.filter(p => p.status !== 'folded');

    // Only one player left
    if (foldedOut.filter(p => p.status === 'active' || p.status === 'all-in').length <= 1 &&
        this.state.players.filter(p => p.status === 'active' || p.status === 'all-in').length <= 1) {
      this.endHand();
      return;
    }

    if (this.isBettingRoundComplete()) {
      this.advancePhase();
    } else {
      this.state.activePlayerIndex = this.nextActivePlayerIndex(this.state.activePlayerIndex);
    }
  }

  private isBettingRoundComplete(): boolean {
    const activePlayers = this.state.players.filter(p => p.status === 'active');
    if (activePlayers.length === 0) return true;

    return activePlayers.every(p =>
      p.hasActed && p.currentBet === this.state.currentBet
    );
  }

  private advancePhase(): void {
    const deck = shuffleDeck(createDeck()); // We track deck separately — use remaining deck
    this.resetBettingRound();

    const nextPhase = this.nextPhase(this.state.phase);
    this.state.phase = nextPhase;

    if (nextPhase === 'flop') {
      // Remove 3 community cards from conceptual deck (actual cards managed at deal time)
      this.dealCommunityCards(3);
    } else if (nextPhase === 'turn') {
      this.dealCommunityCards(1);
    } else if (nextPhase === 'river') {
      this.dealCommunityCards(1);
    } else if (nextPhase === 'showdown') {
      this.endHand();
      return;
    }

    // First to act postflop: left of dealer
    const firstActor = this.nextActivePlayerIndex(this.state.dealerIndex);
    this.state.activePlayerIndex = firstActor;

    // If everyone is all-in, fast-forward to showdown
    const canAct = this.state.players.filter(p => p.status === 'active');
    if (canAct.length <= 1) {
      this.advancePhase();
    }
  }

  private dealCommunityCards(count: number): void {
    // Burn 1, deal count — we need the actual remaining deck
    // The deck is tracked in GameState for real deal; here we use a helper
    const deck = this.getRemainingDeck();
    const burn = deck.slice(0, 1);
    const newCards = deck.slice(1, 1 + count);
    this.state.communityCards.push(...newCards);
  }

  // We reconstruct the remaining deck by removing dealt cards
  private getRemainingDeck(): Card[] {
    const dealtIds = new Set<string>();
    for (const p of this.state.players) {
      for (const c of p.cards) dealtIds.add(c.id);
    }
    for (const c of this.state.communityCards) dealtIds.add(c.id);

    // The deck was shuffled at hand start; we stored the full deck order in players' cards
    // Since we don't store full deck, we create a fresh shuffled one minus dealt cards
    const fullDeck = shuffleDeck(createDeck());
    return fullDeck.filter(c => !dealtIds.has(c.id));
  }

  private resetBettingRound(): void {
    this.state.currentBet = 0;
    this.state.lastRaiseAmount = this.state.bigBlind;
    for (const p of this.state.players) {
      p.currentBet = 0;
      p.hasActed = false;
    }
  }

  private nextPhase(phase: GamePhase): GamePhase {
    const order: GamePhase[] = ['pre-flop', 'flop', 'turn', 'river', 'showdown'];
    const idx = order.indexOf(phase);
    return order[idx + 1] ?? 'showdown';
  }

  private nextActivePlayerIndex(fromIndex: number): number {
    const { players } = this.state;
    let idx = (fromIndex + 1) % players.length;
    let attempts = 0;
    while (players[idx].status !== 'active' && attempts < players.length) {
      idx = (idx + 1) % players.length;
      attempts++;
    }
    return idx;
  }

  private endHand(): void {
    this.state.phase = 'showdown';
    this.calculateSidePots();

    const contestants = this.state.players.filter(
      p => p.status === 'active' || p.status === 'all-in'
    );

    // If only 1 contestant, they win without showdown
    if (contestants.length === 1) {
      const winner = contestants[0];
      const totalPot = this.state.pots.reduce((s, p) => s + p.amount, 0);
      winner.chips += totalPot;
      this.state.winners = [{ playerId: winner.id, potAmount: totalPot }];
    } else {
      const winners = awardPots(
        this.state.pots,
        contestants.map(p => ({ id: p.id, cards: p.cards })),
        this.state.communityCards
      );
      for (const w of winners) {
        const player = this.state.players.find(p => p.id === w.playerId);
        if (player) player.chips += w.potAmount;
      }
      this.state.winners = winners;
    }

    this.state.phase = 'ended';
  }

  private calculateSidePots(): void {
    const activePlayers = this.state.players.filter(
      p => p.totalBetInHand > 0 || p.status === 'active' || p.status === 'all-in'
    );

    // Sort by total bet ascending
    const sorted = [...activePlayers].sort((a, b) => a.totalBetInHand - b.totalBetInHand);
    const pots: Pot[] = [];
    let previousLevel = 0;

    for (let i = 0; i < sorted.length; i++) {
      const level = sorted[i].totalBetInHand;
      if (level <= previousLevel) continue;

      const contribution = level - previousLevel;
      const potAmount = contribution * (sorted.length - i);
      const eligible = sorted.slice(i).map(p => p.id);

      // Merge with last pot if eligible set is the same
      const lastPot = pots[pots.length - 1];
      if (lastPot && JSON.stringify(lastPot.eligiblePlayerIds.sort()) === JSON.stringify(eligible.slice().sort())) {
        lastPot.amount += potAmount;
      } else {
        pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
      }

      previousLevel = level;
    }

    this.state.pots = pots;
    this.state.pot = pots.reduce((s, p) => s + p.amount, 0);
  }

  getValidActions(playerId: string): Array<{ action: GameAction; minAmount?: number; maxAmount?: number }> {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.status !== 'active') return [];

    const actions: Array<{ action: GameAction; minAmount?: number; maxAmount?: number }> = [];
    const toCall = this.state.currentBet - player.currentBet;

    // Fold always valid (unless can check)
    if (toCall > 0) {
      actions.push({ action: 'fold' });
    }

    // Check
    if (toCall === 0) {
      actions.push({ action: 'check' });
    }

    // Call
    if (toCall > 0 && toCall < player.chips) {
      actions.push({ action: 'call', minAmount: toCall, maxAmount: toCall });
    }

    // Raise
    const minRaise = this.state.currentBet + this.state.lastRaiseAmount;
    if (player.chips > toCall) {
      actions.push({
        action: 'raise',
        minAmount: Math.min(minRaise, player.chips + player.currentBet),
        maxAmount: player.chips + player.currentBet,
      });
    }

    // All-in (always if chips > 0)
    if (player.chips > 0) {
      actions.push({ action: 'all-in', minAmount: player.chips, maxAmount: player.chips });
    }

    return actions;
  }

  isValidAction(player: Player, action: GameAction, amount?: number): boolean {
    const valid = this.getValidActions(player.id);
    return valid.some(v => v.action === action);
  }

  isHandOver(): boolean {
    return this.state.phase === 'ended';
  }

  getActivePlayer(): Player | null {
    const p = this.state.players[this.state.activePlayerIndex];
    return p?.status === 'active' ? p : null;
  }
}
