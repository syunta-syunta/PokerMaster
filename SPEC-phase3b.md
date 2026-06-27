# SPEC: Phase 3B — ゲームフロー

**対象フェーズ**: Phase 3B
**推定期間**: 2週間
**担当**: Claude Code
**前提**: Phase 3A完了・旧実装削除済み（HANDOFF.md Step 0 実施後）

---

## 1. 作成するファイル一覧

```
backend/src/game/
├── engine/                        ← Phase 3B 新規
│   ├── TablePlayer.ts
│   ├── GameTable.ts
│   ├── BettingRound.ts
│   ├── PotManager.ts
│   └── GameEngine.ts
├── types/
│   └── game.types.ts              ← 型を追記（既存は変更しない）
└── __tests__/
    └── engine/                    ← Phase 3B 新規
        ├── BettingRound.test.ts
        ├── PotManager.test.ts
        └── GameEngine.test.ts
```

---

## 2. game.types.ts への追記

**既存の型は一切変更しない。以下を末尾に追記する。**

```typescript
// ─── Phase 3B 追加型 ───────────────────────────────────────

/** ゲームの進行ストリート */
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

/** ハンド内のプレイヤー状態 */
export type PlayerStatus =
  | 'active'       // アクション可能
  | 'folded'       // フォールド済み
  | 'all-in'       // オールイン（アクション不要）
  | 'sitting-out'; // このハンドに不参加

/** テーブル上のポジション名 */
export type PositionName =
  | 'UTG' | 'UTG1' | 'UTG2' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

/** ゲーム設定 */
export interface GameConfig {
  maxPlayers: 2 | 6 | 8 | 9;
  smallBlind: number;          // BB単位 (通常 0.5)
  bigBlind: number;            // BB単位 (通常 1.0)
  startingStack: number;       // BB単位 (通常 100)
  actionTimeoutSeconds: number; // アクションタイムアウト (通常 30)
}

/** テーブル上のプレイヤー（ゲームエンジン内部用） */
export interface TablePlayer {
  id: string;
  name: string;
  stack: number;                  // 残りチップ (BB)
  holeCards: [Card, Card] | null; // ディール前はnull
  status: PlayerStatus;
  betThisStreet: number;          // このストリートに出した額 (BB)
  totalBetThisHand: number;       // このハンドで出した合計額 (BB)
  seatIndex: number;              // 座席番号 (0-based)
  positionName: PositionName | null;
  isDealer: boolean;
  isSB: boolean;
  isBB: boolean;
}

/** ポット（メインポット or サイドポット） */
export interface Pot {
  amount: number;              // ポット額 (BB)
  eligiblePlayerIds: string[]; // このポットを勝てるプレイヤー
}

/** 全プレイヤーに送る公開情報（ホールカードなし） */
export interface PublicPlayerState {
  id: string;
  name: string;
  stack: number;
  betThisStreet: number;
  status: PlayerStatus;
  seatIndex: number;
  positionName: PositionName | null;
  isDealer: boolean;
  isSB: boolean;
  isBB: boolean;
  holeCards?: [Card, Card]; // ショーダウン時のみセット
}

/** 特定プレイヤーへ送るゲームスナップショット（自分のホールカード含む） */
export interface GameSnapshot {
  handId: string;
  street: Street;
  communityCards: Card[];
  pots: Pot[];
  totalPot: number;        // potsの合計（利便性のため）
  currentBet: number;      // このストリートの最高ベット額 (BB)
  minRaiseTotal: number;   // 最小レイズ後の合計額 (BB)
  activePlayerId: string | null;
  timeLimit: number;       // 残り秒数
  players: PublicPlayerState[];
  myHoleCards: [Card, Card] | null; // 自分のホールカード（他人のは含まない）
  dealerSeatIndex: number;
}

/** ハンド結果イベント */
export interface HandResultEvent {
  winners: WinnerInfo[];
  potDistribution: { playerId: string; amount: number }[];
  playerHands: {
    playerId: string;
    holeCards: [Card, Card];
    handResult: HandResult;
  }[];
}

/** Socket.IO: サーバー→クライアント イベント定義（旧実装のイベント名を引き継ぐ） */
export interface ServerToClientEvents {
  'game-state': (snapshot: GameSnapshot) => void;
  'game-error': (error: string) => void;
  'player-joined': (player: PublicPlayerState) => void;
  'player-left': (playerId: string) => void;
  'action-required': (playerId: string, timeLimit: number) => void;
  'hand-result': (result: HandResultEvent) => void;
}

/** Socket.IO: クライアント→サーバー イベント定義（旧実装のイベント名を引き継ぐ） */
export interface ClientToServerEvents {
  'join-game': (gameId: string) => void;
  'player-action': (action: PlayerAction) => void;
  'leave-game': () => void;
}
```

