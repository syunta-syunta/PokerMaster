# SPEC: Phase 3C — ポストフロップ GTO AIエンジン

**対象フェーズ**: Phase 3C  
**推定期間**: 3週間  
**担当**: Claude Code  
**前提**: Phase 3B完了（GameEngine/BettingRound/PotManager動作確認済み）

---

## 設計原則

このエンジンはGTOの**思考プロセスをそのまま順に実行する**。

```
Step 1: 誰がこのボードでレンジ優位を持つか？          (Range Level)
Step 2: このハンドは何のために存在するか？            (Hand Level)
Step 3: 数学的均衡からベット頻度を決定する            (Math Level)
Step 4: ベットサイズはレンジ形状が決定する            (Sizing Level)
Step 5: RNGで混合戦略を実行する                      (Execution)
```

ハンドのラベル（TPTK、オーバーペア等）ではなく、
**機能的役割（バリュー・ショーダウン・ブラフ等）** で分類する。

---

## 1. ファイル構成

```
backend/src/game/
├── ai/
│   ├── postflop/
│   │   ├── DrawDetector.ts        ← ドロー検出
│   │   ├── HandClassifier.ts      ← 5機能カテゴリ分類
│   │   ├── BoardAnalyzer.ts       ← レンジ優位 + ボードテクスチャ
│   │   ├── BluffCalculator.ts     ← alpha計算によるブラフ頻度
│   │   ├── PostflopStrategy.ts    ← 戦略テーブルと頻度計算
│   │   └── PostflopEngine.ts      ← 統合エントリーポイント
│   ├── data/
│   │   └── (GTOプリフロップレンジファイル群)
│   └── GtoAiPlayer.ts             ← Phase 3Cで完成させる
└── __tests__/
    └── ai/
        ├── DrawDetector.test.ts
        ├── HandClassifier.test.ts
        ├── BoardAnalyzer.test.ts
        ├── BluffCalculator.test.ts
        └── PostflopEngine.test.ts
```

---

## 2. game.types.ts への追記

既存の型は変更しない。以下を末尾に追記する。

```typescript
// ─── Phase 3C 追加型 ────────────────────────────────────────────

/** ドローの種類 */
export type DrawType =
  | 'none'
  | 'flush_draw'        // フラッシュドロー (強セミブラフ)
  | 'oesd'             // 両面ストレートドロー (強セミブラフ)
  | 'combo_draw'       // フラッシュ + ストレートドロー (最強セミブラフ)
  | 'gutshot'          // ガットショット (弱セミブラフ)
  | 'backdoor_flush'   // バックドアフラッシュドロー (補助)
  | 'backdoor_straight'; // バックドアストレートドロー (補助)

/** ハンドの機能的カテゴリ (GTOの思考プロセスに対応) */
export type HandCategory =
  | 'NUTTED'     // エクイティ >75% : ポットを最大化する
  | 'VALUE'      // エクイティ 55-75%: バリューベットで利益を得る
  | 'SHOWDOWN'   // エクイティ 40-55%: チェックでエクイティを実現する
  | 'SEMI_BLUFF' // ドロー 30-50%: フォールドエクイティ + ドロー完成EV
  | 'BLUFF';     // エクイティ <30%: alpha計算に基づいて選択的にブラフ

/** ベットサイズのバケット */
export type BetSizeBucket = 'small' | 'medium' | 'large';
// small = 33% pot, medium = 67% pot, large = 100%+ pot

/** ポストフロップの意思決定コンテキスト */
export interface PostflopContext {
  isPFA: boolean;              // プリフロップアグレッサーか
  isIP: boolean;               // インポジションか
  spr: number;                 // スタック ÷ ポット
  street: 'flop' | 'turn' | 'river';
  pot: number;                 // ポット額 (BB)
  effectiveStack: number;      // 実効スタック (BB)
  facingBet: number | null;    // 直面しているベット額 (null = 自分が先に行動)
  facingBetSizeBucket: BetSizeBucket | null; // 直面しているベットのサイズ分類
}

/** ポストフロップの決定結果 */
export interface PostflopDecision {
  action: 'check' | 'bet' | 'call' | 'raise' | 'fold';
  betSizeBucket?: BetSizeBucket; // betまたはraiseの場合
  betAmount?: number;            // 実際のBB額
  category: HandCategory;        // 判断に使用したカテゴリ (デバッグ用)
  drawType: DrawType;            // 検出されたドロー (デバッグ用)
}

/** ボードアドバンテージの分析結果 */
export interface BoardAdvantageResult {
  score: number;              // 0〜10 (10 = この側が強い)
  hasNutAdvantage: boolean;   // ラージベット/オーバーベット可能
  betFreqMultiplier: number;  // 0.70 〜 1.30
  wetness: number;            // 0〜3 (ボードの濡れ度)
}

/** アクション頻度 (Aggressor用: bet) */
export interface AggressorFrequencies {
  check: number;    // 合計100
  betSmall: number;
  betMedium: number;
  betLarge: number;
}

/** アクション頻度 (Defender用: call) */
export interface DefenderFrequencies {
  fold: number;   // 合計100
  call: number;
  raise: number;
}
```

