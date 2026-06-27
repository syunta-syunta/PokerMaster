// backend/src/game/engine/PotManager.ts

import { Pot, TablePlayer, WinnerInfo } from '../types/game.types';

export class PotManager {
  private pots: Pot[] = [];

  /** 各プレイヤーの betThisHand からポットを計算してサイドポットを生成する */
  calculatePots(players: TablePlayer[]): void {
    // ハンドに参加しているプレイヤーのみ対象
    const contributors = players
      .filter(p => p.totalBetThisHand > 0)
      .sort((a, b) => a.totalBetThisHand - b.totalBetThisHand);

    this.pots = [];
    let previousLevel = 0;

    for (let i = 0; i < contributors.length; i++) {
      const level = contributors[i].totalBetThisHand;
      if (level <= previousLevel) continue;

      const increment = level - previousLevel;
      const potAmount = increment * (contributors.length - i);

      // このポットに参加できるプレイヤー（level以上を払っているプレイヤー）
      const eligible = contributors
        .filter(p => p.totalBetThisHand >= level && p.status !== 'folded')
        .map(p => p.id);

      if (eligible.length > 0) {
        this.pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
      }

      previousLevel = level;
    }
  }

  /** 勝者情報に基づいてポットを分配する
   *  @returns { playerId: string, amount: number }[] の分配リスト
   */
  distributePots(
    winners: WinnerInfo[],
    allPlayersInHand: TablePlayer[],
  ): { playerId: string; amount: number }[] {
    const distribution: Map<string, number> = new Map();

    for (const pot of this.pots) {
      // このポットを勝てる勝者を絞り込む
      const potWinners = winners
        .flatMap(w => w.playerIds)
        .filter(id => pot.eligiblePlayerIds.includes(id));

      if (potWinners.length === 0) {
        // 勝者がいない（全員フォールド後のエラーケース）
        // 最後にフォールドしていないプレイヤーに渡す
        const lastStanding = allPlayersInHand.find(
          p => p.status !== 'folded' && pot.eligiblePlayerIds.includes(p.id),
        );
        if (lastStanding) potWinners.push(lastStanding.id);
      }

      const share = Math.floor((pot.amount / potWinners.length) * 100) / 100;
      potWinners.forEach(id => {
        distribution.set(id, (distribution.get(id) ?? 0) + share);
      });

      // 端数は最初の勝者に加算
      const total = potWinners.length * share;
      const remainder = Math.round((pot.amount - total) * 100) / 100;
      if (remainder > 0 && potWinners[0]) {
        distribution.set(
          potWinners[0],
          (distribution.get(potWinners[0]) ?? 0) + remainder,
        );
      }
    }

    return Array.from(distribution.entries()).map(([playerId, amount]) => ({
      playerId,
      amount,
    }));
  }

  getPots(): Pot[] {
    return [...this.pots];
  }

  getTotalPot(): number {
    return this.pots.reduce((sum, p) => sum + p.amount, 0);
  }

  reset(): void {
    this.pots = [];
  }
}
