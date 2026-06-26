export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export type PlayerStatus = 'waiting' | 'active' | 'folded' | 'all-in' | 'disconnected';
export type GamePhase = 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
export type GameAction = 'check' | 'call' | 'raise' | 'fold' | 'all-in';

// ポジション (6max)
export type Position = 'BTN' | 'SB' | 'BB' | 'UTG' | 'HJ' | 'CO';

// ============================================
// AI タイプ & カスタムAIプロファイル
// ============================================

export type StrategyType =
  | 'GTO'            // GTOテーブルベース（本実装）
  | 'TAG'            // Tight Aggressive
  | 'LAG'            // Loose Aggressive
  | 'NIT'            // 超タイト
  | 'callingStation' // コーリングステーション
  | 'maniac'         // マニアック
  | 'ABC';           // ABCポーカー

export type AIType = StrategyType | null; // null = human

export interface CustomAIProfile {
  name: string;
  description: string;
  strategy: StrategyType;
  // プリフロップ傾向
  vpip: number;              // 0-100 参加率
  pfr: number;               // 0-100 プリフロップレイズ率
  threeBetFrequency: number; // 0-30  3Bet頻度(%)
  // ポストフロップ傾向
  aggressionFactor: number;  // 0-5   アグレッション係数
  cbetFlop: number;          // 0-100 フロップCBet頻度
  cbetTurn: number;          // 0-100 ターンCBet頻度
  foldToCbet: number;        // 0-100 CBetへのフォールド率
  bluffFrequency: number;    // 0-100 ブラフ頻度
}

export const AI_PROFILES: Record<StrategyType, CustomAIProfile> = {
  GTO: {
    name: 'GTO',
    description: 'GTOテーブルに基づくバランスの取れたプレイ。',
    strategy: 'GTO',
    vpip: 25, pfr: 20, threeBetFrequency: 9,
    aggressionFactor: 2.8, cbetFlop: 60, cbetTurn: 50, foldToCbet: 42, bluffFrequency: 35,
  },
  TAG: {
    name: 'TAG',
    description: 'タイトだが攻撃的。堅いレンジで参加し、アグレッシブにベット。',
    strategy: 'TAG',
    vpip: 22, pfr: 18, threeBetFrequency: 8,
    aggressionFactor: 3.0, cbetFlop: 65, cbetTurn: 55, foldToCbet: 45, bluffFrequency: 30,
  },
  LAG: {
    name: 'LAG',
    description: '多くのハンドに参加し、積極的にポットを膨らませる。',
    strategy: 'LAG',
    vpip: 32, pfr: 26, threeBetFrequency: 12,
    aggressionFactor: 3.5, cbetFlop: 72, cbetTurn: 60, foldToCbet: 35, bluffFrequency: 45,
  },
  NIT: {
    name: 'NIT',
    description: '非常にタイト。プレミアムハンドのみ参加。',
    strategy: 'NIT',
    vpip: 12, pfr: 10, threeBetFrequency: 5,
    aggressionFactor: 2.0, cbetFlop: 55, cbetTurn: 45, foldToCbet: 55, bluffFrequency: 10,
  },
  callingStation: {
    name: 'コーリングステーション',
    description: '多くのハンドでコール。フォールドしない。',
    strategy: 'callingStation',
    vpip: 45, pfr: 8, threeBetFrequency: 3,
    aggressionFactor: 0.8, cbetFlop: 30, cbetTurn: 25, foldToCbet: 15, bluffFrequency: 10,
  },
  maniac: {
    name: 'マニアック',
    description: 'ほぼ全ハンドで参加し、常にベット・レイズ。',
    strategy: 'maniac',
    vpip: 55, pfr: 40, threeBetFrequency: 18,
    aggressionFactor: 4.5, cbetFlop: 85, cbetTurn: 70, foldToCbet: 20, bluffFrequency: 60,
  },
  ABC: {
    name: 'ABCポーカー',
    description: '基本に忠実。強いハンドでベット、弱いハンドでフォールド。',
    strategy: 'ABC',
    vpip: 20, pfr: 15, threeBetFrequency: 6,
    aggressionFactor: 2.5, cbetFlop: 60, cbetTurn: 50, foldToCbet: 50, bluffFrequency: 15,
  },
};

// ============================================
// ゲーム型
// ============================================

export interface Player {
  id: string;
  name: string;
  chips: number;
  cards: Card[];
  status: PlayerStatus;
  currentBet: number;      // 現在ベッティングラウンドのベット額
  totalBetInHand: number;  // このハンド全体の合計ベット額
  isDealer: boolean;
  isSB: boolean;
  isBB: boolean;
  position: number;         // シートインデックス (0-7)
  positionName: Position | null;
  hasActed: boolean;        // 現在ベッティングラウンドでアクション済みか
  aiType: AIType;           // null = human
  isHuman: boolean;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface GameState {
  id: string;
  players: Player[];
  communityCards: Card[];
  pots: Pot[];
  pot: number;             // 全ポット合計（表示用）
  currentBet: number;
  phase: GamePhase;
  activePlayerIndex: number;
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  smallBlind: number;
  bigBlind: number;
  lastRaiseAmount: number;
  handNumber: number;
  fastFold: boolean;
  actionHistory: PlayerAction[];
  winners?: WinnerInfo[];
}

export interface PlayerAction {
  playerId: string;
  action: GameAction;
  amount?: number;
  timestamp: Date;
}

export interface WinnerInfo {
  playerId: string;
  potAmount: number;
  handName?: string;
  handCards?: Card[];
}

// ============================================
// ゲームルーム
// ============================================

export interface GameRoom {
  id: string;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  fastFold: boolean;
  state: GameState | null;
  socketIds: Map<string, string>; // playerId → socketId
  aiPlayerIds: string[];
  humanPlayerIds: string[];
  actionTimeoutMs: number;
}

// ============================================
// Socket イベントペイロード
// ============================================

export interface JoinGamePayload {
  gameId: string;
  playerName: string;
  userId?: string;
}

export interface PlayerActionPayload {
  gameId: string;
  playerId: string;
  action: GameAction;
  amount?: number;
}

export interface CreateGameOptions {
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  fastFold: boolean;
  aiCount: number;
  aiStrategy?: StrategyType;
}

export interface ActionRequiredData {
  playerId: string;
  timeLimit: number;
  validActions: ValidAction[];
}

export interface ValidAction {
  action: GameAction;
  minAmount?: number;
  maxAmount?: number;
}

export interface HandResultData {
  winners: WinnerInfo[];
  players: Array<{ id: string; name: string; cards: Card[]; handName?: string }>;
  communityCards: Card[];
}

// クライアント向けゲーム状態（相手ホールカードを秘匿）
export interface ClientGameState extends Omit<GameState, 'players'> {
  players: ClientPlayer[];
  myPlayerId: string | null;
}

export interface ClientPlayer extends Omit<Player, 'cards'> {
  cards: (Card | null)[];
  cardCount: number;
}

// ============================================
// ユーザー
// ============================================

export interface User {
  id: string;
  username: string;
  email: string;
  chips: number;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: Date;
  updatedAt: Date;
}
