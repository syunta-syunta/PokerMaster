import { HandEvaluator } from '../core/HandEvaluator';
import { Card } from '../types/game.types';

const evaluator = new HandEvaluator();

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

describe('HandEvaluator', () => {
  describe('evaluate()', () => {
    test('ロイヤルフラッシュを正しく判定', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('K', 'spades')];
      const community: Card[] = [c('Q', 'spades'), c('J', 'spades'), c('T', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Royal Flush');
    });

    test('ストレートフラッシュを正しく判定', () => {
      const hole: [Card, Card] = [c('9', 'hearts'), c('8', 'hearts')];
      const community: Card[] = [c('7', 'hearts'), c('6', 'hearts'), c('5', 'hearts')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Straight Flush');
    });

    test('フォーカードを正しく判定', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('A', 'hearts')];
      const community: Card[] = [c('A', 'diamonds'), c('A', 'clubs'), c('K', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Four of a Kind');
    });

    test('フルハウスを正しく判定', () => {
      const hole: [Card, Card] = [c('K', 'spades'), c('K', 'hearts')];
      const community: Card[] = [c('K', 'diamonds'), c('Q', 'clubs'), c('Q', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Full House');
    });

    test('フラッシュを正しく判定', () => {
      const hole: [Card, Card] = [c('A', 'clubs'), c('9', 'clubs')];
      const community: Card[] = [c('7', 'clubs'), c('4', 'clubs'), c('2', 'clubs')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Flush');
    });

    test('ストレートを正しく判定 (A-2-3-4-5 ホイール含む)', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('2', 'hearts')];
      const community: Card[] = [c('3', 'diamonds'), c('4', 'clubs'), c('5', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Straight');
    });

    test('スリーカードを正しく判定', () => {
      const hole: [Card, Card] = [c('7', 'spades'), c('7', 'hearts')];
      const community: Card[] = [c('7', 'diamonds'), c('K', 'clubs'), c('2', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Three of a Kind');
    });

    test('ツーペアを正しく判定', () => {
      const hole: [Card, Card] = [c('J', 'spades'), c('J', 'hearts')];
      const community: Card[] = [c('5', 'diamonds'), c('5', 'clubs'), c('2', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Two Pair');
    });

    test('ワンペアを正しく判定', () => {
      const hole: [Card, Card] = [c('9', 'spades'), c('9', 'hearts')];
      const community: Card[] = [c('K', 'diamonds'), c('5', 'clubs'), c('2', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('Pair');
    });

    test('ハイカードを正しく判定', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('J', 'hearts')];
      const community: Card[] = [c('8', 'diamonds'), c('5', 'clubs'), c('2', 'spades')];
      const result = evaluator.evaluate(hole, community);
      expect(result.rank).toBe('High Card');
    });

    test('コミュニティカードが3枚でも動作する (フロップ時)', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('K', 'hearts')];
      const community: Card[] = [c('Q', 'diamonds'), c('J', 'clubs'), c('2', 'spades')];
      expect(() => evaluator.evaluate(hole, community)).not.toThrow();
    });

    test('コミュニティカードが6枚でエラー', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('K', 'hearts')];
      const community: Card[] = [
        c('Q', 'diamonds'), c('J', 'clubs'), c('2', 'spades'), c('3', 'hearts'), c('4', 'diamonds'), c('5', 'clubs'),
      ];
      expect(() => evaluator.evaluate(hole, community)).toThrow('Invalid community card count');
    });
  });

  describe('findWinners()', () => {
    test('明確な勝者を返す', () => {
      const community: Card[] = [c('K', 'diamonds'), c('5', 'clubs'), c('2', 'spades'), c('9', 'hearts'), c('3', 'clubs')];
      const players = [
        { id: 'p1', holeCards: [c('A', 'spades'), c('A', 'hearts')] as [Card, Card] }, // pair of aces
        { id: 'p2', holeCards: [c('4', 'spades'), c('7', 'hearts')] as [Card, Card] }, // high card
      ];
      const result = evaluator.findWinners(players, community);
      expect(result.playerIds).toEqual(['p1']);
    });

    test('引き分けの場合に複数のplayerIdを返す', () => {
      const community: Card[] = [c('K', 'diamonds'), c('Q', 'clubs'), c('J', 'spades'), c('9', 'hearts'), c('3', 'clubs')];
      const players = [
        { id: 'p1', holeCards: [c('2', 'spades'), c('4', 'hearts')] as [Card, Card] },
        { id: 'p2', holeCards: [c('2', 'diamonds'), c('4', 'clubs')] as [Card, Card] },
      ];
      const result = evaluator.findWinners(players, community);
      expect(result.playerIds.length).toBe(2);
      expect(result.playerIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    });

    test('コミュニティカードが5枚未満でエラー', () => {
      const community: Card[] = [c('K', 'diamonds'), c('Q', 'clubs'), c('J', 'spades')];
      const players = [
        { id: 'p1', holeCards: [c('2', 'spades'), c('4', 'hearts')] as [Card, Card] },
        { id: 'p2', holeCards: [c('2', 'diamonds'), c('4', 'clubs')] as [Card, Card] },
      ];
      expect(() => evaluator.findWinners(players, community)).toThrow('exactly 5 community cards');
    });

    test('プレイヤーが1人でエラー', () => {
      const community: Card[] = [c('K', 'diamonds'), c('Q', 'clubs'), c('J', 'spades'), c('9', 'hearts'), c('3', 'clubs')];
      const players = [
        { id: 'p1', holeCards: [c('2', 'spades'), c('4', 'hearts')] as [Card, Card] },
      ];
      expect(() => evaluator.findWinners(players, community)).toThrow('At least 2 players required');
    });

    test('3人以上のショーダウン', () => {
      const community: Card[] = [c('2', 'diamonds'), c('5', 'clubs'), c('8', 'spades'), c('J', 'hearts'), c('3', 'clubs')];
      const players = [
        { id: 'p1', holeCards: [c('A', 'spades'), c('A', 'hearts')] as [Card, Card] },
        { id: 'p2', holeCards: [c('4', 'spades'), c('9', 'hearts')] as [Card, Card] },
        { id: 'p3', holeCards: [c('K', 'spades'), c('K', 'hearts')] as [Card, Card] },
      ];
      const result = evaluator.findWinners(players, community);
      expect(result.playerIds).toEqual(['p1']); // pair of aces beats pair of kings beats high card
    });
  });

  describe('compareHands()', () => {
    test('フラッシュ > ストレートでa=1を返す', () => {
      const flush = evaluator.evaluate(
        [c('A', 'clubs'), c('9', 'clubs')],
        [c('7', 'clubs'), c('4', 'clubs'), c('2', 'clubs')],
      );
      const straight = evaluator.evaluate(
        [c('A', 'spades'), c('2', 'hearts')],
        [c('3', 'diamonds'), c('4', 'clubs'), c('5', 'spades')],
      );
      expect(evaluator.compareHands(flush, straight)).toBe(1);
    });

    test('同ランクで0を返す', () => {
      const hand1 = evaluator.evaluate(
        [c('A', 'spades'), c('K', 'hearts')],
        [c('8', 'diamonds'), c('5', 'clubs'), c('2', 'spades')],
      );
      const hand2 = evaluator.evaluate(
        [c('A', 'hearts'), c('K', 'spades')],
        [c('8', 'clubs'), c('5', 'diamonds'), c('2', 'hearts')],
      );
      expect(evaluator.compareHands(hand1, hand2)).toBe(0);
    });
  });
});
