# SPEC: Phase 3A — コアプリミティブ

**対象フェーズ**: Phase 3A  
**推定期間**: 2週間  
**担当**: Claude Code  
**前提**: backend/package.json に `pokersolver ^2.1.4` インストール済み  

---

## 1. 作成するファイル一覧

```
backend/src/game/
├── core/
│   ├── Card.ts
│   ├── Deck.ts
│   ├── HandEvaluator.ts
│   ├── Action.ts
│   └── ActionValidator.ts
├── types/
│   └── game.types.ts
└── __tests__/
    ├── Card.test.ts
    ├── Deck.test.ts
    ├── HandEvaluator.test.ts
    └── ActionValidator.test.ts
```

**注意**: `backend/__tests__/` ではなく `backend/src/game/__tests__/` に置く。

---

## 2. game.types.ts — 共通型定義

すべての型を一元管理する。他のファイルはここからインポートする。

```typescript
// backend/src/game/types/game.types.ts

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  readonly suit: Suit;
  readonly rank: Rank;
}

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all-in';

export interface PlayerAction {
  type: ActionType;
  playerId: string;
  amount?: number;       // raise/call/all-in の時のみ使用 (BB単位)
  timestamp: number;     // Date.now()
}

export interface BettingContext {
  currentBet: number;           // このストリートで最高のベット額 (BB単位)
  lastRaiseIncrement: number;   // 最後のレイズの増加分 (minRaiseの計算に使用)
  playerStack: number;          // プレイヤーの残りチップ (BB単位)
  playerBetThisStreet: number;  // このストリートでプレイヤーが既に出した額
  bigBlind: number;             // BB額 (通常 1.0 = 1BB単位)
}

export type HandRank =
  | 'Royal Flush'
  | 'Straight Flush'
  | 'Four of a Kind'
  | 'Full House'
  | 'Flush'
  | 'Straight'
  | 'Three of a Kind'
  | 'Two Pair'
  | 'Pair'
  | 'High Card';

export interface HandResult {
  rank: HandRank;
  rankValue: number;  // 0=High Card ... 8=Royal Flush (比較用)
  name: string;       // 例: "Ace High Flush"
  cards: Card[];      // ベスト5枚のカード (pokersolver由来)
}

export interface WinnerInfo {
  playerIds: string[];   // 引き分けの場合は複数
  handResult: HandResult;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  correctedAction?: PlayerAction;  // all-in時など額を修正した場合
}
```

---

## 3. Card.ts

```typescript
// backend/src/game/core/Card.ts

import { Card, Rank, Suit } from '../types/game.types';

/** pokersolver ライブラリが要求するカード文字列に変換
 *  例: { rank: 'A', suit: 'spades' } → 'As'
 *  ランク文字: 2-9, T, J, Q, K, A
 *  スート文字: c(clubs), d(diamonds), h(hearts), s(spades)
 */
export function cardToPokerSolverString(card: Card): string {
  const suitMap: Record<Suit, string> = {
    clubs: 'c',
    diamonds: 'd',
    hearts: 'h',
    spades: 's',
  };
  return `${card.rank}${suitMap[card.suit]}`;
}

/** 表示用文字列に変換。例: { rank: 'A', suit: 'spades' } → 'A♠' */
export function cardToDisplayString(card: Card): string {
  const suitSymbol: Record<Suit, string> = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
  };
  return `${card.rank}${suitSymbol[card.suit]}`;
}

/** ランクを数値に変換 (2→2, T→10, J→11, Q→12, K→13, A→14) */
export function rankToValue(rank: Rank): number {
  const rankMap: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return rankMap[rank];
}

/** 2枚のカードが同じかどうか判定 */
export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** 全52枚のカードを生成して返す */
export function createFullDeck(): Card[] {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const ranks: Rank[] = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}
```

---

## 4. Deck.ts

