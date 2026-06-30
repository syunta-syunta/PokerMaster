import { analyzeBoardAdvantage, calculateWetness } from '../../ai/postflop/BoardAnalyzer';
import { Card } from '../../types/game.types';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

describe('BoardAnalyzer', () => {
  describe('analyzeBoardAdvantage', () => {
    test('K72 レインボー (PFA) → score > 5, multiplier > 1.0', () => {
      const board: Card[] = [c('K', 'hearts'), c('7', 'diamonds'), c('2', 'clubs')];
      const result = analyzeBoardAdvantage(board, true);
      expect(result.score).toBeGreaterThan(5);
      expect(result.betFreqMultiplier).toBeGreaterThan(1.0);
    });

    test('987 ツートーン (PFA) → score < 5, multiplier < 1.0', () => {
      const board: Card[] = [c('9', 'hearts'), c('8', 'hearts'), c('7', 'diamonds')];
      const result = analyzeBoardAdvantage(board, true);
      expect(result.score).toBeLessThan(5);
      expect(result.betFreqMultiplier).toBeLessThan(1.0);
    });

    test('A72 レインボー (PFA) → score >= 7, hasNutAdvantage=true', () => {
      const board: Card[] = [c('A', 'spades'), c('7', 'diamonds'), c('2', 'clubs')];
      const result = analyzeBoardAdvantage(board, true);
      expect(result.score).toBeGreaterThanOrEqual(7);
      expect(result.hasNutAdvantage).toBe(true);
    });

    test('K72 レインボー (Caller) → score < 5, multiplier < 1.0', () => {
      const board: Card[] = [c('K', 'hearts'), c('7', 'diamonds'), c('2', 'clubs')];
      const result = analyzeBoardAdvantage(board, false);
      expect(result.score).toBeLessThan(5);
      expect(result.betFreqMultiplier).toBeLessThan(1.0);
    });

    test('multiplier は 0.70〜1.30 の範囲内', () => {
      const boards: Card[][] = [
        [c('A', 'spades'), c('K', 'hearts'), c('Q', 'diamonds')],
        [c('9', 'hearts'), c('8', 'hearts'), c('7', 'diamonds')],
        [c('K', 'hearts'), c('7', 'diamonds'), c('2', 'clubs')],
        [c('2', 'spades'), c('2', 'hearts'), c('3', 'diamonds')],
      ];
      for (const board of boards) {
        for (const isPFA of [true, false]) {
          const result = analyzeBoardAdvantage(board, isPFA);
          expect(result.betFreqMultiplier).toBeGreaterThanOrEqual(0.70);
          expect(result.betFreqMultiplier).toBeLessThanOrEqual(1.30);
        }
      }
    });
  });

  describe('calculateWetness', () => {
    test('K72 レインボー → 0', () => {
      const board: Card[] = [c('K', 'hearts'), c('7', 'diamonds'), c('2', 'clubs')];
      expect(calculateWetness(board)).toBe(0);
    });

    test('JT9 ツートーン → 3', () => {
      const board: Card[] = [c('J', 'hearts'), c('T', 'hearts'), c('9', 'diamonds')];
      expect(calculateWetness(board)).toBe(3);
    });

    test('モノトーン (3枚同スート) はsuitScore最大', () => {
      const board: Card[] = [c('K', 'hearts'), c('7', 'hearts'), c('2', 'hearts')];
      expect(calculateWetness(board)).toBeGreaterThanOrEqual(3);
    });
  });
});