---

## 3. DrawDetector.ts

```typescript
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
  const allCards = [...holeCards, ...communityCards];

  // ═══ フラッシュドロー検出 ═══
  // 注: 既にフラッシュが成立 (rankValue >= 4) の場合はスキップ
  if (handRankValue < 4) {
    const flushDraw = detectFlushDraw(holeCards, communityCards);
    if (flushDraw) return flushDraw;
  }

  // ═══ ストレートドロー検出 ═══
  // 注: 既にストレートが成立 (rankValue >= 3) の場合はスキップ
  if (handRankValue < 3) {
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
    const hasLowEnd = !sorted.includes(low - 1) === false || low === 1;
    const missingRanks = [];
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
```

---

## 4. HandClassifier.ts

```typescript
// backend/src/game/ai/postflop/HandClassifier.ts

import { Card, HandResult, HandCategory, DrawType } from '../../types/game.types';
import { rankToValue } from '../../core/Card';

/**
 * ハンドを5つの機能的カテゴリに分類する。
 *
 * GTOの問い: 「このハンドは何のために存在するか？」
 *   NUTTED     → ポットを最大化するために存在する
 *   VALUE      → バリューベットで利益を得るために存在する
 *   SHOWDOWN   → チェックして安全にエクイティを実現するために存在する
 *   SEMI_BLUFF → フォールドエクイティとドロー完成EVを合算するために存在する
 *   BLUFF      → 相手をフォールドさせるためにのみ存在する
 */
export function classifyHand(
  handResult: HandResult,
  holeCards: [Card, Card],
  communityCards: Card[],
  draw: DrawType,
): HandCategory {
  const { rankValue } = handResult;

  // ═══ NUTTED: エクイティ > 75% ═══
  // フォーカード以上 → 常にNUTTED
  if (rankValue >= 6) return 'NUTTED';

  // フルハウス: ほぼ常にNUTTED（ただしボードペアがある場合は相手もフルハウス可能性）
  if (rankValue === 5) {
    const boardPaired = isBoardPaired(communityCards);
    return boardPaired ? 'VALUE' : 'NUTTED';
  }

  // フラッシュ: ナッツフラッシュかどうかで判定
  if (rankValue === 4) {
    return isNutFlush(holeCards, communityCards) ? 'NUTTED' : 'VALUE';
  }

  // ストレート: 基本的にVALUEだが、ボードが非常にウェットな場合はSHOWDOWN
  if (rankValue === 3) return 'VALUE';

  // トリップス: VALUE
  if (rankValue === 2) return 'VALUE';

  // ツーペア: ペアの質によって分類
  if (rankValue === 1) {
    return classifyTwoPair(holeCards, communityCards);
  }

  // ワンペア / ハイカード: ペアの強さで分類
  if (rankValue === 0) {
    return classifyPairOrHighCard(handResult, holeCards, communityCards);
  }

  // ドロー処理: メイドハンドがない場合
  return classifyByDraw(draw);
}

/** ツーペアの分類 */
function classifyTwoPair(holeCards: [Card, Card], community: Card[]): HandCategory {
  const boardRanks = community.map(c => rankToValue(c.rank)).sort((a, b) => b - a);
  const holeRanks = holeCards.map(c => rankToValue(c.rank));

  // どちらかのホールカードがトップペアに関与しているか
  const topBoardRank = boardRanks[0];
  const holdsTopPair = holeRanks.includes(topBoardRank);

  // ボードにペアがある場合 (例: AA7 で A7o を持つ → ツーペアだがキッカーで負ける可能性)
  if (isBoardPaired(community) && !holdsTopPair) return 'SHOWDOWN';

  return holdsTopPair ? 'VALUE' : 'SHOWDOWN';
}

/** ワンペアまたはハイカードの分類 */
function classifyPairOrHighCard(
  handResult: HandResult,
  holeCards: [Card, Card],
  community: Card[],
): HandCategory {
  const boardRanks = community.map(c => rankToValue(c.rank)).sort((a, b) => b - a);
  const holeRanks = holeCards.map(c => rankToValue(c.rank));
  const topBoardRank = boardRanks[0];
  const secondBoardRank = boardRanks[1] ?? 0;

  // オーバーペア: ホールカードのペアがボードの全カードより高い
  const isOverpair = holeRanks[0] === holeRanks[1] && holeRanks[0] > topBoardRank;
  if (isOverpair) {
    // AAまたはKKのオーバーペアはVALUE
    return holeRanks[0] >= 12 ? 'VALUE' : 'SHOWDOWN';
  }

  // ボードとのペア確認
  const pairedRankOnBoard = holeRanks.find(r => boardRanks.includes(r));

  if (pairedRankOnBoard) {
    if (pairedRankOnBoard === topBoardRank) {
      // トップペア: キッカーの強さで分類
      const kicker = holeRanks.find(r => r !== pairedRankOnBoard) ?? 0;
      if (kicker >= 11) return 'VALUE';  // A/K/J キッカー
      if (kicker >= 9) return 'SHOWDOWN'; // T/9 キッカー
      return 'SHOWDOWN'; // 弱いキッカー
    }
    if (pairedRankOnBoard === secondBoardRank) return 'SHOWDOWN'; // セカンドペア
    return 'BLUFF'; // ボトムペア以下
  }

  // ノーペア
  const highHoleCard = Math.max(...holeRanks);
  if (highHoleCard === 14) return 'SHOWDOWN'; // Aハイ = ブラフキャッチャー
  return 'BLUFF';
}

/** ドローのみの場合の分類 */
function classifyByDraw(draw: DrawType): HandCategory {
  switch (draw) {
    case 'combo_draw':
    case 'flush_draw':
    case 'oesd':
      return 'SEMI_BLUFF';
    case 'gutshot':
    case 'backdoor_flush':
    case 'backdoor_straight':
      return 'BLUFF'; // 弱いドロー = 基本的にBLUFF候補
    default:
      return 'BLUFF';
  }
}

/** ナッツフラッシュかどうか判定 */
function isNutFlush(holeCards: [Card, Card], community: Card[]): boolean {
  const allCards = [...holeCards, ...community];
  const suitCounts: Record<string, number> = {};
  allCards.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1; });

  const flushSuit = Object.entries(suitCounts).find(([, n]) => n >= 5)?.[0];
  if (!flushSuit) return false;

  const hasAce = holeCards.some(c => c.suit === flushSuit && c.rank === 'A');
  return hasAce;
}

/** ボードにペアがあるか判定 */
function isBoardPaired(community: Card[]): boolean {
  const ranks = community.map(c => c.rank);
  return new Set(ranks).size < ranks.length;
}
```

