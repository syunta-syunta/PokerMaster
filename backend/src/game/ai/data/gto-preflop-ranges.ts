// gto-preflop-ranges.ts
// PokerMaster GTO Preflop Range Tables
// Based on commonly published 6max 100BB cash game GTO solutions

// ============================================
// 型定義
// ============================================

export type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB";
export type Position8Max = "UTG" | "UTG1" | "UTG2" | "LJ" | "HJ" | "CO" | "BTN" | "SB" | "BB";

export interface ActionFrequency {
  fold: number;   // 0-100
  call: number;   // 0-100
  raise: number;  // 0-100
}

export interface RangeEntry {
  hand: string;
  action: ActionFrequency;
}

export interface PreflopRangeTable {
  position: string;
  scenario: string;
  vsPosition?: string;
  stackDepthBB: number;
  entries: Record<string, ActionFrequency>;
}

// ============================================
// 13x13 ハンドマトリクス定義
// ============================================
// 行 = 1枚目, 列 = 2枚目
// 対角線上 = ポケットペア
// 対角線より上 = スーテッド (s)
// 対角線より下 = オフスーテッド (o)

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;

export const ALL_HANDS: string[] = [];
for (let i = 0; i < RANKS.length; i++) {
  for (let j = 0; j < RANKS.length; j++) {
    if (i === j) {
      ALL_HANDS.push(`${RANKS[i]}${RANKS[j]}`);  // ポケットペア
    } else if (i < j) {
      ALL_HANDS.push(`${RANKS[i]}${RANKS[j]}s`);  // スーテッド
    } else {
      ALL_HANDS.push(`${RANKS[j]}${RANKS[i]}o`);  // オフスーテッド
    }
  }
}

// ============================================
// ヘルパー: レンジ作成ユーティリティ
// ============================================

/** 全ハンドをFoldで初期化 */
function createEmptyRange(): Record<string, ActionFrequency> {
  const range: Record<string, ActionFrequency> = {};
  for (const hand of ALL_HANDS) {
    range[hand] = { fold: 100, call: 0, raise: 0 };
  }
  return range;
}

/** 指定ハンドをRaise 100%に設定 */
function setRaise(range: Record<string, ActionFrequency>, hands: string[]): void {
  for (const hand of hands) {
    if (range[hand]) {
      range[hand] = { fold: 0, call: 0, raise: 100 };
    }
  }
}

/** 指定ハンドをミックス（Raise/Fold）に設定 */
function setMixed(range: Record<string, ActionFrequency>, hand: string, raiseFreq: number): void {
  if (range[hand]) {
    range[hand] = { fold: 100 - raiseFreq, call: 0, raise: raiseFreq };
  }
}

// ============================================
// 6MAX RFI (Raise First In) レンジ
// 100BB キャッシュゲーム
// ============================================
// 参考: 公開GTOソルバー出力に基づく標準的な6maxレンジ
// オープンレイズサイズ: 2.5BB (UTG-CO), 2.5BB (BTN), 3BB (SB)

function createUTG_RFI(): Record<string, ActionFrequency> {
  const range = createEmptyRange();
  // Open freq: ~15% (verified)

  // --- Pure Raise (100%) ---
  setRaise(range, [
    // ポケットペア
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77",
    // スーテッド Ax
    "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s",
    // スーテッド Kx
    "KQs", "KJs", "KTs",
    // スーテッド Qx
    "QJs", "QTs",
    // スーテッド Jx
    "JTs",
    // スーテッド コネクター
    "T9s", "98s", "87s",
    // オフスーテッド
    "AKo", "AQo", "AJo", "ATo",
  ]);

  // --- Mixed ---
  setMixed(range, "66", 90);
  setMixed(range, "55", 70);
  setMixed(range, "44", 35);
  setMixed(range, "A8s", 45);
  setMixed(range, "A2s", 55);
  setMixed(range, "K9s", 60);
  setMixed(range, "Q9s", 50);
  setMixed(range, "J9s", 55);
  setMixed(range, "76s", 60);
  setMixed(range, "65s", 55);
  setMixed(range, "54s", 35);
  setMixed(range, "KQo", 40);

  return range;
}

