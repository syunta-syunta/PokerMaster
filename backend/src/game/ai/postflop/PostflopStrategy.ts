// backend/src/game/ai/postflop/PostflopStrategy.ts
//
// 注: selectBetSize() と applySPRModifier() は SPEC-phase3c.md セクション10B
//     アドエンダム (Fix B 幾何学的サイジング / Fix A カテゴリ別SPR修正) の版を採用している。

import {
  HandCategory, BetSizeBucket, BoardAdvantageResult,
  AggressorFrequencies, DefenderFrequencies,
} from '../../types/game.types';
import { getGeometricBetSize } from './BetSizer';

// ── ベースストラテジーテーブル (Aggressor, Cbet) ──────────────────────────
// [check, betSmall, betMedium, betLarge] (合計100)
// wetness: 0-1 = dry, 2 = semi, 3 = wet
// 注: BLUFFカテゴリはalpha計算で決定するため省略

export const AGGRESSOR_TABLE: Record<
  Exclude<HandCategory, 'BLUFF'>,
  Record<'dry' | 'semi' | 'wet', AggressorFrequencies>
> = {
  NUTTED: {
    dry:  { check: 25, betSmall:  0, betMedium: 10, betLarge: 65 },
    semi: { check: 12, betSmall:  0, betMedium: 18, betLarge: 70 },
    wet:  { check:  5, betSmall:  0, betMedium: 10, betLarge: 85 },
  },
  VALUE: {
    dry:  { check: 30, betSmall: 40, betMedium: 25, betLarge:  5 },
    semi: { check: 25, betSmall: 22, betMedium: 45, betLarge:  8 },
    wet:  { check: 15, betSmall: 10, betMedium: 50, betLarge: 25 },
  },
  SHOWDOWN: {
    dry:  { check: 65, betSmall: 25, betMedium: 10, betLarge:  0 },
    semi: { check: 52, betSmall: 26, betMedium: 22, betLarge:  0 },
    wet:  { check: 35, betSmall: 28, betMedium: 37, betLarge:  0 }, // PROTECTIONフラグ
  },
  SEMI_BLUFF: {
    dry:  { check: 38, betSmall: 10, betMedium: 38, betLarge: 14 },
    semi: { check: 22, betSmall:  6, betMedium: 48, betLarge: 24 },
    wet:  { check: 10, betSmall:  5, betMedium: 40, betLarge: 45 },
  },
};

// ── ディフェンダーテーブル ──────────────────────────────────────────────────
// [fold, call, raise] (合計100)
// ズレA修正: ベットサイズ別に3段階 (MDF準拠)
// MDF: small(33%)=75%, medium(67%)=60%, large(100%)=50%

export const DEFENDER_TABLE: Record<
  HandCategory,
  Record<BetSizeBucket, DefenderFrequencies>
> = {
  NUTTED: {
    small:  { fold:  0, call: 20, raise: 80 },
    medium: { fold:  0, call: 15, raise: 85 },
    large:  { fold:  0, call: 10, raise: 90 },
  },
  VALUE: {
    small:  { fold:  0, call: 60, raise: 40 },
    medium: { fold:  0, call: 50, raise: 50 },
    large:  { fold:  0, call: 40, raise: 60 },
  },
  SHOWDOWN: {
    small:  { fold: 15, call: 80, raise:  5 }, // continue=85% ≈ MDF(75%)を上回る
    medium: { fold: 30, call: 65, raise:  5 }, // continue=70% ≈ MDF(60%)を上回る
    large:  { fold: 45, call: 50, raise:  5 }, // continue=55% ≈ MDF(50%)
  },
  SEMI_BLUFF: {
    small:  { fold:  5, call: 65, raise: 30 },
    medium: { fold:  5, call: 55, raise: 40 },
    large:  { fold:  5, call: 45, raise: 50 },
  },
  BLUFF: {
    small:  { fold: 80, call: 18, raise:  2 },
    medium: { fold: 90, call:  8, raise:  2 },
    large:  { fold: 95, call:  4, raise:  1 },
  },
};

// ── ベットサイズ選択 (Fix B: 幾何学的サイジング、セクション10B-2版) ──────────

