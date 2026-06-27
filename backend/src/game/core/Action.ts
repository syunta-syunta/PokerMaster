// backend/src/game/core/Action.ts

import { ActionType, PlayerAction } from '../types/game.types';

/** アクションを生成するファクトリ関数群 */

export function createFold(playerId: string): PlayerAction {
  return { type: 'fold', playerId, timestamp: Date.now() };
}

export function createCheck(playerId: string): PlayerAction {
  return { type: 'check', playerId, timestamp: Date.now() };
}

export function createCall(playerId: string, amount: number): PlayerAction {
  return { type: 'call', playerId, amount, timestamp: Date.now() };
}

export function createRaise(playerId: string, amount: number): PlayerAction {
  return { type: 'raise', playerId, amount, timestamp: Date.now() };
}

export function createAllIn(playerId: string, amount: number): PlayerAction {
  return { type: 'all-in', playerId, amount, timestamp: Date.now() };
}

/** アクションが金額を伴うかどうか */
export function actionRequiresAmount(type: ActionType): boolean {
  return type === 'call' || type === 'raise' || type === 'all-in';
}

/** アクションの表示用文字列 */
export function actionToString(action: PlayerAction): string {
  switch (action.type) {
    case 'fold':   return 'Fold';
    case 'check':  return 'Check';
    case 'call':   return `Call ${action.amount?.toFixed(2)}BB`;
    case 'raise':  return `Raise to ${action.amount?.toFixed(2)}BB`;
    case 'all-in': return `All-In ${action.amount?.toFixed(2)}BB`;
  }
}
