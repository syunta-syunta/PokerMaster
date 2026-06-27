// backend/src/game/__tests__/engine/TestGameEngine.ts

import { GameEngine } from '../../engine/GameEngine';
import { GameTable } from '../../engine/GameTable';
import { PlayerAction, BettingContext, Street, HandResultEvent } from '../../types/game.types';

export class TestGameEngine extends GameEngine {
  private actionQueue: Map<string, PlayerAction[]> = new Map();
  public snapshots: string[] = [];

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

  protected async requestAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction> {
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
  }

  protected async broadcastHandResult(_result: HandResultEvent): Promise<void> {}
}
