/**
 * AI Engine - GTO Preflop + Heuristic Postflop
 *
 * Layer 1: プリフロップ → GTO_RFI_RANGES / GTO_VS_OPEN_RANGES 参照
 *          RNG(0-100) で ActionFrequency{fold/call/raise} から確率的に決定
 * Layer 2: ポストフロップ → ハンド強度・ボードテクスチャ・ポットオッズ・SPR に基づくヒューリスティック
 * Layer 3: ミックス戦略 → Math.random() * 100 で分岐
 */

import { Card, GameState, GameAction, Player, StrategyType, AIType, AI_PROFILES, CustomAIProfile } from '../types';
import { cardsToHandNotation, decidePreflopAction, GTO_RFI_RANGES } from '../data/gto-preflop-ranges';
import { decideVsOpenAction, getVsOpenEntry } from '../data/gto-vs-open-ranges';
import { evaluateHand } from './hand-evaluator';

// ============================================
// 型
// ============================================

export interface AIDecision {
  action: GameAction;
  amount?: number;
}

type BoardTexture = 'dry' | 'wet' | 'monotone' | 'paired' | 'connected';
type HandStrengthCategory = 'nuts' | 'strong' | 'medium' | 'weak' | 'draw' | 'air';

// ============================================
// メイン: AIアクション決定
// ============================================

export function getAIDecision(state: GameState, playerId: string): AIDecision {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.status !== 'active') return { action: 'fold' };

  const profile = getProfile(player.aiType);

  if (state.phase === 'pre-flop') {
    return getPreflopDecision(state, player, profile);
  } else {
    return getPostflopDecision(state, player, profile);
  }
}

function getProfile(aiType: AIType): CustomAIProfile {
  if (!aiType || !(aiType in AI_PROFILES)) return AI_PROFILES['GTO'];
  return AI_PROFILES[aiType as StrategyType];
}

// ============================================
// Layer 1: プリフロップ決定
// ============================================

function getPreflopDecision(
  state: GameState,
  player: Player,
  profile: CustomAIProfile
): AIDecision {
  if (player.cards.length < 2) return { action: 'fold' };

  const [c1, c2] = player.cards;
  const suited = c1.suit === c2.suit;
  const hand = cardsToHandNotation(c1.rank, c2.rank, suited);
  const heroPos = player.positionName ?? 'UTG';
  const rng = Math.random() * 100; // 0-100

  // ─── アクション前に誰かがオープンしているか判定 ───
  const facingRaise = state.currentBet > state.bigBlind;
  const isBB = player.isBB;
  const facingLimp = !facingRaise && state.currentBet === state.bigBlind && !isBB;

  if (!facingRaise) {
    // ── RFI (Raise First In) ──
    return resolveRFI(state, player, hand, heroPos, profile, rng);
  } else {
    // ── vs Open / BB Defense ──
    return resolveVsOpen(state, player, hand, heroPos, profile, rng);
  }
}

function resolveRFI(
  state: GameState,
  player: Player,
  hand: string,
  heroPos: string,
  profile: CustomAIProfile,
  rng: number
): AIDecision {
  // GTOプロファイルはテーブルをそのまま使用
  if (profile.strategy === 'GTO') {
    const action = decidePreflopAction(hand, heroPos, 'RFI', rng);
    if (action === 'raise') {
      return { action: 'raise', amount: calcOpenSize(state) };
    }
    if (action === 'call') return { action: 'call' }; // RFIでcallは通常ない
    // check available?
    const canCheck = state.currentBet === 0 || (player.isBB && state.currentBet === state.bigBlind);
    return canCheck ? { action: 'check' } : { action: 'fold' };
  }

  // カスタムプロファイル: PFR を基準に調整
  // GTO RFI テーブルを参照してベースラインを取得し、プロファイルで倍率調整
  const baseTable = GTO_RFI_RANGES[heroPos];
  const baseEntry = baseTable?.entries[hand];
  if (!baseEntry) {
    const canCheck = player.isBB;
    return canCheck ? { action: 'check' } : { action: 'fold' };
  }

  // PFR調整係数: GTO基準(~20%)とプロファイルPFRの比
  const pfrScale = profile.pfr / 20;
  const adjustedRaiseFreq = Math.min(100, baseEntry.raise * pfrScale);

  if (rng <= adjustedRaiseFreq) {
    return { action: 'raise', amount: calcOpenSize(state) };
  }
  const canCheck = player.isBB && state.currentBet === state.bigBlind;
  return canCheck ? { action: 'check' } : { action: 'fold' };
}

