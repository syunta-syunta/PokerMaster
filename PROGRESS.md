# PROGRESS.md — PokerMaster 開発進捗

> **ルール**: Claude Codeセッション終了時に必ず更新する。
> 前のセッションの内容は消さずに、新しいエントリを追記する。

---

## 現在のフェーズ

**Phase 3B: ゲームフロー** (完了)

---

## フェーズ別ステータス

| フェーズ | 内容 | ステータス |
|---|---|---|
| ✅ Phase 1 | インフラ・認証 | 完了 |
| ✅ Phase 2 | 認証UI・ルーティング | 完了 |
| ✅ Phase 3A | コアプリミティブ | 完了 |
| ✅ Phase 3B | ゲームフロー | **完了** |
| ⬜ Phase 3C | AIエンジン | 未着手 |
| ⬜ Phase 3D | サーバー統合 | 未着手 |
| ⬜ Phase 3E | フロントエンド統合 | 未着手 |
| ⬜ Phase 4 | 追加機能 | 未着手 |

---

## Phase 3A 進捗

### 完了タスク
- [x] ファイル構成作成 (`backend/src/game/core`, `types`, `__tests__`)
- [x] `game.types.ts` — 共通型定義
- [x] `Card.ts` — カードユーティリティ
- [x] `Deck.ts` — デッキクラス
- [x] `HandEvaluator.ts` — ハンド評価 (pokersolverラッパー)
- [x] `Action.ts` — アクションファクトリ
- [x] `ActionValidator.ts` — バリデーション
- [x] テスト環境セットアップ (jest + ts-jest)
- [x] `Card.test.ts` (9 tests)
- [x] `Deck.test.ts` (8 tests)
- [x] `HandEvaluator.test.ts` (21 tests)
- [x] `ActionValidator.test.ts` (14 tests)
- [x] `backend/src/types/pokersolver.d.ts` — pokersolver型定義
- [x] GitHub Actions CI設定 (`.github/workflows/ci.yml`)

### テスト結果
- 全52テストPASS
- カバレッジ: 91.6% (目標85%を達成)
  - Card.ts: 100% / Deck.ts: 100% / HandEvaluator.ts: 95.34% / ActionValidator.ts: 93.02% / Action.ts: 63.15%

### 実装上の注意点 (次フェーズへの引き継ぎ)
- **Royal Flush判定**: pokersolverは"Royal Flush"を返さず常に"Straight Flush"として返す。
  `HandEvaluator.evaluate()` 内で `isRoyalFlush()` ヘルパーがベスト5枚を見て A-K-Q-J-T か判定し補正している。
  findWinners() で別途Royal Flush判定が必要な場面があれば同様の補正を入れること。

### ブロッカー
*(なし)*

---

## Phase 3B 進捗

### 完了タスク
- [x] Step0: 旧実装削除 (`src/data/`, `src/engine/`, `src/socket/`, `src/services/game-service.ts`, `src/types/index.ts`)
  - `src/services/memory-storage.ts` は認証で使用中のため削除対象から除外（HANDOFF記載の `rm -rf services/` は実施せず該当ファイルのみ削除）
- [x] Step0: `server.ts` を最小構成に書き直し（Express+CORS、Socket.IO初期化のみ、ゲームハンドラ未接続）
- [x] Step1: `game.types.ts` にPhase 3B型を追記（既存型は無変更）
- [x] Step2: `backend/src/game/engine/` 5ファイル実装
  - `TablePlayer.ts` / `GameTable.ts` / `BettingRound.ts` / `PotManager.ts` / `GameEngine.ts`
- [x] Step3: `backend/src/game/__tests__/engine/` テスト作成
  - `TestGameEngine.ts`（テストヘルパー、`getCommunityCardCount()`を追加実装）
  - `BettingRound.test.ts` (14 tests)
  - `PotManager.test.ts` (7 tests)
  - `GameEngine.test.ts` (7 tests)

