import { v4 as uuidv4 } from 'uuid';
import { Card, Rank, Suit } from '../types';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: uuidv4() });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], count: number): { cards: Card[]; remainingDeck: Card[] } {
  if (deck.length < count) throw new Error('Not enough cards in deck');
  return {
    cards: deck.slice(0, count),
    remainingDeck: deck.slice(count),
  };
}

/** Convert our Card rank to pokersolver format */
export function rankToSolver(rank: Rank): string {
  return rank === '10' ? 'T' : rank;
}

/** Convert our Card to pokersolver string (e.g. 'Ah', 'Td') */
export function cardToSolverString(card: Card): string {
  const suitMap: Record<Suit, string> = {
    hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's',
  };
  return `${rankToSolver(card.rank)}${suitMap[card.suit]}`;
}
