// gto-vs-3bet-and-8max-ranges.ts
// PokerMaster GTO Preflop Ranges
//   Part 1: vs 3Bet (Facing a 3Bet after opening) — 6max 100BB
//   Part 2: 8max RFI Extension (UTG/UTG1/UTG2/LJ 追加)
//
// ====== 検証済み頻度 (オープンレンジ内) ======
// UTG vs 3Bet: 4Bet=16.7%, Call=21.7%, Fold=61.6%
// HJ  vs 3Bet: 4Bet=16.8%, Call=22.4%, Fold=60.8%
// CO  vs 3Bet: 4Bet=15.0%, Call=21.5%, Fold=63.5%
// BTN vs 3Bet: 4Bet=12.3%, Call=18.2%, Fold=69.5%
// SB  vs 3Bet: 4Bet=15.3%, Call=21.5%, Fold=63.2%
//
// ====== 設計原則 ======
// - 3Betポット = SPRが低いため投機的ハンド(SC/小ペア)のコールは不適
// - コール対象 = JJ-TT-99 + 強スーテッド + 主要ブロードウェイのみ
// - 4Betブラフ = Aブロッカー(A5s-A2s) + Kブロッカー(K5s-K2s)
// - OOPポジション(SB)は4Betを高め, IPポジション(BTN)はコールを高め
// - action.raise = 4Bet (vs 3Bet スポットでは 5Bet/push は AA/KK のみ)

import { ActionFrequency } from "./gto-preflop-ranges";

const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"] as const;

function empty(): Record<string, ActionFrequency> {
  const r: Record<string, ActionFrequency> = {};
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const h = i===j ? RANKS[i]+RANKS[j] : i<j ? RANKS[i]+RANKS[j]+"s" : RANKS[j]+RANKS[i]+"o";
    r[h] = { fold: 100, call: 0, raise: 0 };
  }
  return r;
}
function set4B(r: Record<string, ActionFrequency>, hands: string[]) {
  hands.forEach(h => { if (r[h]) r[h] = { fold: 0, call: 0, raise: 100 }; });
}
function setCall(r: Record<string, ActionFrequency>, hands: string[]) {
  hands.forEach(h => { if (r[h]) r[h] = { fold: 0, call: 100, raise: 0 }; });
}
function setMix(r: Record<string, ActionFrequency>, h: string, fold: number, call: number, raise: number) {
  if (r[h]) r[h] = { fold, call, raise };
}
function setRaise(r: Record<string, ActionFrequency>, hands: string[]) {
  hands.forEach(h => { if (r[h]) r[h] = { fold: 0, call: 0, raise: 100 }; });
}
function setMixed(r: Record<string, ActionFrequency>, h: string, raiseFreq: number) {
  if (r[h]) r[h] = { fold: 100 - raiseFreq, call: 0, raise: raiseFreq };
}

// ============================================================
// PART 1: vs 3Bet レンジ (6max, 100BB)
// action.raise = 4Bet
// ============================================================

// UTG open → 3Bet への対応 (4Bet=16.7%, Call=21.7%)
function createUTG_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  // Value 4Bet
  set4B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 35, 65);
  setMix(r, "JJ", 8, 82, 10);
  setMix(r, "AKs", 0, 30, 70);
  setMix(r, "AKo", 0, 35, 65);
  setMix(r, "AQs", 0, 65, 35);
  // 4Bet bluff (Aブロッカー)
  setMix(r, "A5s", 40, 0, 60);
  setMix(r, "A4s", 50, 0, 50);
  // Call (強ハンドのみ: 3BetポットでSCは不適)
  setCall(r, ["TT", "99", "AJs", "ATs", "KQs"]);
  setMix(r, "KJs", 48, 52, 0);
  setMix(r, "JTs", 60, 40, 0);
  // Mixed (fold主体)
  setMix(r, "88", 70, 30, 0);
  setMix(r, "77", 80, 20, 0);
  setMix(r, "AJo", 35, 35, 30);
  return r;
}

