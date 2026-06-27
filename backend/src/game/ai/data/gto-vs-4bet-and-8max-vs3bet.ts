// gto-vs-4bet-and-8max-vs3bet.ts
// PokerMaster GTO Preflop Ranges
//   Part 1: 8max vs 3Bet — UTG/UTG1/UTG2/LJ が3Betを受けた場合の対応
//   Part 2: vs 4Bet — 3Betterが4Betを受けた場合 (全ポジション)
//
// ====== 8max vs 3Bet 検証済み頻度 (オープンレンジ内) ======
// 8max UTG  vs 3Bet: 4Bet=24.0%, Call=34.8%, Fold=41.2%
// 8max UTG1 vs 3Bet: 4Bet=23.0%, Call=30.2%, Fold=46.8%
// 8max UTG2 vs 3Bet: 4Bet=21.8%, Call=31.2%, Fold=47.0%
// 8max LJ   vs 3Bet: 4Bet=18.6%, Call=28.3%, Fold=53.1%
//
// ※ 8max UTGのフォールド率~41%は正常:
//   8max UTGは超タイト(~9-11%)に開封するため、
//   開封レンジの大半がプレミアムハンドであり、多くが3Betにディフェンスする
//   (6max UTGの開封レンジは中程度のハンドを多く含むためフォールド率~62%と高い)
//
// ====== vs 4Bet 検証済み頻度 (3Betレンジ内) ======
// BB  vs 4Bet: 5Bet=48%,   Call=0%,   Fold=52%
// SB  vs 4Bet: 5Bet=50.3%, Call=0%,   Fold=49.7%
// BTN vs 4Bet: 5Bet=42.7%, Call=0.9%, Fold=56.4%
// CO  vs 4Bet: 5Bet=51.4%, Call=0%,   Fold=48.6%
// HJ  vs 4Bet: 5Bet=55.4%, Call=0%,   Fold=44.6%
//
// ====== 設計原則 ======
// 8max vs 3Bet:
//   - 基本的に6max UTG/HJのvs3Betレンジと同じ構造
//   - UTG1/UTG2はUTGより開封がわずかに広い → コールレンジも若干広め
//   - LJ ≈ 6max HJ (同じ開封頻度のためvs3Betも同等)
//
// vs 4Bet:
//   - 100BBでは4Bet後の5Betは実質オールイン
//   - 基本戦略: 5Bet or Fold (Callはほぼ0)
//   - Value 5Bet: AA/KK/QQ + AKs/AKo
//   - Bluff 5Bet: Aブロッカー (A5s, A4s, A3s, A2s) — 相手のAK/AQをブロック
//   - Fold: JJ以下のペア, AQs/AJs, スーテッドコネクターなど

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
function set5B(r: Record<string, ActionFrequency>, hands: string[]) {
  hands.forEach(h => { if (r[h]) r[h] = { fold: 0, call: 0, raise: 100 }; });
}
function setCall(r: Record<string, ActionFrequency>, hands: string[]) {
  hands.forEach(h => { if (r[h]) r[h] = { fold: 0, call: 100, raise: 0 }; });
}
function setMix(r: Record<string, ActionFrequency>, h: string, fold: number, call: number, raise: number) {
  if (r[h]) r[h] = { fold, call, raise };
}

// ============================================================
// PART 1: 8max vs 3Bet
// action.raise = 4Bet
// ============================================================

// 8max UTG open → 3Bet への対応
// 4Bet=24.0%, Call=34.8%, Fold=41.2%
// ※ 高い4Bet/Callは正常: 8max UTGはAA-QQ/AKs等のプレミアムのみ開封するため
function create8maxUTG_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  // Value 4Bet
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 40, 60);
  setMix(r, "JJ", 8, 80, 12);
  setMix(r, "AKs", 0, 32, 68);
  setMix(r, "AKo", 0, 40, 60);
  setMix(r, "AQs", 0, 68, 32);
  // 4Bet bluff (Aブロッカー)
  setMix(r, "A5s", 42, 0, 58);
  setMix(r, "A4s", 52, 0, 48);
  // Call (プレミアムレンジのため幅広めにコール)
  setCall(r, ["TT", "99", "AJs", "ATs", "KQs"]);
  setMix(r, "KJs", 55, 45, 0);
  setMix(r, "JTs", 65, 35, 0);
  // 88/77: 3Betポット (SPR低) ではフォールド
  return r;
}

