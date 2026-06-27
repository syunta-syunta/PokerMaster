// backend/src/game/core/HandEvaluator.ts

import { Hand } from 'pokersolver';
import { Card, HandRank, HandResult, WinnerInfo } from '../types/game.types';
import { cardToPokerSolverString } from './Card';

/** pokersolver の hand.name を HandRank に変換するマッピング */
const HAND_RANK_MAP: Record<string, { rank: HandRank; value: number }> = {
  'Royal Flush':     { rank: 'Royal Flush',     value: 8 },
  'Straight Flush':  { rank: 'Straight Flush',  value: 7 },
  'Four of a Kind':  { rank: 'Four of a Kind',  value: 6 },
  'Full House':      { rank: 'Full House',       value: 5 },
  'Flush':           { rank: 'Flush',            value: 4 },
  'Straight':        { rank: 'Straight',         value: 3 },
  'Three of a Kind': { rank: 'Three of a Kind',  value: 2 },
  'Two Pair':        { rank: 'Two Pair',         value: 1 },
  'Pair':            { rank: 'Pair',             value: 0 },
  'High Card':       { rank: 'High Card',        value: -1 },
};

/** pokersolver のカードオブジェクトを Card 型に変換する */
function pokerSolverCardToCard(psCard: any): Card {
  const rankMap: Record<string, string> = {
    'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', 'T': 'T',
    '9': '9', '8': '8', '7': '7', '6': '6', '5': '5',
    '4': '4', '3': '3', '2': '2',
  };
  const suitMap: Record<string, string> = {
    's': 'spades', 'h': 'hearts', 'd': 'diamonds', 'c': 'clubs',
  };
  return {
    rank: rankMap[psCard.value] as any,
    suit: suitMap[psCard.suit] as any,
  };
}

/** ストレートフラッシュのベスト5枚が A-K-Q-J-T かどうか判定する */
function isRoyalFlush(cards: any[]): boolean {
  const values = cards.map((c) => c.value).sort();
  const royalValues = ['A', 'J', 'K', 'Q', 'T'].sort();
  return JSON.stringify(values) === JSON.stringify(royalValues);
}

export class HandEvaluator {
  /**
   * ホールカード2枚とコミュニティカード3〜5枚から最強の5枚ハンドを評価する
   * @param holeCards プレイヤーのホールカード (必ず2枚)
   * @param communityCards コミュニティカード (3〜5枚)
   * @returns HandResult
   */
  evaluate(holeCards: [Card, Card], communityCards: Card[]): HandResult {
    if (communityCards.length < 3 || communityCards.length > 5) {
      throw new Error(`Invalid community card count: ${communityCards.length}. Must be 3-5.`);
    }

    const allCards = [...holeCards, ...communityCards].map(cardToPokerSolverString);
    const solvedHand = Hand.solve(allCards);

    let handName = solvedHand.name;
    // pokersolver は Royal Flush を区別せず "Straight Flush" として返すため、
    // ベスト5枚が A-K-Q-J-T の場合は Royal Flush に補正する
    if (handName === 'Straight Flush' && isRoyalFlush(solvedHand.cards)) {
      handName = 'Royal Flush';
    }

    const rankInfo = HAND_RANK_MAP[handName];
    if (!rankInfo) {
      throw new Error(`Unknown hand name from pokersolver: ${handName}`);
    }

    return {
      rank: rankInfo.rank,
      rankValue: rankInfo.value,
      name: solvedHand.toString(),
      cards: solvedHand.cards.map(pokerSolverCardToCard),
    };
  }

  /**
   * 複数プレイヤーのハンドを比較して勝者を決定する
   * @param players { id, holeCards } の配列 (2名以上)
   * @param communityCards コミュニティカード (5枚。ショーダウン時)
   * @returns WinnerInfo (引き分けの場合 playerIds が複数)
   */
  findWinners(
    players: { id: string; holeCards: [Card, Card] }[],
    communityCards: Card[],
  ): WinnerInfo {
    if (players.length < 2) {
      throw new Error('At least 2 players required');
    }
    if (communityCards.length !== 5) {
      throw new Error(`Showdown requires exactly 5 community cards, got ${communityCards.length}`);
    }

    const solvedHands = players.map((p) => {
      const allCards = [...p.holeCards, ...communityCards].map(cardToPokerSolverString);
      return { id: p.id, hand: Hand.solve(allCards) };
    });

    const winnerHands = Hand.winners(solvedHands.map((h) => h.hand));

    const winnerIds = solvedHands
      .filter((h) => winnerHands.includes(h.hand))
      .map((h) => h.id);

    // 勝者の HandResult を生成 (最初の勝者のハンドを代表として使用)
    const winnerHandResult = this.evaluate(
      players.find((p) => p.id === winnerIds[0])!.holeCards,
      communityCards,
    );

    return {
      playerIds: winnerIds,
      handResult: winnerHandResult,
    };
  }

  /**
   * 2つの HandResult を比較する
   * @returns 1 if a wins, -1 if b wins, 0 if tie
   */
  compareHands(a: HandResult, b: HandResult): 1 | -1 | 0 {
    if (a.rankValue > b.rankValue) return 1;
    if (a.rankValue < b.rankValue) return -1;
    return 0;
    // 注: 同ランク内のタイブレークは pokersolver の Hand.winners が処理するため、
    //     このメソッドは大まかな比較にのみ使用すること
  }
}

export const handEvaluator = new HandEvaluator(); // シングルトン
