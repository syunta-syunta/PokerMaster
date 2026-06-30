// backend/src/game/engine/AIGameEngine.ts
//
// 注: SPEC-phase3d.md のサンプルコードは GtoAiPlayer の想定シグネチャ（Phase 3C SPEC時点の仮）
//     を前提にしていたが、実際の GtoAiPlayer (backend/src/game/ai/GtoAiPlayer.ts) は
//     以下の点でシグネチャが異なっていたため、実装に合わせて調整した:
//       - decidePreflopAction() は PreflopDecisionContext（scenario/raiserPositionを含む）を要求する。
//         シナリオは BettingContext から自動推測せず、GameEngine.preflopRaiseCount から判定する。
//       - decidePostflopAction() は (communityCards, context) の2引数。holeCards は
//         setHoleCards() で事前にセットする必要がある（3引数で直接渡す方式ではない）。
//       - isPFA / isIP はハンドごとに変わるため GtoAiConfig には含まれず、
//         decidePostflopAction() の context に含めて毎回渡す必要がある。
//       - position もディーラーボタン移動に伴い変わるため setPosition() で毎ハンド更新する。
//     これらの調整は backend/src/game/ai/GtoAiPlayer.ts を直接確認した上で行った。

import { Server } from 'socket.io';
import {
  PlayerAction, BettingContext, Street,
  GameSnapshot, HandResultEvent, Card,
} from '../types/game.types';
import { GameEngine } from './GameEngine';
import { GameTable } from './GameTable';
import { GtoAiPlayer, PreflopScenario } from '../ai/GtoAiPlayer';