// 8max UTG1 open → 3Bet への対応
// 4Bet=23.0%, Call=30.2%, Fold=46.8%
function create8maxUTG1_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 38, 62);
  setMix(r, "JJ", 8, 78, 14);
  setMix(r, "AKs", 0, 30, 70);
  setMix(r, "AKo", 0, 38, 62);
  setMix(r, "AQs", 0, 65, 35);
  setMix(r, "A5s", 38, 0, 62);
  setMix(r, "A4s", 48, 0, 52);
  setMix(r, "A3s", 65, 0, 35);
  setCall(r, ["TT", "99", "AJs", "ATs", "KQs"]);
  setMix(r, "KJs", 48, 52, 0);
  setMix(r, "JTs", 58, 42, 0);
  setMix(r, "88", 72, 28, 0);
  setMix(r, "AJo", 38, 32, 30);
  return r;
}

// 8max UTG2 open → 3Bet への対応 (≈ 6max UTG)
// 4Bet=21.8%, Call=31.2%, Fold=47.0%
function create8maxUTG2_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 35, 65);
  setMix(r, "JJ", 8, 80, 12);
  setMix(r, "TT", 0, 88, 12);
  setMix(r, "AKs", 0, 30, 70);
  setMix(r, "AKo", 0, 35, 65);
  setMix(r, "AQs", 0, 65, 35);
  setMix(r, "A5s", 35, 0, 65);
  setMix(r, "A4s", 45, 0, 55);
  setMix(r, "A3s", 60, 0, 40);
  setCall(r, ["99", "88", "AJs", "ATs", "KQs"]);
  setMix(r, "KJs", 42, 58, 0);
  setMix(r, "JTs", 52, 48, 0);
  setMix(r, "T9s", 62, 38, 0);
  setMix(r, "77", 72, 28, 0);
  setMix(r, "AQo", 22, 48, 30);
  setMix(r, "AJo", 35, 35, 30);
  return r;
}

// 8max LJ open → 3Bet への対応 (≈ 6max HJ vs 3Bet)
// 4Bet=18.6%, Call=28.3%, Fold=53.1%
function create8maxLJ_vs3Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 35, 65);
  setMix(r, "JJ", 8, 80, 12);
  setMix(r, "AKs", 0, 28, 72);
  setMix(r, "AKo", 0, 35, 65);
  setMix(r, "AQs", 0, 60, 40);
  setMix(r, "A5s", 33, 0, 67);
  setMix(r, "A4s", 43, 0, 57);
  setMix(r, "A3s", 58, 0, 42);
  setMix(r, "A2s", 70, 0, 30);
  setCall(r, ["TT", "99", "AJs", "ATs", "KQs"]);
  setMix(r, "KJs", 35, 65, 0);
  setMix(r, "QJs", 40, 60, 0);
  setMix(r, "JTs", 30, 70, 0);
  setMix(r, "T9s", 42, 58, 0);
  setMix(r, "88", 68, 32, 0);
  setMix(r, "77", 78, 22, 0);
  setMix(r, "66", 88, 12, 0);
  setMix(r, "AQo", 20, 50, 30);
  setMix(r, "AJo", 38, 40, 22);
  setMix(r, "KQo", 38, 44, 18);
  return r;
}

