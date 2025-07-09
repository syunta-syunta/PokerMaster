// カードの種類
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

// カード
export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

// プレイヤーの状態
export type PlayerStatus = 'waiting' | 'playing' | 'folded' | 'all-in' | 'disconnected';

// ゲームの段階
export type GamePhase = 'waiting' | 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';

// プレイヤー情報
export interface Player {
  id: string;
  name: string;
  chips: number;
  cards: Card[];
  status: PlayerStatus;
  currentBet: number;
  isDealer: boolean;
  position: number;
}

// ゲームの状態
export interface GameState {
  id: string;
  players: Player[];
  communityCards: Card[];
  pot: number;
  currentBet: number;
  phase: GamePhase;
  activePlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  deck: Card[];
}

// ユーザー情報
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

// アクション
export type GameAction = 'check' | 'call' | 'raise' | 'fold' | 'all-in';

export interface PlayerAction {
  playerId: string;
  action: GameAction;
  amount?: number;
  timestamp: Date;
}

// Socket.IOのイベント
export interface SocketEvents {
  // クライアント → サーバー
  'join-game': (gameId: string) => void;
  'player-action': (action: PlayerAction) => void;
  'leave-game': () => void;
  
  // サーバー → クライアント
  'game-state': (state: GameState) => void;
  'game-error': (error: string) => void;
  'player-joined': (player: Player) => void;
  'player-left': (playerId: string) => void;
  'action-required': (playerId: string, timeLimit: number) => void;
}