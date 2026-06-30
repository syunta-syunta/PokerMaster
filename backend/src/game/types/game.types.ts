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