// ============================================================
// PART 2: vs 4Bet レンジ
// action.raise = 5Bet (実質オールイン at 100BB)
// ============================================================
// 設計原則:
//   1. Value 5Bet: AA, KK (常に), QQ (100%), AKs/AKo (高頻度)
//   2. Bluff 5Bet: A5s-A2s (Aブロッカーでレンジ相手の強ハンドをブロック)
//   3. Fold: JJ以下ペア, AQs/AJs, スーテッドコネクター
//   4. Call: 100BBでは実質なし (ポットオッズが悪い)
//      ※ BTNのみIPのため QQ/JJ をわずかにCall候補

// BB 3Bet → 4Bet受け → 5Bet or Fold
// 5Bet=48.0%, Call=0%, Fold=52.0%
function createBB_vs4Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 0, 100);      // 5Bet shove
  setMix(r, "JJ", 70, 0, 30);      // 多くフォールド
  setMix(r, "AKs", 5, 0, 95);      // ほぼ5Bet
  setMix(r, "AKo", 8, 0, 92);
  setMix(r, "AQs", 60, 0, 40);     // ミックス
  // Bluff 5Bet: BBは広い3Betレンジ → Aブロッカー5Betが有効
  setMix(r, "A5s", 18, 0, 82);
  setMix(r, "A4s", 25, 0, 75);
  setMix(r, "A3s", 32, 0, 68);
  setMix(r, "A2s", 40, 0, 60);
  return r;
}

// SB 3Bet → 4Bet受け → 5Bet or Fold
// 5Bet=50.3%, Call=0%, Fold=49.7%
function createSB_vs4Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 0, 100);
  setMix(r, "JJ", 72, 0, 28);
  setMix(r, "AKs", 5, 0, 95);
  setMix(r, "AKo", 10, 0, 90);
  setMix(r, "AQs", 65, 0, 35);
  setMix(r, "A5s", 20, 0, 80);
  setMix(r, "A4s", 28, 0, 72);
  return r;
}

// BTN 3Bet → 4Bet受け → 5Bet or Fold (IP: Callわずかに有効)
// 5Bet=42.7%, Call=0.9%, Fold=56.4%
function createBTN_vs4Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 8, 92);       // IP → わずかにCall有効
  setMix(r, "JJ", 68, 5, 27);      // 多くフォールド
  setMix(r, "AKs", 5, 5, 90);
  setMix(r, "AKo", 12, 0, 88);
  setMix(r, "AQs", 65, 0, 35);
  // Bluff 5Bet: BTNの3BetレンジにAブロッカーが多い
  setMix(r, "A5s", 18, 0, 82);
  setMix(r, "A4s", 25, 0, 75);
  setMix(r, "A3s", 35, 0, 65);
  setMix(r, "A2s", 45, 0, 55);
  setMix(r, "KQs", 72, 0, 28);     // 3Betブラフで使ったKQsも5Betブラフ候補
  return r;
}

// CO 3Bet → 4Bet受け → 5Bet or Fold
// 5Bet=51.4%, Call=0%, Fold=48.6%
function createCO_vs4Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 0, 100);
  setMix(r, "JJ", 70, 0, 30);
  setMix(r, "AKs", 5, 0, 95);
  setMix(r, "AKo", 10, 0, 90);
  setMix(r, "AQs", 65, 0, 35);
  setMix(r, "A5s", 20, 0, 80);
  setMix(r, "A4s", 28, 0, 72);
  setMix(r, "A3s", 38, 0, 62);
  return r;
}

// HJ 3Bet → 4Bet受け → 5Bet or Fold
// 5Bet=55.4%, Call=0%, Fold=44.6%
// ※ HJは3Betレンジがタイトなため、4Betに対して5Bet率が高い
function createHJ_vs4Bet(): Record<string, ActionFrequency> {
  const r = empty();
  set5B(r, ["AA", "KK"]);
  setMix(r, "QQ", 0, 0, 100);
  setMix(r, "JJ", 72, 0, 28);
  setMix(r, "AKs", 8, 0, 92);
  setMix(r, "AKo", 12, 0, 88);
  setMix(r, "AQs", 68, 0, 32);
  setMix(r, "A5s", 22, 0, 78);
  setMix(r, "A4s", 30, 0, 70);
  return r;
}