---

## 5. BoardAnalyzer.ts

```typescript
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

  return Math.min(3, suitScore + connScore) as 0 | 1 | 2 | 3;
}

function isBoardPaired(community: Card[]): boolean {
  const ranks = community.map(c => c.rank);
  return new Set(ranks).size < ranks.length;
}
```

---

## 6. BluffCalculator.ts

```typescript
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
```

---

## 7. PostflopStrategy.ts

```typescript
// backend/src/game/ai/postflop/PostflopStrategy.ts

import {
  HandCategory, BetSizeBucket, BoardAdvantageResult,
  AggressorFrequencies, DefenderFrequencies,
} from '../../types/game.types';

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

// ── ベットサイズ選択 ────────────────────────────────────────────────────────

export function selectBetSize(
  category: HandCategory,
  boardAdv: BoardAdvantageResult,
  spr: number,
): BetSizeBucket {
  // NUTTEDはレンジ形状に応じてサイズを選択
  if (category === 'NUTTED') {
    if (boardAdv.hasNutAdvantage) return 'large';
    if (spr < 3) return 'large'; // 低SPR: コミットが近い
    return 'medium';
  }

  // VALUE: レンジアドバンテージがあればsmall (マージド)、なければmedium
  if (category === 'VALUE') {
    return boardAdv.score >= 6 ? 'small' : 'medium';
  }

  // SEMI_BLUFF: ドロー強度とボードに応じて
  if (category === 'SEMI_BLUFF') {
    return boardAdv.wetness >= 2 ? 'medium' : 'small';
  }

  // SHOWDOWN/BLUFFはSMALL (ポットを小さく保つ)
  return 'small';
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

// ── SPR・ポジション・ストリート補正 ─────────────────────────────────────────

export function applySPRModifier(
  freq: AggressorFrequencies,
  spr: number,
): AggressorFrequencies {
  if (spr < 3) {
    // 低SPR: コミットが近い → ラージベット/レイズを増やす
    return {
      check: Math.max(0, freq.check - 10),
      betSmall: Math.max(0, freq.betSmall - 5),
      betMedium: Math.max(0, freq.betMedium),
      betLarge: Math.min(100, freq.betLarge + 15),
    };
  }
  if (spr > 10) {
    // 高SPR: ドローに有利 → 投機的チェックを増やす
    return {
      check: Math.min(100, freq.check + 8),
      betSmall: Math.max(0, freq.betSmall + 5),
      betMedium: Math.max(0, freq.betMedium - 5),
      betLarge: Math.max(0, freq.betLarge - 8),
    };
  }
  return freq;
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
```

