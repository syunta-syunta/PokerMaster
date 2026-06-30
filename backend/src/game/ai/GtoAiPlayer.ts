// backend/src/game/ai/GtoAiPlayer.ts

import { PlayerAction, BettingContext, Card } from '../types/game.types';
import { handEvaluator } from '../core/HandEvaluator';
import { decidePostflopAction, classifyFacingBetSize } from './postflop/PostflopEngine';
import { ActionFrequency, GTO_RFI_RANGES } from './data/gto-preflop-ranges';
import { GTO_VS_OPEN_RANGES } from './data/gto-vs-open-ranges';
import { GTO_VS_3BET_RANGES, GTO_8MAX_RFI_RANGES } from './data/gto-vs-3bet-and-8max-ranges';
import { GTO_8MAX_VS3BET_RANGES, GTO_VS4BET_RANGES } from './data/gto-vs-4bet-and-8max-vs3bet';

export interface GtoAiConfig {
  /** 初期ポジション。ディーラーボタンの移動に伴いハンドごとに変わるため、
   *  毎ハンド開始時に setPosition() で更新すること。 */
  position: string;
}

/**
 * プリフロップの意思決定シナリオ。
 *
 * GtoAiPlayer はステートレス（ベッティング履歴を保持しない）であるため、
 * 「今何回目のレイズを受けているか」は呼び出し側（GameEngine）が判断して渡す。
 * ベットサイズからの逆算はサイジング規約に依存し脆いため採用しない。
 */
export type PreflopScenario = 'RFI' | 'vsOpen' | 'vs3Bet' | 'vs4Bet';

export interface PreflopDecisionContext extends BettingContext {
  playerId: string;
  scenario: PreflopScenario;
  /** vsOpen シナリオの場合のみ必須（直近のレイザーのポジション） */
  raiserPosition?: string;
}

const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/** ホールカード2枚をGTOレンジテーブルのキー表記に変換する (例: "AKs", "AKo", "AA") */
export function holeCardsToHandKey(holeCards: [Card, Card]): string {
  const [c1, c2] = holeCards;
  if (c1.rank === c2.rank) return `${c1.rank}${c2.rank}`;
  const suited = c1.suit === c2.suit;
  const i1 = RANK_ORDER.indexOf(c1.rank);
  const i2 = RANK_ORDER.indexOf(c2.rank);
  const [high, low] = i1 < i2 ? [c1.rank, c2.rank] : [c2.rank, c1.rank];
  return `${high}${low}${suited ? 's' : 'o'}`;
}

/** 8max専用ポジション（6maxのGTOテーブルに存在しないため別テーブルを参照する） */
const EIGHT_MAX_ONLY_POSITIONS = new Set(['UTG1', 'UTG2', 'LJ']);

export class GtoAiPlayer {
  private holeCards: [Card, Card] | null = null;
  private config: GtoAiConfig;

  constructor(config: GtoAiConfig) {
    this.config = config;
  }

  setHoleCards(cards: [Card, Card]): void {
    this.holeCards = cards;
  }

  /** ディーラーボタンの移動に伴い、毎ハンド開始時にポジションを更新する */
  setPosition(position: string): void {
    this.config.position = position;
  }

  /**
   * プリフロップのアクションを決定する。
   * GTO preflop range tables (backend/src/game/ai/data/) を参照し、
   * RNGで混合戦略を実行する。
   */
  decidePreflopAction(context: PreflopDecisionContext): PlayerAction {
    if (!this.holeCards) throw new Error('Hole cards not set');

    const position = this.config.position;
    const toCall = context.currentBet - context.playerBetThisStreet;
    const canCheck = toCall <= 0;

    // BBはRFI(誰もレイズしていない)状況では常に無料でチェックできる。
    // GTO_RFI_RANGESにBBのエントリは存在しない（オープンレイズという概念がBBにはないため）。
    if (context.scenario === 'RFI' && position === 'BB') {
      return { type: 'check', playerId: context.playerId, timestamp: Date.now() };
    }

    const handKey = holeCardsToHandKey(this.holeCards);
    const freq = this.lookupFrequency(context.scenario, position, context.raiserPosition, handKey);

    if (!freq) {
      // レンジテーブルに存在しないハンド、またはテーブル自体が見つからない場合は
      // gto-preflop-ranges.ts の decidePreflopAction() ヘルパーと同じ規約でフォールドにフォールバックする。
      return canCheck
        ? { type: 'check', playerId: context.playerId, timestamp: Date.now() }
        : { type: 'fold', playerId: context.playerId, timestamp: Date.now() };
    }

    const rng = Math.random() * 100;

    if (rng < freq.fold) {
      return canCheck
        ? { type: 'check', playerId: context.playerId, timestamp: Date.now() }
        : { type: 'fold', playerId: context.playerId, timestamp: Date.now() };
    }
    if (rng < freq.fold + freq.call) {
      if (canCheck) return { type: 'check', playerId: context.playerId, timestamp: Date.now() };
      return { type: 'call', playerId: context.playerId, amount: toCall, timestamp: Date.now() };
    }

    // raise (RFIではオープン、vsOpenでは3Bet、vs3Betでは4Bet、vs4Betでは5Bet)
    const raiseAmount = this.calculateStandardRaiseSize(context.scenario, context, position);
    return { type: 'raise', playerId: context.playerId, amount: raiseAmount, timestamp: Date.now() };
  }

