// gto-vs-open-ranges.ts
// PokerMaster GTO Preflop Ranges: vs Open (Facing a Raise)
// 6max 100BB Cash Game
//
// 3Bet sizing: IP = 3.5x open, OOP = 4x open
// 高レーキ環境ではIPからのフラットコールは減少し、3Bet or Fold寄りになる
// BBのみコールが標準的に許容される

import { ActionFrequency } from "./gto-preflop-ranges";

// ============================================
// ActionFrequency: { fold, call, raise(=3bet) }
// ============================================

function empty(): Record<string, ActionFrequency> {
  const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
  const r: Record<string, ActionFrequency> = {};
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) {
    const h = i===j ? RANKS[i]+RANKS[j] : i<j ? RANKS[i]+RANKS[j]+"s" : RANKS[j]+RANKS[i]+"o";
    r[h] = { fold: 100, call: 0, raise: 0 };
  }
  return r;
}

function set3B(r: Record<string, ActionFrequency>, hands: string[]) {
  hands.forEach(h => { if (r[h]) r[h] = { fold: 0, call: 0, raise: 100 }; });
}
function setCall(r: Record<string, ActionFrequency>, hands: string[]) {
  hands.forEach(h => { if (r[h]) r[h] = { fold: 0, call: 100, raise: 0 }; });
}
function setMix(r: Record<string, ActionFrequency>, h: string, f: number, c: number, tb: number) {
  if (r[h]) r[h] = { fold: f, call: c, raise: tb };
}

// ============================================
// HJ vs UTG Open
// 3Bet ~6-7%, Call ~3-4% (tight due to OOP players behind)
// ============================================
function createHJ_vsUTG(): Record<string, ActionFrequency> {
  const r = empty();

  // Pure 3Bet
  set3B(r, ["AA", "KK", "QQ", "AKs", "AKo"]);

  // Mixed 3Bet/Call/Fold
  setMix(r, "JJ", 0, 40, 60);
  setMix(r, "TT", 0, 60, 40);
  setMix(r, "99", 20, 60, 20);
  setMix(r, "AQs", 0, 30, 70);
  setMix(r, "AJs", 0, 50, 50);
  setMix(r, "ATs", 10, 60, 30);
  setMix(r, "A5s", 40, 0, 60);  // ブラフ3Bet候補
  setMix(r, "A4s", 50, 0, 50);
  setMix(r, "KQs", 0, 60, 40);
  setMix(r, "AQo", 0, 30, 70);

  // Pure Call
  setCall(r, ["88", "77", "KJs", "QJs"]);

  // Mixed Call/Fold
  setMix(r, "66", 40, 60, 0);
  setMix(r, "KTs", 20, 80, 0);
  setMix(r, "QTs", 30, 70, 0);
  setMix(r, "JTs", 20, 80, 0);
  setMix(r, "T9s", 30, 70, 0);
  setMix(r, "98s", 40, 60, 0);
  setMix(r, "87s", 50, 50, 0);
  setMix(r, "AJo", 30, 40, 30);

  return r;
}

