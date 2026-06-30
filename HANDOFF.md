# HANDOFF.md — セッション引き継ぎ文書

> **ルール**:
> - **Chat→Code**: ChatがこのファイルにNext Stepsを記載 → Codeが冒頭で必ず読む
> - **Code→Chat**: Codeがセッション終了時に「現在地」と「未解決事項」を更新

---

## 🔄 現在地

**フェーズ**: Phase 3D — サーバー統合 **完了** → **Phase 3E: フロントエンド統合**
**ステータス**: 全217テストPASS（3回連続実行で安定確認）。カバレッジ全体86.95%。
　　　　　　　Socket.IOによる人間 vs GTO AI のゲームがエンドツーエンドで動作する状態。
**最終更新**: Claude Code (2026-06-29)

---

## ✅ Phase 3D 完了内容

### 着手前に発見・解消した課題（重要）

HANDOFF.mdが事前に示した「ギャップ1・2」に加え、`GtoAiPlayer.ts`を直接確認したところ
**追加で4件の不整合**が見つかった。全て解消済み。

1. **ギャップ1の根本原因**: `preflopAggressorId`/`onAggression`コールバックが
   HANDOFF.md/SPEC-phase3d.md双方で「実装済み」とされていたが、実際は未実装だった。
   `BettingRoundConfig.onAggression`コールバックを新設し、`applyRaise()`/`applyAllIn()`
   （レイズ相当の場合のみ）から呼び出すよう実装。`GameEngine`に`preflopAggressorId`/
   `preflopRaiseCount`を追加し、`playHand()`でリセット・`runBettingRound()`で配線した。

2. **`GtoAiPlayer`の実シグネチャがSPEC想定と異なっていた**:
   - `decidePostflopAction(communityCards, context)`は**2引数**（holeCardsは別途`setHoleCards()`）
   - `isPFA`/`isIP`は元々`GtoAiConfig`（コンストラクタ固定値）にあったが、ハンドごとに
     変わる値なので設計ミスだった。`decidePostflopAction()`の`context`に必須フィールドとして
     移動し、呼び出し側が毎回算出して渡す方式にした。
   - `position`もディーラーボタン移動で変わるため`setPosition()`を新設し、
     `AIGameEngine.broadcastSnapshot('preflop')`で毎ハンド更新する。

3. **`GameConfig.maxPlayers`型のバグ**: `2|6|8|9`のみで3,4,5,7が抜けていた
   （Phase 3Bからの既存バグ）。`GameTable`は2-9人全て対応済みなので型を拡張した。

4. **`GameEngine.handleAllFolded()`が`broadcastHandResult()`を呼んでいなかった**
   （Phase 3Bからの既存バグ）。`runShowdown()`は呼ぶがフォールド決着パスは呼んでいなかった。
   Phase 3Bのテストではこのコールバックが空no-opだったため発覚しなかったが、
   Phase 3DでSocket.IOイベント送信に使うようになり、integration testの
   「hand-result受信」が無限にタイムアウトしたことで発見した。`async`化して修正済み。

詳細はPROGRESS.mdの「Phase 3D: サーバー統合 — 完了」セクション参照。

### 実装ファイル

```
backend/src/game/engine/AIGameEngine.ts   ← GameEngineの具体実装
backend/src/server/GameRoom.ts
backend/src/server/GameManager.ts          ← シングルトン (resetForTesting()追加)
backend/src/server/socketHandlers.ts
backend/src/routes/gameRoutes.ts
backend/src/app.ts                          ← gameRoutes登録
backend/src/server.ts                       ← Socket.IOハンドラ登録
```

### テストファイル

```
backend/src/game/__tests__/engine/AIGameEngine.test.ts  ← 新規 (3テスト、タイムアウト自動フォールド含む)
backend/src/__tests__/server/GameRoom.test.ts            ← 新規 (8テスト)
backend/src/__tests__/server/integration.test.ts          ← 新規 (3テスト、実サーバー+socket.io-client)
backend/src/game/__tests__/engine/BettingRound.test.ts    ← onAggressionテスト5件追加
backend/src/game/__tests__/engine/GameEngine.test.ts      ← preflopAggressorId/RaiseCountテスト4件追加
backend/src/game/__tests__/ai/GtoAiPlayer.test.ts         ← シグネチャ変更に伴い更新+setPosition()テスト追加
```

