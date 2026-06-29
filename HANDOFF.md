# HANDOFF.md — セッション引き継ぎ文書

> **ルール**:
> - **Chat→Code**: ChatがこのファイルにNext Stepsを記載 → Codeが冒頭で必ず読む
> - **Code→Chat**: Codeがセッション終了時に「現在地」と「未解決事項」を更新

---

## 🔄 現在地

**フェーズ**: BettingRound アクション順序バグ修正 **完了** → **Phase 3C は着手不可（SPEC-phase3c.md が見つからない）**
**ステータス**: バグ修正完了・全81テストPASS。Phase 3Cに進もうとしたが `SPEC-phase3c.md` が
　　　　　　　プロジェクト内に存在しないことを確認（`SPEC-phase3a.md`/`SPEC-phase3b.md` のみ存在）。
　　　　　　　**ユーザーに `SPEC-phase3c.md` の提供を依頼してから Phase 3C に着手すること。**
**最終更新**: Claude Code (2026-06-29)

---

## 🚨 バグ修正完了報告（次のセッションは下の「Phase 3C 着手」へ進む前にこれを読むこと）

`GameTable.getPlayersInActionOrder()` を実装したが、**HANDOFF.mdに記載されていたコード例には2つの問題があった**ため、修正して実装した:

1. **HU(2人)のプリフロップオフセットが誤っていた**: 元のコードは `utgOffset = n === 2 ? 1 : 3` だったが、
   これだと回転後の配列でBBが先頭に来てしまい、「BTNが先」というコメント自体の意図と矛盾していた。
   実際のヘッズアップルールはBTN/SBがプリフロップ最初にアクションするため、正しいオフセットは `0`。
   （ポストフロップのオフセット`1`は元のコードのままで正しかった。）
2. **ディーラー脱落時のfallbackが不正確**: 元のコードは `inHand.findIndex(p => p.isDealer)` でディーラーを探し、
   見つからない場合（ポストフロップでBTNがフォールド済みの場合）は座席順のまま返すだけだった。
   座席インデックス(`seatIndex`)を基準にした計算に変更し、ディーラー自身が脱落していても
   正しい相対順序を維持できるようにした。

この修正が正しいことは、新規追加した3テスト（3人プリフロップ/ポストフロップ順序、
HUでディーラー移動後の順序）で検証済み。特に「HUでディーラー移動後」のテストは、
修正前のバグ（座席0が常にディーラーである一回目のハンドだけ偶然正しく動く問題）を
直接検出できる設計にしている。

詳細はPROGRESS.mdの「BettingRound アクション順序バグ修正」セクション参照。

---

## ✅ 完了: BettingRound アクション順序バグ修正

上記「バグ修正完了報告」セクション参照。HANDOFF.mdの当初コード例にあったHU(2人)オフセットの誤り(`1`→`0`)と
ディーラー脱落時fallbackの不正確さを修正し、`GameTable.getPlayersInActionOrder()` / `GameEngine.runBettingRound()` を実装済み。
全81テストPASS、カバレッジStmts 87.75% / Lines 91.38%。

---

## 🚧 Phase 3C 着手不可: SPEC-phase3c.md が見つからない

このHANDOFF.mdには「`SPEC-phase3c.md` (Chat が作成済み、プロジェクト内に存在)」と記載されていたが、
実際にはプロジェクトルートに存在しない。`SPEC-phase3a.md` と `SPEC-phase3b.md` は存在するが、
`SPEC-phase3c.md` だけが見つからない状態（2026-06-29 確認）。

**次のセッションでやること**:
1. ユーザーに `SPEC-phase3c.md` の所在を確認する（別チャットで作成されたが保存/共有されていない可能性、
   または別のディレクトリ/ファイル名で存在する可能性がある）
2. ファイルが提供されたら、その内容に従ってPhase 3Cに着手する
3. 下記の「Phase 3C 着手 (SPEC入手後)」セクションは、HANDOFF.mdに事前に記載されていた
   *予定内容のサマリー* であり、SPEC本文そのものではない。実装の詳細（型定義、各クラスの
   実装内容、テストケース等）はSPEC-phase3c.md本体が必要。