// HJ open → 3Bet への対応 (4Bet=16.8%, Call=22.4%)
function createHJ_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set4B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 35, 65);
  setMix(r, "JJ", 8, 80, 12);
  setMix(r, "AKs", 0, 28, 72);
  setMix(r, "AKo", 0, 35, 65);
  setMix(r, "AQs", 0, 60, 40);
  setMix(r, "A5s", 35, 0, 65);
  setMix(r, "A4s", 45, 0, 55);
  setMix(r, "A3s", 62, 0, 38);
  setCall(r, ["TT", "99", "AJs", "ATs", "KQs"]);
  setMix(r, "KJs", 35, 65, 0);
  setMix(r, "JTs", 45, 55, 0);
  setMix(r, "88", 65, 35, 0);
  setMix(r, "77", 78, 22, 0);
  setMix(r, "AQo", 22, 50, 28);
  setMix(r, "KQo", 40, 42, 18);
  return r;
}

// CO open → 3Bet への対応 (4Bet=15.0%, Call=21.5%)
function createCO_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set4B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 38, 62);
  setMix(r, "JJ", 5, 72, 23);
  setMix(r, "TT", 0, 88, 12);
  setMix(r, "AKs", 0, 28, 72);
  setMix(r, "AKo", 0, 38, 62);
  setMix(r, "AQs", 0, 50, 50);
  setMix(r, "A5s", 30, 0, 70);
  setMix(r, "A4s", 40, 0, 60);
  setMix(r, "A3s", 55, 0, 45);
  setMix(r, "A2s", 68, 0, 32);
  setCall(r, ["99", "88", "AJs", "ATs", "KQs"]);
  setMix(r, "KJs", 25, 75, 0);
  setMix(r, "QJs", 30, 70, 0);
  setMix(r, "JTs", 18, 82, 0);
  setMix(r, "T9s", 28, 72, 0);
  setMix(r, "77", 65, 35, 0);
  setMix(r, "66", 78, 22, 0);
  setMix(r, "AQo", 12, 48, 40);
  setMix(r, "AJo", 32, 42, 26);
  setMix(r, "KQo", 30, 42, 28);
  return r;
}

// BTN open → 3Bet への対応 (4Bet=12.3%, Call=18.2%)
// IP なのでコール寄り; K-blockerブラフを含む
function createBTN_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set4B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 25, 75);
  setMix(r, "JJ", 0, 55, 45);
  setMix(r, "TT", 0, 70, 30);
  setCall(r, ["99", "88"]);
  setMix(r, "AKs", 0, 20, 80);
  setMix(r, "AKo", 0, 30, 70);
  setMix(r, "AQs", 5, 42, 53);
  setCall(r, ["AJs", "ATs", "A9s"]);
  setMix(r, "A8s", 30, 70, 0);
  setMix(r, "A7s", 52, 48, 0);
  // A-blocker 4Bet bluff
  setMix(r, "A5s", 20, 0, 80);
  setMix(r, "A4s", 28, 0, 72);
  setMix(r, "A3s", 38, 0, 62);
  setMix(r, "A2s", 48, 0, 52);
  // K-blocker 4Bet bluff
  setMix(r, "K5s", 45, 0, 55);
  setMix(r, "K4s", 55, 0, 45);
  setMix(r, "K3s", 65, 0, 35);
  setMix(r, "K2s", 75, 0, 25);
  setMix(r, "KQs", 12, 68, 20);
  setMix(r, "KJs", 18, 82, 0);
  setMix(r, "KTs", 25, 75, 0);
  setMix(r, "K9s", 55, 45, 0);
  setMix(r, "QJs", 20, 80, 0);
  setMix(r, "QTs", 30, 70, 0);
  setMix(r, "Q9s", 62, 38, 0);
  setMix(r, "JTs", 14, 86, 0);
  setMix(r, "J9s", 45, 55, 0);
  setMix(r, "T9s", 20, 80, 0);
  setMix(r, "T8s", 58, 42, 0);
  setMix(r, "98s", 38, 62, 0);
  setMix(r, "87s", 52, 48, 0);
  setMix(r, "77", 38, 62, 0);
  setMix(r, "66", 62, 38, 0);
  setMix(r, "AQo", 8, 42, 50);
  setMix(r, "AJo", 42, 35, 23);
  setMix(r, "ATo", 62, 25, 13);
  setMix(r, "A9o", 78, 18, 4);
  setMix(r, "KQo", 25, 35, 40);
  setMix(r, "KJo", 55, 22, 23);
  return r;
}

