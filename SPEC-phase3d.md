# SPEC: Phase 3D — サーバー統合

**対象フェーズ**: Phase 3D
**推定期間**: 1週間
**担当**: Claude Code
**前提**: Phase 3C 完了（GtoAiPlayer.ts 動作確認済み）

---

## 設計方針

**MVP 構成: 1人の人間プレイヤー vs 最大5体の GTO AI**

```
クライアント (ブラウザ)
    │  Socket.IO
    ▼
server.ts → socketHandlers.ts
               │
               ▼
          GameManager (Singleton)
               │
               ▼
          GameRoom (1ゲームにつき1インスタンス)
               │
               ▼
          AIGameEngine (GameEngine の具体実装)
          ├── 人間プレイヤー: requestAction() → Socket.IO イベント待機
          └── AI プレイヤー:  requestAction() → GtoAiPlayer.decide()
```

**AI のアクションは GameRoom 内で完結する。**
外部サービスへの HTTP 呼び出しは不要。

---

## 1. ファイル構成

```
backend/src/
├── game/
│   └── engine/
│       └── AIGameEngine.ts       ← Phase 3D 新規 (GameEngine の具体実装)
├── server/
│   ├── GameRoom.ts               ← Phase 3D 新規
│   ├── GameManager.ts            ← Phase 3D 新規 (Singleton)
│   └── socketHandlers.ts         ← Phase 3D 新規
├── routes/
│   └── gameRoutes.ts             ← Phase 3D 新規 (最小 REST API)
├── server.ts                     ← 既存 (Socket.IO ハンドラ登録を追記)
└── __tests__/
    └── server/
        ├── GameRoom.test.ts      ← Phase 3D 新規
        └── integration.test.ts  ← Phase 3D 新規 (Socket.IO 統合テスト)
```

---

## 2. game.types.ts への追記

```typescript
// ─── Phase 3D 追加型 ────────────────────────────────────────────

/** ゲームルームの設定 */
export interface RoomConfig {
  tableSize: 2 | 3 | 4 | 5 | 6;  // 合計プレイヤー数 (人間1 + AI n-1)
  aiThinkingDelayMs: number;       // AI が考える演出ディレイ (default: 800)
  gameConfig: GameConfig;          // テーブル設定 (blinds, stack, timeout)
}

/** ゲームルームの状態 */
export type RoomStatus =
  | 'waiting'   // 人間プレイヤー待ち
  | 'playing'   // ハンド進行中
  | 'finished'; // ゲーム終了 (プレイヤーが離脱またはバスト)

/** REST API: ゲーム開始リクエスト */
export interface StartGameRequest {
  tableSize: 2 | 3 | 4 | 5 | 6;
}

/** REST API: ゲーム開始レスポンス */
export interface StartGameResponse {
  gameId: string;
}
```

---

## 3. AIGameEngine.ts

`GameEngine` の抽象メソッドを実装する具体クラス。

