import { Server, Socket } from 'socket.io';
import { StrategyType, GameAction } from '../types';
import {
  createGame, startHand, processPlayerAction, getValidActions,
  getAIActionForGame, isAITurn, isHandOver,
  buildClientState, registerSocket, unregisterSocket, getRoom,
} from '../services/game-service';

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    let currentGameId: string | null = null;
    let currentPlayerId: string | null = null;

    // ────────────────────────────────────────
    // ゲーム作成
    // ────────────────────────────────────────
    socket.on('create-game', (options: {
      maxPlayers: number;
      smallBlind: number;
      bigBlind: number;
      startingChips: number;
      fastFold: boolean;
      aiCount: number;
      aiStrategy?: StrategyType;
      playerName: string;
      userId?: string;
    }) => {
      try {
        const { gameId, playerId } = createGame({
          maxPlayers: options.maxPlayers,
          smallBlind: options.smallBlind,
          bigBlind: options.bigBlind,
          startingChips: options.startingChips,
          fastFold: options.fastFold,
          aiCount: options.aiCount,
          aiStrategy: options.aiStrategy ?? 'GTO',
          humanPlayerName: options.playerName,
          humanPlayerId: options.userId ?? socket.id,
        });

        currentGameId = gameId;
        currentPlayerId = playerId;
        registerSocket(gameId, playerId, socket.id);
        socket.join(gameId);

        socket.emit('game-created', { gameId, playerId });
        console.log(`🎮 Game created: ${gameId} (player: ${playerId})`);

        // 最初のハンドを自動開始
        const state = startHand(gameId);
        emitGameState(io, gameId, state);
        scheduleAITurnIfNeeded(io, gameId);
      } catch (err: any) {
        console.error('create-game error:', err.message);
        socket.emit('game-error', err.message ?? 'Failed to create game');
      }
    });

    // ────────────────────────────────────────
    // プレイヤーアクション
    // ────────────────────────────────────────
    socket.on('player-action', (payload: {
      gameId: string;
      playerId: string;
      action: GameAction;
      amount?: number;
    }) => {
      try {
        const { gameId, playerId, action, amount } = payload;

        if (gameId !== currentGameId || playerId !== currentPlayerId) {
          socket.emit('game-error', '不正なアクションです');
          return;
        }

        const state = processPlayerAction(gameId, playerId, action, amount);
        emitGameState(io, gameId, state);

        if (isHandOver(gameId)) {
          handleHandEnd(io, gameId);
        } else {
          scheduleAITurnIfNeeded(io, gameId);
        }
      } catch (err: any) {
        console.error('player-action error:', err.message);
        socket.emit('game-error', err.message ?? 'Invalid action');
      }
    });

    // ────────────────────────────────────────
    // 有効アクション取得
    // ────────────────────────────────────────
    socket.on('get-valid-actions', (payload: { gameId: string; playerId: string }) => {
      try {
        const actions = getValidActions(payload.gameId, payload.playerId);
        socket.emit('valid-actions', actions);
      } catch (err: any) {
        socket.emit('game-error', err.message);
      }
    });

    // ────────────────────────────────────────
    // 切断
    // ────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      if (currentGameId && currentPlayerId) {
        unregisterSocket(currentGameId, currentPlayerId);
      }
    });
  });
}

// ────────────────────────────────────────
// ゲームステート送信（プレイヤーごとに個別ステート）
// ────────────────────────────────────────
function emitGameState(io: Server, gameId: string, _state: any): void {
  const entry = getRoom(gameId);
  if (!entry) return;

  for (const humanId of entry.room.humanPlayerIds) {
    const socketId = entry.room.socketIds.get(humanId);
    if (!socketId) continue;
    try {
      const clientState = buildClientState(gameId, humanId);
      io.to(socketId).emit('game-state', clientState);
    } catch (err: any) {
      console.error('emitGameState error:', err.message);
    }
  }
}

// ────────────────────────────────────────
// AIターン処理
// ────────────────────────────────────────
function scheduleAITurnIfNeeded(io: Server, gameId: string): void {
  const { isAI, aiPlayerId } = isAITurn(gameId);
  if (!isAI || !aiPlayerId) return;

  let decision: { action: GameAction; amount?: number; thinkingTimeMs: number };
  try {
    decision = getAIActionForGame(gameId, aiPlayerId);
  } catch (err: any) {
    console.error('getAIAction error:', err.message);
    return;
  }

  setTimeout(() => {
    try {
      const state = processPlayerAction(gameId, aiPlayerId, decision.action, decision.amount);
      emitGameState(io, gameId, state);

      if (isHandOver(gameId)) {
        handleHandEnd(io, gameId);
      } else {
        scheduleAITurnIfNeeded(io, gameId);
      }
    } catch (err: any) {
      console.error(`AI action failed for ${aiPlayerId}:`, err.message);
      // フォールバック: フォールド
      try {
        const state = processPlayerAction(gameId, aiPlayerId, 'fold');
        emitGameState(io, gameId, state);
        if (isHandOver(gameId)) handleHandEnd(io, gameId);
        else scheduleAITurnIfNeeded(io, gameId);
      } catch (_) {}
    }
  }, decision.thinkingTimeMs);
}

// ────────────────────────────────────────
// ハンド終了処理
// ────────────────────────────────────────
function handleHandEnd(io: Server, gameId: string): void {
  const entry = getRoom(gameId);
  if (!entry) return;

  const state = entry.engine.getState();

  // 全カード公開の最終ステートを送信
  for (const humanId of entry.room.humanPlayerIds) {
    const socketId = entry.room.socketIds.get(humanId);
    if (!socketId) continue;

    const clientState = buildClientState(gameId, humanId);
    io.to(socketId).emit('game-state', clientState);
    io.to(socketId).emit('hand-result', {
      winners: state.winners ?? [],
      players: state.players
        .filter(p => p.cards.length > 0)
        .map(p => ({ id: p.id, name: p.name, cards: p.cards })),
      communityCards: state.communityCards,
    });
  }

  // 次のハンドへ（fastFold = 1.5s, 通常 = 4s）
  const delay = entry.room.fastFold ? 1500 : 4000;
  setTimeout(() => {
    try {
      const activePlayers = state.players.filter(p => p.chips > 0);
      if (activePlayers.length < 2) {
        io.to(gameId).emit('game-over', {
          winnerId: activePlayers[0]?.id ?? null,
          winnerName: activePlayers[0]?.name ?? null,
        });
        return;
      }
      const newState = startHand(gameId);
      emitGameState(io, gameId, newState);
      scheduleAITurnIfNeeded(io, gameId);
    } catch (err: any) {
      console.error('Next hand error:', err.message);
    }
  }, delay);
}