---

## 3. TablePlayer.ts

テーブル上のプレイヤーを生成・操作するファクトリ/ユーティリティ。クラスではなく純粋関数で実装する。

```typescript
// backend/src/game/engine/TablePlayer.ts

import { TablePlayer, PlayerStatus, Card } from '../types/game.types';

/** 初期状態のTablePlayerを生成 */
export function createTablePlayer(
  id: string,
  name: string,
  seatIndex: number,
  startingStack: number,
): TablePlayer {
  return {
    id,
    name,
    stack: startingStack,
    holeCards: null,
    status: 'active',
    betThisStreet: 0,
    totalBetThisHand: 0,
    seatIndex,
    positionName: null,
    isDealer: false,
    isSB: false,
    isBB: false,
  };
}

/** ストリート開始時にbetThisStreetをリセット */
export function resetStreetBet(player: TablePlayer): TablePlayer {
  return { ...player, betThisStreet: 0 };
}

/** プレイヤーがアクション可能か（active のみ） */
export function canAct(player: TablePlayer): boolean {
  return player.status === 'active';
}

/** プレイヤーがポットに参加しているか（folded以外） */
export function isInHand(player: TablePlayer): boolean {
  return player.status !== 'folded' && player.status !== 'sitting-out';
}

/** プレイヤーをフォールド状態にする */
export function foldPlayer(player: TablePlayer): TablePlayer {
  return { ...player, status: 'folded', holeCards: null };
}

/** チップをベットさせる（スタックから引く）。返り値: [updatedPlayer, actualBetAmount]
 *  スタック不足の場合は残りスタック全額をベット（オールイン）
 */
export function placeBet(
  player: TablePlayer,
  amount: number,
): [TablePlayer, number] {
  const actual = Math.min(amount, player.stack);
  const newStack = player.stack - actual;
  const newStatus: PlayerStatus = newStack <= 0 ? 'all-in' : player.status;
  return [
    {
      ...player,
      stack: newStack,
      betThisStreet: player.betThisStreet + actual,
      totalBetThisHand: player.totalBetThisHand + actual,
      status: newStatus,
    },
    actual,
  ];
}

/** ホールカードをディール */
export function dealHoleCards(
  player: TablePlayer,
  cards: [Card, Card],
): TablePlayer {
  return { ...player, holeCards: cards };
}

/** ハンド開始時にプレイヤー状態をリセット（スタックは引き継ぐ） */
export function resetForNewHand(player: TablePlayer): TablePlayer {
  return {
    ...player,
    holeCards: null,
    status: player.stack > 0 ? 'active' : 'sitting-out',
    betThisStreet: 0,
    totalBetThisHand: 0,
    positionName: null,
    isDealer: false,
    isSB: false,
    isBB: false,
  };
}
```

---

## 4. GameTable.ts

座席・ポジション管理を担当する。