`jest.config.js`の`testMatch`に`**/src/__tests__/**/*.test.ts`を追加（`src/game/__tests__/`以外も対象に）。
`socket.io-client`をdevDependencyに追加。

### 全体テスト結果

全217テストPASS（3回連続実行で安定）。カバレッジ: 全体86.95% (Stmts) / 89.12% (Lines)。
`npx tsc --noEmit` エラーなし。

---

## ⚠️ Phase 3D既知の未対応事項（次フェーズへの引き継ぎ）

1. **`gameRoutes.ts`（REST API）のテストカバレッジ0%**: supertest等の追加インストールが
   必要なため見送った。ロジックは単純（UUID発行とルーム状態参照のみ）なので実害は低い。
2. **`AIGameEngine.ts`のカバレッジ58%程度**: `isPlayerIP()`、`determinePreflopScenario()`の
   vs3Bet/vs4Bet分岐、`getCurrentPot()`等、複雑なマルチストリート・マルチレイズシナリオを
   経由しないと到達しないコードパスが多く、今回は基本的な往復・タイムアウトのみ検証した。
3. **`isPlayerIP()`はHU専用の簡易実装**（2人以外は常にfalseを返す）。3人以上のテーブルで
   ポジション based のIP/OOP判定が必要になった場合は拡張が必要。
4. **REST API `/api/game/start`は実質的にgameIdの予約のみ**で、実際のルーム作成は
   クライアントがSocket.IOで`join-game`した時点（`socketHandlers.ts`）で行われる。
   そのため`tableSize`をREST経由で指定しても、実際のルーム作成時には反映されない
   設計上の制約がある（SPEC-phase3d.md自身がこの制約を認識した上での設計）。
   Phase 3Eでクライアントがゲーム設定（人数等）を選べるUIを作る場合、この制約を
   解消する必要があるかもしれない。

---

## 📋 次のセッションでやること (Code向け: Phase 3E)

### 最初にやること

1. `PROGRESS.md` と `HANDOFF.md` (このファイル) を読む
2. `SPEC-phase3e.md` が存在するか確認する（**現時点では存在未確認**。なければユーザーに確認）
3. SPECの指示に従って実装する

### Phase 3E着手前に検討すべき事項

- フロントエンドは現状、認証機能のみ実装済み（ログイン/登録/ホーム画面）。
  ゲームテーブルUI・カード表示・アクションボタン等はゼロから実装が必要。
- Socket.IOクライアント側のイベント名は`backend/src/game/types/game.types.ts`の
  `ServerToClientEvents`/`ClientToServerEvents`を参照すること（実装と完全に一致しているか
  必ず確認 — 過去のセッションでSPEC記載と実装の乖離が頻発しているため）。
- `GameSnapshot`型（`game.types.ts`）がクライアントに送られる`game-state`イベントの
  ペイロード形状。`myHoleCards`が自分のホールカードのみを含む設計。

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
| テスト | jest + ts-jest | jest.config.js設定済み（Phase 3DでtestMatch拡張） |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
| アクション待機 | `requestAction()` 抽象メソッド | Socket.IO/AI/テストで実装を差し替え可能 |
| GTO AI 精度方針 | MVP は heuristic (~65% HU 精度) | MVP 後に CFR 事前計算で精度向上予定 |
| BettingRound 順序 | 座席インデックスベースで修正済み | 6-max AI 実装で即壊れるため |
| Phase 3C betAmount計算 | サイズバケットに関わらず単一の幾何学的フラクションを使用 (Fix B) | ストリートを跨いだスタック投入の一貫性を確保 |
| プリフロップAIのシナリオ判定 | ベットサイズから推測せず、呼び出し側(AIGameEngine)が`preflopRaiseCount`から判定 | サイジング規約への依存を避け、堅牢性を優先 |
| isPFA/isIP/position | GtoAiConfigの固定値ではなく、毎ハンド呼び出し側が算出して渡す | ハンドごとに変わる値のため (ポジション移動・誰がレイズしたか) |
| 進行中ポットの取得 | `GameEngine.currentBettingRound`を公開し`getCollectedAmount()`で算出 | potManagerはラウンド完了後にしか更新されないため |
| GameManagerシングルトン | `resetForTesting()`を追加 | テスト間で状態を分離するため |
| MVP人数構成 | 1人間 + 最大5AI (tableSize 2-6) | SPEC-phase3d.md準拠 |