function createHJ_RFI(): Record<string, ActionFrequency> {
  const range = createEmptyRange();

  setRaise(range, [
    // ポケットペア
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    // スーテッド Ax
    "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s", "A2s",
    // スーテッド Kx
    "KQs", "KJs", "KTs", "K9s",
    // スーテッド Qx
    "QJs", "QTs",
    // スーテッド Jx
    "JTs",
    // スーテッド コネクター
    "T9s", "98s", "87s",
    // オフスーテッド
    "AKo", "AQo", "AJo", "ATo",
  ]);

  setMixed(range, "55", 80);
  setMixed(range, "44", 50);
  setMixed(range, "A8s", 50);
  setMixed(range, "Q9s", 50);
  setMixed(range, "J9s", 60);
  setMixed(range, "76s", 70);
  setMixed(range, "65s", 60);
  setMixed(range, "54s", 40);
  setMixed(range, "KQo", 60);

  return range;
}

function createCO_RFI(): Record<string, ActionFrequency> {
  const range = createEmptyRange();

  setRaise(range, [
    // ポケットペア
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55",
    // スーテッド Ax
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A5s", "A4s", "A3s", "A2s",
    // スーテッド Kx
    "KQs", "KJs", "KTs", "K9s", "K8s",
    // スーテッド Qx
    "QJs", "QTs", "Q9s",
    // スーテッド Jx
    "JTs", "J9s",
    // スーテッド コネクター
    "T9s", "98s", "87s", "76s", "65s",
    // オフスーテッド
    "AKo", "AQo", "AJo", "ATo", "KQo",
  ]);

  setMixed(range, "44", 80);
  setMixed(range, "33", 60);
  setMixed(range, "22", 40);
  setMixed(range, "A6s", 70);
  setMixed(range, "K7s", 50);
  setMixed(range, "K6s", 40);
  setMixed(range, "Q8s", 50);
  setMixed(range, "J8s", 40);
  setMixed(range, "T8s", 60);
  setMixed(range, "54s", 70);
  setMixed(range, "KJo", 80);
  setMixed(range, "KTo", 50);
  setMixed(range, "QJo", 50);
  setMixed(range, "A9o", 50);

  return range;
}

function createBTN_RFI(): Record<string, ActionFrequency> {
  const range = createEmptyRange();

  setRaise(range, [
    // ポケットペア（全て）
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    // スーテッド Ax（全て）
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    // スーテッド Kx
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s",
    // スーテッド Qx
    "QJs", "QTs", "Q9s", "Q8s", "Q7s",
    // スーテッド Jx
    "JTs", "J9s", "J8s", "J7s",
    // スーテッド Tx
    "T9s", "T8s", "T7s",
    // スーテッド コネクター
    "98s", "97s", "87s", "86s", "76s", "75s", "65s", "64s", "54s", "53s", "43s",
    // オフスーテッド
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o",
    "KQo", "KJo", "KTo", "K9o",
    "QJo", "QTo", "Q9o",
    "JTo", "J9o",
    "T9o",
  ]);

  setMixed(range, "K3s", 60);
  setMixed(range, "K2s", 50);
  setMixed(range, "Q6s", 60);
  setMixed(range, "Q5s", 40);
  setMixed(range, "J6s", 40);
  setMixed(range, "T6s", 50);
  setMixed(range, "96s", 50);
  setMixed(range, "85s", 50);
  setMixed(range, "42s", 30);
  setMixed(range, "A3o", 60);
  setMixed(range, "A2o", 40);
  setMixed(range, "K8o", 50);
  setMixed(range, "Q8o", 40);
  setMixed(range, "J8o", 30);
  setMixed(range, "T8o", 40);
  setMixed(range, "98o", 50);

  return range;
}

