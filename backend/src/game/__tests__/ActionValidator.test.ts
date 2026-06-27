import { ActionValidator } from '../core/ActionValidator';
import { BettingContext, PlayerAction } from '../types/game.types';
import { createFold, createCheck, createCall, createRaise, createAllIn } from '../core/Action';

const validator = new ActionValidator();

function baseContext(overrides: Partial<BettingContext> = {}): BettingContext {
  return {
    currentBet: 2,
    lastRaiseIncrement: 2,
    playerStack: 100,
    playerBetThisStreet: 0,
    bigBlind: 1,
    ...overrides,
  };
}

describe('ActionValidator', () => {
  describe('fold', () => {
    test('常に valid=true', () => {
      const action = createFold('p1');
      const result = validator.validate(action, baseContext());
      expect(result.valid).toBe(true);
    });
  });

  describe('check', () => {
    test('currentBet=0 のとき valid=true', () => {
      const action = createCheck('p1');
      const context = baseContext({ currentBet: 0 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(true);
    });

    test('playerBetThisStreet === currentBet のとき valid=true', () => {
      const action = createCheck('p1');
      const context = baseContext({ currentBet: 2, playerBetThisStreet: 2 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(true);
    });

    test('コールが必要な時 valid=false', () => {
      const action = createCheck('p1');
      const context = baseContext({ currentBet: 2, playerBetThisStreet: 0 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(false);
    });
  });

  describe('call', () => {
    test('正しい額でコール → valid=true', () => {
      const action = createCall('p1', 2);
      const context = baseContext({ currentBet: 2, playerBetThisStreet: 0 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(true);
    });

    test('スタックが足りない場合 → correctedAction として all-in を返す', () => {
      const action = createCall('p1', 2);
      const context = baseContext({ currentBet: 2, playerBetThisStreet: 0, playerStack: 1.5 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(true);
      expect(result.correctedAction?.type).toBe('all-in');
      expect(result.correctedAction?.amount).toBe(1.5);
    });

    test('コールするベットがない → valid=false', () => {
      const action = createCall('p1', 0);
      const context = baseContext({ currentBet: 0, playerBetThisStreet: 0 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(false);
    });
  });

  describe('raise', () => {
    test('最小レイズ以上 → valid=true', () => {
      const action = createRaise('p1', 4); // currentBet(2) + lastRaiseIncrement(2)
      const context = baseContext();
      const result = validator.validate(action, context);
      expect(result.valid).toBe(true);
    });

    test('最小レイズ未満 → valid=false', () => {
      const action = createRaise('p1', 3);
      const context = baseContext();
      const result = validator.validate(action, context);
      expect(result.valid).toBe(false);
    });

    test('スタック超過 → valid=false', () => {
      const action = createRaise('p1', 200);
      const context = baseContext({ playerStack: 100, playerBetThisStreet: 0 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(false);
    });

    test('スタック全額のオールインレイズ → all-in として correctedAction を返す', () => {
      const action = createRaise('p1', 100);
      const context = baseContext({ playerStack: 100, playerBetThisStreet: 0, currentBet: 2, lastRaiseIncrement: 2 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(true);
      expect(result.correctedAction?.type).toBe('all-in');
      expect(result.correctedAction?.amount).toBe(100);
    });

    test('amount が undefined → valid=false', () => {
      const action: PlayerAction = { type: 'raise', playerId: 'p1', timestamp: Date.now() };
      const context = baseContext();
      const result = validator.validate(action, context);
      expect(result.valid).toBe(false);
    });
  });

  describe('all-in', () => {
    test('playerStack と同額 → valid=true', () => {
      const action = createAllIn('p1', 100);
      const context = baseContext({ playerStack: 100 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(true);
    });

    test('playerStack と異なる額 → valid=false', () => {
      const action = createAllIn('p1', 50);
      const context = baseContext({ playerStack: 100 });
      const result = validator.validate(action, context);
      expect(result.valid).toBe(false);
    });

    test('amount が undefined → valid=false', () => {
      const action: PlayerAction = { type: 'all-in', playerId: 'p1', timestamp: Date.now() };
      const context = baseContext();
      const result = validator.validate(action, context);
      expect(result.valid).toBe(false);
    });
  });
});