function resolveVsOpen(
  state: GameState,
  player: Player,
  hand: string,
  heroPos: string,
  profile: CustomAIProfile,
  rng: number
): AIDecision {
  const villainPos = getRaiserPosition(state, player.id);
  const toCall = state.currentBet - player.currentBet;

  if (profile.strategy === 'GTO') {
    const action = decideVsOpenAction(heroPos, villainPos, hand, rng);
    if (action === 'raise') {
      return { action: 'raise', amount: calc3BetSize(state) };
    }
    if (action === 'call') {
      return { action: 'call' };
    }
    // fold - BBはチェックで済む場合もある
    if (player.isBB && toCall === 0) return { action: 'check' };
    return { action: 'fold' };
  }

  // カスタムプロファイル
  const freq = getVsOpenEntry(heroPos, villainPos, hand);
  const scale3B = profile.threeBetFrequency / 9; // GTO基準 ~9%
  const adjusted3B = Math.min(100, freq.raise * scale3B);
  const adjustedCall = Math.min(100 - adjusted3B, freq.call * (profile.vpip / 25));

  if (rng <= adjusted3B) {
    return { action: 'raise', amount: calc3BetSize(state) };
  }
  if (rng <= adjusted3B + adjustedCall) {
    return { action: 'call' };
  }
  if (player.isBB && toCall === 0) return { action: 'check' };
  return { action: 'fold' };
}

// ============================================
// Layer 2: ポストフロップ決定
// ============================================

function getPostflopDecision(
  state: GameState,
  player: Player,
  profile: CustomAIProfile
): AIDecision {
  if (player.cards.length < 2 || state.communityCards.length < 3) {
    return { action: 'check' };
  }

  const toCall = state.currentBet - player.currentBet;
  const potOdds = toCall > 0 ? toCall / (state.pot + toCall) : 0;
  const spr = player.chips / Math.max(state.pot, 1);
  const isIP = isInPosition(state, player);

  const strength = classifyHandStrength(player.cards, state.communityCards);
  const texture = analyzeBoard(state.communityCards);
  const rng = Math.random() * 100;

  switch (strength) {
    case 'nuts':
      return decideNuts(state, player, profile, toCall, spr, rng);
    case 'strong':
      return decideStrong(state, player, profile, toCall, potOdds, spr, isIP, rng);
    case 'medium':
      return decideMedium(state, player, profile, toCall, potOdds, spr, isIP, texture, rng);
    case 'draw':
      return decideDraw(state, player, profile, toCall, potOdds, isIP, texture, rng);
    case 'weak':
      return decideWeak(state, player, profile, toCall, potOdds, isIP, texture, rng);
    case 'air':
    default:
      return decideAir(state, player, profile, toCall, isIP, texture, rng);
  }
}

// ── ナッツ: 常にバリューベット ──
function decideNuts(
  state: GameState, player: Player, profile: CustomAIProfile,
  toCall: number, spr: number, rng: number
): AIDecision {
  if (toCall > 0) {
    // 相手がベット → レイズ（SPRが低いならオールイン）
    if (spr < 2 || rng <= 40) {
      if (player.chips > 0) return { action: 'all-in' };
    }
    return { action: 'raise', amount: Math.floor(state.pot * 0.75) };
  }
  // チェック or ベット: アグレッションに応じてサイズ調整
  const betFreq = 85 + profile.aggressionFactor * 3;
  if (rng <= betFreq) {
    const size = spr < 3 ? player.chips : Math.floor(state.pot * (0.6 + profile.aggressionFactor * 0.08));
    return { action: 'raise', amount: size };
  }
  return { action: 'check' }; // スロープレイ
}

// ── 強いハンド: バリューベット主体 ──
function decideStrong(
  state: GameState, player: Player, profile: CustomAIProfile,
  toCall: number, potOdds: number, spr: number, isIP: boolean, rng: number
): AIDecision {
  const cbetFreq = profile.cbetFlop;
  if (toCall > 0) {
    // 呼ばれたとき: ほぼコール、たまにレイズ
    if (rng <= 30 * (profile.aggressionFactor / 2.8)) {
      return { action: 'raise', amount: Math.floor(state.pot * 0.65) };
    }
    const equity = 0.7;
    if (equity > potOdds) return { action: 'call' };
    return { action: 'fold' };
  }
  // ベット機会
  if (rng <= cbetFreq) {
    return { action: 'raise', amount: Math.floor(state.pot * 0.5) };
  }
  return { action: 'check' };
}

