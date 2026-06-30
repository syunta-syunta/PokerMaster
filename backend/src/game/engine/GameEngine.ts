// backend/src/game/engine/GameEngine.ts

import { v4 as uuidv4 } from 'uuid';
import {
  TablePlayer, PlayerAction, Street, GameSnapshot,
  HandResultEvent, PublicPlayerState, Card, BettingContext,
} from '../types/game.types';
import { Deck } from '../core/Deck';
import { handEvaluator } from '../core/HandEvaluator';
import { GameTable } from './GameTable';
import { BettingRound } from './BettingRound';
import { PotManager } from './PotManager';
import { dealHoleCards, resetStreetBet } from './TablePlayer';

export abstract class GameEngine {
  protected table: GameTable;
  protected potManager: PotManager;
  protected deck: Deck;
  protected communityCards: Card[] = [];
  protected currentHandId: string = '';
  protected currentStreet: Street = 'preflop';
  /** 現在のハンドでプリフロップアグレッサーのプレイヤーID（レイズなしの場合はBB） */
  protected preflopAggressorId: string | null = null;
  /** 現在のハンドでプリフロップに発生したレイズの回数（0=RFI, 1=vsOpen, 2=vs3Bet, 3+=vs4Bet） */
  protected preflopRaiseCount: number = 0;
  /**
   * 進行中のベッティングラウンド（ラウンド完了後はnull）。
   * potManagerはラウンド完了後にしか更新されないため、ラウンド進行中の
   * 正確なポット額（現在のストリートで集まった額を含む）を取得するために公開する。
   */
  protected currentBettingRound: BettingRound | null = null;

  constructor(table: GameTable) {
    this.table = table;
    this.potManager = new PotManager();
    this.deck = new Deck();
  }

  // ─── 抽象メソッド（Socket.IO実装で上書き） ──────────

  /**
   * プレイヤーのアクションを待機して返す。
   * Phase 3Bのテストでは事前にキューに詰めたアクションを返す実装を使う。
   * Phase 3Dでは Socket.IO のイベントを待機する実装に差し替える。
   */
  protected abstract requestAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction>;

  /**
   * 全プレイヤーにゲームスナップショットを送る。
   * テストでは記録するだけ、Socket.IOでは emit する。
   */
  protected abstract broadcastSnapshot(street: Street): Promise<void>;

  /**
   * ハンド結果を全プレイヤーに送る。
   */
  protected abstract broadcastHandResult(result: HandResultEvent): Promise<void>;

  // ─── ハンド進行 ────────────────────────────────────

  /** 1ハンドを実行する */
  async playHand(): Promise<HandResultEvent> {
    this.currentHandId = uuidv4();
    this.communityCards = [];
    this.deck.reset();
    this.potManager.reset();

    // ポジション割り当て
    this.table.setupForNewHand();

    // ブラインドをポスト
    this.postBlinds();

    // プリフロップアグレッサー追跡をリセット（デフォルトはBB = 誰もレイズしなかった場合の挙動）
    this.preflopAggressorId = this.table.getBBPlayer().id;
    this.preflopRaiseCount = 0;

    // ホールカードをディール
    this.dealHoleCards();

    await this.broadcastSnapshot('preflop');

    // プリフロップ
    const foldedPreflop = await this.runBettingRound('preflop', true);
    if (foldedPreflop) return await this.handleAllFolded();

    // フロップ
    this.dealCommunityCards(3);
    await this.broadcastSnapshot('flop');
    const foldedFlop = await this.runBettingRound('flop', false);
    if (foldedFlop) return await this.handleAllFolded();

    // ターン
    this.dealCommunityCards(1);
    await this.broadcastSnapshot('turn');
    const foldedTurn = await this.runBettingRound('turn', false);
    if (foldedTurn) return await this.handleAllFolded();

    // リバー
    this.dealCommunityCards(1);
    await this.broadcastSnapshot('river');
    const foldedRiver = await this.runBettingRound('river', false);
    if (foldedRiver) return await this.handleAllFolded();

    // ショーダウン
    return this.runShowdown();
  }

  // ─── Private ────────────────────────────────────────

  private postBlinds(): void {
    const sb = this.table.getSBPlayer();
    const bb = this.table.getBBPlayer();

    const [updatedSB] = this.betForPlayer(sb, this.table.config.smallBlind);
    this.table.updatePlayer(updatedSB);

    const [updatedBB] = this.betForPlayer(bb, this.table.config.bigBlind);
    this.table.updatePlayer(updatedBB);
  }

  private dealHoleCards(): void {
    this.table.getAllPlayers()
      .filter(p => p.status === 'active' || p.status === 'all-in')
      .forEach(p => {
        const cards = this.deck.dealMany(2) as [Card, Card];
        this.table.updatePlayer(dealHoleCards(p, cards));
      });
  }

  private dealCommunityCards(count: number): void {
    const cards = this.deck.dealMany(count);
    this.communityCards.push(...cards);
  }

  private betForPlayer(
    player: TablePlayer,
    amount: number,
  ): [TablePlayer, number] {
    const actual = Math.min(amount, player.stack);
    const updated: TablePlayer = {
      ...player,
      stack: player.stack - actual,
      betThisStreet: player.betThisStreet + actual,
      totalBetThisHand: player.totalBetThisHand + actual,
      status: player.stack - actual <= 0 ? 'all-in' : player.status,
    };
    return [updated, actual];
  }

