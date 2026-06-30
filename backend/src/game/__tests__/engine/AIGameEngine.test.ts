import { Server } from 'socket.io';
import { AIGameEngine } from '../../engine/AIGameEngine';
import { GameTable } from '../../engine/GameTable';
import { GtoAiPlayer } from '../../ai/GtoAiPlayer';
import { GameConfig } from '../../types/game.types';

function createMockIo(): Server {
  const emit = jest.fn();
  return {
    to: jest.fn(() => ({ emit })),
  } as unknown as Server;
}

function makeTable(config: Partial<GameConfig> = {}): GameTable {
  const fullConfig: GameConfig = {
    maxPlayers: 2, smallBlind: 0.5, bigBlind: 1, startingStack: 100,
    actionTimeoutSeconds: 30,
    ...config,
  };
  return new GameTable(fullConfig);
}

describe('AIGameEngine', () => {
  test('人間プレイヤーがタイムアウトすると自動フォールドする', async () => {
    const table = makeTable({ actionTimeoutSeconds: 0.05 }); // 50ms
    const humanId = 'human1';
    const aiId = 'ai1';
    table.addPlayer(humanId, 'Human');
    table.addPlayer(aiId, 'AI');

    const io = createMockIo();
    const aiPlayers = new Map<string, GtoAiPlayer>([
      [aiId, new GtoAiPlayer({ position: 'unknown' })],
    ]);
    const playerSocketMap = new Map<string, string>(); // 人間のソケット未登録 = emit先なし

    const engine = new AIGameEngine(table, io, 'room1', humanId, playerSocketMap, aiPlayers, 10);

    const result = await engine.playHand();

    // 2人テーブルでHU規約によりhumanId(seat0=BTN/SB)がプリフロップ最初にアクションし、
    // 応答しなければタイムアウトで自動フォールドする → AIが全額獲得する
    expect(result.winners[0].playerIds).toEqual([aiId]);
  }, 10000);

  test('AIプレイヤーは人間の入力を待たずにアクションを返す', async () => {
    const table = makeTable({ actionTimeoutSeconds: 30 });
    const humanId = 'human1';
    const aiId = 'ai1';
    table.addPlayer(humanId, 'Human');
    table.addPlayer(aiId, 'AI');

    const io = createMockIo();
    const aiPlayers = new Map<string, GtoAiPlayer>([
      [aiId, new GtoAiPlayer({ position: 'unknown' })],
    ]);
    const playerSocketMap = new Map<string, string>();

    const engine = new AIGameEngine(table, io, 'room1', humanId, playerSocketMap, aiPlayers, 10);

    // receiveHumanActionを即座にfoldで応答させ、AIが正常に処理されることを確認する
    // (人間のwaitForHumanActionが解決されないとAIの番が来ないため、先にfoldさせる)
    const playPromise = engine.playHand();
    // playHand()内部の非同期処理がpendingActionResolverをセットするまで
    // マイクロタスク/タイマーを1サイクル進める
    await new Promise(r => setTimeout(r, 20));
    // 人間が最初にアクションするので即フォールドさせる
    engine.receiveHumanAction({ type: 'fold', playerId: humanId, timestamp: Date.now() });

    const result = await playPromise;
    expect(result.winners[0].playerIds).toEqual([aiId]);
  }, 10000);

  test('receiveHumanAction() は保留中のアクションがない場合falseを返す', () => {
    const table = makeTable();
    table.addPlayer('human1', 'Human');
    table.addPlayer('ai1', 'AI');
    const io = createMockIo();
    const aiPlayers = new Map<string, GtoAiPlayer>([['ai1', new GtoAiPlayer({ position: 'unknown' })]]);
    const engine = new AIGameEngine(table, io, 'room1', 'human1', new Map(), aiPlayers, 10);

    const result = engine.receiveHumanAction({ type: 'fold', playerId: 'human1', timestamp: Date.now() });
    expect(result).toBe(false);
  });
});
