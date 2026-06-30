import { BettingRound } from '../../engine/BettingRound';
import { createTablePlayer } from '../../engine/TablePlayer';
import { TablePlayer } from '../../types/game.types';

function makePlayers(count: number, stack = 100): TablePlayer[] {
  return Array.from({ length: count }, (_, i) =>
    createTablePlayer(`p${i}`, `Player${i}`, i, stack));
}

function act(playerId: string, type: 'fold' | 'check' | 'call' | 'raise' | 'all-in', amount?: number) {
  return { type, playerId, amount, timestamp: Date.now() };
}

describe('BettingRound', () => {
  describe('基本的なアクション', () => {
    test('全員チェック → ラウンド終了', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      expect(round.isOver()).toBe(false);
      round.applyAction(act('p0', 'check'));
      round.applyAction(act('p1', 'check'));
      expect(round.isOver()).toBe(false);
      round.applyAction(act('p2', 'check'));
      expect(round.isOver()).toBe(true);
    });

    test('プレイヤーがレイズ → 他全員がコール → 終了', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      round.applyAction(act('p0', 'raise', 5));
      round.applyAction(act('p1', 'call', 5));
      expect(round.isOver()).toBe(false);
      round.applyAction(act('p2', 'call', 5));
      expect(round.isOver()).toBe(true);
    });

    test('プレイヤーがフォールド → 残り1人で終了', () => {
      const players = makePlayers(2);
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      round.applyAction(act('p0', 'fold'));
      expect(round.isOver()).toBe(true);
    });

    test('無効なチェック（ベットがある）→ valid=false', () => {
      const players = makePlayers(2);
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 5);
      const result = round.applyAction(act('p0', 'check'));
      expect(result.valid).toBe(false);
    });
  });

  describe('BBオプション（プリフロップ）', () => {
    // BB(p2)は事前にビッグブラインドをポスト済み (betThisStreet = bigBlind) という前提
    test('誰もレイズしない場合、BBがチェックして終了', () => {
      const players = makePlayers(3);
      players[2].isBB = true;
      players[2].betThisStreet = 1;
      const round = new BettingRound(players, { bigBlind: 1, street: 'preflop', bbHasOption: true }, 1);
      round.applyAction(act('p0', 'call', 1));
      round.applyAction(act('p1', 'call', 1));
      expect(round.isOver()).toBe(false); // BBオプションが残っている
      round.applyAction(act('p2', 'check'));
      expect(round.isOver()).toBe(true);
    });

    test('誰もレイズしない場合、BBがレイズして継続', () => {
      const players = makePlayers(3);
      players[2].isBB = true;
      players[2].betThisStreet = 1;
      const round = new BettingRound(players, { bigBlind: 1, street: 'preflop', bbHasOption: true }, 1);
      round.applyAction(act('p0', 'call', 1));
      round.applyAction(act('p1', 'call', 1));
      round.applyAction(act('p2', 'raise', 3));
      expect(round.isOver()).toBe(false); // p0, p1 が再アクション必要
    });

    test('誰かがレイズした場合、BBのオプションは消える', () => {
      const players = makePlayers(3);
      players[2].isBB = true;
      players[2].betThisStreet = 1;
      const round = new BettingRound(players, { bigBlind: 1, street: 'preflop', bbHasOption: true }, 1);
      round.applyAction(act('p0', 'raise', 3));
      round.applyAction(act('p1', 'call', 3));
      round.applyAction(act('p2', 'call', 3));
      expect(round.isOver()).toBe(true);
    });
  });

  describe('オールイン', () => {
    test('オールインプレイヤーはplayersToActから除外される', () => {
      const players = makePlayers(3, 100);
      players[0].stack = 10;
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      round.applyAction(act('p0', 'all-in', 10));
      expect(round.getNextActingPlayerId()).not.toBe('p0');
    });

    test('オールインがレイズになる場合、他プレイヤーのアクションが再開', () => {
      const players = makePlayers(3, 100);
      players[2].stack = 50;
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      round.applyAction(act('p0', 'check')); // playersToAct: {p1, p2}
      round.applyAction(act('p1', 'check')); // playersToAct: {p2}
      round.applyAction(act('p2', 'all-in', 50)); // raise from 0 to 50, increment(50) >= lastRaiseIncrement(1)
      expect(round.isOver()).toBe(false);
      expect(round.getNextActingPlayerId()).toBe('p0');
    });

    test('最小レイズに満たないオールインは他のアクションを再開させない', () => {
      const players = makePlayers(3, 100);
      players[2].stack = 15;
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      round.applyAction(act('p0', 'raise', 10)); // currentBet=10, lastRaiseIncrement=10
      round.applyAction(act('p1', 'call', 10));
      round.applyAction(act('p2', 'all-in', 15)); // raise increment = 5 < lastRaiseIncrement(10)
      expect(round.isOver()).toBe(true); // p0, p1 は再アクション不要
    });
  });

  describe('getNextActingPlayerId()', () => {
    test('players配列の順番でアクションが回る', () => {
      const players = makePlayers(3);
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      expect(round.getNextActingPlayerId()).toBe('p0');
      round.applyAction(act('p0', 'check'));
      expect(round.getNextActingPlayerId()).toBe('p1');
    });

    test('ラウンド終了後はnullを返す', () => {
      const players = makePlayers(2);
      const round = new BettingRound(players, { bigBlind: 1, street: 'flop', bbHasOption: false }, 0);
      round.applyAction(act('p0', 'check'));
      round.applyAction(act('p1', 'check'));
      expect(round.getNextActingPlayerId()).toBeNull();
    });
  });

  describe('onAggression コールバック', () => {
    test('レイズ発生時にコールバックがレイザーIDで呼ばれる', () => {
      const players = makePlayers(3);
      const aggressors: string[] = [];
      const round = new BettingRound(
        players,
        { bigBlind: 1, street: 'flop', bbHasOption: false, onAggression: (id) => aggressors.push(id) },
        0,
      );
      round.applyAction(act('p0', 'raise', 5));
      expect(aggressors).toEqual(['p0']);
    });

    test('複数回レイズされると複数回呼ばれる(3Bet等)', () => {
      const players = makePlayers(3);
      const aggressors: string[] = [];
      const round = new BettingRound(
        players,
        { bigBlind: 1, street: 'flop', bbHasOption: false, onAggression: (id) => aggressors.push(id) },
        0,
      );
      round.applyAction(act('p0', 'raise', 5));
      round.applyAction(act('p1', 'raise', 15));
      expect(aggressors).toEqual(['p0', 'p1']);
    });

    test('現在のベットを超えるオールイン(レイズ相当)では呼ばれる', () => {
      const players = makePlayers(3, 100);
      players[2].stack = 50;
      const aggressors: string[] = [];
      const round = new BettingRound(
        players,
        { bigBlind: 1, street: 'flop', bbHasOption: false, onAggression: (id) => aggressors.push(id) },
        0,
      );
      round.applyAction(act('p0', 'check'));
      round.applyAction(act('p1', 'check'));
      round.applyAction(act('p2', 'all-in', 50)); // 0からの50ベット = レイズ相当
      expect(aggressors).toEqual(['p2']);
    });

    test('チェック・コール・フォールドでは呼ばれない', () => {
      const players = makePlayers(3);
      const aggressors: string[] = [];
      const round = new BettingRound(
        players,
        { bigBlind: 1, street: 'flop', bbHasOption: false, onAggression: (id) => aggressors.push(id) },
        0,
      );
      round.applyAction(act('p0', 'check'));
      round.applyAction(act('p1', 'check'));
      round.applyAction(act('p2', 'check'));
      expect(aggressors).toEqual([]);
    });

    test('現在のベットを超えないオールイン(コール相当)では呼ばれない', () => {
      const players = makePlayers(3, 100);
      players[2].stack = 3;
      const aggressors: string[] = [];
      const round = new BettingRound(
        players,
        { bigBlind: 1, street: 'flop', bbHasOption: false, onAggression: (id) => aggressors.push(id) },
        0,
      );
      round.applyAction(act('p0', 'raise', 10));
      round.applyAction(act('p1', 'call', 10));
      round.applyAction(act('p2', 'all-in', 3)); // 10に届かないコール相当のオールイン
      expect(aggressors).toEqual(['p0']); // p2のオールインはカウントされない
    });
  });
});
