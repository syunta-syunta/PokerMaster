import {
  cardToPokerSolverString,
  cardToDisplayString,
  rankToValue,
  cardsEqual,
  createFullDeck,
} from '../core/Card';
import { Card } from '../types/game.types';

describe('Card utilities', () => {
  test('cardToPokerSolverString: Ace of spades → "As"', () => {
    const card: Card = { rank: 'A', suit: 'spades' };
    expect(cardToPokerSolverString(card)).toBe('As');
  });

  test('cardToPokerSolverString: Ten of hearts → "Th"', () => {
    const card: Card = { rank: 'T', suit: 'hearts' };
    expect(cardToPokerSolverString(card)).toBe('Th');
  });

  test('cardToPokerSolverString: Two of clubs → "2c"', () => {
    const card: Card = { rank: '2', suit: 'clubs' };
    expect(cardToPokerSolverString(card)).toBe('2c');
  });

  test('cardToDisplayString: Ace of spades → "A♠"', () => {
    const card: Card = { rank: 'A', suit: 'spades' };
    expect(cardToDisplayString(card)).toBe('A♠');
  });

  test('rankToValue: 2→2, T→10, A→14', () => {
    expect(rankToValue('2')).toBe(2);
    expect(rankToValue('T')).toBe(10);
    expect(rankToValue('A')).toBe(14);
  });

  test('cardsEqual: 同じカードはtrue', () => {
    const a: Card = { rank: 'K', suit: 'diamonds' };
    const b: Card = { rank: 'K', suit: 'diamonds' };
    expect(cardsEqual(a, b)).toBe(true);
  });

  test('cardsEqual: 異なるカードはfalse', () => {
    const a: Card = { rank: 'K', suit: 'diamonds' };
    const b: Card = { rank: 'K', suit: 'hearts' };
    expect(cardsEqual(a, b)).toBe(false);
  });

  test('createFullDeck: 52枚のカードを返す', () => {
    const deck = createFullDeck();
    expect(deck.length).toBe(52);
  });

  test('createFullDeck: 重複がない', () => {
    const deck = createFullDeck();
    const keys = deck.map((c) => `${c.rank}${c.suit}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(52);
  });

  test('createFullDeck: 4スート×13ランクで構成される', () => {
    const deck = createFullDeck();
    const suits = new Set(deck.map((c) => c.suit));
    const ranks = new Set(deck.map((c) => c.rank));
    expect(suits.size).toBe(4);
    expect(ranks.size).toBe(13);
  });
});
