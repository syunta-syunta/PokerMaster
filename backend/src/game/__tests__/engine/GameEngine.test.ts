import { GameTable } from '../../engine/GameTable';
import { TestGameEngine } from './TestGameEngine';
import { GameConfig } from '../../types/game.types';

function makeTable(playerCount: number, config?: Partial<GameConfig>): GameTable {
  const fullConfig: GameConfig = {
    maxPlayers: 8,
    smallBlind: 0.5,
    bigBlind: 1,
    startingStack: 100,
    actionTimeoutSeconds: 30,
    ...config,
  };
  const table = new GameTable(fullConfig);
  for (let i = 0; i < playerCount; i++) {
    table.addPlayer(`p${i}`, `Player${i}`);
  }
  return table;
}

describe('GameEngine (TestGameEngine使用)', () => {
  test('完全なハンド（フォールドなし）が完走する', async () => {
    const table = makeTable(2);
    const engine = new TestGameEngine(table);
    const result = await engine.playHand();
    expect(result.winners.length).toBeGreaterThan(0);
    expect(engine.snapshots).toContain('showdown');
  });

  test('プリフロップでフォールド → 残り1人が全額獲得', async () => {
    const table = makeTable(2);
    const engine = new TestGameEngine(table);
    // HUではp0=BTN/SBが最初にアクション
    engine.queueAction('p0', { type: 'fold', playerId: 'p0', timestamp: Date.now() });
    const result = await engine.playHand();
    expect(result.winners[0].playerIds).toEqual(['p1']);
  });

  test('ハンド終了後にディーラーボタンが進む', async () => {
    const table = makeTable(3);
    const engine = new TestGameEngine(table);
    const dealerBefore = table.getDealerSeatIndex();
    await engine.playHand();
    const dealerAfter = table.getDealerSeatIndex();
    expect(dealerAfter).toBe((dealerBefore + 1) % 3);
  });

  test('ブラインドが正しくポストされる', async () => {
    const table = makeTable(2, { smallBlind: 0.5, bigBlind: 1, startingStack: 100 });
    const engine = new TestGameEngine(table);
    engine.queueAction('p0', { type: 'fold', playerId: 'p0', timestamp: Date.now() });
    await engine.playHand();
    const p0 = table.getPlayer('p0'); // SB
    const p1 = table.getPlayer('p1'); // BB
    expect(p0.stack).toBeCloseTo(99.5);
    expect(p1.stack).toBeCloseTo(100.5);
  });

  test('コミュニティカードが正しい枚数でディールされる', async () => {
    const table = makeTable(2);
    const engine = new TestGameEngine(table);
    await engine.playHand();
    expect(engine.getCommunityCardCount()).toBe(5);
  });

  test('ショーダウン時に勝者が正しく決まる', async () => {
    const table = makeTable(2);
    const engine = new TestGameEngine(table);
    const result = await engine.playHand();
    expect(result.playerHands.length).toBe(2);
    expect(result.winners[0].handResult).toBeDefined();
  });

  test('オールインを含むハンドでサイドポットが正しく分配される', async () => {
    const table = makeTable(3, { startingStack: 100 });
    table.updatePlayer({ ...table.getPlayer('p0'), stack: 5 }); // p0(BTN)をショートスタックに
    const engine = new TestGameEngine(table);

    // プリフロップ: p0オールイン、p1・p2コール
    engine.queueAction('p0', { type: 'all-in', playerId: 'p0', amount: 5, timestamp: Date.now() });
    engine.queueAction('p1', { type: 'call', playerId: 'p1', amount: 4.5, timestamp: Date.now() });
    engine.queueAction('p2', { type: 'call', playerId: 'p2', amount: 4, timestamp: Date.now() });

    // フロップ: p1レイズ、p2コール (p0はオールインのため非アクティブ)
    engine.queueAction('p1', { type: 'raise', playerId: 'p1', amount: 10, timestamp: Date.now() });
    engine.queueAction('p2', { type: 'call', playerId: 'p2', amount: 10, timestamp: Date.now() });

    const result = await engine.playHand();

    // メインポット(5*3=15) + サイドポット((15-5)*2=20) = 合計35
    const totalDistributed = result.potDistribution.reduce((s, d) => s + d.amount, 0);
    expect(totalDistributed).toBeCloseTo(35);
  });

  describe('アクション順序', () => {
    test('3人: プリフロップはBTN→SB→BBの順でアクションが回る', async () => {
      // 3人テーブルにUTGは存在しないため、BTNがプリフロップの最初のアクション者になる
      const table = makeTable(3);
      const engine = new TestGameEngine(table);
      await engine.playHand(); // 全員デフォルト(call/check)で進行
      expect(engine.getActionOrderForStreet('preflop')).toEqual(['p0', 'p1', 'p2']); // BTN,SB,BB
    });

    test('3人: ポストフロップはSB→BB→BTNの順でアクションが回る', async () => {
      const table = makeTable(3);
      const engine = new TestGameEngine(table);
      await engine.playHand();
      expect(engine.getActionOrderForStreet('flop')).toEqual(['p1', 'p2', 'p0']); // SB,BB,BTN
    });

    test('HU: ディーラーが移動した後もBTN/SBがプリフロップ最初、BBがポストフロップ最初になる', async () => {
      // 2人テーブルでディーラーボタンを1つ進める (p1がBTN/SB、p0がBBになる)
      const table = makeTable(2);
      table.advanceDealer();
      const engine = new TestGameEngine(table);
      await engine.playHand();
      expect(engine.getActionOrderForStreet('preflop')[0]).toBe('p1'); // BTN/SBが先
      expect(engine.getActionOrderForStreet('flop')[0]).toBe('p0'); // BBが先
    });
  });

  describe('プリフロップアグレッサー追跡 (preflopAggressorId / preflopRaiseCount)', () => {
    test('誰もレイズしない場合、デフォルトでBBがアグレッサーになり回数は0', async () => {
      const table = makeTable(3); // p0=BTN, p1=SB, p2=BB
      const engine = new TestGameEngine(table);
      await engine.playHand(); // 全員デフォルト(call/check)で進行、レイズなし
      expect(engine.getPreflopAggressorId()).toBe('p2'); // BB
      expect(engine.getPreflopRaiseCount()).toBe(0);
    });

    test('1回レイズされると、そのプレイヤーがアグレッサーになり回数は1', async () => {
      const table = makeTable(3);
      const engine = new TestGameEngine(table);
      engine.queueAction('p0', { type: 'raise', playerId: 'p0', amount: 3, timestamp: Date.now() });
      await engine.playHand();
      expect(engine.getPreflopAggressorId()).toBe('p0');
      expect(engine.getPreflopRaiseCount()).toBe(1);
    });

    test('3Bet(2回目のレイズ)が発生すると、最後のレイザーがアグレッサーになり回数は2', async () => {
      const table = makeTable(3);
      const engine = new TestGameEngine(table);
      engine.queueAction('p0', { type: 'raise', playerId: 'p0', amount: 3, timestamp: Date.now() });
      engine.queueAction('p1', { type: 'raise', playerId: 'p1', amount: 9, timestamp: Date.now() });
      await engine.playHand();
      expect(engine.getPreflopAggressorId()).toBe('p1');
      expect(engine.getPreflopRaiseCount()).toBe(2);
    });

    test('ポストフロップのレイズはプリフロップアグレッサーに影響しない', async () => {
      const table = makeTable(2);
      const engine = new TestGameEngine(table);
      // プリフロップ: p0(BTN/SB)がレイズ、p1(BB)はコール
      engine.queueAction('p0', { type: 'raise', playerId: 'p0', amount: 3, timestamp: Date.now() });
      engine.queueAction('p1', { type: 'call', playerId: 'p1', amount: 2, timestamp: Date.now() });
      // フロップ: p1(HUではBBが先手)がレイズしてもpreflopAggressorIdは変化しないはず
      engine.queueAction('p1', { type: 'raise', playerId: 'p1', amount: 5, timestamp: Date.now() });
      await engine.playHand();
      expect(engine.getPreflopAggressorId()).toBe('p0');
      expect(engine.getPreflopRaiseCount()).toBe(1);
    });
  });
});