```typescript
// backend/src/game/engine/GameTable.ts

import { TablePlayer, PositionName, GameConfig } from '../types/game.types';
import { createTablePlayer, resetForNewHand } from './TablePlayer';

/** ポジション名のマッピング（プレイヤー数 → ポジション配列、BTNから時計回り） */
const POSITION_NAMES: Record<number, PositionName[]> = {
  2: ['BTN', 'BB'],          // BTN = SB でもある (Heads-Up ルール)
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO'],
};

export class GameTable {
  private players: TablePlayer[] = [];
  private dealerSeatIndex: number = 0;
  readonly config: GameConfig;

  constructor(config: GameConfig) {
    this.config = config;
  }

  // ─── プレイヤー管理 ────────────────────────

  addPlayer(id: string, name: string): void {
    if (this.players.length >= this.config.maxPlayers) {
      throw new Error('Table is full');
    }
    if (this.players.some(p => p.id === id)) {
      throw new Error(`Player ${id} is already at the table`);
    }
    const seatIndex = this.players.length;
    this.players.push(
      createTablePlayer(id, name, seatIndex, this.config.startingStack),
    );
  }

  removePlayer(id: string): void {
    this.players = this.players.filter(p => p.id !== id);
    // seatIndexを詰め直す
    this.players.forEach((p, i) => { p.seatIndex = i; });
  }

  getPlayer(id: string): TablePlayer {
    const p = this.players.find(p => p.id === id);
    if (!p) throw new Error(`Player ${id} not found`);
    return p;
  }

  updatePlayer(updated: TablePlayer): void {
    const idx = this.players.findIndex(p => p.id === updated.id);
    if (idx === -1) throw new Error(`Player ${updated.id} not found`);
    this.players[idx] = updated;
  }

  getActivePlayers(): TablePlayer[] {
    return this.players.filter(p => p.status === 'active');
  }

  getPlayersInHand(): TablePlayer[] {
    return this.players.filter(
      p => p.status === 'active' || p.status === 'all-in',
    );
  }

  getAllPlayers(): TablePlayer[] {
    return [...this.players];
  }

  getPlayerCount(): number {
    return this.players.length;
  }

  // ─── ポジション管理 ────────────────────────

  /** ハンド開始時にプレイヤー状態をリセットしてポジションを割り当てる */
  setupForNewHand(): void {
    // 全プレイヤーのハンド状態をリセット
    this.players = this.players.map(resetForNewHand);

    const n = this.players.length;
    const positions = POSITION_NAMES[n];
    if (!positions) throw new Error(`Unsupported player count: ${n}`);

    // dealerSeatIndex からBTNを割り当て、時計回りにポジション名を付与
    for (let i = 0; i < n; i++) {
      const seatIdx = (this.dealerSeatIndex + i) % n;
      const posName = positions[i];
      const player = this.players[seatIdx];
      player.positionName = posName;
      player.isDealer = posName === 'BTN';
      player.isSB = posName === 'SB' || (n === 2 && posName === 'BTN');
      player.isBB = posName === 'BB';
    }
  }

  /** ディーラーボタンを次に進める */
  advanceDealer(): void {
    this.dealerSeatIndex = (this.dealerSeatIndex + 1) % this.players.length;
  }

  getDealerSeatIndex(): number {
    return this.dealerSeatIndex;
  }

  /** SBプレイヤーを返す */
  getSBPlayer(): TablePlayer {
    const sb = this.players.find(p => p.isSB);
    if (!sb) throw new Error('SB player not found');
    return sb;
  }

  /** BBプレイヤーを返す */
  getBBPlayer(): TablePlayer {
    const bb = this.players.find(p => p.isBB);
    if (!bb) throw new Error('BB player not found');
    return bb;
  }

  /** プリフロップのアクション開始プレイヤー（UTG = BBの次） */
  getUTGPlayer(): TablePlayer {
    const bb = this.getBBPlayer();
    const activePlayers = this.players.filter(p => p.status === 'active');
    const bbIdx = activePlayers.findIndex(p => p.id === bb.id);
    return activePlayers[(bbIdx + 1) % activePlayers.length];
  }

  /** ポストフロップのアクション開始プレイヤー（ディーラーの次のアクティブプレイヤー） */
  getFirstPostflopPlayer(): TablePlayer {
    const dealer = this.players[this.dealerSeatIndex];
    const inHand = this.getPlayersInHand();
    const dealerIdx = inHand.findIndex(p => p.id === dealer.id);
    // ディーラーの次のプレイヤーから探す
    for (let i = 1; i <= inHand.length; i++) {
      const candidate = inHand[(dealerIdx + i) % inHand.length];
      if (candidate.status === 'active') return candidate;
    }
    throw new Error('No active player found for postflop');
  }
}
```

---

## 5. BettingRound.ts

1ストリートのベッティングを管理する。

