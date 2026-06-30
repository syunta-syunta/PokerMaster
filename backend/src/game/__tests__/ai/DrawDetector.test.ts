import { detectDraw, detectComboDrawIfAny } from '../../ai/postflop/DrawDetector';
import { Card } from '../../types/game.types';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

describe('DrawDetector', () => {
  test('フラッシュドロー: ホール2枚 + ボード2枚 同スートで検出', () => {
    const hole: [Card, Card] = [c('A', 'spades'), c('K', 'spades')];
    const board: Card[] = [c('5', 'spades'), c('9', 'spades'), c('2', 'hearts')];
    expect(detectDraw(hole, board, 0)).toBe('flush_draw');
  });

  test('OESD: 4連続ランクでギャップなし', () => {
    const hole: [Card, Card] = [c('8', 'hearts'), c('9', 'diamonds')];
    const board: Card[] = [c('6', 'clubs'), c('7', 'spades'), c('2', 'diamonds')];
    expect(detectDraw(hole, board, 0)).toBe('oesd');
  });

  test('ガットショット: 内側のギャップ', () => {
    const hole: [Card, Card] = [c('9', 'hearts'), c('7', 'diamonds')];
    const board: Card[] = [c('8', 'clubs'), c('5', 'spades'), c('2', 'diamonds')];
    expect(detectDraw(hole, board, 0)).toBe('gutshot');
  });

  test('コンボドロー: フラッシュドロー + OESD → combo_draw', () => {
    const hole: [Card, Card] = [c('8', 'spades'), c('9', 'spades')];
    const board: Card[] = [c('6', 'spades'), c('7', 'spades'), c('2', 'diamonds')];
    expect(detectComboDrawIfAny(hole, board, 0)).toBe('combo_draw');
  });

  test('既にフラッシュ完成 (rankValue=4) → none を返す', () => {
    const hole: [Card, Card] = [c('A', 'spades'), c('K', 'spades')];
    const board: Card[] = [c('5', 'spades'), c('9', 'spades'), c('2', 'hearts')];
    expect(detectDraw(hole, board, 4)).toBe('none');
  });

  test('既にストレート完成 (rankValue=3) → none を返す', () => {
    const hole: [Card, Card] = [c('K', 'hearts'), c('2', 'clubs')];
    const board: Card[] = [c('7', 'diamonds'), c('4', 'spades'), c('9', 'clubs')];
    expect(detectDraw(hole, board, 3)).toBe('none');
  });

  test('バックドアフラッシュ: フロップで同スート3枚 (ホール2 + ボード1)', () => {
    const hole: [Card, Card] = [c('A', 'hearts'), c('K', 'hearts')];
    const board: Card[] = [c('7', 'hearts'), c('2', 'diamonds'), c('9', 'clubs')];
    expect(detectDraw(hole, board, 0)).toBe('backdoor_flush');
  });

  test('ドローなし (ハイカードのみ) → none', () => {
    const hole: [Card, Card] = [c('A', 'hearts'), c('K', 'clubs')];
    const board: Card[] = [c('7', 'diamonds'), c('2', 'spades'), c('9', 'clubs')];
    expect(detectDraw(hole, board, 0)).toBe('none');
  });

  describe('detectComboDrawIfAny', () => {
    test('既にメイドハンド (rankValue>=4) → none', () => {
      const hole: [Card, Card] = [c('8', 'spades'), c('9', 'spades')];
      const board: Card[] = [c('6', 'spades'), c('7', 'spades'), c('2', 'diamonds')];
      expect(detectComboDrawIfAny(hole, board, 4)).toBe('none');
    });

    test('フラッシュドローのみ → flush_draw', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('K', 'spades')];
      const board: Card[] = [c('5', 'spades'), c('9', 'spades'), c('2', 'hearts')];
      expect(detectComboDrawIfAny(hole, board, 0)).toBe('flush_draw');
    });

    test('OESDのみ → oesd', () => {
      const hole: [Card, Card] = [c('8', 'hearts'), c('9', 'diamonds')];
      const board: Card[] = [c('6', 'clubs'), c('7', 'spades'), c('2', 'diamonds')];
      expect(detectComboDrawIfAny(hole, board, 0)).toBe('oesd');
    });

    test('ガットショットのみ → gutshot', () => {
      const hole: [Card, Card] = [c('9', 'hearts'), c('7', 'diamonds')];
      const board: Card[] = [c('8', 'clubs'), c('5', 'spades'), c('2', 'diamonds')];
      expect(detectComboDrawIfAny(hole, board, 0)).toBe('gutshot');
    });
  });
});