```typescript
// backend/src/game/core/Deck.ts

import { Card } from '../types/game.types';
import { createFullDeck } from './Card';

export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = createFullDeck();
    this.shuffle();
  }

  /** Fisher-Yates アルゴリズムでシャッフル */
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /** デッキの先頭からカードを1枚取り出す
   *  @throws Error デッキが空の場合
   */
  deal(): Card {
    const card = this.cards.pop();
    if (!card) {
      throw new Error('Deck is empty');
    }
    return card;
  }

  /** 指定枚数のカードをまとめて取り出す
   *  @throws Error デッキの残りが不足する場合
   */
  dealMany(count: number): Card[] {
    if (this.cards.length < count) {
      throw new Error(`Not enough cards. Remaining: ${this.cards.length}, Requested: ${count}`);
    }
    return Array.from({ length: count }, () => this.deal());
  }

  /** 残り枚数を返す */
  remaining(): number {
    return this.cards.length;
  }

  /** デッキを52枚に戻してシャッフル */
  reset(): void {
    this.cards = createFullDeck();
    this.shuffle();
  }
}
```

---

## 5. HandEvaluator.ts

pokersolver ライブラリのラッパー。ポーカーのハンド評価・勝者決定を担当する。

```typescript
// backend/src/game/core/HandEvaluator.ts

import { Hand } from 'pokersolver';
import { Card, HandRank, HandResult, WinnerInfo } from '../types/game.types';
import { cardToPokerSolverString } from './Card';

/** pokersolver の hand.name を HandRank に変換するマッピング */
const HAND_RANK_MAP: Record<string, { rank: HandRank; value: number }> = {
  'Royal Flush':     { rank: 'Royal Flush',     value: 8 },
  'Straight Flush':  { rank: 'Straight Flush',  value: 7 },
  'Four of a Kind':  { rank: 'Four of a Kind',  value: 6 },
  'Full House':      { rank: 'Full House',       value: 5 },
  'Flush':           { rank: 'Flush',            value: 4 },
  'Straight':        { rank: 'Straight',         value: 3 },
  'Three of a Kind': { rank: 'Three of a Kind',  value: 2 },
  'Two Pair':        { rank: 'Two Pair',         value: 1 },
  'Pair':            { rank: 'Pair',             value: 0 },
  'High Card':       { rank: 'High Card',        value: -1 },
};

/** pokersolver のカードオブジェクトを Card 型に変換する */
function pokerSolverCardToCard(psCard: any): Card {
  const rankMap: Record<string, string> = {
    'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', 'T': 'T',
    '9': '9', '8': '8', '7': '7', '6': '6', '5': '5',
    '4': '4', '3': '3', '2': '2',
  };
  const suitMap: Record<string, string> = {
    's': 'spades', 'h': 'hearts', 'd': 'diamonds', 'c': 'clubs',
  };
  return {
    rank: rankMap[psCard.value] as any,
    suit: suitMap[psCard.suit] as any,
  };
}

export class HandEvaluator {
  /**
   * ホールカード2枚とコミュニティカード3〜5枚から最強の5枚ハンドを評価する
   * @param holeCards プレイヤーのホールカード (必ず2枚)
   * @param communityCards コミュニティカード (3〜5枚)
   * @returns HandResult
   */
  evaluate(holeCards: [Card, Card], communityCards: Card[]): HandResult {
    if (communityCards.length < 3 || communityCards.length > 5) {
      throw new Error(`Invalid community card count: ${communityCards.length}. Must be 3-5.`);
    }

    const allCards = [...holeCards, ...communityCards].map(cardToPokerSolverString);
    const solvedHand = Hand.solve(allCards);

    const rankInfo = HAND_RANK_MAP[solvedHand.name];
    if (!rankInfo) {
      throw new Error(`Unknown hand name from pokersolver: ${solvedHand.name}`);
    }

    return {
      rank: rankInfo.rank,
      rankValue: rankInfo.value,
      name: solvedHand.toString(),
      cards: solvedHand.cards.map(pokerSolverCardToCard),
    };
  }

  /**
   * 複数プレイヤーのハンドを比較して勝者を決定する
   * @param players { id, holeCards } の配列 (2名以上)
   * @param communityCards コミュニティカード (5枚。ショーダウン時)
   * @returns WinnerInfo (引き分けの場合 playerIds が複数)
   */
  findWinners(
    players: { id: string; holeCards: [Card, Card] }[],
    communityCards: Card[],
  ): WinnerInfo {
    if (players.length < 2) {
      throw new Error('At least 2 players required');
    }
    if (communityCards.length !== 5) {
      throw new Error(`Showdown requires exactly 5 community cards, got ${communityCards.length}`);
    }

    const solvedHands = players.map((p) => {
      const allCards = [...p.holeCards, ...communityCards].map(cardToPokerSolverString);
      return { id: p.id, hand: Hand.solve(allCards) };
    });

    const winnerHands = Hand.winners(solvedHands.map((h) => h.hand));

    const winnerIds = solvedHands
      .filter((h) => winnerHands.includes(h.hand))
      .map((h) => h.id);

    // 勝者の HandResult を生成 (最初の勝者のハンドを代表として使用)
    const winnerHandResult = this.evaluate(
      players.find((p) => p.id === winnerIds[0])!.holeCards,
      communityCards,
    );

    return {
      playerIds: winnerIds,
      handResult: winnerHandResult,
    };
  }

  /**
   * 2つの HandResult を比較する
   * @returns 1 if a wins, -1 if b wins, 0 if tie
   */
  compareHands(a: HandResult, b: HandResult): 1 | -1 | 0 {
    if (a.rankValue > b.rankValue) return 1;
    if (a.rankValue < b.rankValue) return -1;
    return 0;
    // 注: 同ランク内のタイブレークは pokersolver の Hand.winners が処理するため、
    //     このメソッドは大まかな比較にのみ使用すること
  }
}

export const handEvaluator = new HandEvaluator(); // シングルトン
```

