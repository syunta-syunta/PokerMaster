// backend/src/game/engine/BettingRound.ts

import {
  TablePlayer, PlayerAction, BettingContext,
} from '../types/game.types';
import { actionValidator } from '../core/ActionValidator';
import { placeBet, foldPlayer, canAct } from './TablePlayer';

export interface BettingRoundConfig {
  bigBlind: number;
  street: 'preflop' | 'flop' | 'turn' | 'river';
  /** BBのオプション権があるか（プリフロップで誰もレイズしていない場合） */
  bbHasOption: boolean;
}

export interface BettingRoundResult {
  updatedPlayers: TablePlayer[];
  collectedBets: number; // このラウンドで集めた合計額 (BB)
}

export class BettingRound {
  private players: TablePlayer[];
  private currentBet: number;
  private lastRaiseIncrement: number;
  private config: BettingRoundConfig;
  /** まだアクションが必要なプレイヤーIDのセット */
  private playersToAct: Set<string>;
  /** BBのオプション権が残っているか */
  private bbOptionPending: boolean;

  constructor(
    players: TablePlayer[],
    config: BettingRoundConfig,
    initialBet: number = 0,
  ) {
    this.players = players.map(p => ({ ...p }));
    this.config = config;
    this.currentBet = initialBet;
    this.lastRaiseIncrement = config.bigBlind;
    this.bbOptionPending = config.bbHasOption;

    // 初期アクション対象: activeなプレイヤー全員
    this.playersToAct = new Set(
      players.filter(canAct).map(p => p.id),
    );
  }

  /** 現在アクションすべきプレイヤーを返す（順番は players 配列の順） */
  getNextActingPlayerId(): string | null {
    if (this.isOver()) return null;
    const active = this.players.filter(
      p => canAct(p) && this.playersToAct.has(p.id),
    );
    return active[0]?.id ?? null;
  }

  /** BettingContext を構築して返す（ActionValidator に渡す） */
  getBettingContext(playerId: string): BettingContext {
    const player = this.getPlayer(playerId);
    return {
      currentBet: this.currentBet,
      lastRaiseIncrement: this.lastRaiseIncrement,
      playerStack: player.stack,
      playerBetThisStreet: player.betThisStreet,
      bigBlind: this.config.bigBlind,
    };
  }

  /**
   * アクションを適用する
   * @returns バリデーション結果。valid=falseの場合、アクションは適用されない
   */
  applyAction(action: PlayerAction): { valid: boolean; error?: string } {
    const player = this.getPlayer(action.playerId);
    const context = this.getBettingContext(action.playerId);
    const result = actionValidator.validate(action, context);

    if (!result.valid) {
      return { valid: false, error: result.error };
    }

    // correctedAction がある場合はそちらを使う
    const effectiveAction = result.correctedAction ?? action;

    switch (effectiveAction.type) {
      case 'fold':
        this.applyFold(player);
        break;
      case 'check':
        this.applyCheck(player);
        break;
      case 'call':
        this.applyCall(player, effectiveAction.amount ?? 0);
        break;
      case 'raise':
        this.applyRaise(player, effectiveAction.amount ?? 0);
        break;
      case 'all-in':
        this.applyAllIn(player, effectiveAction.amount ?? 0);
        break;
    }

    return { valid: true };
  }

  /** ラウンドが終了しているか */
  isOver(): boolean {
    const activePlayers = this.players.filter(canAct);
    // アクティブプレイヤーが1人以下 → 終了
    if (activePlayers.length <= 1) return true;
    // playersToActが空 かつ BBオプション未使用でない → 終了
    return this.playersToAct.size === 0 && !this.bbOptionPending;
  }

  /** このラウンドで集めたベット額の合計 */
  getCollectedAmount(): number {
    const originalBets = this.players.reduce(
      (sum, p) => sum + p.betThisStreet, 0,
    );
    return originalBets;
  }

  /** 現在のプレイヤー状態を返す */
  getPlayers(): TablePlayer[] {
    return this.players.map(p => ({ ...p }));
  }

  getCurrentBet(): number {
    return this.currentBet;
  }

  // ─── Private ────────────────────────────────

  private getPlayer(id: string): TablePlayer {
    const p = this.players.find(p => p.id === id);
    if (!p) throw new Error(`Player ${id} not found in BettingRound`);
    return p;
  }

  private updatePlayer(updated: TablePlayer): void {
    const idx = this.players.findIndex(p => p.id === updated.id);
    if (idx !== -1) this.players[idx] = updated;
  }

  private applyFold(player: TablePlayer): void {
    this.updatePlayer(foldPlayer(player));
    this.playersToAct.delete(player.id);
    this.checkBbOption(player.id);
  }

  private applyCheck(player: TablePlayer): void {
    this.playersToAct.delete(player.id);
    this.checkBbOption(player.id);
  }

  private applyCall(player: TablePlayer, amount: number): void {
    const [updated] = placeBet(player, amount);
    this.updatePlayer(updated);
    this.playersToAct.delete(player.id);
    this.checkBbOption(player.id);
  }

  private applyRaise(player: TablePlayer, totalBetAmount: number): void {
    const additionalAmount = totalBetAmount - player.betThisStreet;
    const [updated] = placeBet(player, additionalAmount);
    const newIncrement = totalBetAmount - this.currentBet;
    this.lastRaiseIncrement = Math.max(newIncrement, this.config.bigBlind);
    this.currentBet = totalBetAmount;
    this.updatePlayer(updated);

    // レイズしたので他の全activeプレイヤーをplayersToActに戻す
    this.players.forEach(p => {
      if (canAct(p) && p.id !== player.id) {
        this.playersToAct.add(p.id);
      }
    });
    this.playersToAct.delete(player.id);
    this.bbOptionPending = false; // レイズでBBオプションは消える
  }

  private applyAllIn(player: TablePlayer, amount: number): void {
    const [updated] = placeBet(player, amount);
    const totalBet = updated.betThisStreet;

    // オールインがレイズになる場合（現在のベット額を超える）
    if (totalBet > this.currentBet) {
      const newIncrement = totalBet - this.currentBet;
      // 最小レイズに満たないオールインレイズは他プレイヤーのアクションを再開させない
      if (newIncrement >= this.lastRaiseIncrement) {
        this.lastRaiseIncrement = newIncrement;
        this.players.forEach(p => {
          if (canAct(p) && p.id !== player.id) {
            this.playersToAct.add(p.id);
          }
        });
      }
      this.currentBet = totalBet;
    }

    this.updatePlayer(updated);
    this.playersToAct.delete(player.id);
    this.bbOptionPending = false;
  }

  /** BBがアクションしたらオプションを消費 */
  private checkBbOption(playerId: string): void {
    const bb = this.players.find(p => p.isBB);
    if (bb && bb.id === playerId) {
      this.bbOptionPending = false;
    }
  }
}