---

## 📋 Phase 3C 着手 (SPEC入手後)

**SPEC**: `SPEC-phase3c.md` (本HANDOFF.md作成時点では「Chat が作成済み」とされていたが、
2026-06-29時点でプロジェクト内に見つからず。上記セクション参照)

### 最初にやること

1. `PROGRESS.md` と `HANDOFF.md` を読む
2. `SPEC-phase3c.md` を読む (セクション10B アドeンダムが最新版 = 優先適用)
3. ファイル構成を作成: `backend/src/game/ai/postflop/`
4. SPEC の順番通りに実装する:

```
Step 1: game.types.ts に Phase 3C 型を追記 (PostflopContext 等)
Step 2: BetSizer.ts        ← Fix B: 幾何学的サイジング
Step 3: DrawDetector.ts    ← ドロー検出
Step 4: HandClassifier.ts  ← 5機能カテゴリ分類
Step 5: BoardAnalyzer.ts   ← レンジアドバンテージ (Gap 1 解決)
Step 6: BluffCalculator.ts ← alpha 計算 (Gap 2 解決)
Step 7: PostflopStrategy.ts ← 戦略テーブル + 修正 applySPRModifier (Fix A)
Step 8: PostflopEngine.ts  ← 統合エントリーポイント
Step 9: GtoAiPlayer.ts     ← プリフロップ + ポストフロップ統合
Step 10: テスト全件作成・PASS 確認
```

### ⚠️ 重要: SPEC-phase3c.md のセクション10B が最新版

SPEC-phase3c.md 末尾の **セクション10B アドeンダム** が、本文中の同名関数より優先される。

具体的に上書きされる関数:
- `selectBetSize()` → 幾何学的サイジングを適用 (BetSizer.ts を使用)
- `applySPRModifier()` → カテゴリ別SPR修正 (Fix A)
- `PostflopEngine.ts` の `betAmount` → `min(fraction × pot, effectiveStack)`
- `applySPRModifier()` の呼び出し → `category` を第2引数に追加

### ⚠️ GTOデータファイルの注意点

`backend/src/game/ai/data/` の4ファイルは配置済みだが Phase 3B では未使用。

```
gto-preflop-ranges.ts       の ActionFrequency = { fold, call, raise: 0-100 の頻度 }
game.types.ts の PlayerAction = { type, playerId, amount, timestamp }
```

この2つは**別物**。混同しないこと。
GtoAiPlayer.ts の実装時に、ActionFrequency の頻度を RNG で PlayerAction に変換する。

---

## ✅ 確定済み設計判断（累積）

| 事項 | 決定内容 | 理由 |
|---|---|---|
| 実装方針 | `src/game/` 新実装に完全一本化 | テスト有り、BB単位、型設計が整合 |
| 旧実装 | 完全削除済み (Phase 3B Step0) | 技術的負債を引き継がない |
| ゲームタイプ | テキサスホールデム 6-max〜8-max | MVP方針 |
| スタック深さ | 100BB | GTO標準 |
| 数値単位 | 全てBB単位 | GTO AIとの整合のため |
| ハンド評価 | pokersolver ^2.1.4 | インストール済み |
| TypeScript | strict mode | tsconfig.json設定済み |
| Express | 4.x 必須 (4.19.2) | 5.xはpath-to-regexp非互換 |
| Royal Flush補正 | `isRoyalFlush()` で補正済み | pokersolver の仕様上必要 |
| テスト | jest + ts-jest | jest.config.js設定済み |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
| Socket.IOイベント名 | 旧実装の名称を引き継ぐ | フロントエンドと互換性維持 |
| アクション待機 | `requestAction()` 抽象メソッド | Socket.IO/AI/テストで実装を差し替え可能 |
| GTO AI 精度方針 | MVP は heuristic (~65% HU 精度) | MVP 後に CFR 事前計算で精度向上予定 |
| マルチウェイ GTO | MVP では対応しない | HU から 6-max への拡張時に対応 |
| BettingRound 順序 | action order 修正を Phase 3C 前に実施・完了 | 6-max AI 実装で即壊れるため。座席インデックスベースの計算に変更し、HUオフセット誤りも修正 |

