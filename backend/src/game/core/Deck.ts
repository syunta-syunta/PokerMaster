// backend/src/game/core/Deck.ts

import { Card } from '../types/game.types';
import { createFullDeck } from './Card';

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = createFullDeck();
    this.shuffle();
  }

  /** Fisher-Yates アルゴリズムでシャッフル */
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /** デッキの先頭からカードを1枚取り出す
   *  @throws Error デッキが空の場合
   */
  deal(): Card {
    const card = this.cards.pop();
    if (!card) {
      throw new Error('Deck is empty');
    }
    return card;
  }

  /** 指定枚数のカードをまとめて取り出す
   *  @throws Error デッキの残りが不足する場合
   */
  dealMany(count: number): Card[] {
    if (this.cards.length < count) {
      throw new Error(`Not enough cards. Remaining: ${this.cards.length}, Requested: ${count}`);
    }
    return Array.from({ length: count }, () => this.deal());
  }

  /** 残り枚数を返す */
  remaining(): number {
    return this.cards.length;
  }

  /** デッキを52枚に戻してシャッフル */
  reset(): void {
    this.cards = createFullDeck();
    this.shuffle();
  }
}