```typescript
// backend/src/game/engine/AIGameEngine.ts

import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  PlayerAction, BettingContext, Street,
  GameSnapshot, HandResultEvent, Card,
} from '../types/game.types';
import { GameEngine } from './GameEngine';
import { GameTable } from './GameTable';
import { GtoAiPlayer } from '../ai/GtoAiPlayer';
import { handEvaluator } from '../core/HandEvaluator';

export interface AIPlayerConfig {
  playerId: string;
  name: string;
}

export class AIGameEngine extends GameEngine {
  private io: Server;
  private roomId: string;
  /** playerId → socketId (人間プレイヤーのみ) */
  private playerSocketMap: Map<string, string>;
  /** playerId → GtoAiPlayer (AI プレイヤーのみ) */
  private aiPlayers: Map<string, GtoAiPlayer>;
  private humanPlayerId: string;
  private aiThinkingDelayMs: number;
  /** 人間プレイヤーのアクションを待つ Promise の resolve 関数 */
  private pendingActionResolver: ((action: PlayerAction) => void) | null = null;
  private actionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  /** 現在のハンドでプリフロップアグレッサーのプレイヤーID */
  private preflopAggressorId: string | null = null;

  constructor(
    table: GameTable,
    io: Server,
    roomId: string,
    humanPlayerId: string,
    playerSocketMap: Map<string, string>,
    aiPlayers: Map<string, GtoAiPlayer>,
    aiThinkingDelayMs: number = 800,
  ) {
    super(table);
    this.io = io;
    this.roomId = roomId;
    this.humanPlayerId = humanPlayerId;
    this.playerSocketMap = playerSocketMap;
    this.aiPlayers = aiPlayers;
    this.aiThinkingDelayMs = aiThinkingDelayMs;
  }

  // ─── 抽象メソッドの実装 ─────────────────────────────────────────

  /**
   * プレイヤーのアクションを取得する。
   * 人間: Socket.IO イベント待機 (タイムアウト付き)
   * AI:   GtoAiPlayer.decide() を呼び出す
   */
  protected async requestAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction> {
    if (playerId === this.humanPlayerId) {
      return this.waitForHumanAction(playerId, context);
    } else {
      return this.getAiAction(playerId, context);
    }
  }

  /** 各プレイヤーにゲームスナップショットを送信する */
  protected async broadcastSnapshot(street: Street): Promise<void> {
    this.currentStreet = street;
    const players = this.table.getAllPlayers();

    for (const player of players) {
      const snapshot = this.buildSnapshot(player.id);

      if (player.id === this.humanPlayerId) {
        // 人間プレイヤー: 自分のホールカードを含むスナップショット
        const socketId = this.playerSocketMap.get(player.id);
        if (socketId) {
          this.io.to(socketId).emit('game-state', snapshot);
        }
      } else {
        // AI プレイヤー: ホールカードなし (将来の観戦モード用にルームへ送信)
        // MVP では AI への送信は不要だが、観戦用に roomId 全体に送信しておく
      }
    }

    // ルーム全体への公開情報 (ホールカードなし) を別途送信
    const publicSnapshot = this.buildSnapshot('__public__');
    this.io.to(this.roomId).emit('game-state-public', publicSnapshot);
  }

  /** ハンド結果を送信する */
  protected async broadcastHandResult(result: HandResultEvent): Promise<void> {
    this.io.to(this.roomId).emit('hand-result', result);
    // 結果表示のため少し待つ
    await new Promise(r => setTimeout(r, 2000));
  }

  // ─── 人間プレイヤーのアクション受信 ────────────────────────────────

  /**
   * Socket.IO 経由で受け取った人間プレイヤーのアクションを処理する。
   * GameRoom から呼び出される。
   */
  receiveHumanAction(action: PlayerAction): boolean {
    if (!this.pendingActionResolver) return false;

    // タイムアウトをキャンセル
    if (this.actionTimeoutHandle) {
      clearTimeout(this.actionTimeoutHandle);
      this.actionTimeoutHandle = null;
    }

    this.pendingActionResolver({ ...action, playerId: this.humanPlayerId });
    this.pendingActionResolver = null;
    return true;
  }

  // ─── Private ────────────────────────────────────────────────────

  private waitForHumanAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction> {
    return new Promise((resolve) => {
      this.pendingActionResolver = resolve;

      // action-required イベントを送信
      const socketId = this.playerSocketMap.get(playerId);
      if (socketId) {
        this.io.to(socketId).emit(
          'action-required',
          playerId,
          this.table.config.actionTimeoutSeconds,
        );
      }

      // タイムアウト: 自動フォールド
      this.actionTimeoutHandle = setTimeout(() => {
        if (this.pendingActionResolver) {
          this.pendingActionResolver({
            type: 'fold',
            playerId: this.humanPlayerId,
            timestamp: Date.now(),
          });
          this.pendingActionResolver = null;
        }
      }, this.table.config.actionTimeoutSeconds * 1000);
    });
  }

  private async getAiAction(
    playerId: string,
    context: BettingContext,
  ): Promise<PlayerAction> {
    const aiPlayer = this.aiPlayers.get(playerId);
    if (!aiPlayer) {
      throw new Error(`AI player not found: ${playerId}`);
    }

    // AI の「考える」演出ディレイ
    const delay = this.aiThinkingDelayMs + Math.random() * 500;
    await new Promise(r => setTimeout(r, delay));

    const player = this.table.getPlayer(playerId);
    const holeCards = player.holeCards;
    const communityCards = this.communityCards;
    const pot = this.potManager.getTotalPot();
    const street = this.currentStreet as 'preflop' | 'flop' | 'turn' | 'river';

    if (street === 'preflop' || !holeCards || communityCards.length < 3) {
      return aiPlayer.decidePreflopAction({ ...context, playerId });
    }

    // ポストフロップ: IsIP と isPFA を判定
    const isPFA = this.preflopAggressorId === playerId;
    const isIP = this.isPlayerIP(playerId);

    return aiPlayer.decidePostflopAction(
      holeCards,
      communityCards,
      { ...context, playerId, pot, street, isPFA, isIP },
    );
  }

  /**
   * プレイヤーがインポジションか判定する。
   * シンプルな実装: ディーラーに近い側がIP
   */
  private isPlayerIP(playerId: string): boolean {
    const inHand = this.table.getPlayersInHand();
    if (inHand.length !== 2) return false; // HU以外は簡略化
    const dealer = inHand.find(p => p.isDealer);
    return dealer?.id === playerId;
  }

  /**
   * プリフロップでの最後のアグレッシブアクションを記録する。
   * BettingRound は GameEngine 内部なので、playHand() の preflop 後に設定。
   * ⚠️ この実装は簡略版。厳密には BettingRound からイベントを受け取る必要がある。
   *    MVP では「ポジションを持つ側 (BTN/IP) が PFA」と近似する。
   */
  setPreflopAggressor(playerId: string | null): void {
    this.preflopAggressorId = playerId;
  }
}
```