---

## 📁 ファイル状態

### 既存・完了済み（変更なし）
- `backend/src/routes/auth-routes.ts` / `middleware/auth-middleware.ts` / `controllers/auth-controller.ts`
- `backend/src/services/memory-storage.ts`
- `backend/src/game/core/*.ts` (5ファイル)
- `backend/src/game/ai/postflop/*.ts` (7ファイル)

### Phase 3Dで更新したファイル
- `backend/src/game/engine/BettingRound.ts` — `onAggression`コールバック追加
- `backend/src/game/engine/GameEngine.ts` — `preflopAggressorId`/`preflopRaiseCount`/
  `currentBettingRound`追加、`handleAllFolded()`を`async`化しバグ修正
- `backend/src/game/ai/GtoAiPlayer.ts` — `setPosition()`追加、`GtoAiConfig`から`isPFA`削除、
  `decidePostflopAction()`のcontext型に`isPFA`/`isIP`追加
- `backend/src/game/types/game.types.ts` — Phase 3D型追加、`GameConfig.maxPlayers`型拡張
- `backend/src/app.ts` / `server.ts` — ルート・ハンドラ登録
- `backend/jest.config.js` — testMatch拡張
- `backend/package.json` — socket.io-client追加

### Phase 3Dで新規作成したファイル
```
backend/src/game/engine/AIGameEngine.ts
backend/src/server/GameRoom.ts
backend/src/server/GameManager.ts
backend/src/server/socketHandlers.ts
backend/src/routes/gameRoutes.ts
backend/src/game/__tests__/engine/AIGameEngine.test.ts
backend/src/__tests__/server/GameRoom.test.ts
backend/src/__tests__/server/integration.test.ts
```

### Phase 3Eで実装予定
- `SPEC-phase3e.md` 参照（存在未確認、次セッションで確認すること）
- フロントエンドのゲームテーブルUI・Socket.IOクライアント連携

---

## ⚠️ 未解決事項

上記「Phase 3D既知の未対応事項」4点を参照。

---

## 🐛 既知の問題

| 問題 | 状態 |
|---|---|
| pokersolver が Royal Flush を返さない | 対応済み |
| BettingRound のアクション順序が座席順依存 | 対応済み |
| フルハウス NUTTED 分岐が到達不能 | 対応不要と判断・コメント追加済み |
| リバーで SEMI_BLUFF に誤分類される | 対応済み |
| GtoAiPlayer プリフロップ未実装 | 対応済み |
| preflopAggressorId/onAggressionが未実装だった | 対応済み (Phase 3D) |
| GameConfig.maxPlayers型が2,6,8,9のみだった | 対応済み (Phase 3D) |
| handleAllFolded()がbroadcastHandResult()を呼んでいなかった | 対応済み (Phase 3D) |
| gameRoutes.tsのテストカバレッジ0% | 未対応 (実害低、上記参照) |
| AIGameEngine.tsのカバレッジが部分的 | 未対応 (上記参照) |

---

## 📖 参照すべきドキュメント

- `SPEC-phase3e.md` — Phase 3E仕様（存在未確認、次セッションで確認）
- `SPEC-phase3d.md` — Phase 3D仕様（完了済み、参照用。一部記載と実装に乖離があったため
  HANDOFF.mdの記載を優先すること）
- `backend/src/game/types/game.types.ts` — 全型定義（Phase 3A〜3D分）

---

## 🔚 Codeセッション終了時のチェックリスト

**Phase 3D実装セッション（完了）:**
- [x] `npx tsc --noEmit` エラーなし
- [x] `npm test` 全テスト PASS（217件、3回連続実行で安定）
- [x] Socket.IO 統合テストで join → action-required → player-action → hand-result の一往復が確認できる
- [x] タイムアウト時に自動フォールドが動作する（AIGameEngine.test.tsで高速に検証）
- [x] PROGRESS.md を更新した
- [x] HANDOFF.md を更新した（次フェーズ Phase 3E の着手内容を記載）