### テスト結果
- 全78テストPASS（Phase 3Aの52 + Phase 3Bの26）
- カバレッジ (`src/game/**`, テスト・ai data除外): Stmts 87.81% / Lines 91.16% / Funcs 84.44% / Branch 72.13%
  - 目標85%(Stmts/Lines基準)を達成
  - `GameTable.ts` は62.66%と低め — `getUTGPlayer()` / `getFirstPostflopPlayer()` / `removePlayer()` がGameEngineから未使用のため未テスト（SPEC通り実装済みだが現状呼ばれていないユーティリティ）。Phase 3D以降でマルチプレイヤー対応時に使用見込み

### 実装上の注意点 (次フェーズへの引き継ぎ)
- **BBオプションのテスト**: `BettingRound` のテストでBBプレイヤーの `betThisStreet` を事前にビッグブラインド額に設定しておく必要がある（実際のゲームではブラインド投入後の状態を想定しているため）。これを忘れると `validateCheck` がポストフロップと同じロジックで弾いてしまう。
- **`GameEngine.handleAllFolded()` / テストの `WinnerInfo.handResult`**: フォールドのみで決着した場合、ショーダウンが発生しないため `handResult` は `null as unknown as HandResult` を使っている。型安全性より「ショーダウンなしの勝者」という実態を優先した設計。

### ブロッカー
*(なし)*

---

## セッション履歴

### 2026-06-27 — Phase 3B 実装・完了
- HANDOFF.md Step0に従い旧実装(`src/data/`, `engine/`, `socket/`, `services/game-service.ts`, `types/index.ts`)を削除
- `server.ts` を最小構成に書き直し（Socket.IOゲームハンドラはPhase 3Dで接続予定）
- SPEC-phase3b.md に従い `backend/src/game/engine/` の5ファイルを実装
- `game.types.ts` にPhase 3B用型を追記（Street, PlayerStatus, PositionName, GameConfig, TablePlayer, Pot, PublicPlayerState, GameSnapshot, HandResultEvent, ServerToClientEvents, ClientToServerEvents）
- テスト4ファイル作成、全78テストPASS（カバレッジ87.81%）
- 次セッションは Phase 3C (AIエンジン) へ。HANDOFF.md 参照

### 2026-06-27 — Phase 3A 実装・完了
- SPEC-phase3a.md に従い `backend/src/game/` 配下にコアプリミティブを実装
- pokersolver用の型定義 (`pokersolver.d.ts`) を追加
- jest + ts-jest 環境構築、4テストファイル作成、全52テストPASS (カバレッジ91.6%)
- GitHub Actions CI (`.github/workflows/ci.yml`) を新規作成 — backend (typecheck+test) / frontend (build) の2ジョブ構成
- 既存の `backend/src/data/`, `engine/`, `services/`, `socket/` (Phase別構成と異なる旧実装) とは独立した新規ディレクトリ構成
- 次セッションは Phase 3B (ゲームフロー) へ。HANDOFF.md 参照

---

## 既知の技術的問題

- pokersolver の型定義なし → `declare module` で回避予定
- Express 4.x 必須 (5.x は path-to-regexp 非互換)

---

## GTOデータファイル

| ファイル名 | 説明 | 場所 |
|---|---|---|
| `gto-preflop-ranges.ts` | 6max RFI全5ポジション | `backend/src/game/ai/data/` 配置済み |
| `gto-vs-open-ranges.ts` | vs Open全スポット | 同上 配置済み |
| `gto-vs-3bet-and-8max-ranges.ts` | vs 3Bet + 8max RFI | 同上 配置済み |
| `gto-vs-4bet-and-8max-vs3bet.ts` | vs 4Bet + 8max vs 3Bet | 同上 配置済み |

> Phase 3Bまで未使用 (AIエンジンはPhase 3Cで実装予定)。
> 旧実装(`backend/src/data/`, `engine/`, `socket/`, `services/game-service.ts`)はPhase 3B Step0で削除済み。
> `backend/src/game/ai/data/` のGTOファイルが現在唯一の正式版。