export class AIGameEngine extends GameEngine {
  private io: Server;
  private roomId: string;
  /** playerId → socketId (人間プレイヤーのみ) */
  private playerSocketMap: Map<string, string>;
  /** playerId → GtoAiPlayer (AI プレイヤーのみ) */
  private aiPlayers: Map<string, GtoAiPlayer>;
  private humanPlayerId: string;
  private aiThinkingDelayMs: number;
  /** 人間プレイヤーのアクションを待つ Promise の resolve 関数 */
  private pendingActionResolver: ((action: PlayerAction) => void) | null = null;
  private actionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    table: GameTable,
    io: Server,
    roomId: string,
    humanPlayerId: string,
    playerSocketMap: Map<string, string>,
    aiPlayers: Map<string, GtoAiPlayer>,
    aiThinkingDelayMs: number = 800,
  ) {
    super(table);
    this.io = io;
    this.roomId = roomId;
    this.humanPlayerId = humanPlayerId;
    this.playerSocketMap = playerSocketMap;
    this.aiPlayers = aiPlayers;
    this.aiThinkingDelayMs = aiThinkingDelayMs;
  }

  // ─── 抽象メソッドの実装 ─────────────────────────────────────────

  /**
   * プレイヤーのアクションを取得する。
   * 人間: Socket.IO イベント待機 (タイムアウト付き)
   * AI:   GtoAiPlayer を呼び出す
   */
  protected async requestAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction> {
    if (playerId === this.humanPlayerId) {
      return this.waitForHumanAction(playerId, context);
    } else {
      return this.getAiAction(playerId, context);
    }
  }

  /** 各プレイヤーにゲームスナップショットを送信する */
  protected async broadcastSnapshot(street: Street): Promise<void> {
    this.currentStreet = street;

    // ハンド開始直後（プリフロップの最初のスナップショット）に、
    // AIプレイヤーへホールカードと最新ポジションをセットする。
    if (street === 'preflop') {
      for (const [playerId, aiPlayer] of this.aiPlayers) {
        const player = this.table.getPlayer(playerId);
        if (player.holeCards) aiPlayer.setHoleCards(player.holeCards);
        if (player.positionName) aiPlayer.setPosition(player.positionName);
      }
    }

    const players = this.table.getAllPlayers();

    for (const player of players) {
      if (player.id === this.humanPlayerId) {
        // 人間プレイヤー: 自分のホールカードを含むスナップショット
        const socketId = this.playerSocketMap.get(player.id);
        if (socketId) {
          const snapshot = this.buildSnapshot(player.id);
          this.io.to(socketId).emit('game-state', snapshot);
        }
      }
      // AIプレイヤー: ホールカードなし (MVPでは送信不要)
    }

    // ルーム全体への公開情報 (ホールカードなし) を別途送信
    const publicSnapshot = this.buildSnapshot('__public__');
    this.io.to(this.roomId).emit('game-state-public', publicSnapshot);
  }

  /** ハンド結果を送信する */
  protected async broadcastHandResult(result: HandResultEvent): Promise<void> {
    this.io.to(this.roomId).emit('hand-result', result);
    // 結果表示のため少し待つ
    await new Promise(r => setTimeout(r, 2000));
  }

  // ─── 人間プレイヤーのアクション受信 ────────────────────────────────

  /**
   * Socket.IO 経由で受け取った人間プレイヤーのアクションを処理する。
   * GameRoom から呼び出される。
   */
  receiveHumanAction(action: PlayerAction): boolean {
    if (!this.pendingActionResolver) return false;

    // タイムアウトをキャンセル
    if (this.actionTimeoutHandle) {
      clearTimeout(this.actionTimeoutHandle);
      this.actionTimeoutHandle = null;
    }

    this.pendingActionResolver({ ...action, playerId: this.humanPlayerId });
    this.pendingActionResolver = null;
    return true;
  }

  // ─── Private ────────────────────────────────────────────────────

  private waitForHumanAction(
    playerId: string,
    _context: BettingContext,
  ): Promise<PlayerAction> {
    return new Promise((resolve) => {
      this.pendingActionResolver = resolve;

      // action-required イベントを送信
      const socketId = this.playerSocketMap.get(playerId);
      if (socketId) {
        this.io.to(socketId).emit(
          'action-required',
          playerId,
          this.table.config.actionTimeoutSeconds,
        );
      }

      // タイムアウト: 自動フォールド
      this.actionTimeoutHandle = setTimeout(() => {
        if (this.pendingActionResolver) {
          this.pendingActionResolver({
            type: 'fold',
            playerId: this.humanPlayerId,
            timestamp: Date.now(),
          });
          this.pendingActionResolver = null;
        }
      }, this.table.config.actionTimeoutSeconds * 1000);
    });
  }

  private async getAiAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction> {
    const aiPlayer = this.aiPlayers.get(playerId);
    if (!aiPlayer) {
      throw new Error(`AI player not found: ${playerId}`);
    }

    // AI の「考える」演出ディレイ
    const delay = this.aiThinkingDelayMs + Math.random() * 500;
    await new Promise(r => setTimeout(r, delay));

    const player = this.table.getPlayer(playerId);
    const communityCards = this.communityCards;
    const pot = this.getCurrentPot();
    const street = this.currentStreet as 'preflop' | 'flop' | 'turn' | 'river';

    if (street === 'preflop' || !player.holeCards || communityCards.length < 3) {
      const scenario = this.determinePreflopScenario();
      const raiserPosition = scenario === 'vsOpen' ? this.getRaiserPosition() : undefined;
      return aiPlayer.decidePreflopAction({
        ...context,
        playerId,
        scenario,
        raiserPosition,
      });
    }

    // ポストフロップ: isPFA と isIP を判定
    const isPFA = this.preflopAggressorId === playerId;
    const isIP = this.isPlayerIP(playerId);
    const toCall = context.currentBet - context.playerBetThisStreet;

    return aiPlayer.decidePostflopAction(
      communityCards,
      {
        ...context,
        playerId,
        pot,
        street,
        isPFA,
        isIP,
        facingBet: toCall > 0 ? toCall : null,
      },
    );
  }

  /**
   * プリフロップのシナリオを preflopRaiseCount から判定する。
   * 0回 = RFI、1回 = vsOpen、2回 = vs3Bet、3回以上 = vs4Bet
   */
  private determinePreflopScenario(): PreflopScenario {
    if (this.preflopRaiseCount === 0) return 'RFI';
    if (this.preflopRaiseCount === 1) return 'vsOpen';
    if (this.preflopRaiseCount === 2) return 'vs3Bet';
    return 'vs4Bet';
  }

  /** 直近のプリフロップレイザーのポジション名を取得する (vsOpenシナリオで必須) */
  private getRaiserPosition(): string | undefined {
    if (!this.preflopAggressorId) return undefined;
    return this.table.getPlayer(this.preflopAggressorId).positionName ?? undefined;
  }

  /**
   * 現在のポット額を取得する。
   * potManagerは完了したベッティングラウンドの分しか反映されないため、
   * 進行中のラウンドで集まった額 (currentBettingRound.getCollectedAmount()) を加算する。
   */
  private getCurrentPot(): number {
    return this.potManager.getTotalPot() + (this.currentBettingRound?.getCollectedAmount() ?? 0);
  }

  /**
   * プレイヤーがインポジションか判定する。
   * シンプルな実装: ディーラーに近い側がIP（HU以外は簡略化してfalseを返す）
   */
  private isPlayerIP(playerId: string): boolean {
    const inHand = this.table.getPlayersInHand();
    if (inHand.length !== 2) return false; // HU以外は簡略化
    const dealer = inHand.find(p => p.isDealer);
    return dealer?.id === playerId;
  }
}
