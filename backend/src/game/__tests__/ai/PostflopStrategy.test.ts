import {
  applySPRModifier, applyPositionModifier, applyStreetModifier,
  applyRangeMultiplier, normalizeFrequencies, wetnessToKey,
  AGGRESSOR_TABLE, DEFENDER_TABLE,
} from '../../ai/postflop/PostflopStrategy';
import { AggressorFrequencies } from '../../types/game.types';

describe('Fix A: applySPRModifier カテゴリ別確認', () => {
  test('SEMI_BLUFF + 高SPR → betMedium が増加、check が減少', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 10, betMedium: 30, betLarge: 30 };
    const result = applySPRModifier(freq, 'SEMI_BLUFF', 15);
    expect(result.betMedium).toBeGreaterThan(freq.betMedium);
    expect(result.check).toBeLessThan(freq.check);
  });

  test('SHOWDOWN + 高SPR → check が増加、bet が減少', () => {
    const freq: AggressorFrequencies = { check: 50, betSmall: 25, betMedium: 15, betLarge: 10 };
    const result = applySPRModifier(freq, 'SHOWDOWN', 15);
    expect(result.check).toBeGreaterThan(freq.check);
    expect(result.betSmall + result.betMedium).toBeLessThan(freq.betSmall + freq.betMedium);
  });

  test('SEMI_BLUFF + 低SPR → check が微増 (含み益減)', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 10, betMedium: 30, betLarge: 30 };
    const result = applySPRModifier(freq, 'SEMI_BLUFF', 2);
    expect(result.check).toBeGreaterThan(freq.check);
  });

  test('NUTTED + 高SPR → 変化なし (積み上げ段階)', () => {
    const freq: AggressorFrequencies = { check: 5, betSmall: 0, betMedium: 10, betLarge: 85 };
    const result = applySPRModifier(freq, 'NUTTED', 15);
    expect(result).toEqual(freq);
  });

  test('BLUFF + 高SPR → betSmall が微減', () => {
    const freq: AggressorFrequencies = { check: 50, betSmall: 20, betMedium: 20, betLarge: 10 };
    const result = applySPRModifier(freq, 'BLUFF', 15);
    expect(result.betSmall).toBeLessThan(freq.betSmall);
  });

  test('中間SPR (3-10) → 変化なし', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 10, betMedium: 30, betLarge: 30 };
    expect(applySPRModifier(freq, 'VALUE', 5)).toEqual(freq);
    expect(applySPRModifier(freq, 'SEMI_BLUFF', 7)).toEqual(freq);
  });

  test('NUTTED/VALUE + 低SPR → betLarge増加・check減少', () => {
    const freq: AggressorFrequencies = { check: 25, betSmall: 0, betMedium: 10, betLarge: 65 };
    const result = applySPRModifier(freq, 'NUTTED', 2);
    expect(result.betLarge).toBeGreaterThan(freq.betLarge);
    expect(result.check).toBeLessThan(freq.check);
  });
});

describe('applyPositionModifier', () => {
  test('IP → checkが増加', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 10, betMedium: 30, betLarge: 30 };
    const result = applyPositionModifier(freq, true);
    expect(result.check).toBeGreaterThan(freq.check);
  });

  test('OOP → checkが減少、ベットが増加', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 10, betMedium: 30, betLarge: 30 };
    const result = applyPositionModifier(freq, false);
    expect(result.check).toBeLessThan(freq.check);
  });
});

describe('applyStreetModifier', () => {
  test('ターン → betSmall減、betLarge増', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 20, betMedium: 30, betLarge: 20 };
    const result = applyStreetModifier(freq, 'turn');
    expect(result.betSmall).toBeLessThan(freq.betSmall);
    expect(result.betLarge).toBeGreaterThan(freq.betLarge);
  });

  test('リバー → betSmallが0になる', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 20, betMedium: 30, betLarge: 20 };
    const result = applyStreetModifier(freq, 'river');
    expect(result.betSmall).toBe(0);
  });

  test('フロップ → 変化なし', () => {
    const freq: AggressorFrequencies = { check: 30, betSmall: 20, betMedium: 30, betLarge: 20 };
    expect(applyStreetModifier(freq, 'flop')).toEqual(freq);
  });
});

describe('applyRangeMultiplier', () => {
  test('multiplier > 1 でベット頻度が増加する', () => {
    const base: AggressorFrequencies = { check: 30, betSmall: 40, betMedium: 25, betLarge: 5 };
    const result = applyRangeMultiplier(base, 1.2);
    const baseBet = base.betSmall + base.betMedium + base.betLarge;
    const resultBet = result.betSmall + result.betMedium + result.betLarge;
    expect(resultBet).toBeGreaterThan(baseBet);
    expect(result.check).toBeLessThan(base.check);
  });

  test('multiplier < 1 でベット頻度が減少する', () => {
    const base: AggressorFrequencies = { check: 30, betSmall: 40, betMedium: 25, betLarge: 5 };
    const result = applyRangeMultiplier(base, 0.7);
    const baseBet = base.betSmall + base.betMedium + base.betLarge;
    const resultBet = result.betSmall + result.betMedium + result.betLarge;
    expect(resultBet).toBeLessThan(baseBet);
  });
});

describe('normalizeFrequencies', () => {
  test('合計が100になるよう正規化する', () => {
    const result = normalizeFrequencies({ check: 10, betSmall: 10, betMedium: 10, betLarge: 10 });
    const total = result.check + result.betSmall + result.betMedium + result.betLarge;
    expect(total).toBe(100);
  });

  test('合計0の場合はcheck=100を返す', () => {
    const result = normalizeFrequencies({ check: 0, betSmall: 0, betMedium: 0, betLarge: 0 });
    expect(result).toEqual({ check: 100, betSmall: 0, betMedium: 0, betLarge: 0 });
  });
});

describe('wetnessToKey', () => {
  test('0,1 → dry / 2 → semi / 3 → wet', () => {
    expect(wetnessToKey(0)).toBe('dry');
    expect(wetnessToKey(1)).toBe('dry');
    expect(wetnessToKey(2)).toBe('semi');
    expect(wetnessToKey(3)).toBe('wet');
  });
});

describe('AGGRESSOR_TABLE / DEFENDER_TABLE', () => {
  test('AGGRESSOR_TABLEの各カテゴリ・テクスチャで頻度合計が100', () => {
    for (const category of Object.keys(AGGRESSOR_TABLE) as Array<keyof typeof AGGRESSOR_TABLE>) {
      for (const texture of ['dry', 'semi', 'wet'] as const) {
        const freq = AGGRESSOR_TABLE[category][texture];
        const total = freq.check + freq.betSmall + freq.betMedium + freq.betLarge;
        expect(total).toBe(100);
      }
    }
  });

  test('DEFENDER_TABLEの各カテゴリ・サイズで頻度合計が100', () => {
    for (const category of Object.keys(DEFENDER_TABLE) as Array<keyof typeof DEFENDER_TABLE>) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const freq = DEFENDER_TABLE[category][size];
        const total = freq.fold + freq.call + freq.raise;
        expect(total).toBe(100);
      }
    }
  });

  test('ズレA確認: SHOWDOWNはsmall < large でfold率が増加する', () => {
    expect(DEFENDER_TABLE.SHOWDOWN.small.fold).toBeLessThan(DEFENDER_TABLE.SHOWDOWN.large.fold);
  });
});
