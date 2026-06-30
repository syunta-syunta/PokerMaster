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

  /** テスト用: シングルトンインスタンスをリセットする */
  static resetForTesting(): void {
    GameManager.instance = new GameManager();
  }
}