---

## 6. Action.ts

```typescript
// backend/src/game/core/Action.ts

import { ActionType, PlayerAction } from '../types/game.types';

/** アクションを生成するファクトリ関数群 */

export function createFold(playerId: string): PlayerAction {
  return { type: 'fold', playerId, timestamp: Date.now() };
}

export function createCheck(playerId: string): PlayerAction {
  return { type: 'check', playerId, timestamp: Date.now() };
}

export function createCall(playerId: string, amount: number): PlayerAction {
  return { type: 'call', playerId, amount, timestamp: Date.now() };
}

export function createRaise(playerId: string, amount: number): PlayerAction {
  return { type: 'raise', playerId, amount, timestamp: Date.now() };
}

export function createAllIn(playerId: string, amount: number): PlayerAction {
  return { type: 'all-in', playerId, amount, timestamp: Date.now() };
}

/** アクションが金額を伴うかどうか */
export function actionRequiresAmount(type: ActionType): boolean {
  return type === 'call' || type === 'raise' || type === 'all-in';
}

/** アクションの表示用文字列 */
export function actionToString(action: PlayerAction): string {
  switch (action.type) {
    case 'fold':   return 'Fold';
    case 'check':  return 'Check';
    case 'call':   return `Call ${action.amount?.toFixed(2)}BB`;
    case 'raise':  return `Raise to ${action.amount?.toFixed(2)}BB`;
    case 'all-in': return `All-In ${action.amount?.toFixed(2)}BB`;
  }
}
```

---

## 7. ActionValidator.ts

テキサスホールデムの標準ルールに基づいてアクションを検証する。

