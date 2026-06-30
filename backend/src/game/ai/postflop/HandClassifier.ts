// backend/src/game/ai/postflop/HandClassifier.ts

import { Card, HandResult, HandCategory, DrawType } from '../../types/game.types';
import { rankToValue } from '../../core/Card';

/**
 * ハンドを5つの機能的カテゴリに分類する。
 *
 * GTOの問い: 「このハンドは何のために存在するか？」
 *   NUTTED     → ポットを最大化するために存在する
 *   VALUE      → バリューベットで利益を得るために存在する
 *   SHOWDOWN   → チェックして安全にエクイティを実現するために存在する
 *   SEMI_BLUFF → フォールドエクイティとドロー完成EVを合算するために存在する
 *   BLUFF      → 相手をフォールドさせるためにのみ存在する
 */
export function classifyHand(
  handResult: HandResult,
  holeCards: [Card, Card],
  communityCards: Card[],
  draw: DrawType,
): HandCategory {
  const { rankValue } = handResult;

  // ═══ NUTTED: エクイティ > 75% ═══
  // フォーカード以上 → 常にNUTTED
  if (rankValue >= 6) return 'NUTTED';

  // フルハウス: ほぼ常にNUTTED（ただしボードペアがある場合は相手もフルハウス可能性）
  if (rankValue === 5) {
    const boardPaired = isBoardPaired(communityCards);
    return boardPaired ? 'VALUE' : 'NUTTED';
  }

  // フラッシュ: ナッツフラッシュかどうかで判定
  if (rankValue === 4) {
    return isNutFlush(holeCards, communityCards) ? 'NUTTED' : 'VALUE';
  }

  // ストレート: 基本的にVALUEだが、ボードが非常にウェットな場合はSHOWDOWN
  if (rankValue === 3) return 'VALUE';

  // トリップス: VALUE
  if (rankValue === 2) return 'VALUE';

  // ツーペア: ペアの質によって分類
  if (rankValue === 1) {
    return classifyTwoPair(holeCards, communityCards);
  }

  // ワンペア / ハイカード: ペアの強さで分類
  if (rankValue === 0) {
    return classifyPairOrHighCard(handResult, holeCards, communityCards);
  }

  // ドロー処理: メイドハンドがない場合
  return classifyByDraw(draw);
}

/** ツーペアの分類 */
function classifyTwoPair(holeCards: [Card, Card], community: Card[]): HandCategory {
  const boardRanks = community.map(c => rankToValue(c.rank)).sort((a, b) => b - a);
  const holeRanks = holeCards.map(c => rankToValue(c.rank));

  // どちらかのホールカードがトップペアに関与しているか
  const topBoardRank = boardRanks[0];
  const holdsTopPair = holeRanks.includes(topBoardRank);

  // ボードにペアがある場合 (例: AA7 で A7o を持つ → ツーペアだがキッカーで負ける可能性)
  if (isBoardPaired(community) && !holdsTopPair) return 'SHOWDOWN';

  return holdsTopPair ? 'VALUE' : 'SHOWDOWN';
}

/** ワンペアまたはハイカードの分類 */
function classifyPairOrHighCard(
  handResult: HandResult,
  holeCards: [Card, Card],
  community: Card[],
): HandCategory {
  const boardRanks = community.map(c => rankToValue(c.rank)).sort((a, b) => b - a);
  const holeRanks = holeCards.map(c => rankToValue(c.rank));
  const topBoardRank = boardRanks[0];
  const secondBoardRank = boardRanks[1] ?? 0;

  // オーバーペア: ホールカードのペアがボードの全カードより高い
  const isOverpair = holeRanks[0] === holeRanks[1] && holeRanks[0] > topBoardRank;
  if (isOverpair) {
    // AAまたはKKのオーバーペアはVALUE
    return holeRanks[0] >= 12 ? 'VALUE' : 'SHOWDOWN';
  }

  // ボードとのペア確認
  const pairedRankOnBoard = holeRanks.find(r => boardRanks.includes(r));

  if (pairedRankOnBoard) {
    if (pairedRankOnBoard === topBoardRank) {
      // トップペア: キッカーの強さで分類
      const kicker = holeRanks.find(r => r !== pairedRankOnBoard) ?? 0;
      if (kicker >= 11) return 'VALUE';  // A/K/J キッカー
      if (kicker >= 9) return 'SHOWDOWN'; // T/9 キッカー
      return 'SHOWDOWN'; // 弱いキッカー
    }
    if (pairedRankOnBoard === secondBoardRank) return 'SHOWDOWN'; // セカンドペア
    return 'BLUFF'; // ボトムペア以下
  }

  // ノーペア
  const highHoleCard = Math.max(...holeRanks);
  if (highHoleCard === 14) return 'SHOWDOWN'; // Aハイ = ブラフキャッチャー
  return 'BLUFF';
}

/** ドローのみの場合の分類 */
function classifyByDraw(draw: DrawType): HandCategory {
  switch (draw) {
    case 'combo_draw':
    case 'flush_draw':
    case 'oesd':
      return 'SEMI_BLUFF';
    case 'gutshot':
    case 'backdoor_flush':
    case 'backdoor_straight':
      return 'BLUFF'; // 弱いドロー = 基本的にBLUFF候補
    default:
      return 'BLUFF';
  }
}

/** ナッツフラッシュかどうか判定 */
function isNutFlush(holeCards: [Card, Card], community: Card[]): boolean {
  const allCards = [...holeCards, ...community];
  const suitCounts: Record<string, number> = {};
  allCards.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1; });

  const flushSuit = Object.entries(suitCounts).find(([, n]) => n >= 5)?.[0];
  if (!flushSuit) return false;

  const hasAce = holeCards.some(c => c.suit === flushSuit && c.rank === 'A');
  return hasAce;
}

/** ボードにペアがあるか判定 */
function isBoardPaired(community: Card[]): boolean {
  const ranks = community.map(c => c.rank);
  return new Set(ranks).size < ranks.length;
}