```typescript
// backend/src/game/engine/BettingRound.ts

import {
  TablePlayer, PlayerAction, BettingContext, ActionType,
} from '../types/game.types';
import { actionValidator } from '../core/ActionValidator';
import { placeBet, foldPlayer, canAct } from './TablePlayer';

export interface BettingRoundConfig {
  bigBlind: number;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  /** BBのオプション権があるか（プリフロップで誰もレイズしていない場合） */
  bbHasOption: boolean;
}

export interface BettingRoundResult {
  updatedPlayers: TablePlayer[];
  collectedBets: number; // このラウンドで集めた合計額 (BB)
}

export class BettingRound {
  private players: TablePlayer[];
  private currentBet: number;
  private lastRaiseIncrement: number;
  private config: BettingRoundConfig;
  /** まだアクションが必要なプレイヤーIDのセット */
  private playersToAct: Set<string>;
  /** BBのオプション権が残っているか */
  private bbOptionPending: boolean;

  constructor(
    players: TablePlayer[],
    config: BettingRoundConfig,
    initialBet: number = 0,
  ) {
    this.players = players.map(p => ({ ...p }));
    this.config = config;
    this.currentBet = initialBet;
    this.lastRaiseIncrement = config.bigBlind;
    this.bbOptionPending = config.bbHasOption;

    // 初期アクション対象: activeなプレイヤー全員
    this.playersToAct = new Set(
      players.filter(canAct).map(p => p.id),
    );
  }

  /** 現在アクションすべきプレイヤーを返す（順番は players 配列の順） */
  getNextActingPlayerId(): string | null {
    if (this.isOver()) return null;
    const active = this.players.filter(
      p => canAct(p) && this.playersToAct.has(p.id),
    );
    return active[0]?.id ?? null;
  }

  /** BettingContext を構築して返す（ActionValidator に渡す） */
  getBettingContext(playerId: string): BettingContext {
    const player = this.getPlayer(playerId);
    return {
      currentBet: this.currentBet,
      lastRaiseIncrement: this.lastRaiseIncrement,
      playerStack: player.stack,
      playerBetThisStreet: player.betThisStreet,
      bigBlind: this.config.bigBlind,
    };
  }

  /**
   * アクションを適用する
   * @returns バリデーション結果。valid=falseの場合、アクションは適用されない
   */
  applyAction(action: PlayerAction): { valid: boolean; error?: string } {
    const player = this.getPlayer(action.playerId);
    const context = this.getBettingContext(action.playerId);
    const result = actionValidator.validate(action, context);

    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    // correctedAction がある場合はそちらを使う
    const effectiveAction = result.correctedAction ?? action;

    switch (effectiveAction.type) {
      case 'fold':
        this.applyFold(player);
        break;
      case 'check':
        this.applyCheck(player);
        break;
      case 'call':
        this.applyCall(player, effectiveAction.amount ?? 0);
        break;
      case 'raise':
        this.applyRaise(player, effectiveAction.amount ?? 0);
        break;
      case 'all-in':
        this.applyAllIn(player, effectiveAction.amount ?? 0);
        break;
    }

    return { valid: true };
  }

  /** ラウンドが終了しているか */
  isOver(): boolean {
    const activePlayers = this.players.filter(canAct);
    // アクティブプレイヤーが1人以下 → 終了
    if (activePlayers.length <= 1) return true;
    // playersToActが空 かつ BBオプション未使用でない → 終了
    return this.playersToAct.size === 0 && !this.bbOptionPending;
  }

  /** このラウンドで集めたベット額の合計 */
  getCollectedAmount(): number {
    const originalBets = this.players.reduce(
      (sum, p) => sum + p.betThisStreet, 0,
    );
    return originalBets;
  }

  /** 現在のプレイヤー状態を返す */
  getPlayers(): TablePlayer[] {
    return this.players.map(p => ({ ...p }));
  }

  getCurrentBet(): number {
    return this.currentBet;
  }

  // ─── Private ────────────────────────────────

  private getPlayer(id: string): TablePlayer {
    const p = this.players.find(p => p.id === id);
    if (!p) throw new Error(`Player ${id} not found in BettingRound`);
    return p;
  }

  private updatePlayer(updated: TablePlayer): void {
    const idx = this.players.findIndex(p => p.id === updated.id);
    if (idx !== -1) this.players[idx] = updated;
  }

  private applyFold(player: TablePlayer): void {
    this.updatePlayer(foldPlayer(player));
    this.playersToAct.delete(player.id);
    this.checkBbOption(player.id);
  }

  private applyCheck(player: TablePlayer): void {
    this.playersToAct.delete(player.id);
    this.checkBbOption(player.id);
  }

  private applyCall(player: TablePlayer, amount: number): void {
    const [updated] = placeBet(player, amount);
    this.updatePlayer(updated);
    this.playersToAct.delete(player.id);
    this.checkBbOption(player.id);
  }

  private applyRaise(player: TablePlayer, totalBetAmount: number): void {
    const additionalAmount = totalBetAmount - player.betThisStreet;
    const [updated] = placeBet(player, additionalAmount);
    const newIncrement = totalBetAmount - this.currentBet;
    this.lastRaiseIncrement = Math.max(newIncrement, this.config.bigBlind);
    this.currentBet = totalBetAmount;
    this.updatePlayer(updated);

    // レイズしたので他の全activeプレイヤーをplayersToActに戻す
    this.players.forEach(p => {
      if (canAct(p) && p.id !== player.id) {
        this.playersToAct.add(p.id);
      }
    });
    this.playersToAct.delete(player.id);
    this.bbOptionPending = false; // レイズでBBオプションは消える
  }

  private applyAllIn(player: TablePlayer, amount: number): void {
    const [updated] = placeBet(player, amount);
    const totalBet = updated.betThisStreet;

    // オールインがレイズになる場合（現在のベット額を超える）
    if (totalBet > this.currentBet) {
      const newIncrement = totalBet - this.currentBet;
      // 最小レイズに満たないオールインレイズは他プレイヤーのアクションを再開させない
      if (newIncrement >= this.lastRaiseIncrement) {
        this.lastRaiseIncrement = newIncrement;
        this.players.forEach(p => {
          if (canAct(p) && p.id !== player.id) {
            this.playersToAct.add(p.id);
          }
        });
      }
      this.currentBet = totalBet;
    }

    this.updatePlayer(updated);
    this.playersToAct.delete(player.id);
    this.bbOptionPending = false;
  }

  /** BBがアクションしたらオプションを消費 */
  private checkBbOption(playerId: string): void {
    const bb = this.players.find(p => p.isBB);
    if (bb && bb.id === playerId) {
      this.bbOptionPending = false;
    }
  }
}
```

