// backend/src/game/ai/postflop/DrawDetector.ts

import { Card, DrawType } from '../../types/game.types';
import { rankToValue } from '../../core/Card';

/**
 * ドローを検出する。
 * 重要: 既にメイドハンドになっているものは除外する。
 * (例: フラッシュが完成済みの場合、フラッシュドローとは判定しない)
 */
export function detectDraw(
  holeCards: [Card, Card],
  communityCards: Card[],
  handRankValue: number, // pokersolver の rankValue (0-8)
): DrawType {
  // ═══ フラッシュドロー検出 ═══
  // 注: 既にフラッシュが成立 (rankValue >= 4) の場合はスキップ
  if (handRankValue < 4) {
    const flushDraw = detectFlushDraw(holeCards, communityCards);
    if (flushDraw) return flushDraw;
  }

  // ═══ ストレートドロー検出 ═══
  // 注: 既にストレートが成立 (rankValue >= 3) の場合はスキップ
  if (handRankValue < 3) {
    const allCards = [...holeCards, ...communityCards];
    const straightDraw = detectStraightDraw(allCards, communityCards.length);
    if (straightDraw) return straightDraw;
  }

  return 'none';
}

function detectFlushDraw(holeCards: [Card, Card], communityCards: Card[]): DrawType | null {
  const allCards = [...holeCards, ...communityCards];
  const suitCounts: Record<string, Card[]> = {};

  allCards.forEach(c => {
    if (!suitCounts[c.suit]) suitCounts[c.suit] = [];
    suitCounts[c.suit].push(c);
  });

  for (const [suit, cards] of Object.entries(suitCounts)) {
    const holeInSuit = holeCards.filter(c => c.suit === suit).length;
    const communityInSuit = communityCards.filter(c => c.suit === suit).length;

    // フラッシュドロー: 計4枚同スート (あと1枚でフラッシュ)
    if (cards.length === 4 && holeInSuit >= 1) {
      // ストレートドローも同時にあれば combo_draw は後で合成
      // ここでは一旦 flush_draw を返す
      return 'flush_draw';
    }

    // バックドアフラッシュ: ホールカードが2枚同スート + コミュニティが1枚同スート
    if (communityInSuit === 1 && holeInSuit === 2) {
      return 'backdoor_flush';
    }
  }

  return null;
}

function detectStraightDraw(allCards: Card[], communityCount: number): DrawType | null {
  // A は 1 と 14 両方として扱う
  const ranks = new Set<number>();
  allCards.forEach(c => {
    const v = rankToValue(c.rank);
    ranks.add(v);
    if (v === 14) ranks.add(1);
  });

  const sorted = [...ranks].sort((a, b) => a - b);

  // 5枚ウィンドウを滑らせて最大のスパンを確認
  let maxConnected = 0;
  let bestWindow = { low: 0, connected: 0, gaps: 0 };

  for (let low = 1; low <= 10; low++) {
    const high = low + 4;
    const inWindow = sorted.filter(r => r >= low && r <= high).length;
    const gaps = 5 - inWindow;

    if (inWindow > maxConnected) {
      maxConnected = inWindow;
      bestWindow = { low, connected: inWindow, gaps };
    }
  }

  // 4連続 (OESD): 両端が空いている → バックドアは1つのギャップ
  if (bestWindow.connected === 4 && bestWindow.gaps === 1) {
    // ウィンドウの端チェック (OESD か gutshot か)
    const low = bestWindow.low;
    const high = low + 4;
    const missingRanks: number[] = [];
    for (let r = low; r <= high; r++) {
      if (!sorted.includes(r)) missingRanks.push(r);
    }
    const isMiddleGap = missingRanks[0] > low && missingRanks[0] < high;

    if (isMiddleGap) return 'gutshot'; // 内側のギャップ
    if (communityCount <= 3) return 'oesd'; // フロップでは OESD
    return 'gutshot'; // ターンでは片端のみ = gutshot相当
  }

  // 3連続でコミュニティカードが3枚 (フロップ) → バックドアストレート
  if (bestWindow.connected === 3 && communityCount === 3) {
    return 'backdoor_straight';
  }

  return null;
}

/**
 * フラッシュドロー + ストレートドローを合成してコンボドローを検出する
 */
export function detectComboDrawIfAny(
  holeCards: [Card, Card],
  communityCards: Card[],
  handRankValue: number,
): DrawType {
  if (handRankValue >= 4) return 'none'; // 既にメイドハンド

  const flushResult = detectFlushDraw(holeCards, communityCards);
  const allCards = [...holeCards, ...communityCards];
  const straightResult = detectStraightDraw(allCards, communityCards.length);

  const hasStrongFlush = flushResult === 'flush_draw';
  const hasStrongStraight = straightResult === 'oesd';

  if (hasStrongFlush && hasStrongStraight) return 'combo_draw';
  if (hasStrongFlush) return 'flush_draw';
  if (hasStrongStraight) return 'oesd';
  if (straightResult === 'gutshot') return 'gutshot';
  if (flushResult === 'backdoor_flush') return 'backdoor_flush';
  if (straightResult === 'backdoor_straight') return 'backdoor_straight';
  return 'none';
}