---

## 8. PostflopEngine.ts

```typescript
// backend/src/game/ai/postflop/PostflopEngine.ts

import {
  Card, HandResult, PostflopContext, PostflopDecision,
  BetSizeBucket, HandCategory,
} from '../../types/game.types';
import { detectComboDrawIfAny } from './DrawDetector';
import { classifyHand } from './HandClassifier';
import { analyzeBoardAdvantage } from './BoardAnalyzer';
import { calculateBluffFrequency, assessBlockerQuality } from './BluffCalculator';
import {
  AGGRESSOR_TABLE, DEFENDER_TABLE,
  selectBetSize, wetnessToKey,
  applyRangeMultiplier, applySPRModifier,
  applyPositionModifier, applyStreetModifier,
  normalizeFrequencies,
} from './PostflopStrategy';

const BET_SIZE_FRACTIONS: Record<BetSizeBucket, number> = {
  small:  0.33,
  medium: 0.67,
  large:  1.00,
};

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
  const draw = detectComboDrawIfAny(holeCards, communityCards, handResult.rankValue);
  const category = classifyHand(handResult, holeCards, communityCards, draw);

  // ═══ Step 3 & 4: アクションを決定 ═══
  if (context.facingBet !== null && context.facingBetSizeBucket !== null) {
    // ── ディフェンダー (ベットに直面している) ──
    return decideDefenderAction(category, context, holeCards, communityCards, boardAdv, draw);
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
  const sizeBucket = selectBetSize(category, boardAdv, context.spr);
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

  // SPR・ポジション・ストリート補正
  frequencies = applySPRModifier(frequencies, context.spr);
  frequencies = applyPositionModifier(frequencies, context.isIP);
  frequencies = applyStreetModifier(frequencies, context.street);
  frequencies = normalizeFrequencies(frequencies);

  // RNGで混合戦略を実行
  const rng = Math.random() * 100;
  let cumulative = 0;

  if (rng < (cumulative += frequencies.check)) {
    return { action: 'check', category, drawType: draw };
  }
  if (rng < (cumulative += frequencies.betSmall)) {
    const amount = context.pot * BET_SIZE_FRACTIONS.small;
    return { action: 'bet', betSizeBucket: 'small', betAmount: amount, category, drawType: draw };
  }
  if (rng < (cumulative += frequencies.betMedium)) {
    const amount = context.pot * BET_SIZE_FRACTIONS.medium;
    return { action: 'bet', betSizeBucket: 'medium', betAmount: amount, category, drawType: draw };
  }
  const amount = context.pot * BET_SIZE_FRACTIONS.large;
  return { action: 'bet', betSizeBucket: 'large', betAmount: amount, category, drawType: draw };
}

function decideDefenderAction(
  category: HandCategory,
  context: PostflopContext,
  holeCards: [Card, Card],
  communityCards: Card[],
  boardAdv: ReturnType<typeof analyzeBoardAdvantage>,
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
```

