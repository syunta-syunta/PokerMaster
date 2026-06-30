// backend/src/game/ai/postflop/BetSizer.ts

import { BetSizeBucket } from '../../types/game.types';

/**
 * 幾何学的ベットサイジング (Geometric Bet Sizing)
 *
 * 目的: 残りストリートで均等にポットを膨らませながら
 *       全スタックをリバーまでに入れきる最適サイズを計算する。
 *
 * 数学的導出:
 *   開始ポット P、各プレイヤースタック S (SPR = S/P)
 *   各ストリートで f×P をベット → コールされると新ポット = P(1+2f)
 *   n ストリート後: P(1+2f)^n = P + 2S = P(1+2·SPR)
 *   → f = ((1+2·SPR)^(1/n) - 1) / 2
 *
 * 検証値:
 *   SPR=3, n=3 (フロップ): f ≈ 0.456 → medium
 *   SPR=6, n=3 (フロップ): f ≈ 0.675 → medium
 *   SPR=9, n=3 (フロップ): f ≈ 0.834 → medium
 *   SPR=6, n=2 (ターン)  : f ≈ 1.303 → large (ジャムに近い)
 *   SPR=6, n=1 (リバー)  : f = 6.000 → large (ジャム)
 */
export function geometricBetFraction(spr: number, streetsRemaining: number): number {
  if (streetsRemaining <= 0 || spr <= 0) return 1.0;
  return (Math.pow(1 + 2 * spr, 1 / streetsRemaining) - 1) / 2;
}

/**
 * フラクションを BetSizeBucket に変換する。
 * > 0.85 はラージ/オーバーベット扱い。実際の額は min(f×pot, effectiveStack)。
 */
export function geometricFractionToBucket(fraction: number): BetSizeBucket {
  if (fraction < 0.45) return 'small';
  if (fraction < 0.85) return 'medium';
  return 'large';
}

/** SPR + 残りストリート数 → (bucket, fraction) をまとめて返す */
export function getGeometricBetSize(
  spr: number,
  streetsRemaining: number,
): { bucket: BetSizeBucket; fraction: number } {
  const fraction = geometricBetFraction(spr, streetsRemaining);
  return { bucket: geometricFractionToBucket(fraction), fraction };
}

/** street 文字列から残りストリート数を返すヘルパー */
export function getStreetsRemaining(street: 'flop' | 'turn' | 'river'): number {
  const map: Record<string, number> = { flop: 3, turn: 2, river: 1 };
  return map[street] ?? 1;
}