---

## 6. PotManager.ts

ポット計算とサイドポット分配を担当する。

```typescript
// backend/src/game/engine/PotManager.ts

import { Pot, TablePlayer, WinnerInfo } from '../types/game.types';

export class PotManager {
  private pots: Pot[] = [];

  /** 各プレイヤーの betThisHand からポットを計算してサイドポットを生成する */
  calculatePots(players: TablePlayer[]): void {
    // ハンドに参加しているプレイヤーのみ対象
    const contributors = players
      .filter(p => p.totalBetThisHand > 0)
      .sort((a, b) => a.totalBetThisHand - b.totalBetThisHand);

    this.pots = [];
    let previousLevel = 0;

    for (let i = 0; i < contributors.length; i++) {
      const level = contributors[i].totalBetThisHand;
      if (level <= previousLevel) continue;

      const increment = level - previousLevel;
      const potAmount = increment * (contributors.length - i);

      // このポットに参加できるプレイヤー（level以上を払っているプレイヤー）
      const eligible = contributors
        .filter(p => p.totalBetThisHand >= level && p.status !== 'folded')
        .map(p => p.id);

      if (eligible.length > 0) {
        this.pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
      }

      previousLevel = level;
    }
  }

  /** 勝者情報に基づいてポットを分配する
   *  @returns { playerId: string, amount: number }[] の分配リスト
   */
  distributePots(
    winners: WinnerInfo[],
    allPlayersInHand: TablePlayer[],
  ): { playerId: string; amount: number }[] {
    const distribution: Map<string, number> = new Map();

    for (const pot of this.pots) {
      // このポットを勝てる勝者を絞り込む
      const potWinners = winners
        .flatMap(w => w.playerIds)
        .filter(id => pot.eligiblePlayerIds.includes(id));

      if (potWinners.length === 0) {
        // 勝者がいない（全員フォールド後のエラーケース）
        // 最後にフォールドしていないプレイヤーに渡す
        const lastStanding = allPlayersInHand.find(
          p => p.status !== 'folded' && pot.eligiblePlayerIds.includes(p.id),
        );
        if (lastStanding) potWinners.push(lastStanding.id);
      }

      const share = Math.floor((pot.amount / potWinners.length) * 100) / 100;
      potWinners.forEach(id => {
        distribution.set(id, (distribution.get(id) ?? 0) + share);
      });

      // 端数は最初の勝者に加算
      const total = potWinners.length * share;
      const remainder = Math.round((pot.amount - total) * 100) / 100;
      if (remainder > 0 && potWinners[0]) {
        distribution.set(
          potWinners[0],
          (distribution.get(potWinners[0]) ?? 0) + remainder,
        );
      }
    }

    return Array.from(distribution.entries()).map(([playerId, amount]) => ({
      playerId,
      amount,
    }));
  }

  getPots(): Pot[] {
    return [...this.pots];
  }

  getTotalPot(): number {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  reset(): void {
    this.pots = [];
  }
}
```

---

## 7. GameEngine.ts

ハンド全体のオーケストレーション。**Socket.IOと疎結合**にするため、アクション取得を抽象メソッドで定義する。