  /** シナリオ・ポジションに応じたレンジテーブルからアクション頻度を取得する */
  private lookupFrequency(
    scenario: PreflopScenario,
    position: string,
    raiserPosition: string | undefined,
    handKey: string,
  ): ActionFrequency | null {
    switch (scenario) {
      case 'RFI': {
        const table = EIGHT_MAX_ONLY_POSITIONS.has(position)
          ? GTO_8MAX_RFI_RANGES[`8max_${position}` as keyof typeof GTO_8MAX_RFI_RANGES]
          : GTO_RFI_RANGES[position];
        return table?.entries[handKey] ?? null;
      }
      case 'vsOpen': {
        if (!raiserPosition) return null;
        const table = this.findVsOpenTable(position, raiserPosition);
        return table?.entries[handKey] ?? null;
      }
      case 'vs3Bet': {
        const table = EIGHT_MAX_ONLY_POSITIONS.has(position)
          ? GTO_8MAX_VS3BET_RANGES[`8max_${position}_vs3Bet` as keyof typeof GTO_8MAX_VS3BET_RANGES]
          // 8maxポジションにvs3Betテーブルがない場合(HJ/CO/BTN/SB)は6max版を流用
          : GTO_VS_3BET_RANGES[`${position}_vs3Bet` as keyof typeof GTO_VS_3BET_RANGES];
        return table?.entries[handKey] ?? null;
      }
      case 'vs4Bet': {
        // UTGはほぼ3Betしないため専用テーブルが存在しない。8max専用ポジションも同様。
        // 6max版で代用する (近似)。
        const lookupPos = EIGHT_MAX_ONLY_POSITIONS.has(position) ? 'UTG' : position;
        const table = GTO_VS4BET_RANGES[`${lookupPos}_vs4Bet` as keyof typeof GTO_VS4BET_RANGES];
        return table?.entries[handKey] ?? null;
      }
      default:
        return null;
    }
  }

  /**
   * vsOpenテーブルを検索する。完全一致がない場合は、同じヒーローポジションの
   * 別の相手ポジション向けテーブルで近似する（オープンレンジの形は相手の
   * ポジションが変わってもおおむね近いため、フォールドよりは妥当な近似となる）。
   */
  private findVsOpenTable(
    heroPosition: string,
    raiserPosition: string,
  ): { entries: Record<string, ActionFrequency> } | null {
    const exactKey = `${heroPosition}_vs${raiserPosition}`;
    const ranges = GTO_VS_OPEN_RANGES as Record<string, { entries: Record<string, ActionFrequency> }>;
    if (ranges[exactKey]) return ranges[exactKey];

    const fallbackKey = Object.keys(ranges).find(k => k.startsWith(`${heroPosition}_vs`));
    return fallbackKey ? ranges[fallbackKey] : null;
  }

  /** シナリオに応じた標準レイズサイズ (BB単位の合計ベット額) を計算する */
  private calculateStandardRaiseSize(
    scenario: PreflopScenario,
    context: PreflopDecisionContext,
    position: string,
  ): number {
    switch (scenario) {
      case 'RFI':
        // 標準オープンサイズ: 2.5BB (SBのみ慣習的に3BB)
        return position === 'SB' ? context.bigBlind * 3 : context.bigBlind * 2.5;
      case 'vsOpen': {
        // 3Betサイズ: IP=3.5x open, OOP=4x open (gto-vs-open-ranges.tsのヘッダコメント準拠)
        const isOOP = position === 'SB' || position === 'BB';
        const multiplier = isOOP ? 4 : 3.5;
        return Math.min(context.currentBet * multiplier, context.playerStack + context.playerBetThisStreet);
      }
      case 'vs3Bet': {
        // 4Betサイズ: 3Betの約2.2倍
        return Math.min(context.currentBet * 2.2, context.playerStack + context.playerBetThisStreet);
      }
      case 'vs4Bet':
        // 5Betは100BBでは実質オールイン
        return context.playerStack + context.playerBetThisStreet;
      default:
        return context.currentBet * 2;
    }
  }

  /**
   * ポストフロップのアクションを決定する。
   * PostflopEngine を使用。
   *
   * isPFA (プリフロップアグレッサーか) と isIP (インポジションか) は
   * ハンドごとに変わる値であるため、呼び出し側 (GameEngine) が都度算出して渡す。
   */
  decidePostflopAction(
    communityCards: Card[],
    context: BettingContext & {
      playerId: string;
      pot: number;
      facingBet: number | null;
      street: 'flop' | 'turn' | 'river';
      isPFA: boolean;
      isIP: boolean;
    },
  ): PlayerAction {
    if (!this.holeCards) throw new Error('Hole cards not set');

    const handResult = handEvaluator.evaluate(this.holeCards, communityCards);
    const spr = context.playerStack / context.pot;

    const decision = decidePostflopAction(
      this.holeCards,
      communityCards,
      handResult,
      {
        isPFA: context.isPFA,
        isIP: context.isIP,
        spr,
        street: context.street,
        pot: context.pot,
        effectiveStack: context.playerStack,
        facingBet: context.facingBet,
        facingBetSizeBucket: context.facingBet !== null
          ? classifyFacingBetSize(context.facingBet, context.pot)
          : null,
      },
    );

    return this.convertDecisionToAction(decision, context);
  }

  private convertDecisionToAction(
    decision: ReturnType<typeof decidePostflopAction>,
    context: BettingContext & { playerId: string },
  ): PlayerAction {
    const { playerId } = context;
    switch (decision.action) {
      case 'check': return { type: 'check', playerId, timestamp: Date.now() };
      case 'fold':  return { type: 'fold',  playerId, timestamp: Date.now() };
      case 'call':  return { type: 'call',  playerId, amount: context.currentBet - context.playerBetThisStreet, timestamp: Date.now() };
      case 'bet':
      case 'raise':
        return { type: 'raise', playerId, amount: decision.betAmount ?? context.currentBet * 2, timestamp: Date.now() };
    }
  }
}