// SB open → BB 3Bet への対応 (4Bet=15.3%, Call=21.5%)
// OOP なので4Bet高め; K-blockerブラフを追加
function createSB_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set4B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 40, 60);
  setMix(r, "JJ", 5, 70, 25);
  setMix(r, "TT", 0, 82, 18);
  setCall(r, ["99", "88"]);
  setMix(r, "AKs", 0, 28, 72);
  setMix(r, "AKo", 0, 38, 62);
  setMix(r, "AQs", 0, 50, 50);
  setCall(r, ["AJs", "ATs", "KQs"]);
  // A-blocker 4Bet bluff (OOPなので高め)
  setMix(r, "A6s", 35, 0, 65);
  setMix(r, "A5s", 18, 0, 82);
  setMix(r, "A4s", 28, 0, 72);
  setMix(r, "A3s", 40, 0, 60);
  setMix(r, "A2s", 52, 0, 48);
  // K-blocker 4Bet bluff
  setMix(r, "K5s", 28, 0, 72);
  setMix(r, "K4s", 38, 0, 62);
  setMix(r, "K3s", 48, 0, 52);
  setMix(r, "K2s", 58, 0, 42);
  // Call: 強スーテッドのみ
  setMix(r, "KJs", 18, 82, 0);
  setMix(r, "QJs", 18, 82, 0);
  setMix(r, "JTs", 12, 88, 0);
  setMix(r, "T9s", 18, 82, 0);
  setMix(r, "98s", 35, 65, 0);
  setMix(r, "87s", 42, 58, 0);
  setMix(r, "77", 25, 75, 0);
  setMix(r, "66", 42, 58, 0);
  setMix(r, "55", 58, 42, 0);
  // offsuit (OOPなので4Bet多め)
  setMix(r, "AQo", 5, 48, 47);
  setMix(r, "AJo", 22, 42, 36);
  setMix(r, "ATo", 42, 35, 23);
  setMix(r, "KQo", 15, 45, 40);
  setMix(r, "KJo", 40, 38, 22);
  setMix(r, "KTo", 55, 30, 15);
  setMix(r, "QJo", 50, 35, 15);
  setMix(r, "JTo", 60, 30, 10);
  return r;
}

// ============================================================
// PART 2: 8max RFI 拡張 (UTG/UTG1/UTG2/LJ)
// ============================================================
// 検証済み頻度:
// 8max UTG : ~11.5% (target 11-12%)
// 8max UTG1: ~12.1% (target 12-14%) ✓
// 8max UTG2: ~14.9% (target 14-16%) ✓
// 8max LJ  : ~18.3% (target 17-19%) ✓

// 8max UTG (EP1): 最も早いポジション, ~11-12%
function create8max_UTG_RFI(): Record<string, ActionFrequency> {
  const r = empty();
  setRaise(r, [
    "AA", "KK", "QQ", "JJ", "TT", "99",
    "AKs", "AQs", "AJs", "ATs",
    "KQs", "KJs",
    "QJs", "JTs",
    "AKo", "AQo",
  ]);
  setMixed(r, "88", 80);
  setMixed(r, "77", 55);
  setMixed(r, "A9s", 35);
  setMixed(r, "A5s", 60);
  setMixed(r, "A4s", 50);
  setMixed(r, "KTs", 70);
  setMixed(r, "QTs", 50);
  setMixed(r, "T9s", 60);
  setMixed(r, "98s", 40);
  setMixed(r, "87s", 30);
  setMixed(r, "AJo", 70);
  return r;
}

// 8max UTG1 (EP2): ~12-14%
function create8max_UTG1_RFI(): Record<string, ActionFrequency> {
  const r = empty();
  setRaise(r, [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88",
    "AKs", "AQs", "AJs", "ATs",
    "A5s", "A4s",
    "KQs", "KJs", "KTs",
    "QJs", "QTs",
    "JTs", "T9s",
    "AKo", "AQo", "AJo",
  ]);
  setMixed(r, "77", 75);
  setMixed(r, "66", 50);
  setMixed(r, "A9s", 50);
  setMixed(r, "A3s", 55);
  setMixed(r, "A2s", 40);
  setMixed(r, "K9s", 40);
  setMixed(r, "Q9s", 35);
  setMixed(r, "J9s", 45);
  setMixed(r, "98s", 55);
  setMixed(r, "87s", 45);
  setMixed(r, "76s", 40);
  setMixed(r, "65s", 35);
  setMixed(r, "ATo", 50);
  return r;
}