---

## 9. GtoAiPlayer.ts (プリフロップ + ポストフロップ統合)

```typescript
// backend/src/game/ai/GtoAiPlayer.ts

import { PlayerAction, BettingContext, Card, HandResult } from '../types/game.types';
import { handEvaluator } from '../core/HandEvaluator';
import { GTO_PREFLOP_RANGES } from './data/gto-preflop-ranges';
import { decidePostflopAction, classifyFacingBetSize } from './postflop/PostflopEngine';

export interface GtoAiConfig {
  position: string;
  isPFA: boolean;
}

export class GtoAiPlayer {
  private holeCards: [Card, Card] | null = null;
  private config: GtoAiConfig;

  constructor(config: GtoAiConfig) {
    this.config = config;
  }

  setHoleCards(cards: [Card, Card]): void {
    this.holeCards = cards;
  }

  /**
   * プリフロップのアクションを決定する。
   * GTO preflop range tables を参照。
   */
  decidePreflopAction(context: BettingContext): PlayerAction {
    // TODO: Phase 3C実装 - GTO range tables を参照
    // gto-preflop-ranges.ts の decidePreflopAction() を呼ぶ
    throw new Error('Preflop decision: Not yet implemented');
  }

  /**
   * ポストフロップのアクションを決定する。
   * PostflopEngine を使用。
   */
  decidePostflopAction(
    communityCards: Card[],
    context: BettingContext & {
      playerId: string;
      pot: number;
      facingBet: number | null;
      street: 'flop' | 'turn' | 'river';
    },
  ): PlayerAction {
    if (!this.holeCards) throw new Error('Hole cards not set');

    const handResult = handEvaluator.evaluate(this.holeCards, communityCards);
    const spr = context.playerStack / context.pot;

    const decision = decidePostflopAction(
      this.holeCards,
      communityCards,
      handResult,
      {
        isPFA: this.config.isPFA,
        isIP: false, // TODO: ゲームエンジンからポジション情報を受け取る
        spr,
        street: context.street,
        pot: context.pot,
        effectiveStack: context.playerStack,
        facingBet: context.facingBet,
        facingBetSizeBucket: context.facingBet !== null
          ? classifyFacingBetSize(context.facingBet, context.pot)
          : null,
      },
    );

    return this.convertDecisionToAction(decision, context);
  }

  private convertDecisionToAction(
    decision: ReturnType<typeof decidePostflopAction>,
    context: BettingContext & { playerId: string },
  ): PlayerAction {
    const { playerId } = context;
    switch (decision.action) {
      case 'check': return { type: 'check', playerId, timestamp: Date.now() };
      case 'fold':  return { type: 'fold',  playerId, timestamp: Date.now() };
      case 'call':  return { type: 'call',  playerId, amount: context.currentBet - context.playerBetThisStreet, timestamp: Date.now() };
      case 'bet':
      case 'raise':
        return { type: 'raise', playerId, amount: decision.betAmount ?? context.currentBet * 2, timestamp: Date.now() };
    }
  }
}
```

---

## 10. テスト仕様

### 10.1 DrawDetector.test.ts

```typescript
describe('DrawDetector', () => {
  test('フラッシュドロー: ホール2枚 + ボード2枚 同スートで検出')
  test('OESD: 4連続ランクでギャップなし')
  test('ガットショット: 内側のギャップ')
  test('コンボドロー: フラッシュドロー + OESD → combo_draw')
  test('既にフラッシュ完成 (rankValue=4) → none を返す')
  test('既にストレート完成 (rankValue=3) → none を返す')
  test('バックドアフラッシュ: フロップで同スート3枚 (ホール2 + ボード1)')
})
```

### 10.2 HandClassifier.test.ts