```typescript
// backend/src/game/engine/GameEngine.ts

import { v4 as uuidv4 } from 'uuid';
import {
  TablePlayer, PlayerAction, Street, GameSnapshot,
  HandResultEvent, PublicPlayerState, Card,
} from '../types/game.types';
import { Deck } from '../core/Deck';
import { handEvaluator } from '../core/HandEvaluator';
import { GameTable } from './GameTable';
import { BettingRound } from './BettingRound';
import { PotManager } from './PotManager';
import { dealHoleCards, isInHand, resetStreetBet } from './TablePlayer';

export abstract class GameEngine {
  protected table: GameTable;
  protected potManager: PotManager;
  protected deck: Deck;
  protected communityCards: Card[] = [];
  protected currentHandId: string = '';
  protected currentStreet: Street = 'preflop';

  constructor(table: GameTable) {
    this.table = table;
    this.potManager = new PotManager();
    this.deck = new Deck();
  }

  // ─── 抽象メソッド（Socket.IO実装で上書き） ──────────

  /**
   * プレイヤーのアクションを待機して返す。
   * Phase 3Bのテストでは事前にキューに詰めたアクションを返す実装を使う。
   * Phase 3Dでは Socket.IO のイベントを待機する実装に差し替える。
   */
  protected abstract requestAction(
    playerId: string,
    context: import('../types/game.types').BettingContext,
  ): Promise<PlayerAction>;

  /**
   * 全プレイヤーにゲームスナップショットを送る。
   * テストでは記録するだけ、Socket.IOでは emit する。
   */
  protected abstract broadcastSnapshot(street: Street): Promise<void>;

  /**
   * ハンド結果を全プレイヤーに送る。
   */
  protected abstract broadcastHandResult(result: HandResultEvent): Promise<void>;

  // ─── ハンド進行 ────────────────────────────────────

  /** 1ハンドを実行する */
  async playHand(): Promise<HandResultEvent> {
    this.currentHandId = uuidv4();
    this.communityCards = [];
    this.deck.reset();
    this.potManager.reset();

    // ポジション割り当て
    this.table.setupForNewHand();

    // ブラインドをポスト
    this.postBlinds();

    // ホールカードをディール
    this.dealHoleCards();

    await this.broadcastSnapshot('preflop');

    // プリフロップ
    const foldedPreflop = await this.runBettingRound('preflop', true);
    if (foldedPreflop) return this.handleAllFolded();

    // フロップ
    this.dealCommunityCards(3);
    await this.broadcastSnapshot('flop');
    const foldedFlop = await this.runBettingRound('flop', false);
    if (foldedFlop) return this.handleAllFolded();

    // ターン
    this.dealCommunityCards(1);
    await this.broadcastSnapshot('turn');
    const foldedTurn = await this.runBettingRound('turn', false);
    if (foldedTurn) return this.handleAllFolded();

    // リバー
    this.dealCommunityCards(1);
    await this.broadcastSnapshot('river');
    const foldedRiver = await this.runBettingRound('river', false);
    if (foldedRiver) return this.handleAllFolded();

    // ショーダウン
    return this.runShowdown();
  }

  // ─── Private ────────────────────────────────────────

  private postBlinds(): void {
    const sb = this.table.getSBPlayer();
    const bb = this.table.getBBPlayer();

    const [updatedSB, sbAmount] = this.betForPlayer(sb, this.table.config.smallBlind);
    this.table.updatePlayer(updatedSB);

    const [updatedBB, bbAmount] = this.betForPlayer(bb, this.table.config.bigBlind);
    this.table.updatePlayer(updatedBB);
  }

  private dealHoleCards(): void {
    this.table.getAllPlayers()
      .filter(p => p.status === 'active' || p.status === 'all-in')
      .forEach(p => {
        const cards = this.deck.dealMany(2) as [Card, Card];
        this.table.updatePlayer(dealHoleCards(p, cards));
      });
  }

  private dealCommunityCards(count: number): void {
    const cards = this.deck.dealMany(count);
    this.communityCards.push(...cards);
  }

  private betForPlayer(
    player: TablePlayer,
    amount: number,
  ): [TablePlayer, number] {
    const actual = Math.min(amount, player.stack);
    const updated: TablePlayer = {
      ...player,
      stack: player.stack - actual,
      betThisStreet: player.betThisStreet + actual,
      totalBetThisHand: player.totalBetThisHand + actual,
      status: player.stack - actual <= 0 ? 'all-in' : player.status,
    };
    return [updated, actual];
  }

  private async runBettingRound(
    street: Street,
    isPreflop: boolean,
  ): Promise<boolean> {
    // ストリート開始時に betThisStreet をリセット（プリフロップはブラインド分があるためスキップ）
    if (!isPreflop) {
      this.table.getAllPlayers().forEach(p => {
        this.table.updatePlayer(resetStreetBet(p));
      });
    }

    const activePlayers = this.table.getActivePlayers();
    if (activePlayers.length <= 1) return false; // ベッティング不要

    const bbPlayer = this.table.getBBPlayer();
    const initialBet = isPreflop ? this.table.config.bigBlind : 0;

    const round = new BettingRound(
      this.table.getAllPlayers(),
      {
        bigBlind: this.table.config.bigBlind,
        street: street as any,
        bbHasOption: isPreflop,
      },
      initialBet,
    );

    while (!round.isOver()) {
      const nextId = round.getNextActingPlayerId();
      if (!nextId) break;

      const context = round.getBettingContext(nextId);
      const action = await this.requestAction(nextId, context);
      const result = round.applyAction(action);

      if (!result.valid) {
        // 無効なアクションはフォールドとして扱う
        round.applyAction({ type: 'fold', playerId: nextId, timestamp: Date.now() });
      }
    }

    // 結果をtableに反映
    round.getPlayers().forEach(p => this.table.updatePlayer(p));

    // ポット計算
    this.potManager.calculatePots(this.table.getAllPlayers());

    // フォールドで1人になったか確認
    const inHand = this.table.getPlayersInHand();
    return inHand.length <= 1;
  }

  private async runShowdown(): Promise<HandResultEvent> {
    this.currentStreet = 'showdown';
    await this.broadcastSnapshot('showdown');

    const playersInHand = this.table.getPlayersInHand();
    const winnerInfo = handEvaluator.findWinners(
      playersInHand.map(p => ({
        id: p.id,
        holeCards: p.holeCards as [Card, Card],
      })),
      this.communityCards,
    );

    const distribution = this.potManager.distributePots(
      [winnerInfo],
      this.table.getAllPlayers(),
    );

    // スタックに還元
    distribution.forEach(({ playerId, amount }) => {
      const p = this.table.getPlayer(playerId);
      this.table.updatePlayer({ ...p, stack: p.stack + amount });
    });

    const result: HandResultEvent = {
      winners: [winnerInfo],
      potDistribution: distribution,
      playerHands: playersInHand.map(p => ({
        playerId: p.id,
        holeCards: p.holeCards as [Card, Card],
        handResult: handEvaluator.evaluate(
          p.holeCards as [Card, Card],
          this.communityCards,
        ),
      })),
    };

    await this.broadcastHandResult(result);
    this.table.advanceDealer();
    return result;
  }

  private handleAllFolded(): HandResultEvent {
    const lastPlayer = this.table.getPlayersInHand()[0];
    const distribution = this.potManager.distributePots(
      [{ playerIds: [lastPlayer.id], handResult: null as any }],
      this.table.getAllPlayers(),
    );

    distribution.forEach(({ playerId, amount }) => {
      const p = this.table.getPlayer(playerId);
      this.table.updatePlayer({ ...p, stack: p.stack + amount });
    });

    const result: HandResultEvent = {
      winners: [{ playerIds: [lastPlayer.id], handResult: null as any }],
      potDistribution: distribution,
      playerHands: [],
    };

    this.table.advanceDealer();
    return result;
  }

  // ─── スナップショット生成（Socket.IO実装から呼ばれる） ──

  buildSnapshot(forPlayerId: string): GameSnapshot {
    const players = this.table.getAllPlayers();
    return {
      handId: this.currentHandId,
      street: this.currentStreet,
      communityCards: this.communityCards,
      pots: this.potManager.getPots(),
      totalPot: this.potManager.getTotalPot(),
      currentBet: 0, // BettingRoundから取得するか外部セット
      minRaiseTotal: this.table.config.bigBlind * 2,
      activePlayerId: null,
      timeLimit: this.table.config.actionTimeoutSeconds,
      players: players.map(p => this.toPublicState(p, this.currentStreet === 'showdown')),
      myHoleCards: players.find(p => p.id === forPlayerId)?.holeCards ?? null,
      dealerSeatIndex: this.table.getDealerSeatIndex(),
    };
  }

  private toPublicState(p: TablePlayer, isShowdown: boolean): PublicPlayerState {
    return {
      id: p.id,
      name: p.name,
      stack: p.stack,
      betThisStreet: p.betThisStreet,
      status: p.status,
      seatIndex: p.seatIndex,
      positionName: p.positionName,
      isDealer: p.isDealer,
      isSB: p.isSB,
      isBB: p.isBB,
      holeCards: isShowdown ? p.holeCards ?? undefined : undefined,
    };
  }
}
```