---

## 4. GameRoom.ts

1つのゲームセッションを管理する。

```typescript
// backend/src/server/GameRoom.ts

import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  RoomConfig, RoomStatus, PlayerAction,
} from '../game/types/game.types';
import { GameTable } from '../game/engine/GameTable';
import { AIGameEngine } from '../game/engine/AIGameEngine';
import { GtoAiPlayer } from '../game/ai/GtoAiPlayer';

const DEFAULT_ROOM_CONFIG: RoomConfig = {
  tableSize: 2,
  aiThinkingDelayMs: 800,
  gameConfig: {
    maxPlayers: 2,
    smallBlind: 0.5,
    bigBlind: 1,
    startingStack: 100,
    actionTimeoutSeconds: 30,
  },
};

export class GameRoom {
  readonly roomId: string;
  private config: RoomConfig;
  private io: Server;

  private table: GameTable | null = null;
  private engine: AIGameEngine | null = null;

  private humanPlayerId: string | null = null;
  private humanSocketId: string | null = null;
  private playerSocketMap: Map<string, string> = new Map(); // playerId → socketId

  status: RoomStatus = 'waiting';

  constructor(io: Server, config: Partial<RoomConfig> = {}) {
    this.roomId = uuidv4();
    this.io = io;
    this.config = { ...DEFAULT_ROOM_CONFIG, ...config };
    if (config.tableSize) {
      this.config.gameConfig.maxPlayers = config.tableSize;
    }
  }

  // ─── プレイヤー管理 ──────────────────────────────────────────────

  /**
   * 人間プレイヤーをルームに追加し、ゲームをセットアップする。
   * MVP では 1人の人間プレイヤーが加入した時点でゲームが開始できる。
   */
  addHumanPlayer(socket: Socket, playerName: string): void {
    if (this.humanPlayerId) {
      socket.emit('game-error', 'This room already has a human player.');
      return;
    }

    this.humanPlayerId = uuidv4();
    this.humanSocketId = socket.id;
    this.playerSocketMap.set(this.humanPlayerId, socket.id);

    socket.join(this.roomId);
    this.setupGame(playerName);
  }

  /** ゲームを非同期で開始する (await しない) */
  startGameLoop(): void {
    if (this.status !== 'waiting' || !this.engine) return;
    this.status = 'playing';
    this.runGameLoop().catch(err => {
      console.error(`[GameRoom ${this.roomId}] Game loop error:`, err);
      this.status = 'finished';
    });
  }

  /** 人間プレイヤーのアクションを受け取る */
  handlePlayerAction(socketId: string, action: PlayerAction): void {
    if (socketId !== this.humanSocketId) return;
    this.engine?.receiveHumanAction(action);
  }

  /** プレイヤーの切断処理 */
  handleDisconnect(socketId: string): void {
    if (socketId !== this.humanSocketId) return;
    // 切断時はタイムアウトに任せる (AIGameEngine のタイムアウトが自動フォールド)
    // status は playing のまま維持し、再接続を待つ (MVP では単純に終了)
    this.status = 'finished';
    console.log(`[GameRoom ${this.roomId}] Human player disconnected.`);
  }

  isReady(): boolean {
    return this.status === 'waiting' && this.humanPlayerId !== null;
  }

  // ─── Private ──────────────────────────────────────────────────────

  private setupGame(humanPlayerName: string): void {
    const gameConfig = this.config.gameConfig;
    this.table = new GameTable(gameConfig);

    // 人間プレイヤーを追加
    this.table.addPlayer(this.humanPlayerId!, humanPlayerName);

    // AI プレイヤーを追加 (tableSize - 1 体)
    const aiPlayers = new Map<string, GtoAiPlayer>();
    const aiCount = this.config.tableSize - 1;

    for (let i = 0; i < aiCount; i++) {
      const aiId = uuidv4();
      const aiName = `AI ${i + 1}`;
      this.table.addPlayer(aiId, aiName);
      aiPlayers.set(aiId, new GtoAiPlayer({ position: 'unknown', isPFA: false }));
    }

    this.engine = new AIGameEngine(
      this.table,
      this.io,
      this.roomId,
      this.humanPlayerId!,
      this.playerSocketMap,
      aiPlayers,
      this.config.aiThinkingDelayMs,
    );
  }

  private async runGameLoop(): Promise<void> {
    if (!this.engine) return;

    while (this.status === 'playing') {
      // スタックがある限りハンドを続ける
      const activePlayers = this.table!.getAllPlayers().filter(p => p.stack > 0);
      if (activePlayers.length < 2) {
        this.status = 'finished';
        this.io.to(this.roomId).emit('game-error', 'Game over: not enough players with chips.');
        break;
      }

      await this.engine.playHand();

      // 次のハンドまで少し待つ
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
```

