import { Server, Socket } from 'socket.io';
import { GameRoom } from '../../server/GameRoom';
import { PlayerAction } from '../../game/types/game.types';

function createMockSocket(id: string): Socket {
  return {
    id,
    emit: jest.fn(),
    join: jest.fn(),
  } as unknown as Socket;
}

function createMockServer(): Server {
  const emit = jest.fn();
  return {
    to: jest.fn(() => ({ emit })),
  } as unknown as Server;
}

describe('GameRoom', () => {
  test('人間プレイヤーが参加すると isReady() が true になる', () => {
    const io = createMockServer();
    const room = new GameRoom(io, { tableSize: 2 });
    expect(room.isReady()).toBe(false);

    const socket = createMockSocket('socket1');
    room.addHumanPlayer(socket, 'Alice');

    expect(room.isReady()).toBe(true);
  });

  test('startGameLoop() 後に status が playing になる', () => {
    const io = createMockServer();
    const room = new GameRoom(io, { tableSize: 2 });
    const socket = createMockSocket('socket1');
    room.addHumanPlayer(socket, 'Alice');

    // 実際のハンド進行（AIの思考ディレイ・人間アクション待機タイムアウト等）が
    // バックグラウンドで動き続けテスト終了後に残留しないよう、playHand()をスタブ化する。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = (room as any).engine;
    jest.spyOn(engine, 'playHand').mockResolvedValue({
      winners: [], potDistribution: [], playerHands: [],
    });

    room.startGameLoop();

    // startGameLoop() は status を同期的に 'playing' へ変更してから
    // 非同期のゲームループを開始する (await しない設計)
    expect(room.status).toBe('playing');

    // バックグラウンドループを停止させる
    room.handleDisconnect('socket1');
  });

  test('handleDisconnect() 後に status が finished になる', () => {
    const io = createMockServer();
    const room = new GameRoom(io, { tableSize: 2 });
    const socket = createMockSocket('socket1');
    room.addHumanPlayer(socket, 'Alice');

    room.handleDisconnect('socket1');

    expect(room.status).toBe('finished');
  });

  test('handleDisconnect() は人間以外のsocketIdでは無視される', () => {
    const io = createMockServer();
    const room = new GameRoom(io, { tableSize: 2 });
    const socket = createMockSocket('socket1');
    room.addHumanPlayer(socket, 'Alice');

    room.handleDisconnect('unknown-socket');

    expect(room.status).toBe('waiting');
  });

  test('handlePlayerAction() が engine に転送される', () => {
    const io = createMockServer();
    const room = new GameRoom(io, { tableSize: 2 });
    const socket = createMockSocket('socket1');
    room.addHumanPlayer(socket, 'Alice');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = (room as any).engine;
    expect(engine).toBeTruthy();
    const spy = jest.spyOn(engine, 'receiveHumanAction').mockReturnValue(true);

    const action: PlayerAction = { type: 'fold', playerId: 'irrelevant', timestamp: Date.now() };
    room.handlePlayerAction('socket1', action);

    expect(spy).toHaveBeenCalledWith(action);
  });

  test('handlePlayerAction() は人間以外のsocketIdでは転送されない', () => {
    const io = createMockServer();
    const room = new GameRoom(io, { tableSize: 2 });
    const socket = createMockSocket('socket1');
    room.addHumanPlayer(socket, 'Alice');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = (room as any).engine;
    const spy = jest.spyOn(engine, 'receiveHumanAction').mockReturnValue(true);

    const action: PlayerAction = { type: 'fold', playerId: 'irrelevant', timestamp: Date.now() };
    room.handlePlayerAction('unknown-socket', action);

    expect(spy).not.toHaveBeenCalled();
  });

  test('2回目の addHumanPlayer() はエラーになる', () => {
    const io = createMockServer();
    const room = new GameRoom(io, { tableSize: 2 });
    const socket1 = createMockSocket('socket1');
    room.addHumanPlayer(socket1, 'Alice');

    const socket2 = createMockSocket('socket2');
    room.addHumanPlayer(socket2, 'Bob');

    expect(socket2.emit).toHaveBeenCalledWith('game-error', expect.any(String));
  });

  test('roomId は一意のUUIDが割り当てられる', () => {
    const io = createMockServer();
    const room1 = new GameRoom(io);
    const room2 = new GameRoom(io);
    expect(room1.roomId).not.toBe(room2.roomId);
  });
});
