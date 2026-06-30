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
    this.config = {
      ...DEFAULT_ROOM_CONFIG,
      ...config,
      gameConfig: { ...DEFAULT_ROOM_CONFIG.gameConfig, ...config.gameConfig },
    };
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
      // position は毎ハンド AIGameEngine.broadcastSnapshot('preflop') 内で
      // setPosition() により更新される (ディーラーボタン移動対応)。
      aiPlayers.set(aiId, new GtoAiPlayer({ position: 'unknown' }));
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
