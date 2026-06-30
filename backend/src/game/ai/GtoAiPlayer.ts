// backend/src/game/ai/GtoAiPlayer.ts

import { PlayerAction, BettingContext, Card } from '../types/game.types';
import { handEvaluator } from '../core/HandEvaluator';
import { decidePostflopAction, classifyFacingBetSize } from './postflop/PostflopEngine';

export interface GtoAiConfig {
  position: string;
  isPFA: boolean;
}

export class GtoAiPlayer {
  private holeCards: [Card, Card] | null = null;
  private config: GtoAiConfig;

  constructor(config: GtoAiConfig) {
    this.config = config;
  }

  setHoleCards(cards: [Card, Card]): void {
    this.holeCards = cards;
  }

  /**
   * プリフロップのアクションを決定する。
   * GTO preflop range tables を参照。
   */
  decidePreflopAction(_context: BettingContext): PlayerAction {
    // TODO: Phase 3C実装 - GTO range tables を参照
    // gto-preflop-ranges.ts の decidePreflopAction() を呼ぶ
    throw new Error('Preflop decision: Not yet implemented');
  }

  /**
   * ポストフロップのアクションを決定する。
   * PostflopEngine を使用。
   */
  decidePostflopAction(
    communityCards: Card[],
    context: BettingContext & {
      playerId: string;
      pot: number;
      facingBet: number | null;
      street: 'flop' | 'turn' | 'river';
    },
  ): PlayerAction {
    if (!this.holeCards) throw new Error('Hole cards not set');

    const handResult = handEvaluator.evaluate(this.holeCards, communityCards);
    const spr = context.playerStack / context.pot;

    const decision = decidePostflopAction(
      this.holeCards,
      communityCards,
      handResult,
      {
        isPFA: this.config.isPFA,
        isIP: false, // TODO: ゲームエンジンからポジション情報を受け取る
        spr,
        street: context.street,
        pot: context.pot,
        effectiveStack: context.playerStack,
        facingBet: context.facingBet,
        facingBetSizeBucket: context.facingBet !== null
          ? classifyFacingBetSize(context.facingBet, context.pot)
          : null,
      },
    );

    return this.convertDecisionToAction(decision, context);
  }

  private convertDecisionToAction(
    decision: ReturnType<typeof decidePostflopAction>,
    context: BettingContext & { playerId: string },
  ): PlayerAction {
    const { playerId } = context;
    switch (decision.action) {
      case 'check': return { type: 'check', playerId, timestamp: Date.now() };
      case 'fold':  return { type: 'fold',  playerId, timestamp: Date.now() };
      case 'call':  return { type: 'call',  playerId, amount: context.currentBet - context.playerBetThisStreet, timestamp: Date.now() };
      case 'bet':
      case 'raise':
        return { type: 'raise', playerId, amount: decision.betAmount ?? context.currentBet * 2, timestamp: Date.now() };
    }
  }
}
