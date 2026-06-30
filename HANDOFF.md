# HANDOFF.md — セッション引き継ぎ文書

> **ルール**:
> - **Chat→Code**: ChatがこのファイルにNext Stepsを記載 → Codeが冒頭で必ず読む
> - **Code→Chat**: Codeがセッション終了時に「現在地」と「未解決事項」を更新

---

## 🔄 現在地

**フェーズ**: Phase 3C — AI エンジン (ポストフロップ GTO) **完了** → **Phase 3D: サーバー統合**
**ステータス**: Phase 3C 全タスク完了・全182テストPASS(4回連続実行で安定確認済み)。
　　　　　　　`SPEC-phase3d.md` の存在を確認済み（内容は未読了、次セッションで読むこと）。
**最終更新**: Claude Code (2026-06-29)

---

## ✅ Phase 3C 完了内容

`backend/src/game/ai/postflop/` 配下に7ファイル + `backend/src/game/ai/GtoAiPlayer.ts` を実装:

- `BetSizer.ts` — Fix B 幾何学的サイジング (`f = ((1+2·SPR)^(1/n) - 1) / 2`)
- `DrawDetector.ts` — フラッシュ/ストレートドロー・コンボドロー検出
- `HandClassifier.ts` — 5機能カテゴリ分類 (NUTTED/VALUE/SHOWDOWN/SEMI_BLUFF/BLUFF)
- `BoardAnalyzer.ts` — レンジアドバンテージスコア + `betFreqMultiplier` (Gap 1)
- `BluffCalculator.ts` — alpha計算によるGTO均衡ブラフ頻度 (Gap 2)
- `PostflopStrategy.ts` — AGGRESSOR_TABLE/DEFENDER_TABLE + 各種頻度補正
- `PostflopEngine.ts` — 統合エントリーポイント (`decidePostflopAction`)
- `GtoAiPlayer.ts` — プリフロップ/ポストフロップ統合インターフェース（プリフロップは未実装スタブ）

**重要**: `PostflopStrategy.ts` の `selectBetSize()` と `applySPRModifier()` は、SPEC-phase3c.md
本文(セクション7)の版ではなく、**セクション10Bアドエンダム版を直接実装した**（本文版は一切実装していない）。
本文版を後から探しても存在しないので注意。

テスト: `backend/src/game/__tests__/ai/` に8ファイル（仕様の5ファイル + 自主追加3ファイル: `BetSizer.test.ts`,
`PostflopStrategy.test.ts`, `GtoAiPlayer.test.ts`）。全182テストPASS、`ai/postflop/`カバレッジ95.22%。

`npx tsc --noEmit` エラーなし、`npm test` 全PASS済み（4回連続実行で確認）。

---

## ⚠️ Phase 3C実装中に発見した仕様との不整合（要Chat確認）

詳細はPROGRESS.mdの「実装中に発見した仕様との不整合」セクション参照。サマリー:

1. **フルハウスのNUTTED判定が事実上到達不能**: `HandClassifier.classifyHand()` の rankValue===5
   (フルハウス) で `isBoardPaired===false → NUTTED` という分岐があるが、3〜5枚のコミュニティカード
   + ホール2枚という制約上、フルハウスはボード側に必ず重複ランクを伴う（数学的に証明済み）。
   実害はないが、Chatの設計意図と異なる可能性がある。

2. **「リバー: SEMI_BLUFF は draw=none に再分類される」テスト(section10.5)が未実装**:
   このテストが前提とする「ストリートに応じてドロー判定を無効化する」ロジックが
   `DrawDetector.ts`/`HandClassifier.ts`/`PostflopEngine.ts` のどこにも存在しない
   (spec本文のコードに一切記載がない)。このテストのみ実装を見送った。
   必要であれば `PostflopEngine.decidePostflopAction()` に `context.street==='river'` 時の
   `draw='none'`強制ロジックを追加実装する必要がある。

3. **統計的テストの安定性**: `decidePostflopAction` はRNGを使うため、頻度検証テストは
   N=400〜3000のサンプリング + 許容マージンで実装した（厳密な`toBeCloseTo`は標本誤差で
   頻繁に失敗するため不採用）。

---

## 📋 次のセッションでやること (Code向け: Phase 3D)

### 最初にやること

1. `PROGRESS.md` と `HANDOFF.md` (このファイル) を読む
2. `SPEC-phase3d.md` を読む（**まだ読んでいない**。冒頭だけ確認した内容: MVP構成は
   「1人の人間プレイヤー vs 最大5体のGTO AI」、`GameManager`(Singleton) → `GameRoom` →
   `AIGameEngine`(GameEngineの具体実装) という構成で、人間プレイヤーの`requestAction()`は
   Socket.IOイベント待機、AIプレイヤーは`GtoAiPlayer.decide()`を呼ぶ設計。詳細は未確認）
3. SPEC-phase3d.mdの指示に従って実装する

### ⚠️ Phase 3D着手前に検討すべき事項

- `GtoAiPlayer.decidePreflopAction()` が未実装スタブ（`throw new Error`）のまま残っている。
  Phase 3Dで実際にAIプレイヤーを動かす場合、プリフロップの意思決定も必要になるはずなので、
  `backend/src/game/ai/data/gto-preflop-ranges.ts` 等を使った実装が必要になる可能性が高い。
  SPEC-phase3d.mdにこの実装が含まれているか確認すること。含まれていなければChatに確認。