---

## 8. テスト仕様

### 8.1 テスト用 GameEngine 実装

テストで使う具体的なGameEngine実装（抽象メソッドを実装）:

```typescript
// backend/src/game/__tests__/engine/TestGameEngine.ts

import { GameEngine } from '../../engine/GameEngine';
import { GameTable } from '../../engine/GameTable';
import { PlayerAction, BettingContext } from '../../types/game.types';

export class TestGameEngine extends GameEngine {
  private actionQueue: Map<string, PlayerAction[]> = new Map();
  public snapshots: string[] = [];

  constructor(table: GameTable) {
    super(table);
  }

  /** テスト用: プレイヤーのアクションキューを事前セット */
  queueAction(playerId: string, action: PlayerAction): void {
    if (!this.actionQueue.has(playerId)) {
      this.actionQueue.set(playerId, []);
    }
    this.actionQueue.get(playerId)!.push(action);
  }

  protected async requestAction(
    playerId: string,
    _context: BettingContext,
  ): Promise<PlayerAction> {
    const queue = this.actionQueue.get(playerId) ?? [];
    const action = queue.shift();
    if (!action) {
      // デフォルト: call or check
      return {
        type: _context.currentBet > _context.playerBetThisStreet ? 'call' : 'check',
        playerId,
        amount: _context.currentBet > _context.playerBetThisStreet
          ? _context.currentBet - _context.playerBetThisStreet
          : undefined,
        timestamp: Date.now(),
      };
    }
    return action;
  }

  protected async broadcastSnapshot(_street: string): Promise<void> {
    this.snapshots.push(_street);
  }

  protected async broadcastHandResult(_result: any): Promise<void> {}
}
```

