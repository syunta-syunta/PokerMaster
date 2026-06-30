// backend/src/game/ai/postflop/PostflopEngine.ts
//
// 注: ベットサイズ・betAmount計算は SPEC-phase3c.md セクション10B-4 アドエンダム
//     (Fix B: 幾何学的サイジング) に従い、selectBetSize() が返す sizeFraction を
//     一律に使用する（betSmall/betMedium/betLargeのどの頻度バケットが選ばれても、
//     実際の金額は同一の幾何学的フラクションに基づく）。

import {
  Card, HandResult, PostflopContext, PostflopDecision, HandCategory, BetSizeBucket,
} from '../../types/game.types';
import { detectComboDrawIfAny } from './DrawDetector';
import { classifyHand } from './HandClassifier';
import { analyzeBoardAdvantage } from './BoardAnalyzer';
import { calculateBluffFrequency, assessBlockerQuality } from './BluffCalculator';
import { getStreetsRemaining } from './BetSizer';
import {
  AGGRESSOR_TABLE, DEFENDER_TABLE,
  selectBetSize, wetnessToKey,
  applyRangeMultiplier, applySPRModifier,
  applyPositionModifier, applyStreetModifier,
  normalizeFrequencies,
} from './PostflopStrategy';

/**
 * ポストフロップの行動を決定するメインエントリーポイント。
 *
 * GTO思考プロセスを順に実行する:
 *   Step 1: レンジレベル評価 (BoardAnalyzer)
 *   Step 2: ハンド分類 (HandClassifier + DrawDetector)
 *   Step 3: 頻度計算 (PostflopStrategy + BluffCalculator)
 *   Step 4: ベットサイズ選択
 *   Step 5: RNGで混合戦略を実行
 */
export function decidePostflopAction(
  holeCards: [Card, Card],
  communityCards: Card[],
  handResult: HandResult,
  context: PostflopContext,
): PostflopDecision {

  // ═══ Step 1: レンジレベル評価 (Gap 1 解決) ═══
  const boardAdv = analyzeBoardAdvantage(communityCards, context.isPFA);

  // ═══ Step 2: ハンド分類 ═══
  let draw = detectComboDrawIfAny(holeCards, communityCards, handResult.rankValue);

  // リバーではドローという概念が存在しない（追加カードが来ないため、
  // 未完成のドローは「外れたドロー」であり SEMI_BLUFF ではなく BLUFF として扱う）。
  if (context.street === 'river') {
    draw = 'none';
  }

  const category = classifyHand(handResult, holeCards, communityCards, draw);

  // ═══ Step 3 & 4: アクションを決定 ═══
  if (context.facingBet !== null && context.facingBetSizeBucket !== null) {
    // ── ディフェンダー (ベットに直面している) ──
    return decideDefenderAction(category, context, draw);
  } else {
    // ── アグレッサー (自分が先に行動する) ──
    return decideAggressorAction(category, context, holeCards, communityCards, boardAdv, draw);
  }
}

function decideAggressorAction(
  category: HandCategory,
  context: PostflopContext,
  holeCards: [Card, Card],
  communityCards: Card[],
  boardAdv: ReturnType<typeof analyzeBoardAdvantage>,
  draw: ReturnType<typeof detectComboDrawIfAny>,
): PostflopDecision {
  const streetsRemaining = getStreetsRemaining(context.street);
  const { bucket: sizeBucket, fraction: sizeFraction } =
    selectBetSize(category, boardAdv, context.spr, streetsRemaining);
  const wetnessKey = wetnessToKey(boardAdv.wetness);

  let frequencies;

  if (category === 'BLUFF') {
    // Gap 2 解決: alphaから均衡ブラフ頻度を計算
    const blockerQ = assessBlockerQuality(holeCards, communityCards);
    const bluffFreq = calculateBluffFrequency(
      sizeBucket, context.street, blockerQ,
      boardAdv.betFreqMultiplier, // ズレB修正: 乗数適用
    );
    const bluffPct = Math.round(bluffFreq * 100);
    const checkPct = 100 - bluffPct;

    frequencies = {
      check: checkPct,
      betSmall:  sizeBucket === 'small'  ? bluffPct : 0,
      betMedium: sizeBucket === 'medium' ? bluffPct : 0,
      betLarge:  sizeBucket === 'large'  ? bluffPct : 0,
    };
  } else {
    // NUTTED/VALUE/SHOWDOWN/SEMI_BLUFFはテーブルから取得
    const base = AGGRESSOR_TABLE[category][wetnessKey];

    // Gap 1 解決: レンジアドバンテージ乗数を適用
    frequencies = applyRangeMultiplier(base, boardAdv.betFreqMultiplier);
  }

  // SPR・ポジション・ストリート補正 (Fix A: applySPRModifierにcategoryを渡す)
  frequencies = applySPRModifier(frequencies, category, context.spr);
  frequencies = applyPositionModifier(frequencies, context.isIP);
  frequencies = applyStreetModifier(frequencies, context.street);
  frequencies = normalizeFrequencies(frequencies);

  // RNGで混合戦略を実行
  const rng = Math.random() * 100;
  let cumulative = 0;

  if (rng < (cumulative += frequencies.check)) {
    return { action: 'check', category, drawType: draw };
  }

  // Fix B: どのサイズ頻度バケットが選ばれても、実際の金額は
  // selectBetSize() が決定した単一の幾何学的フラクションを使用する。
  const betAmount = Math.min(context.pot * sizeFraction, context.effectiveStack);

  if (rng < (cumulative += frequencies.betSmall)) {
    return { action: 'bet', betSizeBucket: 'small', betAmount, category, drawType: draw };
  }
  if (rng < (cumulative += frequencies.betMedium)) {
    return { action: 'bet', betSizeBucket: 'medium', betAmount, category, drawType: draw };
  }
  return { action: 'bet', betSizeBucket: 'large', betAmount, category, drawType: draw };
}

function decideDefenderAction(
  category: HandCategory,
  context: PostflopContext,
  draw: ReturnType<typeof detectComboDrawIfAny>,
): PostflopDecision {
  // ズレA修正: ベットサイズ別のディフェンダーテーブルを参照
  const sizeBucket = context.facingBetSizeBucket ?? 'medium';
  const freq = DEFENDER_TABLE[category][sizeBucket];

  const rng = Math.random() * 100;
  let cumulative = 0;

  if (rng < (cumulative += freq.fold)) {
    return { action: 'fold', category, drawType: draw };
  }
  if (rng < (cumulative += freq.call)) {
    return { action: 'call', category, drawType: draw };
  }
  // レイズ: ベットの3倍を基準に
  const raiseAmount = (context.facingBet ?? 0) * 3;
  return { action: 'raise', betAmount: raiseAmount, category, drawType: draw };
}

/** 直面しているベット額からBetSizeBucketを判定するユーティリティ */
export function classifyFacingBetSize(
  betAmount: number,
  pot: number,
): BetSizeBucket {
  const fraction = betAmount / pot;
  if (fraction <= 0.45) return 'small';
  if (fraction <= 0.85) return 'medium';
  return 'large';
}