// ============================================
// CO vs UTG Open
// IP なので少しワイドにコール可能
// 3Bet ~7-8%, Call ~6-8%
// ============================================
function createCO_vsUTG(): Record<string, ActionFrequency> {
  const r = empty();

  set3B(r, ["AA", "KK", "QQ", "AKs", "AKo"]);

  setMix(r, "JJ", 0, 50, 50);
  setMix(r, "TT", 0, 70, 30);
  setMix(r, "99", 10, 70, 20);
  setMix(r, "AQs", 0, 35, 65);
  setMix(r, "AJs", 0, 55, 45);
  setMix(r, "ATs", 0, 65, 35);
  setMix(r, "A5s", 35, 0, 65);
  setMix(r, "A4s", 45, 0, 55);
  setMix(r, "KQs", 0, 55, 45);
  setMix(r, "AQo", 0, 40, 60);

  setCall(r, ["88", "77", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s"]);

  setMix(r, "66", 30, 70, 0);
  setMix(r, "55", 50, 50, 0);
  setMix(r, "98s", 25, 75, 0);
  setMix(r, "87s", 35, 65, 0);
  setMix(r, "76s", 45, 55, 0);
  setMix(r, "AJo", 20, 50, 30);
  setMix(r, "KQo", 30, 50, 20);

  return r;
}

// ============================================
// BTN vs UTG Open
// IP + 最大のポジションアドバンテージ
// 3Bet ~8-9%, Call ~10-12%
// ============================================
function createBTN_vsUTG(): Record<string, ActionFrequency> {
  const r = empty();

  set3B(r, ["AA", "KK", "QQ", "AKs", "AKo"]);

  setMix(r, "JJ", 0, 50, 50);
  setMix(r, "TT", 0, 75, 25);
  setMix(r, "AQs", 0, 30, 70);
  setMix(r, "AJs", 0, 60, 40);
  setMix(r, "ATs", 0, 70, 30);
  setMix(r, "A5s", 30, 0, 70);
  setMix(r, "A4s", 40, 0, 60);
  setMix(r, "A3s", 55, 0, 45);
  setMix(r, "KQs", 0, 50, 50);
  setMix(r, "AQo", 0, 40, 60);
  setMix(r, "AJo", 10, 55, 35);
  setMix(r, "KQo", 20, 50, 30);

  setCall(r, ["99", "88", "77", "66", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s", "98s"]);

  setMix(r, "55", 30, 70, 0);
  setMix(r, "44", 50, 50, 0);
  setMix(r, "A9s", 30, 70, 0);
  setMix(r, "K9s", 40, 60, 0);
  setMix(r, "Q9s", 45, 55, 0);
  setMix(r, "J9s", 40, 60, 0);
  setMix(r, "87s", 25, 75, 0);
  setMix(r, "76s", 30, 70, 0);
  setMix(r, "65s", 40, 60, 0);
  setMix(r, "ATo", 30, 60, 10);

  return r;
}

// ============================================
// CO vs HJ Open
// ============================================
function createCO_vsHJ(): Record<string, ActionFrequency> {
  const r = empty();

  set3B(r, ["AA", "KK", "QQ", "AKs", "AKo"]);

  setMix(r, "JJ", 0, 45, 55);
  setMix(r, "TT", 0, 65, 35);
  setMix(r, "99", 15, 65, 20);
  setMix(r, "AQs", 0, 30, 70);
  setMix(r, "AJs", 0, 50, 50);
  setMix(r, "ATs", 0, 65, 35);
  setMix(r, "A5s", 30, 0, 70);
  setMix(r, "A4s", 40, 0, 60);
  setMix(r, "KQs", 0, 50, 50);
  setMix(r, "AQo", 0, 35, 65);

  setCall(r, ["88", "77", "KJs", "KTs", "QJs", "QTs", "JTs", "T9s"]);

  setMix(r, "66", 25, 75, 0);
  setMix(r, "55", 45, 55, 0);
  setMix(r, "98s", 25, 75, 0);
  setMix(r, "87s", 30, 70, 0);
  setMix(r, "76s", 40, 60, 0);
  setMix(r, "AJo", 15, 50, 35);
  setMix(r, "KQo", 25, 50, 25);

  return r;
}

// ============================================
// BTN vs CO Open
// COはワイドにオープンするので、BTNもワイドに対応
// 3Bet ~10-12%, Call ~14-16%
// ============================================
function createBTN_vsCO(): Record<string, ActionFrequency> {
  const r = empty();

  set3B(r, ["AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs"]);

  setMix(r, "TT", 0, 55, 45);
  setMix(r, "99", 0, 70, 30);
  setMix(r, "AJs", 0, 45, 55);
  setMix(r, "ATs", 0, 55, 45);
  setMix(r, "A9s", 10, 50, 40);
  setMix(r, "A5s", 15, 0, 85);
  setMix(r, "A4s", 20, 0, 80);
  setMix(r, "A3s", 35, 0, 65);
  setMix(r, "A2s", 45, 0, 55);
  setMix(r, "KQs", 0, 40, 60);
  setMix(r, "KJs", 0, 55, 45);
  setMix(r, "KTs", 0, 60, 40);
  setMix(r, "AQo", 0, 30, 70);
  setMix(r, "AJo", 0, 50, 50);
  setMix(r, "ATo", 10, 55, 35);
  setMix(r, "KQo", 10, 45, 45);

  setCall(r, [
    "88", "77", "66", "55",
    "A8s", "K9s", "QJs", "QTs", "Q9s",
    "JTs", "J9s", "T9s", "T8s", "98s", "87s", "76s",
  ]);

  setMix(r, "44", 30, 70, 0);
  setMix(r, "33", 50, 50, 0);
  setMix(r, "A7s", 20, 60, 20);
  setMix(r, "A6s", 25, 55, 20);
  setMix(r, "K8s", 35, 65, 0);
  setMix(r, "Q8s", 35, 65, 0);
  setMix(r, "J8s", 40, 60, 0);
  setMix(r, "97s", 35, 65, 0);
  setMix(r, "86s", 40, 60, 0);
  setMix(r, "65s", 25, 75, 0);
  setMix(r, "54s", 30, 70, 0);
  setMix(r, "KJo", 20, 55, 25);
  setMix(r, "KTo", 30, 50, 20);
  setMix(r, "QJo", 25, 55, 20);

  return r;
}

// ============================================
// SB vs BTN Open
// OOP だが BTN はワイドなので SB も広めに 3Bet
// 3Bet ~12-15%, Fold rest (SBからのフラットは非推奨)
// ============================================
function createSB_vsBTN(): Record<string, ActionFrequency> {
  const r = empty();

  // SBからは基本3Bet or Fold (フラットコールは非推奨, OOPのため)
  set3B(r, [
    "AA", "KK", "QQ", "JJ", "TT",
    "AKs", "AQs", "AJs", "ATs",
    "A5s", "A4s",
    "KQs", "KJs",
    "AKo", "AQo",
  ]);

  setMix(r, "99", 15, 0, 85);
  setMix(r, "88", 25, 0, 75);
  setMix(r, "77", 35, 0, 65);
  setMix(r, "66", 50, 0, 50);
  setMix(r, "55", 60, 0, 40);
  setMix(r, "A9s", 20, 0, 80);
  setMix(r, "A8s", 30, 0, 70);
  setMix(r, "A7s", 35, 0, 65);
  setMix(r, "A6s", 40, 0, 60);
  setMix(r, "A3s", 30, 0, 70);
  setMix(r, "A2s", 40, 0, 60);
  setMix(r, "KTs", 20, 0, 80);
  setMix(r, "K9s", 40, 0, 60);
  setMix(r, "K8s", 55, 0, 45);
  setMix(r, "QJs", 25, 0, 75);
  setMix(r, "QTs", 30, 0, 70);
  setMix(r, "Q9s", 50, 0, 50);
  setMix(r, "JTs", 25, 0, 75);
  setMix(r, "J9s", 45, 0, 55);
  setMix(r, "T9s", 35, 0, 65);
  setMix(r, "98s", 45, 0, 55);
  setMix(r, "87s", 50, 0, 50);
  setMix(r, "76s", 55, 0, 45);
  setMix(r, "65s", 60, 0, 40);
  setMix(r, "AJo", 15, 0, 85);
  setMix(r, "ATo", 30, 0, 70);
  setMix(r, "A9o", 50, 0, 50);
  setMix(r, "KQo", 20, 0, 80);
  setMix(r, "KJo", 35, 0, 65);
  setMix(r, "KTo", 50, 0, 50);
  setMix(r, "QJo", 45, 0, 55);

  return r;
}

// ============================================
// BB vs Various Opens (BB Defense)
// BBはポジション不利だがポットオッズが良い
// BBはフラットコールが多い唯一のポジション
// ============================================

// BB vs UTG Open: タイトにディフェンス
// 3Bet ~7-8%, Call ~16-18%
function createBB_vsUTG(): Record<string, ActionFrequency> {
  const r = empty();

  // 3Bet for value
  set3B(r, ["AA", "KK", "QQ", "AKs", "AKo"]);

  setMix(r, "JJ", 0, 45, 55);
  setMix(r, "TT", 0, 65, 35);
  setMix(r, "AQs", 0, 40, 60);
  setMix(r, "AJs", 0, 60, 40);
  setMix(r, "A5s", 35, 0, 65);  // ブラフ3Bet
  setMix(r, "A4s", 45, 0, 55);
  setMix(r, "AQo", 0, 50, 50);

  // Call
  setCall(r, [
    "99", "88", "77", "66",
    "ATs", "A9s", "A8s", "A7s", "A6s",
    "KQs", "KJs", "KTs", "K9s",
    "QJs", "QTs",
    "JTs", "J9s",
    "T9s", "98s",
  ]);

  // Mixed Call/Fold
  setMix(r, "55", 20, 80, 0);
  setMix(r, "44", 35, 65, 0);
  setMix(r, "33", 50, 50, 0);
  setMix(r, "22", 60, 40, 0);
  setMix(r, "A3s", 35, 55, 10);
  setMix(r, "A2s", 40, 50, 10);
  setMix(r, "K8s", 40, 60, 0);
  setMix(r, "K7s", 50, 50, 0);
  setMix(r, "Q9s", 30, 70, 0);
  setMix(r, "Q8s", 50, 50, 0);
  setMix(r, "J8s", 45, 55, 0);
  setMix(r, "T8s", 35, 65, 0);
  setMix(r, "87s", 20, 80, 0);
  setMix(r, "76s", 30, 70, 0);
  setMix(r, "65s", 35, 65, 0);
  setMix(r, "54s", 40, 60, 0);
  setMix(r, "AJo", 10, 55, 35);
  setMix(r, "ATo", 20, 70, 10);
  setMix(r, "A9o", 40, 60, 0);
  setMix(r, "KQo", 10, 65, 25);
  setMix(r, "KJo", 25, 65, 10);
  setMix(r, "KTo", 35, 60, 5);
  setMix(r, "QJo", 30, 65, 5);
  setMix(r, "QTo", 45, 55, 0);
  setMix(r, "JTo", 40, 60, 0);

  return r;
}

// BB vs CO Open: ミディアムワイドにディフェンス
// 3Bet ~9-10%, Call ~25-28%
function createBB_vsCO(): Record<string, ActionFrequency> {
  const r = empty();

  set3B(r, ["AA", "KK", "QQ", "AKs", "AKo"]);

  setMix(r, "JJ", 0, 40, 60);
  setMix(r, "TT", 0, 60, 40);
  setMix(r, "99", 0, 70, 30);
  setMix(r, "AQs", 0, 30, 70);
  setMix(r, "AJs", 0, 45, 55);
  setMix(r, "ATs", 0, 55, 45);
  setMix(r, "A9s", 5, 55, 40);
  setMix(r, "A5s", 20, 0, 80);
  setMix(r, "A4s", 25, 0, 75);
  setMix(r, "A3s", 30, 20, 50);
  setMix(r, "A2s", 35, 25, 40);
  setMix(r, "KQs", 0, 40, 60);
  setMix(r, "KJs", 0, 55, 45);
  setMix(r, "AQo", 0, 35, 65);
  setMix(r, "AJo", 0, 55, 45);

  setCall(r, [
    "88", "77", "66", "55", "44",
    "A8s", "A7s", "A6s",
    "KTs", "K9s", "K8s", "K7s", "K6s",
    "QJs", "QTs", "Q9s", "Q8s",
    "JTs", "J9s", "J8s",
    "T9s", "T8s", "T7s",
    "98s", "97s", "87s", "86s", "76s", "75s", "65s", "64s", "54s", "53s", "43s",
  ]);

  setMix(r, "33", 30, 70, 0);
  setMix(r, "22", 40, 60, 0);
  setMix(r, "K5s", 35, 65, 0);
  setMix(r, "K4s", 45, 55, 0);
  setMix(r, "Q7s", 40, 60, 0);
  setMix(r, "J7s", 45, 55, 0);
  setMix(r, "T6s", 50, 50, 0);
  setMix(r, "96s", 50, 50, 0);
  setMix(r, "85s", 50, 50, 0);
  setMix(r, "ATo", 10, 65, 25);
  setMix(r, "A9o", 20, 65, 15);
  setMix(r, "A8o", 30, 60, 10);
  setMix(r, "KQo", 5, 50, 45);
  setMix(r, "KJo", 15, 60, 25);
  setMix(r, "KTo", 20, 65, 15);
  setMix(r, "K9o", 35, 60, 5);
  setMix(r, "QJo", 15, 65, 20);
  setMix(r, "QTo", 25, 65, 10);
  setMix(r, "Q9o", 40, 55, 5);
  setMix(r, "JTo", 20, 70, 10);
  setMix(r, "J9o", 40, 60, 0);
  setMix(r, "T9o", 35, 65, 0);
  setMix(r, "98o", 45, 55, 0);

  return r;
}

// BB vs BTN Open: 最もワイドにディフェンス
// 3Bet ~11-13%, Call ~35-40%
function createBB_vsBTN(): Record<string, ActionFrequency> {
  const r = empty();

  set3B(r, ["AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs"]);

  setMix(r, "TT", 0, 50, 50);
  setMix(r, "99", 0, 65, 35);
  setMix(r, "88", 0, 75, 25);
  setMix(r, "AJs", 0, 35, 65);
  setMix(r, "ATs", 0, 45, 55);
  setMix(r, "A9s", 0, 50, 50);
  setMix(r, "A8s", 0, 55, 45);
  setMix(r, "A7s", 5, 55, 40);
  setMix(r, "A5s", 10, 0, 90);
  setMix(r, "A4s", 15, 10, 75);
  setMix(r, "A3s", 15, 25, 60);
  setMix(r, "A2s", 20, 30, 50);
  setMix(r, "KQs", 0, 35, 65);
  setMix(r, "KJs", 0, 45, 55);
  setMix(r, "KTs", 0, 55, 45);
  setMix(r, "K9s", 0, 60, 40);
  setMix(r, "K8s", 10, 60, 30);
  setMix(r, "AQo", 0, 30, 70);
  setMix(r, "AJo", 0, 45, 55);
  setMix(r, "ATo", 0, 55, 45);
  setMix(r, "A9o", 5, 60, 35);
  setMix(r, "KQo", 0, 40, 60);
  setMix(r, "KJo", 5, 55, 40);
  setMix(r, "KTo", 10, 60, 30);
  setMix(r, "QJo", 5, 60, 35);
  setMix(r, "QTo", 15, 60, 25);

  setCall(r, [
    "77", "66", "55", "44", "33",
    "A6s",
    "K7s", "K6s", "K5s", "K4s",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s",
    "JTs", "J9s", "J8s", "J7s",
    "T9s", "T8s", "T7s", "T6s",
    "98s", "97s", "96s",
    "87s", "86s", "85s",
    "76s", "75s", "74s",
    "65s", "64s",
    "54s", "53s",
    "43s",
  ]);

  setMix(r, "22", 25, 75, 0);
  setMix(r, "K3s", 30, 70, 0);
  setMix(r, "K2s", 40, 60, 0);
  setMix(r, "Q5s", 40, 60, 0);
  setMix(r, "Q4s", 50, 50, 0);
  setMix(r, "J6s", 40, 60, 0);
  setMix(r, "J5s", 55, 45, 0);
  setMix(r, "T5s", 55, 45, 0);
  setMix(r, "95s", 50, 50, 0);
  setMix(r, "84s", 55, 45, 0);
  setMix(r, "73s", 55, 45, 0);
  setMix(r, "63s", 55, 45, 0);
  setMix(r, "52s", 60, 40, 0);
  setMix(r, "42s", 60, 40, 0);
  setMix(r, "32s", 65, 35, 0);
  setMix(r, "A8o", 15, 65, 20);
  setMix(r, "A7o", 20, 60, 20);
  setMix(r, "A6o", 30, 55, 15);
  setMix(r, "A5o", 25, 55, 20);
  setMix(r, "A4o", 30, 55, 15);
  setMix(r, "A3o", 35, 50, 15);
  setMix(r, "A2o", 40, 50, 10);
  setMix(r, "K9o", 20, 65, 15);
  setMix(r, "K8o", 30, 60, 10);
  setMix(r, "K7o", 40, 55, 5);
  setMix(r, "K6o", 45, 50, 5);
  setMix(r, "Q9o", 25, 60, 15);
  setMix(r, "Q8o", 35, 60, 5);
  setMix(r, "Q7o", 50, 50, 0);
  setMix(r, "JTo", 10, 70, 20);
  setMix(r, "J9o", 20, 65, 15);
  setMix(r, "J8o", 35, 60, 5);
  setMix(r, "T9o", 15, 70, 15);
  setMix(r, "T8o", 30, 65, 5);
  setMix(r, "98o", 25, 70, 5);
  setMix(r, "87o", 30, 65, 5);
  setMix(r, "76o", 40, 60, 0);
  setMix(r, "65o", 50, 50, 0);

  return r;
}

// BB vs SB Open: SBはOOPなのでBBは最もワイドにディフェンス
// 3Bet ~14-16%, Call ~38-42%
function createBB_vsSB(): Record<string, ActionFrequency> {
  const r = empty();

  set3B(r, ["AA", "KK", "QQ", "JJ", "TT", "AKs", "AQs", "AJs", "AKo", "AQo"]);

  setMix(r, "99", 0, 55, 45);
  setMix(r, "88", 0, 65, 35);
  setMix(r, "77", 0, 75, 25);
  setMix(r, "ATs", 0, 40, 60);
  setMix(r, "A9s", 0, 45, 55);
  setMix(r, "A8s", 0, 50, 50);
  setMix(r, "A7s", 0, 50, 50);
  setMix(r, "A6s", 0, 55, 45);
  setMix(r, "A5s", 5, 10, 85);
  setMix(r, "A4s", 5, 15, 80);
  setMix(r, "A3s", 10, 25, 65);
  setMix(r, "A2s", 15, 30, 55);
  setMix(r, "KQs", 0, 35, 65);
  setMix(r, "KJs", 0, 40, 60);
  setMix(r, "KTs", 0, 50, 50);
  setMix(r, "K9s", 0, 55, 45);
  setMix(r, "K8s", 5, 60, 35);
  setMix(r, "K7s", 10, 60, 30);
  setMix(r, "K6s", 15, 60, 25);
  setMix(r, "K5s", 20, 55, 25);
  setMix(r, "AJo", 0, 35, 65);
  setMix(r, "ATo", 0, 50, 50);
  setMix(r, "A9o", 0, 55, 45);
  setMix(r, "KQo", 0, 35, 65);
  setMix(r, "KJo", 0, 50, 50);
  setMix(r, "KTo", 5, 55, 40);

  setCall(r, [
    "66", "55", "44", "33", "22",
    "K4s", "K3s", "K2s",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s",
    "JTs", "J9s", "J8s", "J7s", "J6s",
    "T9s", "T8s", "T7s", "T6s",
    "98s", "97s", "96s", "95s",
    "87s", "86s", "85s",
    "76s", "75s", "74s",
    "65s", "64s", "63s",
    "54s", "53s", "52s",
    "43s", "42s",
    "32s",
  ]);

  setMix(r, "Q4s", 30, 70, 0);
  setMix(r, "Q3s", 40, 60, 0);
  setMix(r, "Q2s", 50, 50, 0);
  setMix(r, "J5s", 35, 65, 0);
  setMix(r, "J4s", 50, 50, 0);
  setMix(r, "T5s", 40, 60, 0);
  setMix(r, "T4s", 55, 45, 0);
  setMix(r, "94s", 50, 50, 0);
  setMix(r, "84s", 45, 55, 0);
  setMix(r, "73s", 50, 50, 0);
  setMix(r, "62s", 55, 45, 0);
  setMix(r, "A8o", 5, 60, 35);
  setMix(r, "A7o", 10, 60, 30);
  setMix(r, "A6o", 15, 55, 30);
  setMix(r, "A5o", 15, 50, 35);
  setMix(r, "A4o", 20, 50, 30);
  setMix(r, "A3o", 25, 50, 25);
  setMix(r, "A2o", 30, 50, 20);
  setMix(r, "K9o", 10, 60, 30);
  setMix(r, "K8o", 15, 60, 25);
  setMix(r, "K7o", 25, 55, 20);
  setMix(r, "K6o", 30, 55, 15);
  setMix(r, "K5o", 35, 55, 10);
  setMix(r, "K4o", 45, 50, 5);
  setMix(r, "Q9o", 10, 65, 25);
  setMix(r, "Q8o", 20, 60, 20);
  setMix(r, "Q7o", 30, 55, 15);
  setMix(r, "Q6o", 40, 50, 10);
  setMix(r, "Q5o", 50, 45, 5);
  setMix(r, "JTo", 5, 65, 30);
  setMix(r, "J9o", 10, 65, 25);
  setMix(r, "J8o", 20, 60, 20);
  setMix(r, "J7o", 35, 55, 10);
  setMix(r, "T9o", 5, 70, 25);
  setMix(r, "T8o", 15, 65, 20);
  setMix(r, "T7o", 30, 60, 10);
  setMix(r, "98o", 10, 70, 20);
  setMix(r, "97o", 25, 65, 10);
  setMix(r, "87o", 15, 70, 15);
  setMix(r, "86o", 30, 60, 10);
  setMix(r, "76o", 20, 65, 15);
  setMix(r, "75o", 35, 55, 10);
  setMix(r, "65o", 25, 60, 15);
  setMix(r, "64o", 40, 55, 5);
  setMix(r, "54o", 30, 60, 10);
  setMix(r, "53o", 45, 50, 5);

  return r;
}


// ============================================
// エクスポート
// ============================================

export const GTO_VS_OPEN_RANGES = {
  // vs UTG Open
  "HJ_vsUTG": { position: "HJ", scenario: "vsOpen", vsPosition: "UTG", stackDepthBB: 100, entries: createHJ_vsUTG() },
  "CO_vsUTG": { position: "CO", scenario: "vsOpen", vsPosition: "UTG", stackDepthBB: 100, entries: createCO_vsUTG() },
  "BTN_vsUTG": { position: "BTN", scenario: "vsOpen", vsPosition: "UTG", stackDepthBB: 100, entries: createBTN_vsUTG() },

  // vs HJ Open
  "CO_vsHJ": { position: "CO", scenario: "vsOpen", vsPosition: "HJ", stackDepthBB: 100, entries: createCO_vsHJ() },
  "BTN_vsHJ": { position: "BTN", scenario: "vsOpen", vsPosition: "HJ", stackDepthBB: 100, entries: createBTN_vsUTG() }, // UTGに近い

  // vs CO Open
  "BTN_vsCO": { position: "BTN", scenario: "vsOpen", vsPosition: "CO", stackDepthBB: 100, entries: createBTN_vsCO() },

  // vs BTN Open
  "SB_vsBTN": { position: "SB", scenario: "vsOpen", vsPosition: "BTN", stackDepthBB: 100, entries: createSB_vsBTN() },

  // BB Defense (vs all positions)
  "BB_vsUTG": { position: "BB", scenario: "bbDefense", vsPosition: "UTG", stackDepthBB: 100, entries: createBB_vsUTG() },
  "BB_vsHJ":  { position: "BB", scenario: "bbDefense", vsPosition: "HJ",  stackDepthBB: 100, entries: createBB_vsUTG() }, // UTGに近い
  "BB_vsCO":  { position: "BB", scenario: "bbDefense", vsPosition: "CO",  stackDepthBB: 100, entries: createBB_vsCO() },
  "BB_vsBTN": { position: "BB", scenario: "bbDefense", vsPosition: "BTN", stackDepthBB: 100, entries: createBB_vsBTN() },
  "BB_vsSB":  { position: "BB", scenario: "bbDefense", vsPosition: "SB",  stackDepthBB: 100, entries: createBB_vsSB() },
};

/**
 * vs Open レンジのルックアップ
 * key: "${heroPos}_vs${villainPos}" 例: "BTN_vsCO", "BB_vsBTN"
 */
export function getVsOpenEntry(
  heroPos: string,
  villainPos: string,
  hand: string
): ActionFrequency {
  const key = `${heroPos}_vs${villainPos}`;
  const table = (GTO_VS_OPEN_RANGES as Record<string, { entries: Record<string, ActionFrequency> }>)[key];
  if (!table) return { fold: 100, call: 0, raise: 0 };
  return table.entries[hand] ?? { fold: 100, call: 0, raise: 0 };
}

/**
 * RNGに基づいてvs Openアクションを決定 (rng: 0-100)
 */
export function decideVsOpenAction(
  heroPos: string,
  villainPos: string,
  hand: string,
  rng: number
): "fold" | "call" | "raise" {
  const freq = getVsOpenEntry(heroPos, villainPos, hand);
  if (rng <= freq.raise) return "raise";
  if (rng <= freq.raise + freq.call) return "call";
  return "fold";
}