// ── 中程度: 選択的ベット ──
function decideMedium(
  state: GameState, player: Player, profile: CustomAIProfile,
  toCall: number, potOdds: number, spr: number, isIP: boolean,
  texture: BoardTexture, rng: number
): AIDecision {
  if (toCall > 0) {
    // ポットオッズが有利なら呼ぶ
    const foldToCbetAdj = profile.foldToCbet;
    if (rng > foldToCbetAdj && potOdds < 0.35) return { action: 'call' };
    return { action: 'fold' };
  }
  // ドライボードでCBet
  const betFreq = texture === 'dry' ? profile.cbetFlop * 0.7 : profile.cbetFlop * 0.45;
  if (rng <= betFreq) {
    return { action: 'raise', amount: Math.floor(state.pot * 0.4) };
  }
  return { action: 'check' };
}

// ── ドロー: セミブラフ ──
function decideDraw(
  state: GameState, player: Player, profile: CustomAIProfile,
  toCall: number, potOdds: number, isIP: boolean,
  texture: BoardTexture, rng: number
): AIDecision {
  // ドローのエクイティ概算: フラドロ~35%, OESD~32%
  const drawEquity = 0.33;
  if (toCall > 0) {
    if (drawEquity > potOdds) return { action: 'call' };
    // セミブラフレイズ
    const bluffRaiseFreq = profile.bluffFrequency * 0.4;
    if (rng <= bluffRaiseFreq) {
      return { action: 'raise', amount: Math.floor(state.pot * 0.6) };
    }
    return { action: 'fold' };
  }
  // IP ウェットボードでセミブラフ
  const semiBetFreq = isIP
    ? profile.bluffFrequency * 0.8
    : profile.bluffFrequency * 0.5;
  if (rng <= semiBetFreq) {
    return { action: 'raise', amount: Math.floor(state.pot * 0.5) };
  }
  return { action: 'check' };
}

// ── 弱いハンド ──
function decideWeak(
  state: GameState, player: Player, profile: CustomAIProfile,
  toCall: number, potOdds: number, isIP: boolean,
  texture: BoardTexture, rng: number
): AIDecision {
  if (toCall > 0) {
    if (potOdds < 0.12 && rng > profile.foldToCbet) return { action: 'call' };
    return { action: 'fold' };
  }
  // たまにブラフ（ドライボード限定）
  if (texture === 'dry' && rng <= profile.bluffFrequency * 0.3) {
    return { action: 'raise', amount: Math.floor(state.pot * 0.45) };
  }
  return { action: 'check' };
}

// ── エアー: ほぼチェック/フォールド、頻度ブラフ ──
function decideAir(
  state: GameState, player: Player, profile: CustomAIProfile,
  toCall: number, isIP: boolean, texture: BoardTexture, rng: number
): AIDecision {
  if (toCall > 0) {
    if (rng <= profile.bluffFrequency * 0.15) {
      return { action: 'raise', amount: Math.floor(state.pot * 0.7) };
    }
    return { action: 'fold' };
  }
  if (isIP && texture === 'dry' && rng <= profile.bluffFrequency * 0.35) {
    return { action: 'raise', amount: Math.floor(state.pot * 0.5) };
  }
  return { action: 'check' };
}

// ============================================
// ハンド強度分類
// ============================================

function classifyHandStrength(holeCards: Card[], communityCards: Card[]): HandStrengthCategory {
  if (communityCards.length < 3) return 'medium';

  const hand = evaluateHand(holeCards, communityCards);
  const name: string = hand.name;

  // Nuts / Very strong
  if (['Straight Flush', 'Royal Flush', 'Four of a Kind'].includes(name)) return 'nuts';
  if (name === 'Full House') return 'nuts';
  if (name === 'Flush') return 'strong';
  if (name === 'Straight') return 'strong';
  if (name === 'Three of a Kind') return 'strong';
  if (name === 'Two Pair') return hasTopTwoPair(holeCards, communityCards) ? 'strong' : 'medium';
  if (name === 'Pair') return classifyPair(holeCards, communityCards);

  // High card → ドロー判定
  if (hasFlushDraw(holeCards, communityCards)) return 'draw';
  if (hasStraightDraw(holeCards, communityCards)) return 'draw';

  // Aハイ = weak, その他 = air
  const hasAce = holeCards.some(c => c.rank === 'A');
  return hasAce ? 'weak' : 'air';
}

function classifyPair(holeCards: Card[], communityCards: Card[]): HandStrengthCategory {
  const boardRanks = communityCards.map(c => c.rank);
  const holeRanks = holeCards.map(c => c.rank);
  const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

  // ポケットペア → オーバーペアか判定
  if (holeRanks[0] === holeRanks[1]) {
    const ppIdx = rankOrder.indexOf(holeRanks[0]);
    const boardMax = Math.max(...boardRanks.map(r => rankOrder.indexOf(r)));
    return ppIdx > boardMax ? 'strong' : 'medium';
  }

  // ボードとマッチしてトップペアか
  const boardMax = Math.max(...boardRanks.map(r => rankOrder.indexOf(r)));
  const pairRank = holeRanks.find(r => boardRanks.includes(r));
  if (!pairRank) return 'weak';
  const pairIdx = rankOrder.indexOf(pairRank);
  if (pairIdx === boardMax) return 'medium'; // TPTK寄り
  if (pairIdx >= boardMax - 2) return 'medium';
  return 'weak';
}