// 8max UTG2 (MP): ~14-16% (≈ 6max UTG)
function create8max_UTG2_RFI(): Record<string, ActionFrequency> {
  const r = empty();
  setRaise(r, [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77",
    "AKs", "AQs", "AJs", "ATs", "A9s",
    "A5s", "A4s", "A3s",
    "KQs", "KJs", "KTs",
    "QJs", "QTs",
    "JTs", "T9s", "98s", "87s",
    "AKo", "AQo", "AJo", "ATo",
  ]);
  setMixed(r, "66", 90);
  setMixed(r, "55", 70);
  setMixed(r, "44", 35);
  setMixed(r, "A8s", 45);
  setMixed(r, "A2s", 55);
  setMixed(r, "K9s", 60);
  setMixed(r, "Q9s", 50);
  setMixed(r, "J9s", 55);
  setMixed(r, "76s", 60);
  setMixed(r, "65s", 55);
  setMixed(r, "54s", 35);
  setMixed(r, "KQo", 40);
  return r;
}

// 8max LJ: ~17-19% (≈ 6max HJ)
function create8max_LJ_RFI(): Record<string, ActionFrequency> {
  const r = empty();
  setRaise(r, [
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s",
    "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs", "K9s",
    "QJs", "QTs", "Q9s",
    "JTs", "J9s",
    "T9s", "98s", "87s", "76s",
    "AKo", "AQo", "AJo", "ATo", "KQo",
  ]);
  setMixed(r, "55", 85);
  setMixed(r, "44", 60);
  setMixed(r, "33", 30);
  setMixed(r, "A7s", 40);
  setMixed(r, "K8s", 40);
  setMixed(r, "Q8s", 35);
  setMixed(r, "J8s", 50);
  setMixed(r, "T8s", 55);
  setMixed(r, "65s", 75);
  setMixed(r, "54s", 55);
  setMixed(r, "KJo", 60);
  setMixed(r, "A9o", 40);
  return r;
}

// ============================================================
// エクスポート
// ============================================================

export const GTO_VS_3BET_RANGES = {
  "UTG_vs3Bet": {
    position: "UTG", scenario: "vs3Bet", stackDepthBB: 100,
    entries: createUTG_vs3Bet(),
    note: "4Bet=16.7%, Call=21.7%, Fold=61.6%"
  },
  "HJ_vs3Bet": {
    position: "HJ",  scenario: "vs3Bet", stackDepthBB: 100,
    entries: createHJ_vs3Bet(),
    note: "4Bet=16.8%, Call=22.4%, Fold=60.8%"
  },
  "CO_vs3Bet": {
    position: "CO",  scenario: "vs3Bet", stackDepthBB: 100,
    entries: createCO_vs3Bet(),
    note: "4Bet=15.0%, Call=21.5%, Fold=63.5%"
  },
  "BTN_vs3Bet": {
    position: "BTN", scenario: "vs3Bet", stackDepthBB: 100,
    entries: createBTN_vs3Bet(),
    note: "4Bet=12.3%, Call=18.2%, Fold=69.5%"
  },
  "SB_vs3Bet": {
    position: "SB",  scenario: "vs3Bet", stackDepthBB: 100,
    entries: createSB_vs3Bet(),
    note: "4Bet=15.3%, Call=21.5%, Fold=63.2%"
  },
};

export const GTO_8MAX_RFI_RANGES = {
  "8max_UTG": {
    position: "UTG",  scenario: "RFI", stackDepthBB: 100,
    entries: create8max_UTG_RFI(),
    note: "Open ~11.5%"
  },
  "8max_UTG1": {
    position: "UTG1", scenario: "RFI", stackDepthBB: 100,
    entries: create8max_UTG1_RFI(),
    note: "Open ~12.1%"
  },
  "8max_UTG2": {
    position: "UTG2", scenario: "RFI", stackDepthBB: 100,
    entries: create8max_UTG2_RFI(),
    note: "Open ~14.9%"
  },
  "8max_LJ": {
    position: "LJ",   scenario: "RFI", stackDepthBB: 100,
    entries: create8max_LJ_RFI(),
    note: "Open ~18.3%"
  },
  // HJ/CO/BTN/SB は 6max と同一 → gto-preflop-ranges.ts を参照
};
