// backend/src/game/engine/TablePlayer.ts

import { TablePlayer, PlayerStatus, Card } from '../types/game.types';

/** 初期状態のTablePlayerを生成 */
export function createTablePlayer(
  id: string,
  name: string,
  seatIndex: number,
  startingStack: number,
): TablePlayer {
  return {
    id,
    name,
    stack: startingStack,
    holeCards: null,
    status: 'active',
    betThisStreet: 0,
    totalBetThisHand: 0,
    seatIndex,
    positionName: null,
    isDealer: false,
    isSB: false,
    isBB: false,
  };
}

/** ストリート開始時にbetThisStreetをリセット */
export function resetStreetBet(player: TablePlayer): TablePlayer {
  return { ...player, betThisStreet: 0 };
}

/** プレイヤーがアクション可能か（active のみ） */
export function canAct(player: TablePlayer): boolean {
  return player.status === 'active';
}

/** プレイヤーがポットに参加しているか（folded以外） */
export function isInHand(player: TablePlayer): boolean {
  return player.status !== 'folded' && player.status !== 'sitting-out';
}

/** プレイヤーをフォールド状態にする */
export function foldPlayer(player: TablePlayer): TablePlayer {
  return { ...player, status: 'folded', holeCards: null };
}

/** チップをベットさせる（スタックから引く）。返り値: [updatedPlayer, actualBetAmount]
 *  スタック不足の場合は残りスタック全額をベット（オールイン）
 */
export function placeBet(
  player: TablePlayer,
  amount: number,
): [TablePlayer, number] {
  const actual = Math.min(amount, player.stack);
  const newStack = player.stack - actual;
  const newStatus: PlayerStatus = newStack <= 0 ? 'all-in' : player.status;
  return [
    {
      ...player,
      stack: newStack,
      betThisStreet: player.betThisStreet + actual,
      totalBetThisHand: player.totalBetThisHand + actual,
      status: newStatus,
    },
    actual,
  ];
}

/** ホールカードをディール */
export function dealHoleCards(
  player: TablePlayer,
  cards: [Card, Card],
): TablePlayer {
  return { ...player, holeCards: cards };
}

/** ハンド開始時にプレイヤー状態をリセット（スタックは引き継ぐ） */
export function resetForNewHand(player: TablePlayer): TablePlayer {
  return {
    ...player,
    holeCards: null,
    status: player.stack > 0 ? 'active' : 'sitting-out',
    betThisStreet: 0,
    totalBetThisHand: 0,
    positionName: null,
    isDealer: false,
    isSB: false,
    isBB: false,
  };
}