  private async runBettingRound(
    street: Street,
    isPreflop: boolean,
  ): Promise<boolean> {
    // ストリート開始時に betThisStreet をリセット（プリフロップはブラインド分があるためスキップ）
    if (!isPreflop) {
      this.table.getAllPlayers().forEach(p => {
        this.table.updatePlayer(resetStreetBet(p));
      });
    }

    const activePlayers = this.table.getActivePlayers();
    if (activePlayers.length <= 1) return false; // ベッティング不要

    const initialBet = isPreflop ? this.table.config.bigBlind : 0;

    const round = new BettingRound(
      this.table.getPlayersInActionOrder(isPreflop),
      {
        bigBlind: this.table.config.bigBlind,
        street: street as 'preflop' | 'flop' | 'turn' | 'river',
        bbHasOption: isPreflop,
        onAggression: isPreflop
          ? (playerId: string) => {
              this.preflopAggressorId = playerId;
              this.preflopRaiseCount++;
            }
          : undefined,
      },
      initialBet,
    );
    this.currentBettingRound = round;

    while (!round.isOver()) {
      const nextId = round.getNextActingPlayerId();
      if (!nextId) break;

      const context = round.getBettingContext(nextId);
      const action = await this.requestAction(nextId, context);
      const result = round.applyAction(action);

      if (!result.valid) {
        // 無効なアクションはフォールドとして扱う
        round.applyAction({ type: 'fold', playerId: nextId, timestamp: Date.now() });
      }
    }

    // 結果をtableに反映
    round.getPlayers().forEach(p => this.table.updatePlayer(p));
    this.currentBettingRound = null;

    // ポット計算
    this.potManager.calculatePots(this.table.getAllPlayers());

    // フォールドで1人になったか確認
    const inHand = this.table.getPlayersInHand();
    return inHand.length <= 1;
  }

  private async runShowdown(): Promise<HandResultEvent> {
    this.currentStreet = 'showdown';
    await this.broadcastSnapshot('showdown');

    const playersInHand = this.table.getPlayersInHand();
    const winnerInfo = handEvaluator.findWinners(
      playersInHand.map(p => ({
        id: p.id,
        holeCards: p.holeCards as [Card, Card],
      })),
      this.communityCards,
    );

    const distribution = this.potManager.distributePots(
      [winnerInfo],
      this.table.getAllPlayers(),
    );

    // スタックに還元
    distribution.forEach(({ playerId, amount }) => {
      const p = this.table.getPlayer(playerId);
      this.table.updatePlayer({ ...p, stack: p.stack + amount });
    });

    const result: HandResultEvent = {
      winners: [winnerInfo],
      potDistribution: distribution,
      playerHands: playersInHand.map(p => ({
        playerId: p.id,
        holeCards: p.holeCards as [Card, Card],
        handResult: handEvaluator.evaluate(
          p.holeCards as [Card, Card],
          this.communityCards,
        ),
      })),
    };

    await this.broadcastHandResult(result);
    this.table.advanceDealer();
    return result;
  }

  private async handleAllFolded(): Promise<HandResultEvent> {
    const lastPlayer = this.table.getPlayersInHand()[0];
    const distribution = this.potManager.distributePots(
      [{ playerIds: [lastPlayer.id], handResult: null as unknown as HandResultEvent['playerHands'][0]['handResult'] }],
      this.table.getAllPlayers(),
    );

    distribution.forEach(({ playerId, amount }) => {
      const p = this.table.getPlayer(playerId);
      this.table.updatePlayer({ ...p, stack: p.stack + amount });
    });

    const result: HandResultEvent = {
      winners: [{ playerIds: [lastPlayer.id], handResult: null as unknown as HandResultEvent['playerHands'][0]['handResult'] }],
      potDistribution: distribution,
      playerHands: [],
    };

    await this.broadcastHandResult(result);
    this.table.advanceDealer();
    return result;
  }

  // ─── スナップショット生成（Socket.IO実装から呼ばれる） ──

  buildSnapshot(forPlayerId: string): GameSnapshot {
    const players = this.table.getAllPlayers();
    return {
      handId: this.currentHandId,
      street: this.currentStreet,
      communityCards: this.communityCards,
      pots: this.potManager.getPots(),
      totalPot: this.potManager.getTotalPot(),
      currentBet: 0, // BettingRoundから取得するか外部セット
      minRaiseTotal: this.table.config.bigBlind * 2,
      activePlayerId: null,
      timeLimit: this.table.config.actionTimeoutSeconds,
      players: players.map(p => this.toPublicState(p, this.currentStreet === 'showdown')),
      myHoleCards: players.find(p => p.id === forPlayerId)?.holeCards ?? null,
      dealerSeatIndex: this.table.getDealerSeatIndex(),
    };
  }

  private toPublicState(p: TablePlayer, isShowdown: boolean): PublicPlayerState {
    return {
      id: p.id,
      name: p.name,
      stack: p.stack,
      betThisStreet: p.betThisStreet,
      status: p.status,
      seatIndex: p.seatIndex,
      positionName: p.positionName,
      isDealer: p.isDealer,
      isSB: p.isSB,
      isBB: p.isBB,
      holeCards: isShowdown ? p.holeCards ?? undefined : undefined,
    };
  }
}