```typescript
describe('HandClassifier', () => {
  test('フォーカード → NUTTED')
  test('ナッツフラッシュ → NUTTED')
  test('非ナッツフラッシュ → VALUE')
  test('トップペア良キッカー (ドライボード) → VALUE')
  test('トップペア弱キッカー → SHOWDOWN')
  test('ミドルペア → SHOWDOWN')
  test('Aハイノーペア → SHOWDOWN (ブラフキャッチャー)')
  test('ローカード ノーペア → BLUFF')
  test('フラッシュドロー (draw=flush_draw) → SEMI_BLUFF')
  test('OESD (draw=oesd) → SEMI_BLUFF')
  test('ガットショット (draw=gutshot) → BLUFF')
})
```

### 10.3 BoardAnalyzer.test.ts

```typescript
describe('BoardAnalyzer', () => {
  test('K72 レインボー (PFA) → score > 5, multiplier > 1.0')
  test('987 ツートーン (PFA) → score < 5, multiplier < 1.0')
  test('A72 レインボー (PFA) → score >= 7, hasNutAdvantage=true')
  test('K72 レインボー (Caller) → score < 5, multiplier < 1.0')
  test('wetness: K72 rainbow → 0, JT9 two-tone → 3')
  test('multiplier は 0.70〜1.30 の範囲内')
})
```

### 10.4 BluffCalculator.test.ts

```typescript
describe('BluffCalculator', () => {
  test('calculateAlpha: 33%pot → 0.248')
  test('calculateAlpha: 67%pot → 0.401')
  test('calculateAlpha: 100%pot → 0.500')
  test('ナッツフラッシュブロッカー → quality=0.95')
  test('ブロッカーなし → quality=0.4')
  test('フロップ33%pot ブロッカーあり → freq ≈ 0.248')
  test('リバー33%pot ブロッカーあり → freq ≈ 0.124 (×0.5)')
  test('betFreqMultiplier=0.7 → bluff頻度が70%に下がる (ズレB確認)')
})
```

### 10.5 PostflopEngine.test.ts

```typescript
describe('PostflopEngine (統合テスト)', () => {
  describe('アグレッサー', () => {
    test('NUTTED + dry + nut advantage → betLarge 優先')
    test('VALUE + dry + range advantage → betSmall 優先 (multiplier=1.2)')
    test('VALUE + wet + no advantage → betMedium 優先')
    test('SHOWDOWN + dry → check 優先')
    test('SHOWDOWN + wet → bet(protection) 頻度が上昇')
    test('BLUFF + フロップ + ブロッカーあり → bet頻度 ≈ 25%')
    test('BLUFF + リバー + ブロッカーなし → bet頻度 ≈ 5%')
    test('BLUFF: range disadvantage (multiplier=0.7) → bet頻度が比例して下がる (ズレB確認)')
  })
  describe('ディフェンダー', () => {
    test('NUTTED vs small bet → call+raise ≈ 100%')
    test('SHOWDOWN vs small bet → continue ≈ 85% (MDF ≈ 75% 準拠)')
    test('SHOWDOWN vs large bet → continue ≈ 55% (MDF ≈ 50% 準拠)')
    test('BLUFF vs medium bet → fold ≈ 90%')
    test('ズレA確認: 同カテゴリでsmall < large でfold率が増加')
  })
  describe('ストリートポラライゼーション', () => {
    test('ターン → betSmall 減, betLarge 増')
    test('リバー → betSmall=0, large比率増加')
    test('リバー: SEMI_BLUFF は draw=none に再分類される')
  })
})
```

---

---

## 10B. 修正アドeンダム — Fix A & Fix B

> **優先度**: このセクションの実装は、上記セクション7・8の同名関数を上書きする。

### 背景

Phase 3C の設計レビューで 2 つの均衡逸脱が発見された。

| | 問題 | 搾取の方向 |
|---|---|---|
| Fix A | `applySPRModifier` が全カテゴリに一律変更を適用 | 高SPRでSEMI_BLUFFがチェック過多 → 相手が無料でドロー完成 |
| Fix B | `selectBetSize` がSPRを無視、固定バケットを返す | フロップ過少ベット + リバー突然のオーバーベット → 手がバレる |

---

### 10B-1. 新規ファイル: BetSizer.ts

```typescript
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
```

---

### 10B-2. PostflopStrategy.ts — `selectBetSize` 置き換え

セクション7の `selectBetSize` をこの実装で上書きする。

```typescript
// BetSizer.ts から追加インポート
import { getGeometricBetSize } from './BetSizer';

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
```

---