function createSB_RFI(): Record<string, ActionFrequency> {
  const range = createEmptyRange();

  // SBはBBとのヘッズアップ。3BBオープンが標準。
  // レンジはBTNより少し狭め（OOPのため）
  setRaise(range, [
    // ポケットペア
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44",
    // スーテッド Ax
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    // スーテッド Kx
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s",
    // スーテッド Qx
    "QJs", "QTs", "Q9s", "Q8s",
    // スーテッド Jx
    "JTs", "J9s", "J8s",
    // スーテッド Tx
    "T9s", "T8s",
    // スーテッド コネクター
    "98s", "87s", "76s", "65s", "54s",
    // オフスーテッド
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o",
    "KQo", "KJo", "KTo",
    "QJo", "QTo",
    "JTo",
  ]);

  setMixed(range, "33", 70);
  setMixed(range, "22", 50);
  setMixed(range, "K4s", 50);
  setMixed(range, "Q7s", 40);
  setMixed(range, "J7s", 40);
  setMixed(range, "T7s", 50);
  setMixed(range, "97s", 50);
  setMixed(range, "86s", 50);
  setMixed(range, "75s", 50);
  setMixed(range, "43s", 40);
  setMixed(range, "A6o", 50);
  setMixed(range, "A5o", 60);
  setMixed(range, "K9o", 50);
  setMixed(range, "Q9o", 40);
  setMixed(range, "J9o", 30);
  setMixed(range, "T9o", 50);

  return range;
}


// ============================================
// エクスポート: 全RFIレンジ
// ============================================

export const GTO_RFI_RANGES: Record<string, PreflopRangeTable> = {
  UTG: {
    position: "UTG",
    scenario: "RFI",
    stackDepthBB: 100,
    entries: createUTG_RFI(),
  },
  HJ: {
    position: "HJ",
    scenario: "RFI",
    stackDepthBB: 100,
    entries: createHJ_RFI(),
  },
  CO: {
    position: "CO",
    scenario: "RFI",
    stackDepthBB: 100,
    entries: createCO_RFI(),
  },
  BTN: {
    position: "BTN",
    scenario: "RFI",
    stackDepthBB: 100,
    entries: createBTN_RFI(),
  },
  SB: {
    position: "SB",
    scenario: "RFI",
    stackDepthBB: 100,
    entries: createSB_RFI(),
  },
};


// ============================================
// ユーティリティ関数
// ============================================

/**
 * RNGに基づいてプリフロップアクションを決定
 */
export function decidePreflopAction(
  hand: string,
  position: string,
  scenario: string,
  rng: number // 0-100
): "fold" | "call" | "raise" {
  const rangeTable = GTO_RFI_RANGES[position];
  if (!rangeTable) return "fold";

  const entry = rangeTable.entries[hand];
  if (!entry) return "fold";

  if (rng <= entry.raise) return "raise";
  if (rng <= entry.raise + entry.call) return "call";
  return "fold";
}

/**
 * ハンド表記をソート用数値に変換
 */
export function handToValue(hand: string): number {
  const rankValues: Record<string, number> = {
    "A": 14, "K": 13, "Q": 12, "J": 11, "T": 10,
    "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
  };
  const r1 = rankValues[hand[0]] || 0;
  const r2 = rankValues[hand[1]] || 0;
  const suited = hand.endsWith("s") ? 1 : 0;
  return r1 * 100 + r2 * 10 + suited;
}

/**
 * レンジのオープン頻度(%)を計算
 */
export function calculateOpenFrequency(range: Record<string, ActionFrequency>): number {
  let totalCombos = 0;
  let openCombos = 0;

  for (const [hand, freq] of Object.entries(range)) {
    // コンボ数の計算
    let combos: number;
    if (hand.length === 2) {
      // ポケットペア: 6コンボ
      combos = 6;
    } else if (hand.endsWith("s")) {
      // スーテッド: 4コンボ
      combos = 4;
    } else {
      // オフスーテッド: 12コンボ
      combos = 12;
    }

    totalCombos += combos;
    openCombos += combos * ((freq.raise + freq.call) / 100);
  }

  return Math.round((openCombos / totalCombos) * 1000) / 10;
}


// ============================================
// デバッグ: レンジサマリー表示
// ============================================

export function printRangeSummary(): void {
  for (const [pos, range] of Object.entries(GTO_RFI_RANGES)) {
    const freq = calculateOpenFrequency(range.entries);
    console.log(`${pos} RFI: ${freq}%`);
  }
}
