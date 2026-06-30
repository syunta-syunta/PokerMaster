import { geometricBetFraction, geometricFractionToBucket, getGeometricBetSize, getStreetsRemaining } from '../../ai/postflop/BetSizer';
import { selectBetSize } from '../../ai/postflop/PostflopStrategy';
import { BoardAdvantageResult } from '../../types/game.types';

function advantage(overrides: Partial<BoardAdvantageResult> = {}): BoardAdvantageResult {
  return { score: 5, hasNutAdvantage: false, betFreqMultiplier: 1.0, wetness: 1, ...overrides };
}

describe('BetSizer', () => {
  test('SPR=6, フロップ(3ストリート) → f≈67.5% → medium', () => {
    const f = geometricBetFraction(6, 3);
    expect(f).toBeCloseTo(0.676, 2);
    expect(geometricFractionToBucket(f)).toBe('medium');
  });

  test('SPR=6, ターン(2ストリート) → f≈130% → large (ジャム)', () => {
    const f = geometricBetFraction(6, 2);
    expect(f).toBeCloseTo(1.303, 2);
    expect(geometricFractionToBucket(f)).toBe('large');
  });

  test('SPR=3, フロップ(3ストリート) → f≈45.6% → medium', () => {
    const f = geometricBetFraction(3, 3);
    expect(f).toBeCloseTo(0.4565, 3);
    expect(geometricFractionToBucket(f)).toBe('medium');
  });

  test('SPR=9, フロップ(3ストリート) → f≈83.4% → medium (境界値)', () => {
    const f = geometricBetFraction(9, 3);
    expect(f).toBeCloseTo(0.8342, 3);
    expect(geometricFractionToBucket(f)).toBe('medium');
  });

  test('getGeometricBetSize: bucketとfractionをまとめて返す', () => {
    const result = getGeometricBetSize(6, 3);
    expect(result.bucket).toBe('medium');
    expect(result.fraction).toBeCloseTo(0.676, 2);
  });

  test('getStreetsRemaining: flop=3, turn=2, river=1', () => {
    expect(getStreetsRemaining('flop')).toBe(3);
    expect(getStreetsRemaining('turn')).toBe(2);
    expect(getStreetsRemaining('river')).toBe(1);
  });

  test('streetsRemaining<=0 や spr<=0 では 1.0 を返す', () => {
    expect(geometricBetFraction(0, 3)).toBe(1.0);
    expect(geometricBetFraction(5, 0)).toBe(1.0);
  });

  describe('selectBetSize: カテゴリ別の幾何学的サイジング上限クリップ', () => {
    test('SEMI_BLUFF + large(高SPR) → medium に上限クリップ', () => {
      // SPR=9, flop(3) → geometric fraction ≈0.834 → bucket='medium' なのでlargeにならない通常ケースとは別に
      // ターン(streets=1)のような極端な高SPRでlargeになるケースを検証する
      const result = selectBetSize('SEMI_BLUFF', advantage(), 20, 1); // streetsRemaining=1, SPR=20 → fraction=20 → large
      expect(result.bucket).toBe('medium');
      expect(result.fraction).toBe(0.67);
    });

    test('VALUE + no nut advantage + large → medium に上限クリップ', () => {
      const result = selectBetSize('VALUE', advantage({ hasNutAdvantage: false }), 20, 1);
      expect(result.bucket).toBe('medium');
      expect(result.fraction).toBe(0.67);
    });

    test('NUTTED + nut advantage → large/overbetが許可される (クリップされない)', () => {
      const result = selectBetSize('NUTTED', advantage({ hasNutAdvantage: true }), 20, 1);
      expect(result.bucket).toBe('large');
      expect(result.fraction).toBeGreaterThan(1.0); // オーバーベット許可
    });

    test('SHOWDOWN / BLUFF は常にsmall固定', () => {
      expect(selectBetSize('SHOWDOWN', advantage(), 6, 3)).toEqual({ bucket: 'small', fraction: 0.33 });
      expect(selectBetSize('BLUFF', advantage(), 6, 3)).toEqual({ bucket: 'small', fraction: 0.33 });
    });
  });
});
