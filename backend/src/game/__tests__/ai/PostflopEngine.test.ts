import { decidePostflopAction } from '../../ai/postflop/PostflopEngine';
import { handEvaluator } from '../../core/HandEvaluator';
import { Card, PostflopContext, PostflopDecision } from '../../types/game.types';

function c(rank: Card['rank'], suit: Card['suit']): Card {
  return { rank, suit };
}

function baseContext(overrides: Partial<PostflopContext> = {}): PostflopContext {
  return {
    isPFA: true,
    isIP: true,
    spr: 6, // 中間SPR (3-10): SPRモディファイアの影響を受けない
    street: 'flop',
    pot: 10,
    effectiveStack: 60,
    facingBet: null,
    facingBetSizeBucket: null,
    ...overrides,
  };
}

function sample(
  hole: [Card, Card],
  board: Card[],
  context: PostflopContext,
  n = 400,
): { counts: Record<string, number>; decisions: PostflopDecision[] } {
  const handResult = handEvaluator.evaluate(hole, board);
  const counts: Record<string, number> = {};
  const decisions: PostflopDecision[] = [];
  for (let i = 0; i < n; i++) {
    const d = decidePostflopAction(hole, board, handResult, context);
    const key = d.action === 'bet' ? `bet:${d.betSizeBucket}` : d.action;
    counts[key] = (counts[key] ?? 0) + 1;
    decisions.push(d);
  }
  return { counts, decisions };
}

function betRate(counts: Record<string, number>, n: number): number {
  const bet = (counts['bet:small'] ?? 0) + (counts['bet:medium'] ?? 0) + (counts['bet:large'] ?? 0);
  return bet / n;
}