function hasTopTwoPair(holeCards: Card[], communityCards: Card[]): boolean {
  const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const boardRanks = communityCards.map(c => c.rank);
  const holeRanks = holeCards.map(c => c.rank);
  const boardSorted = [...boardRanks].sort((a,b) => rankOrder.indexOf(b) - rankOrder.indexOf(a));
  return holeRanks.includes(boardSorted[0]) && holeRanks.includes(boardSorted[1]);
}

function hasFlushDraw(holeCards: Card[], communityCards: Card[]): boolean {
  const allCards = [...holeCards, ...communityCards];
  const suitCounts = allCards.reduce((acc, c) => {
    acc[c.suit] = (acc[c.suit] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return Object.values(suitCounts).some(n => n === 4);
}

function hasStraightDraw(holeCards: Card[], communityCards: Card[]): boolean {
  const rankOrder = ['A','2','3','4','5','6','7','8','9','10','J','Q','K','A']; // Aは両側
  const allRanks = [...holeCards, ...communityCards].map(c => c.rank);
  const indices = [...new Set(allRanks.map(r => rankOrder.indexOf(r)))].sort((a,b)=>a-b);
  // 4連続または1ギャップあり4枚をカバー
  for (let i = 0; i < indices.length - 3; i++) {
    if (indices[i+3] - indices[i] <= 4) return true;
  }
  return false;
}

// ============================================
// ボードテクスチャ分析
// ============================================

function analyzeBoard(communityCards: Card[]): BoardTexture {
  if (communityCards.length < 3) return 'dry';

  const suits = communityCards.map(c => c.suit);
  const ranks = communityCards.map(c => c.rank);
  const rankOrder = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

  // モノトーン
  if (new Set(suits).size === 1) return 'monotone';

  // ペアボード
  const rankFreq = ranks.reduce((a,r) => { a[r]=(a[r]??0)+1; return a; }, {} as Record<string,number>);
  if (Object.values(rankFreq).some(n => n >= 2)) return 'paired';

  // フラッシュドロー可能性
  const suitFreq = suits.reduce((a,s) => { a[s]=(a[s]??0)+1; return a; }, {} as Record<string,number>);
  const hasFD = Object.values(suitFreq).some(n => n >= 2);

  // コネクト度
  const indices = ranks.map(r => rankOrder.indexOf(r)).sort((a,b)=>a-b);
  const maxGap = Math.max(indices[1]-indices[0], indices[2]-indices[1]);
  const isConnected = maxGap <= 2;

  if (hasFD && isConnected) return 'wet';
  if (hasFD || isConnected) return 'connected';
  return 'dry';
}

// ============================================
// ユーティリティ
// ============================================

function isInPosition(state: GameState, player: Player): boolean {
  // ディーラー後ろ(BTN)がIP、それ以外はケースバイケース
  // 簡易: positionName が BTN or CO → IP
  const ipPositions = ['BTN', 'CO'];
  return ipPositions.includes(player.positionName ?? '');
}

function getRaiserPosition(state: GameState, excludePlayerId: string): string {
  // 最大currentBetを持つプレイヤーのポジションをレイザーとみなす
  let maxBet = 0;
  let raiserPos = 'UTG';
  for (const p of state.players) {
    if (p.id !== excludePlayerId && p.currentBet > maxBet) {
      maxBet = p.currentBet;
      raiserPos = p.positionName ?? 'UTG';
    }
  }
  return raiserPos;
}

function calcOpenSize(state: GameState): number {
  // 標準オープンサイズ: 2.5BB (BTN/CO), 3BB (SB)
  return Math.floor(state.bigBlind * 2.5);
}

function calc3BetSize(state: GameState): number {
  // 3Betサイズ: IP=3.5x, OOP=4x (currentBetに対して)
  return Math.floor(state.currentBet * 3.5);
}

/** AI思考時間 (ms): ハンド強度・プロファイルで変動 */
export function getAIThinkingTime(profile: CustomAIProfile): number {
  // GTO/TAGは熟考、maniacは速い
  const base: Record<StrategyType, number> = {
    GTO: 1200, TAG: 1000, LAG: 800, NIT: 1500,
    callingStation: 600, maniac: 400, ABC: 700,
  };
  const baseMs = base[profile.strategy] ?? 1000;
  const jitter = Math.random() * 800 - 400; // ±400ms
  return Math.max(300, Math.floor(baseMs + jitter));
}
