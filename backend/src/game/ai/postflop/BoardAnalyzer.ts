// backend/src/game/ai/postflop/BoardAnalyzer.ts

import { Card, BoardAdvantageResult } from '../../types/game.types';
import { rankToValue } from '../../core/Card';

/**
 * ボードアドバンテージを分析する。
 *
 * GTO Step 1: 「誰がこのボードでレンジ優位を持つか？」
 * PFA = プリフロップアグレッサー (オープンレイズ/3Bet したプレイヤー)
 *
 * 原則:
 *   - ハイカード (A/K/Q): PFAのレンジに多い → PFA有利
 *   - ローコネクテッド (7-8-9, 5-6-7): Callerのレンジに多い → Caller有利
 *   - ミッドコネクテッド: 中立に近い
 */
export function analyzeBoardAdvantage(
  communityCards: Card[],
  isPFA: boolean,
): BoardAdvantageResult {
  const ranks = communityCards.map(c => rankToValue(c.rank));
  const sorted = [...ranks].sort((a, b) => b - a);
  const wetness = calculateWetness(communityCards);

  // ── PFAから見たボードスコアを算出 (0〜10, 5=中立) ──
  let pfaScore = 5.0;

  // ① ハイカードボーナス
  const topRank = sorted[0];
  if (topRank === 14) pfaScore += 2.5;       // Ace
  else if (topRank === 13) pfaScore += 1.5;   // King
  else if (topRank === 12) pfaScore += 0.8;   // Queen
  else if (topRank <= 9) pfaScore -= 1.5;     // ローボード

  // ② コネクティビティ (低いほどCallerが有利)
  const spread = sorted.length >= 2 ? sorted[0] - sorted[sorted.length - 1] : 0;
  if (spread <= 3) pfaScore -= 2.0;   // 非常にコネクテッド (8-9-T等)
  else if (spread <= 5) pfaScore -= 0.8; // やや連続

  // ③ ウェットボードはCallerのドローが増える
  if (wetness >= 3) pfaScore -= 0.5;

  // ④ ペアボードで低ペア: CallerのセットTripps可能性
  if (isBoardPaired(communityCards) && topRank <= 9) pfaScore -= 0.5;

  pfaScore = Math.max(0, Math.min(10, pfaScore));

  // isPFAならpfaScoreをそのまま使う; Callerなら反転
  const score = isPFA ? pfaScore : 10 - pfaScore;

  // ナットアドバンテージ: score >= 7 の高優位側
  // → ラージベット/オーバーベットが有効な状況
  const hasNutAdvantage = score >= 7.0;

  // ベット頻度乗数: 0.70〜1.30
  const betFreqMultiplier = 0.70 + (score / 10) * 0.60;

  return { score, hasNutAdvantage, betFreqMultiplier, wetness };
}

/**
 * ボードの「濡れ度」を 0〜3 で返す。
 * 0 = ドライ (K72 レインボー)
 * 3 = ウェット (987 ツートーン)
 */
export function calculateWetness(communityCards: Card[]): number {
  const suitCounts: Record<string, number> = {};
  communityCards.forEach(c => {
    suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
  });

  // スーツスコア
  const maxSuit = Math.max(...Object.values(suitCounts));
  const suitScore = maxSuit === 3 ? 3 : maxSuit === 2 ? 1 : 0;

  // コネクティビティスコア (フロップ3枚の範囲が狭いほど高い)
  if (communityCards.length < 2) return suitScore;
  const ranks = communityCards.map(c => rankToValue(c.rank)).sort((a, b) => a - b);
  const spread = ranks[ranks.length - 1] - ranks[0];
  const connScore = spread <= 3 ? 2 : spread <= 5 ? 1 : 0;

  return Math.min(3, suitScore + connScore);
}

function isBoardPaired(community: Card[]): boolean {
  const ranks = community.map(c => c.rank);
  return new Set(ranks).size < ranks.length;
}
