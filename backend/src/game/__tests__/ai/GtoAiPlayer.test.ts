import { GtoAiPlayer } from '../../ai/GtoAiPlayer';
import { Card, BettingContext } from '../../types/game.types';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

describe('GtoAiPlayer', () => {
  test('decidePreflopAction は未実装のためエラーを投げる', () => {
    const ai = new GtoAiPlayer({ position: 'BTN', isPFA: true });
    const context: BettingContext = {
      currentBet: 1, lastRaiseIncrement: 1, playerStack: 100, playerBetThisStreet: 0, bigBlind: 1,
    };
    expect(() => ai.decidePreflopAction(context)).toThrow('Not yet implemented');
  });

  test('ホールカード未設定でdecidePostflopActionを呼ぶとエラー', () => {
    const ai = new GtoAiPlayer({ position: 'BTN', isPFA: true });
    const context: BettingContext & {
      playerId: string; pot: number; facingBet: number | null; street: 'flop' | 'turn' | 'river';
    } = {
      currentBet: 0, lastRaiseIncrement: 1, playerStack: 100, playerBetThisStreet: 0, bigBlind: 1,
      playerId: 'p1', pot: 10, facingBet: null, street: 'flop',
    };
    expect(() => ai.decidePostflopAction([c('K', 'hearts'), c('7', 'diamonds')], context)).toThrow('Hole cards not set');
  });

  test('setHoleCards後、decidePostflopActionがPlayerActionを返す (check/fold/call/raise)', () => {
    const ai = new GtoAiPlayer({ position: 'BTN', isPFA: true });
    ai.setHoleCards([c('2', 'hearts'), c('2', 'diamonds')]); // 強いハンド
    const board: Card[] = [c('2', 'clubs'), c('2', 'spades'), c('A', 'hearts')];
    const context = {
      currentBet: 0, lastRaiseIncrement: 1, playerStack: 100, playerBetThisStreet: 0, bigBlind: 1,
      playerId: 'p1', pot: 10, facingBet: null as number | null, street: 'flop' as const,
    };
    const action = ai.decidePostflopAction(board, context);
    expect(['check', 'fold', 'call', 'raise']).toContain(action.type);
    expect(action.playerId).toBe('p1');
  });

  test('facingBetがある場合のdecidePostflopAction (fold/call/raise)', () => {
    const ai = new GtoAiPlayer({ position: 'BB', isPFA: false });
    ai.setHoleCards([c('A', 'hearts'), c('4', 'clubs')]);
    const board: Card[] = [c('K', 'hearts'), c('7', 'hearts'), c('2', 'spades')];
    const context = {
      currentBet: 5, lastRaiseIncrement: 1, playerStack: 100, playerBetThisStreet: 0, bigBlind: 1,
      playerId: 'p2', pot: 10, facingBet: 5 as number | null, street: 'flop' as const,
    };
    const action = ai.decidePostflopAction(board, context);
    expect(['fold', 'call', 'raise']).toContain(action.type);
  });
});