/**
 * ベットサイズを選択する。
 *
 * Fix B: 幾何学的サイジングを適用することで、ストリートをまたいだ
 * サイズの一貫性を確保しスタック投入が予測可能になる。
 *
 * カテゴリ別の方針:
 *   NUTTED     : 幾何学的サイズ (ナットアドバンテージあれば overbet も可)
 *   VALUE      : 幾何学的サイズ (ナットアドバンテージなければ large を回避)
 *   SEMI_BLUFF : 幾何学的サイズ (medium に上限 = ジャムは避ける)
 *   SHOWDOWN   : 固定 small (ポットを大きくしない)
 *   BLUFF      : 固定 small (alpha計算は呼び出し側で実施)
 */
export function selectBetSize(
  category: HandCategory,
  boardAdv: BoardAdvantageResult,
  spr: number,
  streetsRemaining: number,
): { bucket: BetSizeBucket; fraction: number } {
  // SHOWDOWN / BLUFF: ポットを膨らませない
  if (category === 'SHOWDOWN' || category === 'BLUFF') {
    return { bucket: 'small', fraction: 0.33 };
  }

  const { bucket: geoBucket, fraction: geoFraction } = getGeometricBetSize(spr, streetsRemaining);

  if (category === 'NUTTED') {
    // ナットアドバンテージあり → オーバーベットも許可
    // なし → large まで (1.0 で上限)
    const cappedFraction = boardAdv.hasNutAdvantage
      ? geoFraction
      : Math.min(geoFraction, 1.0);
    return { bucket: geoBucket, fraction: cappedFraction };
  }

  if (category === 'VALUE') {
    // ナットアドバンテージなしでは large を回避 (マージドレンジを維持)
    if (!boardAdv.hasNutAdvantage && geoBucket === 'large') {
      return { bucket: 'medium', fraction: 0.67 };
    }
    return { bucket: geoBucket, fraction: geoFraction };
  }

  if (category === 'SEMI_BLUFF') {
    // ジャムとしてのセミブラフは過剰コミット → medium に上限
    if (geoBucket === 'large') {
      return { bucket: 'medium', fraction: 0.67 };
    }
    return { bucket: geoBucket, fraction: geoFraction };
  }

  return { bucket: geoBucket, fraction: geoFraction };
}

// ── ウェットネスバケット変換 ────────────────────────────────────────────────

export function wetnessToKey(wetness: number): 'dry' | 'semi' | 'wet' {
  if (wetness <= 1) return 'dry';
  if (wetness === 2) return 'semi';
  return 'wet';
}

// ── 頻度への乗数適用 ─────────────────────────────────────────────────────────

export function applyRangeMultiplier(
  base: AggressorFrequencies,
  multiplier: number,
): AggressorFrequencies {
  const betBase = base.betSmall + base.betMedium + base.betLarge;
  const newBet = Math.min(betBase * multiplier, 100);
  const diff = newBet - betBase;
  const check = Math.max(0, base.check - diff);

  // 各betの比率を維持しながら合計を調整
  const ratio = betBase > 0 ? newBet / betBase : 1;
  return {
    check,
    betSmall:  Math.round(base.betSmall  * ratio),
    betMedium: Math.round(base.betMedium * ratio),
    betLarge:  Math.round(base.betLarge  * ratio),
  };
}

// ── SPR補正 (Fix A: カテゴリ別、セクション10B-3版) ──────────────────────────

/**
 * カテゴリ別 SPR 修正。
 *
 * Fix A: 一律変更ではなく、カテゴリごとに正しい方向へ調整する。
 *
 *   低SPR (<3):
 *     NUTTED/VALUE  → ラージ増・チェック減 (コミット機会を活かす)
 *     SEMI_BLUFF    → やや保守的 (含み益が少ない)
 *     SHOWDOWN      → ベット微増 (ポットオッズが良い)
 *     BLUFF         → 変更なし
 *
 *   高SPR (>10):
 *     SEMI_BLUFF    → ベット積極化 (含み益が大きい)
 *     SHOWDOWN      → チェック増大 (過剰コミット回避)
 *     BLUFF         → ベット微減 (相手の含み益が大きいため)
 *     NUTTED/VALUE  → 変更なし (まだポットを積み上げる段階)
 */
