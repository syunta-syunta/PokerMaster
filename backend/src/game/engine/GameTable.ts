// backend/src/game/engine/GameTable.ts

import { TablePlayer, PositionName, GameConfig } from '../types/game.types';
import { createTablePlayer, resetForNewHand } from './TablePlayer';

/** ポジション名のマッピング（プレイヤー数 → ポジション配列、BTNから時計回り） */
const POSITION_NAMES: Record<number, PositionName[]> = {
  2: ['BTN', 'BB'],          // BTN = SB でもある (Heads-Up ルール)
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO'],
};

export class GameTable {
  private players: TablePlayer[] = [];
  private dealerSeatIndex: number = 0;
  readonly config: GameConfig;

  constructor(config: GameConfig) {
    this.config = config;
  }

  // ─── プレイヤー管理 ────────────────────────

  addPlayer(id: string, name: string): void {
    if (this.players.length >= this.config.maxPlayers) {
      throw new Error('Table is full');
    }
    if (this.players.some(p => p.id === id)) {
      throw new Error(`Player ${id} is already at the table`);
    }
    const seatIndex = this.players.length;
    this.players.push(
      createTablePlayer(id, name, seatIndex, this.config.startingStack),
    );
  }

  removePlayer(id: string): void {
    this.players = this.players.filter(p => p.id !== id);
    // seatIndexを詰め直す
    this.players.forEach((p, i) => { p.seatIndex = i; });
  }

  getPlayer(id: string): TablePlayer {
    const p = this.players.find(p => p.id === id);
    if (!p) throw new Error(`Player ${id} not found`);
    return p;
  }

  updatePlayer(updated: TablePlayer): void {
    const idx = this.players.findIndex(p => p.id === updated.id);
    if (idx === -1) throw new Error(`Player ${updated.id} not found`);
    this.players[idx] = updated;
  }

  getActivePlayers(): TablePlayer[] {
    return this.players.filter(p => p.status === 'active');
  }

  getPlayersInHand(): TablePlayer[] {
    return this.players.filter(
      p => p.status === 'active' || p.status === 'all-in',
    );
  }

  getAllPlayers(): TablePlayer[] {
    return [...this.players];
  }

  getPlayerCount(): number {
    return this.players.length;
  }

  // ─── ポジション管理 ────────────────────────

  /** ハンド開始時にプレイヤー状態をリセットしてポジションを割り当てる */
  setupForNewHand(): void {
    // 全プレイヤーのハンド状態をリセット
    this.players = this.players.map(resetForNewHand);

    const n = this.players.length;
    const positions = POSITION_NAMES[n];
    if (!positions) throw new Error(`Unsupported player count: ${n}`);

    // dealerSeatIndex からBTNを割り当て、時計回りにポジション名を付与
    for (let i = 0; i < n; i++) {
      const seatIdx = (this.dealerSeatIndex + i) % n;
      const posName = positions[i];
      const player = this.players[seatIdx];
      player.positionName = posName;
      player.isDealer = posName === 'BTN';
      player.isSB = posName === 'SB' || (n === 2 && posName === 'BTN');
      player.isBB = posName === 'BB';
    }
  }

  /** ディーラーボタンを次に進める */
  advanceDealer(): void {
    this.dealerSeatIndex = (this.dealerSeatIndex + 1) % this.players.length;
  }

  getDealerSeatIndex(): number {
    return this.dealerSeatIndex;
  }

  /** SBプレイヤーを返す */
  getSBPlayer(): TablePlayer {
    const sb = this.players.find(p => p.isSB);
    if (!sb) throw new Error('SB player not found');
    return sb;
  }

  /** BBプレイヤーを返す */
  getBBPlayer(): TablePlayer {
    const bb = this.players.find(p => p.isBB);
    if (!bb) throw new Error('BB player not found');
    return bb;
  }

  /** プリフロップのアクション開始プレイヤー（UTG = BBの次） */
  getUTGPlayer(): TablePlayer {
    const bb = this.getBBPlayer();
    const activePlayers = this.players.filter(p => p.status === 'active');
    const bbIdx = activePlayers.findIndex(p => p.id === bb.id);
    return activePlayers[(bbIdx + 1) % activePlayers.length];
  }

  /** ポストフロップのアクション開始プレイヤー（ディーラーの次のアクティブプレイヤー） */
  getFirstPostflopPlayer(): TablePlayer {
    const dealer = this.players[this.dealerSeatIndex];
    const inHand = this.getPlayersInHand();
    const dealerIdx = inHand.findIndex(p => p.id === dealer.id);
    // ディーラーの次のプレイヤーから探す
    for (let i = 1; i <= inHand.length; i++) {
      const candidate = inHand[(dealerIdx + i) % inHand.length];
      if (candidate.status === 'active') return candidate;
    }
    throw new Error('No active player found for postflop');
  }
}