---

## 5. GameManager.ts

複数のゲームルームを管理するシングルトン。

```typescript
// backend/src/server/GameManager.ts

import { Server } from 'socket.io';
import { GameRoom } from './GameRoom';
import { RoomConfig } from '../game/types/game.types';

export class GameManager {
  private static instance: GameManager;
  private rooms: Map<string, GameRoom> = new Map();
  private socketRoomMap: Map<string, string> = new Map(); // socketId → roomId

  private constructor() {}

  static getInstance(): GameManager {
    if (!GameManager.instance) {
      GameManager.instance = new GameManager();
    }
    return GameManager.instance;
  }

  createRoom(io: Server, config?: Partial<RoomConfig>): GameRoom {
    const room = new GameRoom(io, config);
    this.rooms.set(room.roomId, room);
    return room;
  }

  getRoom(roomId: string): GameRoom | null {
    return this.rooms.get(roomId) ?? null;
  }

  getRoomBySocketId(socketId: string): GameRoom | null {
    const roomId = this.socketRoomMap.get(socketId);
    return roomId ? this.getRoom(roomId) : null;
  }

  registerSocket(socketId: string, roomId: string): void {
    this.socketRoomMap.set(socketId, roomId);
  }

  unregisterSocket(socketId: string): void {
    this.socketRoomMap.delete(socketId);
  }

  destroyRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }

  /** 終了したルームを定期的にクリーンアップ (オプション) */
  cleanupFinishedRooms(): void {
    for (const [id, room] of this.rooms) {
      if (room.status === 'finished') {
        this.rooms.delete(id);
      }
    }
  }
}
```

