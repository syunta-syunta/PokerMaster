// backend/src/game/core/ActionValidator.ts

import { BettingContext, PlayerAction, ValidationResult } from '../types/game.types';
import { createAllIn, createCall } from './Action';

export class ActionValidator {
  /**
   * アクションが有効かどうかを検証する。
   * 無効な場合は error を返す。
   * 部分オールイン等で額が修正される場合は correctedAction を返す。
   */
  validate(action: PlayerAction, context: BettingContext): ValidationResult {
    switch (action.type) {
      case 'fold':   return this.validateFold();
      case 'check':  return this.validateCheck(context);
      case 'call':   return this.validateCall(action, context);
      case 'raise':  return this.validateRaise(action, context);
      case 'all-in': return this.validateAllIn(action, context);
      default:
        return { valid: false, error: `Unknown action type: ${(action as any).type}` };
    }
  }

  /** Fold は常に有効 */
  private validateFold(): ValidationResult {
    return { valid: true };
  }

  /** Check: 自分がまだベットしていない場合 OR 既に最高額をマッチしている場合のみ有効 */
  private validateCheck(context: BettingContext): ValidationResult {
    const amountToCall = context.currentBet - context.playerBetThisStreet;
    if (amountToCall > 0) {
      return {
        valid: false,
        error: `Cannot check. There is a bet of ${amountToCall.toFixed(2)}BB to call.`,
      };
    }
    return { valid: true };
  }

  /** Call: スタックが不足する場合は自動的にオールインに修正 */
  private validateCall(action: PlayerAction, context: BettingContext): ValidationResult {
    const amountToCall = context.currentBet - context.playerBetThisStreet;

    if (amountToCall <= 0) {
      return { valid: false, error: 'No bet to call. Use check instead.' };
    }

    // スタックが足りない → オールイン
    if (context.playerStack <= amountToCall) {
      const correctedAction = createAllIn(action.playerId, context.playerStack);
      return { valid: true, correctedAction };
    }

    // 額の検証
    if (action.amount !== undefined && Math.abs(action.amount - amountToCall) > 0.001) {
      // 正しい額に修正して返す
      const correctedAction = createCall(action.playerId, amountToCall);
      return { valid: true, correctedAction };
    }

    return { valid: true };
  }

  /** Raise: 最小レイズ以上であること、スタック以内であること */
  private validateRaise(action: PlayerAction, context: BettingContext): ValidationResult {
    if (action.amount === undefined || action.amount <= 0) {
      return { valid: false, error: 'Raise amount is required and must be positive.' };
    }

    const totalBetAfterRaise = action.amount; // 総ベット額 (このストリートの合計)
    const minRaiseTotal = context.currentBet + Math.max(
      context.lastRaiseIncrement,
      context.bigBlind,
    );

    // オールインレイズ (最小レイズに満たないがスタック全部) は許可
    if (totalBetAfterRaise === context.playerBetThisStreet + context.playerStack) {
      const correctedAction = createAllIn(action.playerId, context.playerStack);
      return { valid: true, correctedAction };
    }

    if (totalBetAfterRaise < minRaiseTotal) {
      return {
        valid: false,
        error: `Raise too small. Minimum raise to: ${minRaiseTotal.toFixed(2)}BB`,
      };
    }

    const maxBetTotal = context.playerBetThisStreet + context.playerStack;
    if (totalBetAfterRaise > maxBetTotal) {
      return {
        valid: false,
        error: `Raise exceeds stack. Maximum: ${maxBetTotal.toFixed(2)}BB`,
      };
    }

    return { valid: true };
  }

  /** All-In: プレイヤーのスタック全額であること */
  private validateAllIn(action: PlayerAction, context: BettingContext): ValidationResult {
    if (action.amount === undefined) {
      return { valid: false, error: 'All-in amount is required.' };
    }
    if (Math.abs(action.amount - context.playerStack) > 0.001) {
      return {
        valid: false,
        error: `All-in amount must equal player stack: ${context.playerStack.toFixed(2)}BB`,
      };
    }
    return { valid: true };
  }
}

export const actionValidator = new ActionValidator(); // シングルトン