- 上記「仕様との不整合」2点について、Phase 3D着手前にChatの判断を仰ぐかどうか確認すること
  （実害は今のところないため、急ぎではない）。

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
| BettingRound 順序 | 座席インデックスベースの計算で修正・完了 | 6-max AI 実装で即壊れるため |
| services/ディレクトリ | 全削除ではなく `game-service.ts` のみ削除 | `memory-storage.ts` は認証で使用中 |
| Phase 3C selectBetSize/applySPRModifier | セクション10Bアドエンダム版のみ実装、本文版は実装せず | アドエンダムが本文を上書きする仕様のため |
| Phase 3C betAmount計算 | サイズバケットに関わらず単一の幾何学的フラクションを使用 (Fix B) | 10B-4の意図を汲み、ストリートを跨いだスタック投入の一貫性を確保 |
| GtoAiPlayer プリフロップ | 未実装スタブのまま (`throw Error`) | SPEC-phase3cの範囲外（ポストフロップのみが対象）。Phase 3D以降で実装 |

---

## 📁 ファイル状態

### 既存ファイル（変更なし）
- `backend/src/app.ts` / `routes/` / `middleware/` / `controllers/auth-controller.ts`
- `backend/src/services/memory-storage.ts`
- `backend/src/types/auth-types.ts`, `pokersolver.d.ts`

### Phase 3A〜バグ修正で完了済み（変更しない）
- `backend/src/game/core/*.ts` (5ファイル)
- `backend/src/game/engine/*.ts` (5ファイル、`getPlayersInActionOrder()`含む)
- `backend/src/game/__tests__/*.test.ts`, `__tests__/engine/*.ts` (Phase 3A+3B分)
- `backend/src/server.ts`（最小構成）

### Phase 3Cで作成したファイル
```
backend/src/game/ai/
  GtoAiPlayer.ts
  postflop/
    BetSizer.ts
    DrawDetector.ts
    HandClassifier.ts
    BoardAnalyzer.ts
    BluffCalculator.ts
    PostflopStrategy.ts
    PostflopEngine.ts
backend/src/game/__tests__/ai/
  DrawDetector.test.ts
  HandClassifier.test.ts
  BoardAnalyzer.test.ts
  BluffCalculator.test.ts
  PostflopEngine.test.ts
  BetSizer.test.ts          ← 自主追加
  PostflopStrategy.test.ts  ← 自主追加
  GtoAiPlayer.test.ts       ← 自主追加
```

### Phase 3Cで更新したファイル
- `backend/src/game/types/game.types.ts`（Phase 3C型を末尾に追記。既存部分は無変更）

### Phase 3Dで実装予定
- `SPEC-phase3d.md` 参照（未読了）。`GameManager`/`GameRoom`/`AIGameEngine` 等のサーバー統合層

---

## ⚠️ 未解決事項

1. 上記「Phase 3C実装中に発見した仕様との不整合」2点（フルハウスNUTTED分岐、リバーDraw再分類）
2. `GtoAiPlayer.decidePreflopAction()` の未実装スタブをいつ実装するか（Phase 3DのSPEC内容次第）
3. `backend/src/game/engine/GameTable.ts` の `getUTGPlayer()` / `getFirstPostflopPlayer()` が
   依然未使用（`getPlayersInActionOrder()`に置き換わって以降）。バックグラウンドタスクとして
   削除提案済み(task_2d9a3f39)だが未対応の場合は残っている可能性がある。

---

## 🐛 既知の問題

| 問題 | 状態 | 回避策 |
|---|---|---|
| pokersolver が Royal Flush を返さない | 対応済み | `HandEvaluator.ts` 内で補正 |
| BettingRound のアクション順序が座席順依存 | 対応済み | `getPlayersInActionOrder()` で修正 |
| services/ ディレクトリを全削除できない | 把握済み | `memory-storage.ts` は認証で使用中のため `game-service.ts` のみ削除済み |
| フルハウスのNUTTED分岐が到達不能 | 把握済み・実害なし | 上記「未解決事項」参照 |
| リバーDraw再分類ロジックが未実装 | 把握済み・該当テストのみ未実装 | 上記「未解決事項」参照 |

---

## 📖 参照すべきドキュメント

- `SPEC-phase3d.md` — **Phase 3Dの詳細仕様（次セッションで必読、まだ読んでいない）**
- `SPEC-phase3c.md` — Phase 3C仕様（完了済み、参照用。セクション10Bが最終版）
- `backend/src/game/types/game.types.ts` — 全型定義（Phase 3A+3B+3C分）
- `backend/src/game/ai/data/` — GTOレンジデータ4ファイル（プリフロップ用、Phase 3Cでも未接続）

---

## 🔚 Codeセッション終了時のチェックリスト

**Phase 3C実装セッション（完了）:**
- [x] SPEC-phase3c.md セクション10B の修正を反映している
- [x] ズレA確認: SHOWDOWN が small/large で異なる fold 率を返す
- [x] ズレB確認: betFreqMultiplier=0.7 の時 BLUFF bet頻度も 70% に下がる
- [x] Fix A確認: SEMI_BLUFF + 高SPR で betMedium が増加する
- [x] Fix B確認: SPR=6 フロップで betAmount が ≈67%pot になる
- [x] カバレッジ 85% 以上 (ai/postflop/ 以下) — 95.22%達成
- [x] PROGRESS.md 更新
- [x] HANDOFF.md 更新