---

## 6. socketHandlers.ts

Socket.IO イベントハンドラをまとめる。

```typescript
// backend/src/server/socketHandlers.ts

import { Server, Socket } from 'socket.io';
import { GameManager } from './GameManager';
import { PlayerAction, StartGameRequest } from '../game/types/game.types';

export function registerSocketHandlers(io: Server): void {
  const gameManager = GameManager.getInstance();

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    /**
     * join-game: ゲームルームに参加する。
     * gameId が指定された場合は既存ルームに参加、なければ新規作成。
     */
    socket.on('join-game', (gameId: string | null) => {
      try {
        let room = gameId ? gameManager.getRoom(gameId) : null;

        if (!room || room.status !== 'waiting') {
          room = gameManager.createRoom(io);
        }

        const playerName = (socket.handshake.auth as any)?.username ?? `Player_${socket.id.slice(0, 6)}`;
        room.addHumanPlayer(socket, playerName);
        gameManager.registerSocket(socket.id, room.roomId);

        // ゲーム開始
        if (room.isReady()) {
          room.startGameLoop();
        }

        socket.emit('joined-room', { gameId: room.roomId });
      } catch (err) {
        socket.emit('game-error', `Failed to join game: ${(err as Error).message}`);
      }
    });

    /**
     * player-action: 人間プレイヤーのアクションを受け取る。
     */
    socket.on('player-action', (action: PlayerAction) => {
      const room = gameManager.getRoomBySocketId(socket.id);
      if (!room) {
        socket.emit('game-error', 'Not in a game room.');
        return;
      }
      room.handlePlayerAction(socket.id, action);
    });

    /**
     * leave-game: ゲームから退出する。
     */
    socket.on('leave-game', () => {
      const room = gameManager.getRoomBySocketId(socket.id);
      if (room) {
        room.handleDisconnect(socket.id);
        gameManager.unregisterSocket(socket.id);
      }
    });

    /**
     * disconnect: 切断処理。
     */
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      const room = gameManager.getRoomBySocketId(socket.id);
      if (room) {
        room.handleDisconnect(socket.id);
        gameManager.unregisterSocket(socket.id);
      }
    });
  });
}
```

---

## 7. gameRoutes.ts

ゲーム開始のための最小 REST API。

```typescript
// backend/src/routes/gameRoutes.ts

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { GameManager } from '../server/GameManager';
import { StartGameRequest, StartGameResponse } from '../game/types/game.types';

const router = Router();

/**
 * POST /api/game/start
 * ゲームセッションを事前作成し gameId を返す。
 * クライアントはこの gameId で Socket.IO の join-game を呼ぶ。
 *
 * body: { tableSize: 2-6 }
 * response: { gameId: string }
 */
router.post('/start', authenticateToken, (req: Request, res: Response) => {
  const { tableSize = 2 } = req.body as StartGameRequest;

  if (tableSize < 2 || tableSize > 6) {
    return res.status(400).json({ error: 'tableSize must be between 2 and 6' });
  }

  // ルームを事前作成 (io インスタンスは後で接続時に使う)
  // MVP では io なしでルームを作れないため、クライアントが join-game で直接作成する方式も可
  // ここでは gameId の予約のみ行う
  const gameId = require('uuid').v4();

  const response: StartGameResponse = { gameId };
  res.json(response);
});

/**
 * GET /api/game/:gameId/status
 * ゲームルームの状態を確認する (再接続用)
 */
router.get('/:gameId/status', authenticateToken, (req: Request, res: Response) => {
  const { gameId } = req.params;
  const gameManager = GameManager.getInstance();
  const room = gameManager.getRoom(gameId);

  if (!room) {
    return res.status(404).json({ error: 'Game not found' });
  }

  res.json({ gameId, status: room.status });
});

export default router;
```