```typescript
// backend/src/game/core/ActionValidator.ts

import { BettingContext, PlayerAction, ValidationResult } from '../types/game.types';
import { createAllIn, createCall } from './Action';

export class ActionValidator {
  /**
   * アクションが有効かどうかを検証する。
   * 無効な場合は error を返す。
   * 部分オールイン等で額が修正される場合は correctedAction を返す。
   */
  validate(action: PlayerAction, context: BettingContext): ValidationResult {
    switch (action.type) {
      case 'fold':   return this.validateFold();
      case 'check':  return this.validateCheck(context);
      case 'call':   return this.validateCall(action, context);
      case 'raise':  return this.validateRaise(action, context);
      case 'all-in': return this.validateAllIn(action, context);
      default:
        return { valid: false, error: `Unknown action type: ${(action as any).type}` };
    }
  }

  /** Fold は常に有効 */
  private validateFold(): ValidationResult {
    return { valid: true };
  }

  /** Check: 自分がまだベットしていない場合 OR 既に最高額をマッチしている場合のみ有効 */
  private validateCheck(context: BettingContext): ValidationResult {
    const amountToCall = context.currentBet - context.playerBetThisStreet;
    if (amountToCall > 0) {
      return {
        valid: false,
        error: `Cannot check. There is a bet of ${amountToCall.toFixed(2)}BB to call.`,
      };
    }
    return { valid: true };
  }

  /** Call: スタックが不足する場合は自動的にオールインに修正 */
  private validateCall(action: PlayerAction, context: BettingContext): ValidationResult {
    const amountToCall = context.currentBet - context.playerBetThisStreet;

    if (amountToCall <= 0) {
      return { valid: false, error: 'No bet to call. Use check instead.' };
    }

    // スタックが足りない → オールイン
    if (context.playerStack <= amountToCall) {
      const correctedAction = createAllIn(action.playerId, context.playerStack);
      return { valid: true, correctedAction };
    }

    // 額の検証
    if (action.amount !== undefined && Math.abs(action.amount - amountToCall) > 0.001) {
      // 正しい額に修正して返す
      const correctedAction = createCall(action.playerId, amountToCall);
      return { valid: true, correctedAction };
    }

    return { valid: true };
  }

  /** Raise: 最小レイズ以上であること、スタック以内であること */
  private validateRaise(action: PlayerAction, context: BettingContext): ValidationResult {
    if (action.amount === undefined || action.amount <= 0) {
      return { valid: false, error: 'Raise amount is required and must be positive.' };
    }

    const totalBetAfterRaise = action.amount; // 総ベット額 (このストリートの合計)
    const minRaiseTotal = context.currentBet + Math.max(
      context.lastRaiseIncrement,
      context.bigBlind,
    );

    // オールインレイズ (最小レイズに満たないがスタック全部) は許可
    if (totalBetAfterRaise === context.playerBetThisStreet + context.playerStack) {
      const correctedAction = createAllIn(action.playerId, context.playerStack);
      return { valid: true, correctedAction };
    }

    if (totalBetAfterRaise < minRaiseTotal) {
      return {
        valid: false,
        error: `Raise too small. Minimum raise to: ${minRaiseTotal.toFixed(2)}BB`,
      };
    }

    const maxBetTotal = context.playerBetThisStreet + context.playerStack;
    if (totalBetAfterRaise > maxBetTotal) {
      return {
        valid: false,
        error: `Raise exceeds stack. Maximum: ${maxBetTotal.toFixed(2)}BB`,
      };
    }

    return { valid: true };
  }

  /** All-In: プレイヤーのスタック全額であること */
  private validateAllIn(action: PlayerAction, context: BettingContext): ValidationResult {
    if (action.amount === undefined) {
      return { valid: false, error: 'All-in amount is required.' };
    }
    if (Math.abs(action.amount - context.playerStack) > 0.001) {
      return {
        valid: false,
        error: `All-in amount must equal player stack: ${context.playerStack.toFixed(2)}BB`,
      };
    }
    return { valid: true };
  }
}

export const actionValidator = new ActionValidator(); // シングルトン
```

---

## 8. テスト仕様

### 8.1 テスト環境のセットアップ

```bash
# backend フォルダで実行
npm install -D jest @types/jest ts-jest
```