---

## 📁 ファイル状態

### 既存ファイル (変更しない)
- `backend/src/routes/` / `middleware/` / `controllers/` / `services/memory-storage.ts`
- `backend/src/game/core/*.ts` (5ファイル)
- `backend/src/game/__tests__/*.test.ts` (Phase 3A 4ファイル)

### Phase 3B 完了済み (変更可)
- `backend/src/server.ts` (最小構成)
- `backend/src/game/types/game.types.ts` (3A+3B型定義済み)
- `backend/src/game/engine/` (5ファイル)
- `backend/src/game/__tests__/engine/` (4ファイル)

### BettingRound バグ修正で変更したファイル (完了)
- `backend/src/game/engine/GameTable.ts` → `getPlayersInActionOrder()` 追加（座席インデックスベース）
- `backend/src/game/engine/GameEngine.ts` → `runBettingRound()` 修正
- `backend/src/game/__tests__/engine/TestGameEngine.ts` → `actionOrderLog` / `getActionOrderForStreet()` 追加
- `backend/src/game/__tests__/engine/GameEngine.test.ts` → アクション順序テスト3件追加

### Phase 3C で新規作成するファイル
```
backend/src/game/ai/postflop/
  BetSizer.ts
  DrawDetector.ts
  HandClassifier.ts
  BoardAnalyzer.ts
  BluffCalculator.ts
  PostflopStrategy.ts
  PostflopEngine.ts
backend/src/game/ai/
  GtoAiPlayer.ts
backend/src/game/__tests__/ai/
  DrawDetector.test.ts
  HandClassifier.test.ts
  BoardAnalyzer.test.ts
  BluffCalculator.test.ts
  PostflopEngine.test.ts
```

---

## 🐛 既知の問題

| 問題 | 状態 | 回避策 |
|---|---|---|
| pokersolver が Royal Flush を返さない | 対応済み | `HandEvaluator.ts` 内で補正 |
| BettingRound のアクション順序が座席順依存 | **対応済み** | `getPlayersInActionOrder()` で修正 |
| services/ ディレクトリを全削除できない | 把握済み | `memory-storage.ts` は認証で使用中のため `game-service.ts` のみ削除済み |
| `SPEC-phase3c.md` がプロジェクト内に存在しない | **未対応・要確認** | ユーザーに所在確認。Phase 3C着手不可 |

---

## 📖 参照すべきドキュメント

- `SPEC-phase3c.md` — **Phase 3C の詳細仕様 (セクション10B アドeンダムが最新) — ただし現在プロジェクト内に存在しない。要確認**
- `SPEC-phase3b.md` — Phase 3B 仕様 (完了済み、参照用)
- `backend/src/game/types/game.types.ts` — 全型定義 (Phase 3A+3B分)
- `backend/src/game/ai/data/` — GTO レンジデータ 4ファイル (Phase 3C で使用予定)

---

## 🔚 Codeセッション終了時のチェックリスト

**BettingRound バグ修正セッション (完了):**
- [x] `getPlayersInActionOrder()` 実装・テスト追加
- [x] `npm test` 全件 PASS (81件)
- [x] `tsc --noEmit` エラーなし
- [x] PROGRESS.md 更新
- [x] HANDOFF.md 更新

**Phase 3C 実装セッション (SPEC-phase3c.md入手後に着手):**
- [ ] SPEC-phase3c.md セクション10B の修正を反映している
- [ ] ズレA確認: SHOWDOWN が small/large で異なる fold 率を返す
- [ ] ズレB確認: betFreqMultiplier=0.7 の時 BLUFF bet頻度も 70% に下がる
- [ ] Fix A確認: SEMI_BLUFF + 高SPR で betMedium が増加する
- [ ] Fix B確認: SPR=6 フロップで betAmount が ≈67%pot になる
- [ ] カバレッジ 85% 以上 (ai/postflop/ 以下)
- [ ] PROGRESS.md 更新
- [ ] HANDOFF.md 更新
