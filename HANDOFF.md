# HANDOFF.md — セッション引き継ぎ文書

> **ルール**:
> - **Chat→Code**: ChatがこのファイルにNext Stepsを記載 → Codeが冒頭で必ず読む
> - **Code→Chat**: Codeがセッション終了時に「現在地」と「未解決事項」を更新

---

## 🔄 現在地

**フェーズ**: Phase 3B — ゲームフロー → **完了**
**ステータス**: 全タスク完了。Phase 3C (AIエンジン) 着手待ち
**最終更新**: Claude Code (2026-06-27)

---

## ✅ Phase 3B 完了内容

### Step0: 旧実装削除
- 削除: `backend/src/data/`, `backend/src/engine/`, `backend/src/socket/`, `backend/src/services/game-service.ts`, `backend/src/types/index.ts`
- **注意**: `backend/src/services/` ディレクトリ自体は削除していない。`memory-storage.ts`（認証コントローラが依存）が含まれているため、`game-service.ts` のみ個別削除した。HANDOFF.mdの当初案 `rm -rf backend/src/services/` をそのまま実行すると認証機能が壊れるため修正して対応。
- `server.ts` を最小構成に書き直し: Express + CORS、Socket.IO初期化（ハンドラ未接続の空state）、認証ルート接続、port listenのみ。ゲームロジックはPhase 3Dで接続予定。

### Step1〜3: 新規実装
- `game.types.ts` 末尾にPhase 3B型を追記（既存型は無変更）
- `backend/src/game/engine/` — `TablePlayer.ts` / `GameTable.ts` / `BettingRound.ts` / `PotManager.ts` / `GameEngine.ts`
- `backend/src/game/__tests__/engine/` — `TestGameEngine.ts`（ヘルパー）/ `BettingRound.test.ts` / `PotManager.test.ts` / `GameEngine.test.ts`
- 全78テストPASS（Phase 3Aの52 + Phase 3Bの26）、カバレッジ Stmts 87.81% / Lines 91.16%

`npx tsc --noEmit` エラーなし、`npm test` 全PASS済み。

---

## 📋 次のセッションでやること (Code向け: Phase 3C)

### 最初にやること (この順番で)

1. `PROGRESS.md` と `HANDOFF.md` (このファイル) を読む
2. Chatに Phase 3C の SPEC (`SPEC-phase3c.md` 想定) を作成してもらう
3. Phase 3C はおそらく以下を含む (Chat確定待ち):
   - `backend/src/game/ai/` 配下にAI意思決定ロジックを実装
   - `backend/src/game/ai/data/` に既に配置済みのGTOレンジファイル (`gto-preflop-ranges.ts` 等) を使用
   - `GameEngine.requestAction()` を上書きする `AIGameEngine`（またはAI専用の意思決定関数）を作成し、`BettingContext` から `PlayerAction` を生成する
   - ※ `gto-preflop-ranges.ts` の `ActionFrequency` 型（fold/call/raise: 0-100の頻度）はPhase 3Aの `game.types.ts` の型とは別物。混同しないよう注意

### ⚠️ 重要な注意

- `backend/src/game/ai/data/` のGTOファイル4つは配置済みだが、Phase 3Bでは未使用（importされていない）。Phase 3C着手時に実際に接続する。
- `GameEngine` は abstract クラスで `requestAction()` / `broadcastSnapshot()` / `broadcastHandResult()` の3メソッドを要求する。AIプレイヤー用の実装はこれらをAI判断ロジック・no-op (または将来のSocket.IO実装) で埋める想定。

---

## ✅ 確定済み設計判断（累積）

| 事項 | 決定内容 | 理由 |
|---|---|---|
| 実装方針 | `src/game/` 新実装に完全一本化 | テスト有り、BB単位、型設計が整合 |
| 旧実装 | 完全削除済み（Phase 3B Step0で実施） | 技術的負債を引き継がない |
| ゲームタイプ | テキサスホールデム 6-max〜8-max | MVP方針 |
| スタック深さ | 100BB | GTO標準 |
| 数値単位 | 全てBB単位 | GTO AIとの整合のため |
| ハンド評価 | pokersolver ^2.1.4 | インストール済み |
| TypeScript | strict mode | tsconfig.json設定済み |
| Express | 4.x 必須 (4.19.2) | 5.xはpath-to-regexp非互換 |
| Royal Flush補正 | `isRoyalFlush()` で補正済み | pokersolver の仕様上必要 |
| テスト | jest + ts-jest | jest.config.js設定済み |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
| Socket.IOイベント名 | 旧実装の名称を引き継ぐ | フロントエンドと互換性維持（`ServerToClientEvents`/`ClientToServerEvents`として型定義済み、実装はPhase 3D） |
| アクション待機 | `GameEngine.requestAction()` を抽象化 | Socket.IO/AI/テストで実装を差し替え可能にするため |
| BettingRoundのプレイヤー順 | コンストラクタに渡した配列順でアクションが回る | `GameTable.getAllPlayers()` の座席順に依存。ポジション順アクションはGameEngine側でplayers配列の並びを正しく渡す必要がある（現状は座席順=テーブル追加順のままで、厳密なポーカーのアクション順序とは座席配置次第で一致しない点に注意） |
| services/ディレクトリ | 全削除ではなく `game-service.ts` のみ削除 | `memory-storage.ts` は認証機能で使用中 |