### 10B-3. PostflopStrategy.ts — `applySPRModifier` 置き換え

セクション7の `applySPRModifier` をこの実装で上書きする。

```typescript
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
```

---

### 10B-4. PostflopEngine.ts — `decideAggressorAction` の betAmount 計算を修正

セクション8の `decideAggressorAction` 内の以下の箇所を置き換える。

```typescript
// ── 変更前 (セクション8) ──
// const amount = context.pot * BET_SIZE_FRACTIONS[sizeBucket];

// ── 変更後 ──
// BetSizer.ts から追加インポート
import { getStreetsRemaining } from './BetSizer';

// decideAggressorAction 内:
const streetsRemaining = getStreetsRemaining(context.street);

// selectBetSize を呼ぶ箇所を更新 (signature変更)
const { bucket: sizeBucket, fraction: sizeFraction } =
  selectBetSize(category, boardAdv, context.spr, streetsRemaining);

// betAmount: 幾何学的フラクション × ポット、実効スタックを上限とする
const amount = Math.min(
  context.pot * sizeFraction,
  context.effectiveStack,  // オールイン上限
);
```

また `applySPRModifier` の呼び出しに `category` を追加する。

```typescript
// 変更前:
frequencies = applySPRModifier(frequencies, context.spr);

// 変更後:
frequencies = applySPRModifier(frequencies, category, context.spr);
```

---

### 10B-5. ファイル構成の更新 (セクション1に追加)

```
backend/src/game/ai/postflop/
├── BetSizer.ts        ← 追加 (Fix B: 幾何学的サイジング)
├── BluffCalculator.ts
├── BoardAnalyzer.ts
├── DrawDetector.ts
├── HandClassifier.ts
├── PostflopEngine.ts
└── PostflopStrategy.ts
```

---

### 10B-6. 追加テストケース (セクション10に追記)

```typescript
describe('BetSizer', () => {
  test('SPR=6, フロップ → f≈67.5% → medium')
  test('SPR=6, ターン  → f≈130% → large (ジャム)')
  test('SPR=3, フロップ → f≈45.6% → medium')
  test('SPR=9, フロップ → f≈83.4% → medium (境界値)')
  test('SEMI_BLUFF + large → medium に上限クリップ')
  test('VALUE + no nut advantage + large → medium に上限クリップ')
})

describe('Fix A: applySPRModifier カテゴリ別確認', () => {
  test('SEMI_BLUFF + 高SPR → betMedium が増加、check が減少')
  test('SHOWDOWN + 高SPR → check が増加、bet が減少')
  test('SEMI_BLUFF + 低SPR → check が微増 (含み益減)')
  test('NUTTED + 高SPR → 変化なし (積み上げ段階)')
  test('BLUFF + 高SPR → betSmall が微減')
})

describe('Fix B: 幾何学的betAmount確認', () => {
  test('SPR=6 ターン: betAmount が effectiveStack を超えない')
  test('SPR=3 リバー: betAmount = min(3×pot, effectiveStack)')
  test('SPR=1 リバー: betAmount = effectiveStack (オールイン)')
})
```

---

## 11. 完了条件

- [ ] 全ファイルが `tsc --noEmit` でエラーゼロ
- [ ] Phase 3A + 3B テストが引き続きPASS
- [ ] Phase 3C テストがすべてPASS
- [ ] `npm run test:coverage` でai/postflop/ 以下が85%以上
- [ ] ズレA確認: SHOWDOWN が small/large 別に異なる fold 率を返す
- [ ] ズレB確認: betFreqMultiplier=0.7 の時 BLUFF bet頻度も70%に下がる
- [ ] `PROGRESS.md` を更新した
- [ ] `HANDOFF.md` を更新した
- [ ] Fix A確認: SEMI_BLUFF + 高SPR で betMedium が増加する (check が減少する)
- [ ] Fix A確認: SHOWDOWN + 高SPR で check が増加する (bet が減少する)
- [ ] Fix A確認: NUTTED + 高SPR で頻度変化なし
- [ ] Fix B確認: SPR=6 フロップで betAmount が ≈67%pot になる
- [ ] Fix B確認: SPR=6 ターンで betAmount が effectiveStack を超えない
- [ ] Fix B確認: SEMI_BLUFF が large bucket に上限クリップされる