// ============================================================
// エクスポート
// ============================================================

export const GTO_8MAX_VS3BET_RANGES = {
  "8max_UTG_vs3Bet": {
    position: "UTG",  scenario: "vs3Bet", stackDepthBB: 100,
    entries: create8maxUTG_vs3Bet(),
    note: "4Bet=24%, Call=35%, Fold=41% (タイト開封のためディフェンス率高)",
  },
  "8max_UTG1_vs3Bet": {
    position: "UTG1", scenario: "vs3Bet", stackDepthBB: 100,
    entries: create8maxUTG1_vs3Bet(),
    note: "4Bet=23%, Call=30%, Fold=47%",
  },
  "8max_UTG2_vs3Bet": {
    position: "UTG2", scenario: "vs3Bet", stackDepthBB: 100,
    entries: create8maxUTG2_vs3Bet(),
    note: "4Bet=22%, Call=31%, Fold=47% (≈ 6max UTG vs 3Bet)",
  },
  "8max_LJ_vs3Bet": {
    position: "LJ",   scenario: "vs3Bet", stackDepthBB: 100,
    entries: create8maxLJ_vs3Bet(),
    note: "4Bet=19%, Call=28%, Fold=53% (≈ 6max HJ vs 3Bet)",
  },
  // 8max HJ/CO/BTN/SBは6maxと同一 → gto-vs-3bet-and-8max-ranges.ts参照
};

export const GTO_VS4BET_RANGES = {
  "BB_vs4Bet": {
    position: "BB",  scenario: "vs4Bet", stackDepthBB: 100,
    entries: createBB_vs4Bet(),
    note: "5Bet=48%, Fold=52% (Aブロッカーブラフ込み)",
  },
  "SB_vs4Bet": {
    position: "SB",  scenario: "vs4Bet", stackDepthBB: 100,
    entries: createSB_vs4Bet(),
    note: "5Bet=50%, Fold=50%",
  },
  "BTN_vs4Bet": {
    position: "BTN", scenario: "vs4Bet", stackDepthBB: 100,
    entries: createBTN_vs4Bet(),
    note: "5Bet=43%, Call=1% (IP), Fold=56% (広い3BetレンジのためFold多め)",
  },
  "CO_vs4Bet": {
    position: "CO",  scenario: "vs4Bet", stackDepthBB: 100,
    entries: createCO_vs4Bet(),
    note: "5Bet=51%, Fold=49%",
  },
  "HJ_vs4Bet": {
    position: "HJ",  scenario: "vs4Bet", stackDepthBB: 100,
    entries: createHJ_vs4Bet(),
    note: "5Bet=55%, Fold=45% (タイトな3BetレンジのためValue率高)",
  },
  // UTGは3Betすることがほぼないためvs4Betスポットは稀
};

// ============================================================
// GTOデータ全体マップ (参照用)
// ============================================================
//
// gto-preflop-ranges.ts
//   └ RFI (Raise First In): UTG/HJ/CO/BTN/SB/BB
//
// gto-vs-open-ranges.ts
//   └ vs Open (3Bet/Call/Fold):
//       HJ vs UTG, CO vs UTG/HJ, BTN vs UTG/CO,
//       SB vs BTN, BB vs UTG/CO/BTN/SB
//
// gto-vs-3bet-and-8max-ranges.ts
//   ├ vs 3Bet (4Bet/Call/Fold): UTG/HJ/CO/BTN/SB — 6max
//   └ 8max RFI: UTG/UTG1/UTG2/LJ
//
// gto-vs-4bet-and-8max-vs3bet.ts  ← このファイル
//   ├ 8max vs 3Bet: UTG/UTG1/UTG2/LJ
//   └ vs 4Bet (5Bet/Call/Fold): BB/SB/BTN/CO/HJ
