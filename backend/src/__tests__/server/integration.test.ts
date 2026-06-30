import http from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../server/socketHandlers';
import { GameManager } from '../../server/GameManager';

describe('Socket.IO Integration', () => {
  let server: http.Server;
  let io: Server;
  let port: number;
  let clientSocket: ClientSocket;

  beforeAll((done) => {
    GameManager.resetForTesting();
    server = http.createServer();
    io = new Server(server);
    registerSocketHandlers(io);
    server.listen(() => {
      port = (server.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(() => done());
  });

  afterEach((done) => {
    if (clientSocket?.connected) {
      // leave-game でルームのゲームループを確実に停止させてから切断する
      // (停止させないと前のテストのバックグラウンドループが残り続け、後続テストの
      //  イベントループ処理を圧迫してしまうため)
      clientSocket.emit('leave-game');
      clientSocket.disconnect();
    }
    setTimeout(done, 50);
  });

  test('join-game で joined-room イベントが返る', (done) => {
    clientSocket = ioClient(`http://localhost:${port}`, { transports: ['websocket'] });
    clientSocket.on('connect', () => {
      clientSocket.emit('join-game', null);
    });
    clientSocket.on('joined-room', (data: { gameId: string }) => {
      expect(data.gameId).toBeDefined();
      expect(typeof data.gameId).toBe('string');
      done();
    });
  }, 10000);

  test('game-state イベントを受信できる', (done) => {
    clientSocket = ioClient(`http://localhost:${port}`, { transports: ['websocket'] });
    clientSocket.on('connect', () => {
      clientSocket.emit('join-game', null);
    });
    clientSocket.on('game-state', (snapshot: { handId: string; street: string }) => {
      expect(snapshot).toBeDefined();
      expect(snapshot.street).toBe('preflop');
      done();
    });
  }, 10000);

  test('action-required → player-action → hand-result の一往復', (done) => {
    clientSocket = ioClient(`http://localhost:${port}`, { transports: ['websocket'] });
    clientSocket.on('connect', () => {
      clientSocket.emit('join-game', null);
    });

    // 2人テーブルではHU規約によりBTN/SB(=人間、先に参加するためseat0)が
    // プリフロップ最初にアクションする。フォールドして即座にhand-resultを誘発する。
    clientSocket.on('action-required', (playerId: string, _timeLimit: number) => {
      clientSocket.emit('player-action', { type: 'fold', playerId, timestamp: Date.now() });
    });

    clientSocket.on('hand-result', (result: { winners: unknown[] }) => {
      expect(result).toBeDefined();
      expect(Array.isArray(result.winners)).toBe(true);
      done();
    });
  }, 15000);
});
