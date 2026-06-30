// backend/src/routes/gameRoutes.ts

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth-middleware';
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
 *
 * 注: ここでは gameId の予約のみ行う (io インスタンスが必要なルームの実体は
 *     クライアントが Socket.IO で join-game した時点で socketHandlers.ts 側が作成する)。
 */
router.post('/start', authenticateToken, (req: Request, res: Response): void => {
  const { tableSize = 2 } = req.body as StartGameRequest;

  if (tableSize < 2 || tableSize > 6) {
    res.status(400).json({ error: 'tableSize must be between 2 and 6' });
    return;
  }

  const gameId = uuidv4();

  const response: StartGameResponse = { gameId };
  res.json(response);
});

/**
 * GET /api/game/:gameId/status
 * ゲームルームの状態を確認する (再接続用)
 */
router.get('/:gameId/status', authenticateToken, (req: Request, res: Response): void => {
  const { gameId } = req.params;
  const gameManager = GameManager.getInstance();
  const room = gameManager.getRoom(gameId);

  if (!room) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  res.json({ gameId, status: room.status });
});

export default router;
