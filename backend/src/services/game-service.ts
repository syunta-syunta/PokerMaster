import { v4 as uuidv4 } from 'uuid';
import {
  GameRoom, GameState, GameAction, ClientGameState, ClientPlayer,
  Card, StrategyType, AI_PROFILES,
} from '../types';
import { GameEngine, CreateGameOptions } from '../engine/game-engine';
import { getAIDecision, getAIThinkingTime } from '../engine/ai-engine';

const rooms = new Map<string, { room: GameRoom; engine: GameEngine }>();

export function createGame(options: {
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  fastFold: boolean;
  aiCount: number;
  aiStrategy: StrategyType;
  humanPlayerName: string;
  humanPlayerId: string;
}): { gameId: string; playerId: string } {
  const gameId = uuidv4();
  const humanPlayerId = options.humanPlayerId;

  const playerDefs: CreateGameOptions['players'] = [
    { id: humanPlayerId, name: options.humanPlayerName, aiType: null },
  ];

  for (let i = 0; i < options.aiCount; i++) {
    playerDefs.push({
      id: uuidv4(),
      name: `${AI_PROFILES[options.aiStrategy].name} ${i + 1}`,
      aiType: options.aiStrategy,
    });
  }

  const engineOptions: CreateGameOptions = {
    maxPlayers: options.maxPlayers,
    smallBlind: options.smallBlind,
    bigBlind: options.bigBlind,
    startingChips: options.startingChips,
    fastFold: options.fastFold,
    players: playerDefs,
  };

  const engine = new GameEngine(engineOptions);
  const room: GameRoom = {
    id: gameId,
    maxPlayers: options.maxPlayers,
    smallBlind: options.smallBlind,
    bigBlind: options.bigBlind,
    startingChips: options.startingChips,
    fastFold: options.fastFold,
    state: null,
    socketIds: new Map(),
    aiPlayerIds: playerDefs.filter(p => p.aiType !== null).map(p => p.id),
    humanPlayerIds: [humanPlayerId],
    actionTimeoutMs: 30000,
  };

  rooms.set(gameId, { room, engine });
  return { gameId, playerId: humanPlayerId };
}

export function getRoom(gameId: string): { room: GameRoom; engine: GameEngine } | null {
  return rooms.get(gameId) ?? null;
}

export function startHand(gameId: string): GameState {
  const entry = rooms.get(gameId);
  if (!entry) throw new Error('Game not found');
  const state = entry.engine.startHand();
  entry.room.state = state;
  return state;
}

export function processPlayerAction(
  gameId: string,
  playerId: string,
  action: GameAction,
  amount?: number
): GameState {
  const entry = rooms.get(gameId);
  if (!entry) throw new Error('Game not found');
  const state = entry.engine.processAction(playerId, action, amount);
  entry.room.state = state;
  return state;
}

export function getValidActions(gameId: string, playerId: string) {
  const entry = rooms.get(gameId);
  if (!entry) throw new Error('Game not found');
  return entry.engine.getValidActions(playerId);
}

export function getAIActionForGame(
  gameId: string,
  aiPlayerId: string
): { action: GameAction; amount?: number; thinkingTimeMs: number } {
  const entry = rooms.get(gameId);
  if (!entry) throw new Error('Game not found');

  const state = entry.engine.getState();
  const player = state.players.find(p => p.id === aiPlayerId);
  if (!player) throw new Error('AI player not found');

  const decision = getAIDecision(state, aiPlayerId);
  const profile = player.aiType ? AI_PROFILES[player.aiType] : AI_PROFILES['GTO'];
  const thinkingTimeMs = getAIThinkingTime(profile);

  return { ...decision, thinkingTimeMs };
}

export function isAITurn(gameId: string): { isAI: boolean; aiPlayerId: string | null } {
  const entry = rooms.get(gameId);
  if (!entry) return { isAI: false, aiPlayerId: null };

  const state = entry.engine.getState();
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.status !== 'active') {
    return { isAI: false, aiPlayerId: null };
  }

  const isAI = entry.room.aiPlayerIds.includes(activePlayer.id);
  return { isAI, aiPlayerId: isAI ? activePlayer.id : null };
}

export function isHandOver(gameId: string): boolean {
  return rooms.get(gameId)?.engine.isHandOver() ?? false;
}

/**
 * クライアント向けゲームステート（相手のホールカードを null でマスク）
 */
export function buildClientState(gameId: string, forPlayerId: string | null): ClientGameState {
  const entry = rooms.get(gameId);
  if (!entry) throw new Error('Game not found');

  const state = entry.engine.getState();
  const isShowdown = state.phase === 'showdown' || state.phase === 'ended';

  const clientPlayers: ClientPlayer[] = state.players.map(p => {
    const isMe = p.id === forPlayerId;
    const reveal = isMe || isShowdown;

    const cards: (Card | null)[] = reveal
      ? p.cards
      : p.cards.map(() => null);

    return { ...p, cards, cardCount: p.cards.length };
  });

  return { ...state, players: clientPlayers, myPlayerId: forPlayerId };
}

export function registerSocket(gameId: string, playerId: string, socketId: string): void {
  rooms.get(gameId)?.room.socketIds.set(playerId, socketId);
}

export function unregisterSocket(gameId: string, playerId: string): void {
  rooms.get(gameId)?.room.socketIds.delete(playerId);
}

export function deleteGame(gameId: string): void {
  rooms.delete(gameId);
}