---

## 📁 ファイル状態

### 既存ファイル（変更なし）
- `backend/src/app.ts`
- `backend/src/routes/` — 認証ルート
- `backend/src/middleware/` — JWT認証
- `backend/src/controllers/auth-controller.ts`
- `backend/src/services/memory-storage.ts`
- `backend/src/types/auth-types.ts`

### Phase 3Bで書き直したファイル
- `backend/src/server.ts` — 最小構成（Socket.IOハンドラ未接続）

### Phase 3Aで作成済み（変更しない）
- `backend/src/game/types/game.types.ts`（Phase 3Bで追記済み、既存部分は無変更）
- `backend/src/game/core/*.ts` (5ファイル)
- `backend/src/game/__tests__/*.test.ts` (4ファイル)
- `backend/src/types/pokersolver.d.ts`
- `backend/jest.config.js`
- `.github/workflows/ci.yml`

### Phase 3Bで作成したファイル
- `backend/src/game/engine/TablePlayer.ts`
- `backend/src/game/engine/GameTable.ts`
- `backend/src/game/engine/BettingRound.ts`
- `backend/src/game/engine/PotManager.ts`
- `backend/src/game/engine/GameEngine.ts`
- `backend/src/game/__tests__/engine/TestGameEngine.ts`
- `backend/src/game/__tests__/engine/BettingRound.test.ts`
- `backend/src/game/__tests__/engine/PotManager.test.ts`
- `backend/src/game/__tests__/engine/GameEngine.test.ts`

### Phase 3Bで削除したファイル
- `backend/src/data/`（全体）
- `backend/src/engine/`（全体、Phase 3Aの `game/engine/` とは別物だった旧実装）
- `backend/src/socket/`（全体）
- `backend/src/services/game-service.ts`（`services/`ディレクトリ自体は残存）
- `backend/src/types/index.ts`

### Phase 3Cで実装予定
- `backend/src/game/ai/` 配下のAI意思決定ロジック（SPEC-phase3c.md待ち）
- `backend/src/game/ai/data/` のGTOファイルを実際に使用開始

---

## ⚠️ 未解決事項

1. **BettingRoundのアクション順序**: 現状 `BettingRound` は渡された `players` 配列の順番でそのままアクションを回す設計（`getNextActingPlayerId()`）。`GameTable.getAllPlayers()` は座席追加順を返すため、ポジション通りのアクション順（プリフロップはUTGから、ポストフロップはSBから等）を保証するには、`GameEngine.runBettingRound()` 側で正しい順序に並べた配列を渡す必要があるが、現在の実装は座席順をそのまま使っている。3人以上のテストでBTN/SB/BB全員がいる場合に正しい順序になっているかはPhase 3Bのテストでは厳密に検証していない（HU2人ケースのみ確認済み）。Phase 3C/3Dで多人数のAI対戦を実装する際に要確認・要修正の可能性あり。
2. `GameTable.getUTGPlayer()` / `getFirstPostflopPlayer()` が実装済みだが `GameEngine` から未使用（未呼び出し）。本来はこれらを使ってアクション順を決定すべきだったかもしれない。上記1の課題と関連。

---

## 🐛 既知の問題

| 問題 | 回避策 |
|---|---|
| pokersolver に @types がない | `backend/src/types/pokersolver.d.ts` で解決済み |
| pokersolver が Royal Flush を返さない | `HandEvaluator.ts` 内で補正済み |
| BettingRoundのアクション順序が座席順依存 | 上記未解決事項1参照。Phase 3C/3D着手前に確認推奨 |

---

## 📖 参照すべきドキュメント

- `SPEC-phase3b.md` — Phase 3B仕様（完了済み、参照用）
- `SPEC-phase3a.md` — Phase 3A仕様（参照用）
- `backend/src/game/types/game.types.ts` — 全型定義（Phase 3A+3B分）

---

## 🔚 Codeセッション終了時のチェックリスト

- [x] 旧実装ディレクトリが削除されている
- [x] `tsc --noEmit` エラーなし
- [x] `npm test` 全テストPASS（78/78）
- [x] PROGRESS.md を更新した
- [x] このHANDOFF.mdを更新した（現在地・次のアクション・未解決事項）