function maxKey(counts: Record<string, number>): string {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

describe('PostflopEngine (統合テスト)', () => {
  describe('アグレッサー', () => {
    test('NUTTED + dry + nut advantage → betLarge 優先', () => {
      const hole: [Card, Card] = [c('2', 'hearts'), c('2', 'diamonds')];
      const board: Card[] = [c('2', 'clubs'), c('2', 'spades'), c('A', 'hearts')];
      const context = baseContext();
      const { counts } = sample(hole, board, context);
      expect(maxKey(counts)).toBe('bet:large');
    });

    test('VALUE + dry + range advantage → betSmall 優先', () => {
      const hole: [Card, Card] = [c('A', 'hearts'), c('K', 'clubs')];
      const board: Card[] = [c('A', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const context = baseContext();
      const { counts } = sample(hole, board, context);
      expect(maxKey(counts)).toBe('bet:small');
    });

    test('VALUE + wet + no advantage → betMedium 優先', () => {
      const hole: [Card, Card] = [c('A', 'spades'), c('A', 'diamonds')];
      const board: Card[] = [c('9', 'hearts'), c('8', 'hearts'), c('7', 'diamonds')];
      const context = baseContext({ isIP: false });
      const { counts } = sample(hole, board, context);
      expect(maxKey(counts)).toBe('bet:medium');
    });

    test('SHOWDOWN + dry → check 優先', () => {
      const hole: [Card, Card] = [c('J', 'clubs'), c('8', 'hearts')];
      const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const context = baseContext();
      const { counts } = sample(hole, board, context);
      expect(maxKey(counts)).toBe('check');
    });

    test('SHOWDOWN + wet → bet(protection) 頻度が上昇する (dryより高い)', () => {
      const dryHole: [Card, Card] = [c('J', 'clubs'), c('8', 'hearts')];
      const dryBoard: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const wetHole: [Card, Card] = [c('9', 'spades'), c('2', 'clubs')];
      const wetBoard: Card[] = [c('9', 'hearts'), c('8', 'hearts'), c('7', 'diamonds')];
      const context = baseContext();

      const dry = sample(dryHole, dryBoard, context);
      const wet = sample(wetHole, wetBoard, context);

      expect(betRate(wet.counts, 400)).toBeGreaterThan(betRate(dry.counts, 400));
    });

    test('BLUFF + フロップ + ナッツフラッシュブロッカーあり → bet頻度 ≈ 25%', () => {
      const hole: [Card, Card] = [c('A', 'hearts'), c('4', 'clubs')];
      const board: Card[] = [c('K', 'hearts'), c('7', 'hearts'), c('2', 'spades')];
      const context = baseContext({ isIP: true });
      const { counts } = sample(hole, board, context, 1000);
      const rate = betRate(counts, 1000);
      expect(rate).toBeGreaterThan(0.10);
      expect(rate).toBeLessThan(0.42);
    });

    test('BLUFF + リバー + ブロッカーなし → bet頻度 ≈ 5% (フロップより低い)', () => {
      const hole: [Card, Card] = [c('8', 'hearts'), c('4', 'clubs')];
      const board: Card[] = [
        c('K', 'diamonds'), c('7', 'clubs'), c('2', 'spades'), c('9', 'hearts'), c('J', 'diamonds'),
      ];
      const context = baseContext({ isIP: true, street: 'river' });
      const { counts } = sample(hole, board, context, 1000);
      const rate = betRate(counts, 1000);
      expect(rate).toBeLessThan(0.22);
    });

    test('BLUFF: range disadvantage (低multiplier) → bet頻度が比例して下がる (ズレB確認)', () => {
      const advHole: [Card, Card] = [c('A', 'hearts'), c('4', 'clubs')];
      const advBoard: Card[] = [c('K', 'hearts'), c('7', 'hearts'), c('2', 'spades')];
      const disadvHole: [Card, Card] = [c('4', 'hearts'), c('3', 'clubs')];
      const disadvBoard: Card[] = [c('9', 'hearts'), c('8', 'hearts'), c('7', 'diamonds')];
      const context = baseContext({ isIP: true });

      const adv = sample(advHole, advBoard, context);
      const disadv = sample(disadvHole, disadvBoard, context);

      expect(betRate(adv.counts, 400)).toBeGreaterThan(betRate(disadv.counts, 400));
    });
  });

  describe('ディフェンダー', () => {
    test('NUTTED vs small bet → call+raise ≈ 100% (fold ≈ 0%)', () => {
      const hole: [Card, Card] = [c('2', 'hearts'), c('2', 'diamonds')];
      const board: Card[] = [c('2', 'clubs'), c('2', 'spades'), c('A', 'hearts')];
      const context = baseContext({ facingBet: 3, facingBetSizeBucket: 'small', pot: 10 });
      const { counts } = sample(hole, board, context);
      expect(counts['fold'] ?? 0).toBe(0);
    });

    test('SHOWDOWN vs small bet → continue ≈ 85% (MDF ≈ 75% 準拠)', () => {
      const hole: [Card, Card] = [c('J', 'clubs'), c('8', 'hearts')];
      const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const context = baseContext({ facingBet: 3, facingBetSizeBucket: 'small', pot: 10 });
      const { counts } = sample(hole, board, context, 1000);
      const continueRate = ((counts['call'] ?? 0) + (counts['raise'] ?? 0)) / 1000;
      expect(continueRate).toBeGreaterThan(0.75);
      expect(continueRate).toBeLessThan(0.95);
    });

    test('SHOWDOWN vs large bet → continue ≈ 55% (MDF ≈ 50% 準拠)', () => {
      const hole: [Card, Card] = [c('J', 'clubs'), c('8', 'hearts')];
      const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const context = baseContext({ facingBet: 10, facingBetSizeBucket: 'large', pot: 10 });
      const { counts } = sample(hole, board, context, 1000);
      const continueRate = ((counts['call'] ?? 0) + (counts['raise'] ?? 0)) / 1000;
      expect(continueRate).toBeGreaterThan(0.45);
      expect(continueRate).toBeLessThan(0.65);
    });

    test('BLUFF vs medium bet → fold ≈ 90%', () => {
      const hole: [Card, Card] = [c('A', 'hearts'), c('4', 'clubs')];
      const board: Card[] = [c('K', 'hearts'), c('7', 'hearts'), c('2', 'spades')];
      const context = baseContext({ facingBet: 6, facingBetSizeBucket: 'medium', pot: 10 });
      const { counts } = sample(hole, board, context, 1000);
      const foldRate = (counts['fold'] ?? 0) / 1000;
      expect(foldRate).toBeGreaterThan(0.8);
      expect(foldRate).toBeLessThan(1.0);
    });

    test('ズレA確認: 同カテゴリ(SHOWDOWN)でsmall < large でfold率が増加する', () => {
      const hole: [Card, Card] = [c('J', 'clubs'), c('8', 'hearts')];
      const board: Card[] = [c('J', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const smallCtx = baseContext({ facingBet: 3, facingBetSizeBucket: 'small', pot: 10 });
      const largeCtx = baseContext({ facingBet: 10, facingBetSizeBucket: 'large', pot: 10 });

      const small = sample(hole, board, smallCtx);
      const large = sample(hole, board, largeCtx);

      expect((small.counts['fold'] ?? 0) / 400).toBeLessThan((large.counts['fold'] ?? 0) / 400);
    });
  });

  describe('ストリートポラライゼーション', () => {
    test('ターン → betSmall 減, betLarge 増 (フロップ比較)', () => {
      // ストリート補正は betSmall -5pt / betLarge +5pt の小さな固定シフトのため、
      // 統計ノイズの影響を抑えるためサンプル数を増やし、許容誤差を設けて比較する。
      const hole: [Card, Card] = [c('A', 'hearts'), c('K', 'clubs')];
      const board: Card[] = [c('A', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const n = 3000;
      const tolerance = n * 0.03; // 統計ノイズの許容マージン
      const flop = sample(hole, board, baseContext({ street: 'flop' }), n);
      const turn = sample(hole, board, baseContext({ street: 'turn' }), n);

      expect((turn.counts['bet:small'] ?? 0)).toBeLessThanOrEqual((flop.counts['bet:small'] ?? 0) + tolerance);
      expect((turn.counts['bet:large'] ?? 0)).toBeGreaterThanOrEqual((flop.counts['bet:large'] ?? 0) - tolerance);
    });

    test('リバー → betSmallが常に0になる', () => {
      const hole: [Card, Card] = [c('A', 'hearts'), c('K', 'clubs')];
      const board: Card[] = [c('A', 'diamonds'), c('7', 'clubs'), c('2', 'spades')];
      const { counts } = sample(hole, board, baseContext({ street: 'river' }));
      expect(counts['bet:small'] ?? 0).toBe(0);
    });
  });

  describe('リバーのドロー再分類 (課題2修正確認)', () => {
    const hole: [Card, Card] = [c('8', 'spades'), c('9', 'spades')];
    const flopBoard: Card[] = [c('6', 'spades'), c('7', 'spades'), c('2', 'diamonds')];
    const riverBoard: Card[] = [
      c('6', 'spades'), c('7', 'spades'), c('2', 'diamonds'), c('K', 'diamonds'), c('J', 'clubs'),
    ];

    test('リバーで未完成のフラッシュドロー → draw=none → BLUFFに分類される', () => {
      const handResult = handEvaluator.evaluate(hole, riverBoard);
      expect(handResult.rankValue).toBe(-1); // メイドハンドなし (フラッシュ未完成)
      const decision = decidePostflopAction(hole, riverBoard, handResult, baseContext({ street: 'river' }));
      expect(decision.drawType).toBe('none');
      expect(decision.category).toBe('BLUFF');
    });

    test('フロップ/ターンでは同じカード構成でも draw が検出される (回帰確認)', () => {
      const handResult = handEvaluator.evaluate(hole, flopBoard);
      expect(handResult.rankValue).toBe(-1);
      const flopDecision = decidePostflopAction(hole, flopBoard, handResult, baseContext({ street: 'flop' }));
      expect(flopDecision.drawType).not.toBe('none'); // フラッシュ+OESDのコンボドローとして検出される
      expect(flopDecision.category).toBe('SEMI_BLUFF');

      const turnDecision = decidePostflopAction(hole, flopBoard, handResult, baseContext({ street: 'turn' }));
      expect(turnDecision.drawType).not.toBe('none');
      expect(turnDecision.category).toBe('SEMI_BLUFF');
    });
  });

  describe('Fix B: 幾何学的betAmount確認', () => {
    function findFirstBet(
      hole: [Card, Card],
      board: Card[],
      context: PostflopContext,
      maxTries = 100,
    ): PostflopDecision {
      const handResult = handEvaluator.evaluate(hole, board);
      for (let i = 0; i < maxTries; i++) {
        const d = decidePostflopAction(hole, board, handResult, context);
        if (d.action === 'bet') return d;
      }
      throw new Error('No bet decision found within maxTries');
    }

    test('SPR=6 ターン: betAmount が effectiveStack を超えない', () => {
      const hole: [Card, Card] = [c('2', 'hearts'), c('2', 'diamonds')];
      const board: Card[] = [c('2', 'clubs'), c('2', 'spades'), c('A', 'hearts')];
      const context = baseContext({ spr: 6, street: 'turn', pot: 10, effectiveStack: 10 });
      const decision = findFirstBet(hole, board, context);
      expect(decision.betAmount).toBeLessThanOrEqual(10);
    });

    test('SPR=3 リバー: betAmount = min(3×pot, effectiveStack)', () => {
      const hole: [Card, Card] = [c('2', 'hearts'), c('2', 'diamonds')];
      const board: Card[] = [c('2', 'clubs'), c('2', 'spades'), c('A', 'hearts')];
      const context = baseContext({ spr: 3, street: 'river', pot: 10, effectiveStack: 100 });
      const decision = findFirstBet(hole, board, context);
      expect(decision.betAmount).toBeCloseTo(30, 0);
    });

    test('SPR=1 リバー: betAmount = effectiveStack (オールイン)', () => {
      const hole: [Card, Card] = [c('2', 'hearts'), c('2', 'diamonds')];
      const board: Card[] = [c('2', 'clubs'), c('2', 'spades'), c('A', 'hearts')];
      const context = baseContext({ spr: 1, street: 'river', pot: 10, effectiveStack: 10 });
      const decision = findFirstBet(hole, board, context);
      expect(decision.betAmount).toBeCloseTo(10, 0);
    });
  });
});
