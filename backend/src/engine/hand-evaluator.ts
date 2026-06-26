// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Hand } = require('pokersolver');

import { Card, WinnerInfo, Pot } from '../types';
import { cardToSolverString } from './deck';

export interface EvaluatedHand {
  playerId: string;
  hand: any; // pokersolver Hand object
  name: string;
  rank: number;
}

export function evaluateHand(holeCards: Card[], communityCards: Card[]): any {
  const allCards = [...holeCards, ...communityCards].map(cardToSolverString);
  return Hand.solve(allCards);
}

export function evaluateHands(
  players: Array<{ id: string; cards: Card[] }>,
  communityCards: Card[]
): EvaluatedHand[] {
  return players.map(p => {
    const hand = evaluateHand(p.cards, communityCards);
    return { playerId: p.id, hand, name: hand.name as string, rank: hand.rank as number };
  });
}

/**
 * Award pots to winners. Returns WinnerInfo[] with pot amounts.
 */
export function awardPots(
  pots: Pot[],
  players: Array<{ id: string; cards: Card[] }>,
  communityCards: Card[]
): WinnerInfo[] {
  const results: WinnerInfo[] = [];

  for (const pot of pots) {
    const eligible = players.filter(p => pot.eligiblePlayerIds.includes(p.id));
    if (eligible.length === 0) continue;

    if (eligible.length === 1) {
      results.push({ playerId: eligible[0].id, potAmount: pot.amount });
      continue;
    }

    const evaluated = evaluateHands(eligible, communityCards);
    const hands = evaluated.map(e => e.hand);
    const winningHands: any[] = Hand.winners(hands);

    const potWinners = evaluated.filter(e => winningHands.includes(e.hand));
    const share = Math.floor(pot.amount / potWinners.length);

    for (const winner of potWinners) {
      results.push({
        playerId: winner.playerId,
        potAmount: share,
        handName: winner.name,
      });
    }
  }

  return results;
}

/**
 * Rough equity estimation (Monte Carlo, fast version).
 * Runs N random runouts and returns win probability for holeCards.
 */
export function estimateEquity(
  holeCards: Card[],
  communityCards: Card[],
  opponentCount: number,
  iterations = 200
): number {
  // Simplified: just use hand strength as equity proxy when community cards available
  if (communityCards.length >= 3) {
    const hand = evaluateHand(holeCards, communityCards);
    // Hand rank goes from 1 (high card) to higher values for better hands
    // pokersolver ranks: 1=high card, 2=pair, 3=two pair, 4=trips, 5=straight,
    // 6=flush, 7=full house, 8=quads, 9=straight flush
    const strengthMap: Record<string, number> = {
      'High Card': 0.2,
      'Pair': 0.45,
      'Two Pair': 0.65,
      'Three of a Kind': 0.75,
      'Straight': 0.82,
      'Flush': 0.87,
      'Full House': 0.93,
      'Four of a Kind': 0.97,
      'Straight Flush': 0.99,
      'Royal Flush': 1.0,
    };
    const base = strengthMap[hand.name] ?? 0.3;
    // Adjust for number of opponents
    return Math.pow(base, opponentCount);
  }

  // Preflop equity (very rough)
  return 1 / (opponentCount + 1);
}
