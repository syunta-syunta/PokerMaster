// backend/src/game/__tests__/engine/TestGameEngine.ts

import { GameEngine } from '../../engine/GameEngine';
import { GameTable } from '../../engine/GameTable';
import { PlayerAction, BettingContext, Street, HandResultEvent } from '../../types/game.types';

export class TestGameEngine extends GameEngine {
  private actionQueue: Map<string, PlayerAction[]> = new Map();
  public snapshots: string[] = [];
  /** テスト用: 各ストリートでアクションを要求されたプレイヤーIDの順序ログ */
  public actionOrderLog: { street: string; playerId: string }[] = [];
  /**
   * GameEngine.currentStreet はプリフロップ以外更新されないため、
   * broadcastSnapshot() で渡される street を直接追跡する
   */
  private lastBroadcastStreet: string = 'preflop';

  constructor(table: GameTable) {
    super(table);
  }

  /** テスト用: プレイヤーのアクションキューを事前セット */
  queueAction(playerId: string, action: PlayerAction): void {
    if (!this.actionQueue.has(playerId)) {
      this.actionQueue.set(playerId, []);
    }
    this.actionQueue.get(playerId)!.push(action);
  }

  /** テスト用: コミュニティカード枚数を取得 */
  getCommunityCardCount(): number {
    return this.communityCards.length;
  }

  /** テスト用: 指定ストリートでアクションが回ったプレイヤーIDの順序を取得 */
  getActionOrderForStreet(street: string): string[] {
    return this.actionOrderLog.filter(e => e.street === street).map(e => e.playerId);
  }

  protected async requestAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction> {
    this.actionOrderLog.push({ street: this.lastBroadcastStreet, playerId });
    const queue = this.actionQueue.get(playerId) ?? [];
    const action = queue.shift();
    if (!action) {
      // デフォルト: call or check
      return {
        type: context.currentBet > context.playerBetThisStreet ? 'call' : 'check',
        playerId,
        amount: context.currentBet > context.playerBetThisStreet
          ? context.currentBet - context.playerBetThisStreet
          : undefined,
        timestamp: Date.now(),
      };
    }
    return action;
  }

  protected async broadcastSnapshot(street: Street): Promise<void> {
    this.snapshots.push(street);
    this.lastBroadcastStreet = street;
  }

  protected async broadcastHandResult(_result: HandResultEvent): Promise<void> {}
}