export function applySPRModifier(
  freq: AggressorFrequencies,
  category: HandCategory,
  spr: number,
): AggressorFrequencies {
  if (spr < 3) {
    if (category === 'NUTTED' || category === 'VALUE') {
      return {
        check:     Math.max(0, freq.check - 12),
        betSmall:  Math.max(0, freq.betSmall - 5),
        betMedium: freq.betMedium,
        betLarge:  Math.min(100, freq.betLarge + 17),
      };
    }
    if (category === 'SEMI_BLUFF') {
      return {
        check:     Math.min(100, freq.check + 5),
        betSmall:  freq.betSmall,
        betMedium: Math.max(0, freq.betMedium - 5),
        betLarge:  freq.betLarge,
      };
    }
    if (category === 'SHOWDOWN') {
      return {
        check:    Math.max(0, freq.check - 5),
        betSmall: Math.min(100, freq.betSmall + 5),
        betMedium: freq.betMedium,
        betLarge: freq.betLarge,
      };
    }
    return freq; // BLUFF: 変更なし
  }

  if (spr > 10) {
    if (category === 'SEMI_BLUFF') {
      // 含み益が大きい → より積極的にベット
      return {
        check:     Math.max(0, freq.check - 10),
        betSmall:  Math.max(0, freq.betSmall - 5),
        betMedium: Math.min(100, freq.betMedium + 15),
        betLarge:  freq.betLarge,
      };
    }
    if (category === 'SHOWDOWN') {
      // 高SPRでは安全にエクイティを実現
      return {
        check:     Math.min(100, freq.check + 12),
        betSmall:  Math.max(0, freq.betSmall - 8),
        betMedium: Math.max(0, freq.betMedium - 4),
        betLarge:  freq.betLarge,
      };
    }
    if (category === 'BLUFF') {
      // 相手の含み益が大きい → ブラフ効率が下がる
      return {
        check:    Math.min(100, freq.check + 5),
        betSmall: Math.max(0, freq.betSmall - 5),
        betMedium: freq.betMedium,
        betLarge: freq.betLarge,
      };
    }
    // NUTTED/VALUE: 変更なし
    return freq;
  }

  return freq; // 中間SPR (3-10): 調整なし
}

export function applyPositionModifier(
  freq: AggressorFrequencies,
  isIP: boolean,
): AggressorFrequencies {
  if (isIP) {
    // IP: 相手の反応を見てから行動できる → チェック増
    return {
      check: Math.min(100, freq.check + 8),
      betSmall: freq.betSmall,
      betMedium: Math.max(0, freq.betMedium - 4),
      betLarge: Math.max(0, freq.betLarge - 4),
    };
  }
  // OOP: フリーカードを与えられない → ベット増
  return {
    check: Math.max(0, freq.check - 8),
    betSmall: freq.betSmall,
    betMedium: Math.min(100, freq.betMedium + 4),
    betLarge: Math.min(100, freq.betLarge + 4),
  };
}

export function applyStreetModifier(
  freq: AggressorFrequencies,
  street: 'flop' | 'turn' | 'river',
): AggressorFrequencies {
  // ターン/リバーに向かうほどポラライズ (large増, small減)
  if (street === 'turn') {
    return {
      check: freq.check,
      betSmall:  Math.max(0, freq.betSmall - 5),
      betMedium: freq.betMedium,
      betLarge:  Math.min(100, freq.betLarge + 5),
    };
  }
  if (street === 'river') {
    // リバー: small完全廃止、large/checkの2択
    const total = freq.betMedium + freq.betLarge + freq.betSmall;
    return {
      check: freq.check + freq.betSmall,
      betSmall:  0,
      betMedium: Math.round(total * 0.3),
      betLarge:  Math.round(total * 0.7),
    };
  }
  return freq;
}

// ── 正規化 ───────────────────────────────────────────────────────────────────

export function normalizeFrequencies(freq: AggressorFrequencies): AggressorFrequencies {
  const total = freq.check + freq.betSmall + freq.betMedium + freq.betLarge;
  if (total === 0) return { check: 100, betSmall: 0, betMedium: 0, betLarge: 0 };
  return {
    check:     Math.round(freq.check     / total * 100),
    betSmall:  Math.round(freq.betSmall  / total * 100),
    betMedium: Math.round(freq.betMedium / total * 100),
    betLarge:  Math.round(freq.betLarge  / total * 100),
  };
}
