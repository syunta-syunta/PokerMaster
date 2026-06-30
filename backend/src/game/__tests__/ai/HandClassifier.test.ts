import { classifyHand } from '../../ai/postflop/HandClassifier';
import { handEvaluator } from '../../core/HandEvaluator';
import { Card } from '../../types/game.types';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

describe('HandClassifier', () => {
  test('フォーカード → NUTTED', () => {
    const hole: [Card, Card] = [c('A', 'spades'), c('A', 'hearts')];
    const board: Card[] = [c('A', 'diamonds'), c('A', 'clubs'), c('K', 'hearts')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(6);
    expect(classifyHand(result, hole, board, 'none')).toBe('NUTTED');
  });

  test('ナッツフラッシュ → NUTTED', () => {
    const hole: [Card, Card] = [c('A', 'spades'), c('9', 'spades')];
    const board: Card[] = [c('5', 'spades'), c('2', 'spades'), c('K', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(4);
    expect(classifyHand(result, hole, board, 'none')).toBe('NUTTED');
  });

  test('非ナッツフラッシュ → VALUE', () => {
    const hole: [Card, Card] = [c('9', 'spades'), c('8', 'spades')];
    const board: Card[] = [c('5', 'spades'), c('2', 'spades'), c('K', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(4);
    expect(classifyHand(result, hole, board, 'none')).toBe('VALUE');
  });

  test('トップペア良キッカー (ドライボード) → VALUE', () => {
    const hole: [Card, Card] = [c('A', 'spades'), c('J', 'hearts')];
    const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(0);
    expect(classifyHand(result, hole, board, 'none')).toBe('VALUE');
  });

  test('トップペア弱キッカー → SHOWDOWN', () => {
    const hole: [Card, Card] = [c('J', 'clubs'), c('8', 'hearts')];
    const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(0);
    expect(classifyHand(result, hole, board, 'none')).toBe('SHOWDOWN');
  });

  test('ミドルペア (セカンドペア) → SHOWDOWN', () => {
    const hole: [Card, Card] = [c('7', 'hearts'), c('3', 'clubs')];
    const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(0);
    expect(classifyHand(result, hole, board, 'none')).toBe('SHOWDOWN');
  });

  test('Aハイノーペア (ボード自体のペアに参加していない) → SHOWDOWN (ブラフキャッチャー)', () => {
    const hole: [Card, Card] = [c('A', 'spades'), c('K', 'clubs')];
    const board: Card[] = [c('J', 'diamonds'), c('J', 'spades'), c('7', 'clubs')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(0); // ボードのJJペア
    expect(classifyHand(result, hole, board, 'none')).toBe('SHOWDOWN');
  });

  test('ローカード ノーペア (ボード自体のペアに参加していない) → BLUFF', () => {
    const hole: [Card, Card] = [c('9', 'clubs'), c('6', 'diamonds')];
    const board: Card[] = [c('J', 'diamonds'), c('J', 'spades'), c('7', 'clubs')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(0); // ボードのJJペア
    expect(classifyHand(result, hole, board, 'none')).toBe('BLUFF');
  });

  test('フラッシュドロー (draw=flush_draw, メイドハンドなし) → SEMI_BLUFF', () => {
    const hole: [Card, Card] = [c('8', 'spades'), c('9', 'spades')];
    const board: Card[] = [c('6', 'spades'), c('7', 'hearts'), c('2', 'diamonds')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(-1); // High Card
    expect(classifyHand(result, hole, board, 'flush_draw')).toBe('SEMI_BLUFF');
  });

  test('OESD (draw=oesd, メイドハンドなし) → SEMI_BLUFF', () => {
    const hole: [Card, Card] = [c('8', 'hearts'), c('9', 'diamonds')];
    const board: Card[] = [c('6', 'clubs'), c('7', 'spades'), c('2', 'diamonds')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(-1);
    expect(classifyHand(result, hole, board, 'oesd')).toBe('SEMI_BLUFF');
  });

  test('ガットショット (draw=gutshot, メイドハンドなし) → BLUFF', () => {
    const hole: [Card, Card] = [c('9', 'hearts'), c('7', 'diamonds')];
    const board: Card[] = [c('8', 'clubs'), c('5', 'spades'), c('2', 'diamonds')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(-1);
    expect(classifyHand(result, hole, board, 'gutshot')).toBe('BLUFF');
  });

  test('フルハウス (ボードペアあり) → VALUE', () => {
    // 注: 5枚構成 (ホール2+ボード3) のフルハウスは、ホールカードが最大2枚しか
    // 供給できないため、必然的にボード側にペア/トリップスが存在する形にしかならない。
    const hole: [Card, Card] = [c('K', 'spades'), c('K', 'hearts')];
    const board: Card[] = [c('K', 'diamonds'), c('Q', 'clubs'), c('Q', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(5);
    expect(classifyHand(result, hole, board, 'none')).toBe('VALUE');
  });

  test('ストレート → VALUE', () => {
    const hole: [Card, Card] = [c('9', 'spades'), c('8', 'hearts')];
    const board: Card[] = [c('7', 'diamonds'), c('6', 'clubs'), c('5', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(3);
    expect(classifyHand(result, hole, board, 'none')).toBe('VALUE');
  });

  test('スリーカード → VALUE', () => {
    const hole: [Card, Card] = [c('9', 'spades'), c('9', 'hearts')];
    const board: Card[] = [c('9', 'diamonds'), c('5', 'clubs'), c('2', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(2);
    expect(classifyHand(result, hole, board, 'none')).toBe('VALUE');
  });

  test('ツーペア トップ参加 → VALUE', () => {
    const hole: [Card, Card] = [c('J', 'spades'), c('7', 'hearts')];
    const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(1);
    expect(classifyHand(result, hole, board, 'none')).toBe('VALUE');
  });

  test('オーバーペア (AA/KK) → VALUE', () => {
    const hole: [Card, Card] = [c('A', 'spades'), c('A', 'hearts')];
    const board: Card[] = [c('9', 'diamonds'), c('5', 'clubs'), c('2', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(0);
    expect(classifyHand(result, hole, board, 'none')).toBe('VALUE');
  });

  test('オーバーペア (Q未満、JJ等) → SHOWDOWN', () => {
    const hole: [Card, Card] = [c('J', 'hearts'), c('J', 'clubs')];
    const board: Card[] = [c('9', 'diamonds'), c('5', 'clubs'), c('2', 'spades')];
    const result = handEvaluator.evaluate(hole, board);
    expect(result.rankValue).toBe(0);
    expect(classifyHand(result, hole, board, 'none')).toBe('SHOWDOWN');
  });
});
