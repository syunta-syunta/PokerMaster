import { GtoAiPlayer, PreflopDecisionContext } from '../../ai/GtoAiPlayer';
import { Card, BettingContext } from '../../types/game.types';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

function preflopContext(overrides: Partial<PreflopDecisionContext> = {}): PreflopDecisionContext {
  return {
    currentBet: 1, lastRaiseIncrement: 1, playerStack: 100, playerBetThisStreet: 0, bigBlind: 1,
    playerId: 'p1', scenario: 'RFI',
    ...overrides,
  };
}

describe('GtoAiPlayer', () => {
  describe('decidePreflopAction', () => {
    test('RFIシナリオ: UTGでAA → 100%レイズ', () => {
      const ai = new GtoAiPlayer({ position: 'UTG', isPFA: false });
      ai.setHoleCards([c('A', 'spades'), c('A', 'hearts')]);
      const context = preflopContext({ scenario: 'RFI', currentBet: 1, playerBetThisStreet: 0 });
      const action = ai.decidePreflopAction(context);
      expect(action.type).toBe('raise');
    });

    test('RFIシナリオ: UTGで72o → 100%フォールド', () => {
      const ai = new GtoAiPlayer({ position: 'UTG', isPFA: false });
      ai.setHoleCards([c('7', 'hearts'), c('2', 'clubs')]);
      const context = preflopContext({ scenario: 'RFI', currentBet: 1, playerBetThisStreet: 0 });
      const action = ai.decidePreflopAction(context);
      expect(action.type).toBe('fold');
    });

    test('RFIシナリオ: BBは常にチェック (GTO_RFI_RANGESにBBエントリが存在しないため特別扱い)', () => {
      const ai = new GtoAiPlayer({ position: 'BB', isPFA: false });
      ai.setHoleCards([c('7', 'hearts'), c('2', 'clubs')]);
      const context = preflopContext({ scenario: 'RFI', currentBet: 1, playerBetThisStreet: 1 });
      const action = ai.decidePreflopAction(context);
      expect(action.type).toBe('check');
    });

    test('vsOpenシナリオ: BTNがUTGオープンに対しAKsで100%3Bet (raise)', () => {
      const ai = new GtoAiPlayer({ position: 'BTN', isPFA: false });
      ai.setHoleCards([c('A', 'spades'), c('K', 'spades')]);
      const context = preflopContext({
        scenario: 'vsOpen', raiserPosition: 'UTG', currentBet: 2.5, playerBetThisStreet: 0,
      });
      const action = ai.decidePreflopAction(context);
      expect(action.type).toBe('raise');
    });

    test('vsOpenシナリオ: BTNがUTGオープンに対しJJで3Bet/Callの混合戦略になる', () => {
      const ai = new GtoAiPlayer({ position: 'BTN', isPFA: false });
      ai.setHoleCards([c('J', 'spades'), c('J', 'hearts')]);
      const context = preflopContext({
        scenario: 'vsOpen', raiserPosition: 'UTG', currentBet: 2.5, playerBetThisStreet: 0,
      });
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        seen.add(ai.decidePreflopAction(context).type);
      }
      // JJはfold:0,call:50,raise:50の混合 (フォールドは出ない)
      expect(seen.has('call')).toBe(true);
      expect(seen.has('raise')).toBe(true);
      expect(seen.has('fold')).toBe(false);
    });

    test('vs3Betシナリオ: 4Bet/Call/Foldの頻度がレンジ通り (UTG vs3Bet QQ)', () => {
      const ai = new GtoAiPlayer({ position: 'UTG', isPFA: true });
      ai.setHoleCards([c('Q', 'spades'), c('Q', 'hearts')]);
      const context = preflopContext({
        scenario: 'vs3Bet', currentBet: 9, playerBetThisStreet: 2.5,
      });
      const counts = { fold: 0, call: 0, raise: 0 };
      const n = 600;
      for (let i = 0; i < n; i++) {
        const t = ai.decidePreflopAction(context).type as 'fold' | 'call' | 'raise';
        counts[t]++;
      }
      // UTG vs3Bet QQ: fold0, call35, raise65 (許容マージン付き)
      expect(counts.fold).toBe(0);
      expect(counts.call / n).toBeGreaterThan(0.20);
      expect(counts.call / n).toBeLessThan(0.50);
      expect(counts.raise / n).toBeGreaterThan(0.50);
    });

    test('レンジテーブルが存在しない (UTGはvsOpenテーブルを持たない) → フォールドにフォールバック', () => {
      const ai = new GtoAiPlayer({ position: 'UTG', isPFA: false });
      ai.setHoleCards([c('A', 'spades'), c('A', 'hearts')]);
      const context = preflopContext({
        scenario: 'vsOpen', raiserPosition: 'HJ', currentBet: 5, playerBetThisStreet: 0,
      });
      const action = ai.decidePreflopAction(context);
      expect(action.type).toBe('fold');
    });

    test('vsOpenで完全一致テーブルがない場合、同ヒーローポジションの別テーブルで近似する (BTN vs HJ → BTN_vsUTG等にフォールバック)', () => {
      const ai = new GtoAiPlayer({ position: 'BTN', isPFA: false });
      ai.setHoleCards([c('A', 'spades'), c('A', 'hearts')]);
      const context = preflopContext({
        scenario: 'vsOpen', raiserPosition: 'HJ', currentBet: 2.5, playerBetThisStreet: 0,
      });
      // BTN_vsHJ という完全一致テーブルは存在しないため、フォールバックでBTN_vsUTG等を参照する。
      // AAはどのテーブルでも100%レイズのはず。
      const action = ai.decidePreflopAction(context);
      expect(action.type).toBe('raise');
    });

    test('チェック可能な状況 (toCall<=0) ではfoldの代わりにcheckを返す', () => {
      const ai = new GtoAiPlayer({ position: 'UTG', isPFA: false });
      ai.setHoleCards([c('7', 'hearts'), c('2', 'clubs')]);
      const context = preflopContext({ scenario: 'RFI', currentBet: 1, playerBetThisStreet: 1 });
      const action = ai.decidePreflopAction(context);
      expect(action.type).toBe('check');
    });

    test('ホールカード未設定でdecidePreflopActionを呼ぶとエラー', () => {
      const ai = new GtoAiPlayer({ position: 'BTN', isPFA: true });
      const context = preflopContext();
      expect(() => ai.decidePreflopAction(context)).toThrow('Hole cards not set');
    });
  });

  describe('decidePostflopAction', () => {
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
});
