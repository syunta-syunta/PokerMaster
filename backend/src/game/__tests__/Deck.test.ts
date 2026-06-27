import { Deck } from '../core/Deck';

describe('Deck', () => {
  test('初期化時に52枚', () => {
    const deck = new Deck();
    expect(deck.remaining()).toBe(52);
  });

  test('deal() で1枚減る', () => {
    const deck = new Deck();
    deck.deal();
    expect(deck.remaining()).toBe(51);
  });

  test('dealMany(5) で5枚取れる', () => {
    const deck = new Deck();
    const cards = deck.dealMany(5);
    expect(cards.length).toBe(5);
    expect(deck.remaining()).toBe(47);
  });

  test('dealMany(53) でエラー', () => {
    const deck = new Deck();
    expect(() => deck.dealMany(53)).toThrow('Not enough cards');
  });

  test('deal() で空になった後エラー', () => {
    const deck = new Deck();
    deck.dealMany(52);
    expect(() => deck.deal()).toThrow('Deck is empty');
  });

  test('reset() で52枚に戻る', () => {
    const deck = new Deck();
    deck.dealMany(10);
    deck.reset();
    expect(deck.remaining()).toBe(52);
  });

  test('shuffle() 後も52枚', () => {
    const deck = new Deck();
    deck.shuffle();
    expect(deck.remaining()).toBe(52);
  });

  test('shuffle() が毎回異なる順序になる (統計的テスト, 10回中8回以上異なること)', () => {
    let differentCount = 0;
    let previousOrder: string | null = null;

    for (let i = 0; i < 10; i++) {
      const deck = new Deck();
      const cards = deck.dealMany(52);
      const order = cards.map((c) => `${c.rank}${c.suit}`).join(',');
      if (previousOrder !== null && order !== previousOrder) {
        differentCount++;
      }
      previousOrder = order;
    }

    expect(differentCount).toBeGreaterThanOrEqual(8);
  });
});
