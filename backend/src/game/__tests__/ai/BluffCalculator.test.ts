import { calculateAlpha, assessBlockerQuality, calculateBluffFrequency } from '../../ai/postflop/BluffCalculator';
import { Card } from '../../types/game.types';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

describe('BluffCalculator', () => {
  describe('calculateAlpha', () => {
    test('33%pot → 0.248', () => {
      expect(calculateAlpha('small')).toBeCloseTo(0.248, 3);
    });

    test('67%pot → 0.401', () => {
      expect(calculateAlpha('medium')).toBeCloseTo(0.401, 3);
    });

    test('100%pot → 0.500', () => {
      expect(calculateAlpha('large')).toBeCloseTo(0.5, 3);
    });
  });

  describe('assessBlockerQuality', () => {
    test('ナッツフラッシュブロッカー → quality=0.95', () => {
      const hole: [Card, Card] = [c('A', 'hearts'), c('K', 'diamonds')];
      const board: Card[] = [c('7', 'hearts'), c('2', 'hearts'), c('9', 'clubs')];
      expect(assessBlockerQuality(hole, board)).toBe(0.95);
    });

    test('ブロッカーなし → quality=0.4', () => {
      const hole: [Card, Card] = [c('6', 'spades'), c('5', 'clubs')];
      const board: Card[] = [c('7', 'hearts'), c('2', 'clubs'), c('9', 'diamonds')];
      expect(assessBlockerQuality(hole, board)).toBe(0.4);
    });

    test('トップカードブロッカー → quality>=0.75', () => {
      const hole: [Card, Card] = [c('9', 'spades'), c('5', 'clubs')];
      const board: Card[] = [c('7', 'hearts'), c('2', 'clubs'), c('9', 'diamonds')];
      expect(assessBlockerQuality(hole, board)).toBeGreaterThanOrEqual(0.75);
    });

    test('Aブロッカー (ボードにAなし) → quality>=0.65', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('5', 'clubs')];
      const board: Card[] = [c('7', 'hearts'), c('2', 'clubs'), c('9', 'diamonds')];
      expect(assessBlockerQuality(hole, board)).toBeGreaterThanOrEqual(0.65);
    });
  });

  describe('calculateBluffFrequency', () => {
    test('フロップ33%pot ブロッカーあり → freq ≈ 0.248', () => {
      const freq = calculateBluffFrequency('small', 'flop', 1.0, 1.0);
      expect(freq).toBeCloseTo(0.248, 3);
    });

    test('リバー33%pot ブロッカーあり → freq ≈ 0.124 (×0.5)', () => {
      const freq = calculateBluffFrequency('small', 'river', 1.0, 1.0);
      expect(freq).toBeCloseTo(0.124, 3);
    });

    test('betFreqMultiplier=0.7 → bluff頻度が70%に下がる (ズレB確認)', () => {
      const baseline = calculateBluffFrequency('small', 'flop', 1.0, 1.0);
      const adjusted = calculateBluffFrequency('small', 'flop', 1.0, 0.7);
      expect(adjusted / baseline).toBeCloseTo(0.7, 3);
    });

    test('0〜0.95の範囲に収まる', () => {
      const freq = calculateBluffFrequency('large', 'flop', 1.0, 1.3);
      expect(freq).toBeLessThanOrEqual(0.95);
      expect(freq).toBeGreaterThanOrEqual(0);
    });
  });
});
