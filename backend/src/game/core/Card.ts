// backend/src/game/core/Card.ts

import { Card, Rank, Suit } from '../types/game.types';

/** pokersolver ライブラリが要求するカード文字列に変換
 *  例: { rank: 'A', suit: 'spades' } → 'As'
 *  ランク文字: 2-9, T, J, Q, K, A
 *  スート文字: c(clubs), d(diamonds), h(hearts), s(spades)
 */
export function cardToPokerSolverString(card: Card): string {
  const suitMap: Record<Suit, string> = {
    clubs: 'c',
    diamonds: 'd',
    hearts: 'h',
    spades: 's',
  };
  return `${card.rank}${suitMap[card.suit]}`;
}

/** 表示用文字列に変換。例: { rank: 'A', suit: 'spades' } → 'A♠' */
export function cardToDisplayString(card: Card): string {
  const suitSymbol: Record<Suit, string> = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
  };
  return `${card.rank}${suitSymbol[card.suit]}`;
}

/** ランクを数値に変換 (2→2, T→10, J→11, Q→12, K→13, A→14) */
export function rankToValue(rank: Rank): number {
  const rankMap: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return rankMap[rank];
}

/** 2枚のカードが同じかどうか判定 */
export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** 全52枚のカードを生成して返す */
export function createFullDeck(): Card[] {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const ranks: Rank[] = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}
