// backend/src/game/ai/postflop/BluffCalculator.ts

import { Card, BetSizeBucket } from '../../types/game.types';
import { rankToValue } from '../../core/Card';

/**
 * GTO均衡ブラフ頻度を計算する。
 *
 * 数学的根拠:
 *   alpha = ベットサイズ / (ベットサイズ + ポット)
 *   = 相手がフォールドすれば損益分岐となる最低フォールド頻度
 *
 *   ブラフ頻度 = alpha × ストリート係数 × ブロッカー品質 × ボード乗数
 *
 * ズレB の修正: betFreqMultiplier をブラフ頻度にも適用することで
 *   バリュー:ブラフ比率をボードアドバンテージに関わらず一定に保つ。
 */

const BET_SIZE_FRACTIONS: Record<BetSizeBucket, number> = {
  small:  0.33,
  medium: 0.67,
  large:  1.00,
};

const STREET_FACTORS: Record<string, number> = {
  flop:  1.00,
  turn:  0.75,
  river: 0.50,
};

/** Alpha (損益分岐フォールド頻度) を計算する */
export function calculateAlpha(sizeBucket: BetSizeBucket): number {
  const frac = BET_SIZE_FRACTIONS[sizeBucket];
  return frac / (1 + frac);
}
// 確認値:
// small (33%):  alpha = 0.33/1.33 = 0.248
// medium (67%): alpha = 0.67/1.67 = 0.401
// large (100%): alpha = 1.00/2.00 = 0.500

/**
 * ブロッカー品質を 0〜1 で評価する。
 * 品質が高いほど相手の強いハンドの組み合わせを減らせる。
 */
export function assessBlockerQuality(
  holeCards: [Card, Card],
  communityCards: Card[],
): number {
  let quality = 0.4; // ブロッカーなしでも最低限のブラフ価値はある

  const suitCounts: Record<string, number> = {};
  communityCards.forEach(c => {
    suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
  });

  // フラッシュボードのナッツブロッカー (Aを同スートで持つ)
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count >= 2) {
      const hasNutFlushBlocker = holeCards.some(
        c => c.suit === suit && c.rank === 'A'
      );
      if (hasNutFlushBlocker) {
        quality = Math.max(quality, 0.95);
      }
    }
  }

  // トップカードブロッカー
  const boardRanks = communityCards.map(c => rankToValue(c.rank));
  const topRank = Math.max(...boardRanks);
  if (holeCards.some(c => rankToValue(c.rank) === topRank)) {
    quality = Math.max(quality, 0.75);
  }

  // Aブロッカー (ボードにAがない場合に有効)
  if (!boardRanks.includes(14) && holeCards.some(c => c.rank === 'A')) {
    quality = Math.max(quality, 0.65);
  }

  return quality;
}

/**
 * GTO均衡ブラフ頻度を計算する。
 * betFreqMultiplier を適用してバリュー:ブラフ比率を維持する (ズレB修正)。
 */
export function calculateBluffFrequency(
  sizeBucket: BetSizeBucket,
  street: 'flop' | 'turn' | 'river',
  blockerQuality: number,
  betFreqMultiplier: number, // ズレB修正: ボードアドバンテージ乗数
): number {
  const alpha = calculateAlpha(sizeBucket);
  const streetFactor = STREET_FACTORS[street];
  const freq = alpha * streetFactor * blockerQuality * betFreqMultiplier;
  return Math.min(0.95, Math.max(0, freq));
}