---

### 8.2 BettingRound.test.ts (主要ケース)

```typescript
describe('BettingRound', () => {
  describe('基本的なアクション', () => {
    test('全員チェック → ラウンド終了')
    test('プレイヤーがレイズ → 他全員がコール → 終了')
    test('プレイヤーがフォールド → 残り1人で終了')
    test('無効なチェック（ベットがある）→ valid=false')
  });

  describe('BBオプション（プリフロップ）', () => {
    test('誰もレイズしない場合、BBがチェックして終了')
    test('誰もレイズしない場合、BBがレイズして継続')
    test('誰かがレイズした場合、BBのオプションは消える')
  });

  describe('オールイン', () => {
    test('オールインプレイヤーはplayersToActから除外される')
    test('オールインがレイズになる場合、他プレイヤーのアクションが再開')
    test('最小レイズに満たないオールインは他のアクションを再開させない')
  });

  describe('getNextActingPlayerId()', () => {
    test('players配列の順番でアクションが回る')
    test('ラウンド終了後はnullを返す')
  });
});
```

### 8.3 PotManager.test.ts (主要ケース)

```typescript
describe('PotManager', () => {
  describe('calculatePots()', () => {
    test('全員同額の場合、1つのメインポットのみ')
    test('オールインプレイヤーがいる場合、サイドポットが生成される')
    test('複数のオールインで複数のサイドポット')
    test('フォールドしたプレイヤーはeligibleに含まれない')
  });

  describe('distributePots()', () => {
    test('単独勝者が全額獲得')
    test('引き分けの場合に均等分配（端数は最初の勝者に加算）')
    test('サイドポットを勝てないオールインプレイヤー')
  });
});
```

### 8.4 GameEngine.test.ts (主要ケース)

```typescript
describe('GameEngine (TestGameEngine使用)', () => {
  test('完全なハンド（フォールドなし）が完走する')
  test('プリフロップでフォールド → 残り1人が全額獲得')
  test('ハンド終了後にディーラーボタンが進む')
  test('ブラインドが正しくポストされる')
  test('コミュニティカードが正しい枚数でディールされる')
  test('ショーダウン時に勝者が正しく決まる')
  test('オールインを含むハンドでサイドポットが正しく分配される')
})
```

---

## 9. 実装上の注意点

1. **GameEngineのテスト**: `GameEngine` は abstract なので、`TestGameEngine` を作成してテストすること。ファイルは `__tests__/engine/` に置く（`jest.config.js` の testMatch に含まれるように）。

2. **浮動小数点**: BBはfloatで扱う。端数処理は `Math.round(x * 100) / 100` を使う（0.01BB単位）。

3. **イミュータビリティ**: TablePlayer の更新は必ずスプレッドで新オブジェクトを作る（`{ ...player, stack: ... }`）。直接プロパティを書き換えない。

4. **BettingRound の players**: コンストラクタで渡された配列のコピーを持つ。外部の配列を直接変更しない。

5. **GameEngine と GameTable の関係**: GameEngine は GameTable を持ち、テーブルを通じてプレイヤーを操作する。BettingRound は GameTable とは独立した一時的なオブジェクト。

6. **uuid**: `uuidv4()` は既に `backend/package.json` に `uuid` がインストール済み。`import { v4 as uuidv4 } from 'uuid'` で使用可。

---

## 10. 完了条件

- [ ] 旧実装が削除されている（`src/data/`, `src/engine/`, `src/socket/`, `src/services/`, `src/types/index.ts`）
- [ ] `server.ts` が最小構成で `tsc --noEmit` エラーなし
- [ ] Phase 3A の52テストが引き続きPASS
- [ ] Phase 3B の新テストがPASS
- [ ] `npm run test:coverage` でカバレッジ 85%以上
- [ ] `PROGRESS.md` を更新した
- [ ] `HANDOFF.md` を更新した
