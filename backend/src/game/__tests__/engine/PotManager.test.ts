import { PotManager } from '../../engine/PotManager';
import { createTablePlayer } from '../../engine/TablePlayer';
import { TablePlayer, WinnerInfo, HandResult } from '../../types/game.types';

function withBet(
  player: TablePlayer,
  totalBet: number,
  status: TablePlayer['status'] = 'active',
): TablePlayer {
  return { ...player, totalBetThisHand: totalBet, status };
}

const DUMMY_HAND_RESULT = null as unknown as HandResult;

describe('PotManager', () => {
  describe('calculatePots()', () => {
    test('全員同額の場合、1つのメインポットのみ', () => {
      const pm = new PotManager();
      const players = [
        withBet(createTablePlayer('p0', 'P0', 0, 100), 10),
        withBet(createTablePlayer('p1', 'P1', 1, 100), 10),
        withBet(createTablePlayer('p2', 'P2', 2, 100), 10),
      ];
      pm.calculatePots(players);
      const pots = pm.getPots();
      expect(pots.length).toBe(1);
      expect(pots[0].amount).toBe(30);
      expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p0', 'p1', 'p2']);
    });

    test('オールインプレイヤーがいる場合、サイドポットが生成される', () => {
      const pm = new PotManager();
      const players = [
        withBet(createTablePlayer('p0', 'P0', 0, 100), 5, 'all-in'),
        withBet(createTablePlayer('p1', 'P1', 1, 100), 10),
        withBet(createTablePlayer('p2', 'P2', 2, 100), 10),
      ];
      pm.calculatePots(players);
      const pots = pm.getPots();
      expect(pots.length).toBe(2);
      expect(pots[0].amount).toBe(15);
      expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p0', 'p1', 'p2']);
      expect(pots[1].amount).toBe(10);
      expect(pots[1].eligiblePlayerIds.sort()).toEqual(['p1', 'p2']);
    });

    test('複数のオールインで複数のサイドポット', () => {
      const pm = new PotManager();
      const players = [
        withBet(createTablePlayer('p0', 'P0', 0, 100), 5, 'all-in'),
        withBet(createTablePlayer('p1', 'P1', 1, 100), 15, 'all-in'),
        withBet(createTablePlayer('p2', 'P2', 2, 100), 30),
      ];
      pm.calculatePots(players);
      const pots = pm.getPots();
      expect(pots.length).toBe(3);
      expect(pots[0].amount).toBe(15); // 5 * 3
      expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p0', 'p1', 'p2']);
      expect(pots[1].amount).toBe(20); // (15-5) * 2
      expect(pots[1].eligiblePlayerIds.sort()).toEqual(['p1', 'p2']);
      expect(pots[2].amount).toBe(15); // (30-15) * 1
      expect(pots[2].eligiblePlayerIds).toEqual(['p2']);
    });

    test('フォールドしたプレイヤーはeligibleに含まれない', () => {
      const pm = new PotManager();
      const players = [
        withBet(createTablePlayer('p0', 'P0', 0, 100), 10, 'folded'),
        withBet(createTablePlayer('p1', 'P1', 1, 100), 10),
        withBet(createTablePlayer('p2', 'P2', 2, 100), 10),
      ];
      pm.calculatePots(players);
      const pots = pm.getPots();
      expect(pots.length).toBe(1);
      expect(pots[0].amount).toBe(30); // 額自体はフォールドした分も含む
      expect(pots[0].eligiblePlayerIds.sort()).toEqual(['p1', 'p2']);
    });
  });

  describe('distributePots()', () => {
    test('単独勝者が全額獲得', () => {
      const pm = new PotManager();
      const players = [
        withBet(createTablePlayer('p0', 'P0', 0, 100), 10),
        withBet(createTablePlayer('p1', 'P1', 1, 100), 10),
      ];
      pm.calculatePots(players);
      const winners: WinnerInfo[] = [{ playerIds: ['p0'], handResult: DUMMY_HAND_RESULT }];
      const dist = pm.distributePots(winners, players);
      expect(dist).toEqual([{ playerId: 'p0', amount: 20 }]);
    });

    test('引き分けの場合に均等分配（端数は最初の勝者に加算）', () => {
      const pm = new PotManager();
      const players = [
        withBet(createTablePlayer('p0', 'P0', 0, 100), 5),
        withBet(createTablePlayer('p1', 'P1', 1, 100), 5),
        withBet(createTablePlayer('p2', 'P2', 2, 100), 5),
      ];
      pm.calculatePots(players); // total pot = 15
      const winners: WinnerInfo[] = [{ playerIds: ['p0', 'p1'], handResult: DUMMY_HAND_RESULT }];
      const dist = pm.distributePots(winners, players);
      const total = dist.reduce((s, d) => s + d.amount, 0);
      expect(total).toBe(15);
      const p0Amount = dist.find(d => d.playerId === 'p0')!.amount;
      const p1Amount = dist.find(d => d.playerId === 'p1')!.amount;
      // 15 / 2 = 7.5 ずつ、端数なしのケースだが念のため合計を検証
      expect(p0Amount + p1Amount).toBe(15);
      expect(p0Amount).toBeGreaterThanOrEqual(p1Amount); // 端数があれば最初の勝者(p0)に加算
    });

    test('サイドポットを勝てないオールインプレイヤー', () => {
      const pm = new PotManager();
      const players = [
        withBet(createTablePlayer('p0', 'P0', 0, 100), 5, 'all-in'),
        withBet(createTablePlayer('p1', 'P1', 1, 100), 20),
      ];
      pm.calculatePots(players);
      // メインポット(10): eligible [p0,p1] / サイドポット(15): eligible [p1]
      const winners: WinnerInfo[] = [{ playerIds: ['p0'], handResult: DUMMY_HAND_RESULT }];
      const dist = pm.distributePots(winners, players);
      const distSorted = dist.sort((a, b) => a.playerId.localeCompare(b.playerId));
      expect(distSorted).toEqual([
        { playerId: 'p0', amount: 10 },
        { playerId: 'p1', amount: 15 }, // p0が勝者でもサイドポットには参加できないためp1に渡る
      ]);
    });
  });
});
