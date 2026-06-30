// backend/src/server/socketHandlers.ts

import { Server, Socket } from 'socket.io';
import { GameManager } from './GameManager';
import { PlayerAction } from '../game/types/game.types';

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

        const playerName = (socket.handshake.auth?.username as string | undefined)
          ?? `Player_${socket.id.slice(0, 6)}`;
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