`backend/jest.config.js` を作成:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/game/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@game/(.*)$': '<rootDir>/src/game/$1',
  },
};
```

`backend/package.json` の scripts に追加:
```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage"
```

---

### 8.2 Card.test.ts

```typescript
// テストケース一覧 (実装はこれを満たすように書く)
describe('Card utilities', () => {
  test('cardToPokerSolverString: Ace of spades → "As"')
  test('cardToPokerSolverString: Ten of hearts → "Th"')
  test('cardToPokerSolverString: Two of clubs → "2c"')
  test('rankToValue: 2→2, T→10, A→14')
  test('cardsEqual: 同じカードはtrue')
  test('cardsEqual: 異なるカードはfalse')
  test('createFullDeck: 52枚のカードを返す')
  test('createFullDeck: 重複がない')
  test('createFullDeck: 4スート×13ランクで構成される')
});
```

### 8.3 Deck.test.ts

```typescript
describe('Deck', () => {
  test('初期化時に52枚')
  test('deal() で1枚減る')
  test('dealMany(5) で5枚取れる')
  test('dealMany(53) でエラー')
  test('deal() で空になった後エラー')
  test('reset() で52枚に戻る')
  test('shuffle() 後も52枚')
  test('shuffle() が毎回異なる順序になる (統計的テスト, 10回中8回以上異なること)')
});
```

### 8.4 HandEvaluator.test.ts

```typescript
describe('HandEvaluator', () => {
  describe('evaluate()', () => {
    test('ロイヤルフラッシュを正しく判定')
    test('ストレートフラッシュを正しく判定')
    test('フォーカードを正しく判定')
    test('フルハウスを正しく判定')
    test('フラッシュを正しく判定')
    test('ストレートを正しく判定 (A-2-3-4-5 ホイール含む)')
    test('スリーカードを正しく判定')
    test('ツーペアを正しく判定')
    test('ワンペアを正しく判定')
    test('ハイカードを正しく判定')
    test('コミュニティカードが3枚でも動作する (フロップ時)')
    test('コミュニティカードが6枚でエラー')
  });

  describe('findWinners()', () => {
    test('明確な勝者を返す')
    test('引き分けの場合に複数のplayerIdを返す')
    test('コミュニティカードが5枚未満でエラー')
    test('プレイヤーが1人でエラー')
    test('3人以上のショーダウン')
  });

  describe('compareHands()', () => {
    test('フラッシュ > ストレートでa=1を返す')
    test('同ランクで0を返す')
  });
});
```

### 8.5 ActionValidator.test.ts

```typescript
// context の基本形: currentBet=2, lastRaiseIncrement=2, playerStack=100, playerBetThisStreet=0, bigBlind=1
describe('ActionValidator', () => {
  describe('fold', () => {
    test('常に valid=true')
  });

  describe('check', () => {
    test('currentBet=0 のとき valid=true')
    test('playerBetThisStreet === currentBet のとき valid=true')
    test('コールが必要な時 valid=false')
  });

  describe('call', () => {
    test('正しい額でコール → valid=true')
    test('スタックが足りない場合 → correctedAction として all-in を返す')
    test('コールするベットがない → valid=false')
  });

  describe('raise', () => {
    test('最小レイズ以上 → valid=true')
    test('最小レイズ未満 → valid=false')
    test('スタック超過 → valid=false')
    test('スタック全額のオールインレイズ → all-in として correctedAction を返す')
    test('amount が undefined → valid=false')
  });

  describe('all-in', () => {
    test('playerStack と同額 → valid=true')
    test('playerStack と異なる額 → valid=false')
    test('amount が undefined → valid=false')
  });
});
```

---

## 9. 実装上の注意点

1. **pokersolver の型定義がない場合**: `backend/src/types/pokersolver.d.ts` を作成して `declare module 'pokersolver'` を追記すること。

2. **数値精度**: BBは浮動小数点を使用するが、比較時は `Math.abs(a - b) > 0.001` のような許容誤差を使うこと。

3. **イミュータビリティ**: `Card` は `readonly` フィールドを持つ。Deck内部の cards 配列は外部に公開しない。

4. **エラーメッセージ**: 英語で統一する (サーバーログ用)。

5. **Deck の `shuffle()` はコンストラクタで自動実行** する。明示的に `new Deck()` → シャッフル済みで使える状態。

6. **シングルトン**: `handEvaluator` と `actionValidator` はモジュールレベルでエクスポートする。ゲームエンジンはこれをインポートして使う。

---

## 10. 完了条件

- [ ] 全ファイルがコンパイルエラーなく `tsc` を通過する
- [ ] `npm test` で全テストが PASS する
- [ ] `npm run test:coverage` でコアロジックのカバレッジ 85%以上
- [ ] `PROGRESS.md` を更新する
- [ ] `HANDOFF.md` を更新する (次フェーズの引き継ぎ事項を記載)