---

## 8. server.ts 更新

既存の server.ts に以下を追記する。

```typescript
// 追記する内容 (既存コードに影響しない)

import { registerSocketHandlers } from './server/socketHandlers';
import gameRoutes from './routes/gameRoutes';

// Express ルートに追加 (既存の認証ルートの後)
app.use('/api/game', gameRoutes);

// Socket.IO ハンドラを登録 (io 初期化の後)
registerSocketHandlers(io);
```

---

## 9. テスト仕様

### 9.1 GameRoom.test.ts

```typescript
describe('GameRoom', () => {
  test('人間プレイヤーが参加すると isReady() が true になる')
  test('startGameLoop() 後に status が playing になる')
  test('handleDisconnect() 後に status が finished になる')
  test('handlePlayerAction() が engine に転送される')
  test('2回目の addHumanPlayer() はエラーになる')
})
```

### 9.2 integration.test.ts

Socket.IO の統合テスト。`socket.io-client` を使用。

```typescript
// npm install -D socket.io-client が必要

describe('Socket.IO Integration', () => {
  let server: http.Server;
  let io: Server;
  let clientSocket: Socket;

  beforeAll((done) => {
    // テスト用サーバーを起動
    server = http.createServer(app);
    io = new Server(server);
    registerSocketHandlers(io);
    server.listen(0, done); // ランダムポート
  });

  afterAll(() => { server.close(); });

  test('join-game で joined-room イベントが返る')
  test('game-state イベントを受信できる')
  test('action-required → player-action の往復')
  test('タイムアウト: action-required 後に応答しなければ自動フォールド')
  test('hand-result イベントを受信できる')
})
```

---

## 10. 実装上の注意点

### 10.1 GtoAiPlayer のインターフェース確認

Phase 3C で実装された `GtoAiPlayer` のメソッドシグネチャを確認してから実装する。

Phase 3C の SPEC で定義されている想定シグネチャ:
```typescript
class GtoAiPlayer {
  decidePreflopAction(context: BettingContext & { playerId: string }): PlayerAction;
  decidePostflopAction(
    holeCards: [Card, Card],
    communityCards: Card[],
    context: BettingContext & {
      playerId: string;
      pot: number;
      street: 'flop' | 'turn' | 'river';
      isPFA: boolean;
      isIP: boolean;
    }
  ): PlayerAction;
}
```

実際のシグネチャが異なる場合は `AIGameEngine.getAiAction()` 側を合わせる。

### 10.2 isPFA (プリフロップアグレッサー) の判定

厳密な判定は複雑なため、MVP では以下の近似を使う:
- 2人 (HU): ディーラー/BTN 側を PFA とする
- 3人以上: プリフロップでレイズした最後のプレイヤーを PFA とする

本来は `BettingRound` からイベントを受け取るべきだが、MVP 段階では上記の近似で十分。

### 10.3 ゲームループの無限ループ防止

`runGameLoop()` は以下の条件で終了する:
- `status === 'finished'` (切断・エラー)
- アクティブプレイヤーが 2 人未満 (バスト)

### 10.4 Socket.IO の `io` インスタンスの受け渡し

`GameRoom` と `AIGameEngine` は `io` インスタンスを受け取る。
`GameManager.createRoom(io, config)` で渡す。

### 10.5 テスト環境での Socket.IO

統合テストで `socket.io-client` を使う場合:
```bash
npm install -D socket.io-client
```

`jest.config.js` の `testEnvironment` を `'node'` に維持する (デフォルト通り)。

---

## 11. 完了条件

- [ ] `npx tsc --noEmit` エラーなし
- [ ] `npm test` 全テスト PASS
- [ ] Socket.IO 統合テストで join → action-required → player-action → hand-result の一往復が確認できる
- [ ] タイムアウト時に自動フォールドが動作する
- [ ] `PROGRESS.md` を更新した
- [ ] `HANDOFF.md` を更新した (次フェーズ Phase 3E の着手内容を記載)
