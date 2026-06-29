# PROGRESS.md — PokerMaster 開発進捗

> **ルール**: Claude Codeセッション終了時に必ず更新する。

---

## 現在のフェーズ

**BettingRound アクション順序バグ修正 完了** → **Phase 3C: AI エンジン (着手前に確認事項あり、下部参照)**

---

## フェーズ別ステータス

| フェーズ | 内容 | ステータス |
|---|---|---|
| ✅ Phase 1 | インフラ・認証 | 完了 |
| ✅ Phase 2 | 認証 UI・ルーティング | 完了 |
| ✅ Phase 3A | コアプリミティブ | 完了 (52 tests, 91.6% coverage) |
| ✅ Phase 3B | ゲームフロー | 完了 (78 tests, 87.81% coverage) PR マージ済み |
| ✅ バグ修正 | BettingRound アクション順序 | **完了** (81 tests, 87.75% coverage) |
| ⬜ Phase 3C | AI エンジン (ポストフロップ GTO) | **SPEC-phase3c.md が見つからず着手不可。要確認** |
| ⬜ Phase 3D | サーバー統合 | 未着手 |
| ⬜ Phase 3E | フロントエンド統合 | 未着手 |
| ⬜ Phase 4 | 追加機能 | 未着手 |

---

## Phase 3A 完了済みタスク

- [x] game.types.ts / Card.ts / Deck.ts / HandEvaluator.ts / Action.ts / ActionValidator.ts
- [x] pokersolver.d.ts (型定義)
- [x] Jest + ts-jest 環境
- [x] 52 テスト全 PASS / カバレッジ 91.6%
- [x] GitHub Actions CI

**実装上の注意**: pokersolver は Royal Flush を返さない → `HandEvaluator.ts` 内の `isRoyalFlush()` で補正済み。

---

## Phase 3B 完了済みタスク

- [x] 旧実装削除 (`src/data/`, `engine/`, `socket/`, `services/game-service.ts`, `types/index.ts`)
  - ※ `services/memory-storage.ts` は認証で使用中のため削除対象外
- [x] server.ts を最小構成に書き直し (Socket.IO ハンドラは Phase 3D で接続)
- [x] game.types.ts に Phase 3B 型を追記
- [x] `backend/src/game/engine/` 5ファイル実装
  - TablePlayer.ts / GameTable.ts / BettingRound.ts / PotManager.ts / GameEngine.ts
- [x] テスト 4 ファイル (TestGameEngine.ts + 3 test files)
- [x] 78 テスト全 PASS / カバレッジ Stmts 87.81% / Lines 91.16%
- [x] PR マージ済み

**実装上の注意**:
- `GameTable.ts` のカバレッジが 62.66% と低め: `getUTGPlayer()` / `getFirstPostflopPlayer()` / `removePlayer()` が未使用のため。Phase 3D 以降で使用予定。
- `GameEngine.handleAllFolded()` の WinnerInfo.handResult は `null as unknown as HandResult` を使用 (ショーダウンなし決着のため意図的)。
- BB オプションテスト: BettingRound テストでは BB プレイヤーの `betThisStreet` を事前設定必要。

---

## 🔧 BettingRound アクション順序バグ修正 (完了)

### 問題の詳細

`BettingRound` は渡された `players` 配列順でアクションを回す。
旧 `GameEngine.runBettingRound()` が `getAllPlayers()` を渡しており、座席追加順になっていた。
HU (2人) は最初のハンド (dealerSeatIndex=0) では偶然正しく動くが、3人以上、
またはディーラーボタンが移動した後のHUで順序が崩れる。

### 修正内容

1. `GameTable.getPlayersInActionOrder(isPreflop: boolean)` を実装
   - **HANDOFF.md記載のコード例には不具合があったため修正して実装した**:
     HU(2人)のプリフロップオフセットが `1` と指定されていたが、これだとBBが先にアクションすることになり、
     実際のヘッズアップルール(BTN/SBが先)と矛盾する。正しいオフセットは `0`。
   - さらに、ディーラー自身がフォールド済み（ポストフロップでBTNが既に降りているケース）でも
     正しく動作するよう、`inHand` 内のインデックスではなく座席インデックス(`seatIndex`)を基準に
     計算する方式に変更した（HANDOFF.mdの実装例は `inHand.findIndex` ベースで、
     ディーラー脱落時に `fallback: 座席順のまま返す` という不正確な動作になっていた）。
2. `GameEngine.runBettingRound()` で `getAllPlayers()` → `getPlayersInActionOrder(isPreflop)` に変更
3. `TestGameEngine.ts` に `actionOrderLog` / `getActionOrderForStreet()` を追加（テスト用のアクション順序記録機能）
4. `GameEngine.test.ts` に3テスト追加:
   - 3人プリフロップ順序 (BTN→SB→BB、3人にはUTGが存在しないため)
   - 3人ポストフロップ順序 (SB→BB→BTN)
   - **HUでディーラーボタンを1つ進めた後の順序検証**（座席0偶然一致のバグを実際に検出できるテスト）

### 進捗

- [x] `GameTable.getPlayersInActionOrder()` 実装（HANDOFF.md記載のオフセット誤りを修正）
- [x] `GameEngine.runBettingRound()` 修正
- [x] アクション順序テスト3件追加・PASS確認
- [x] 全81テストPASS (Phase 3A 52 + Phase 3B 26 + 順序修正3) / カバレッジ Stmts 87.75% / Lines 91.38%
- [x] `npx tsc --noEmit` エラーなし

---

## ⚠️ Phase 3C 着手不可: SPEC-phase3c.md が見つからない

HANDOFF.md には「`SPEC-phase3c.md` (Chat が作成済み、プロジェクト内に存在)」と記載があるが、
プロジェクトルートに `SPEC-phase3c.md` が存在しない（確認済み: `SPEC-phase3a.md` と `SPEC-phase3b.md` のみ存在）。
Phase 3C本体（BetSizer/DrawDetector/HandClassifier/BoardAnalyzer/BluffCalculator/PostflopStrategy/PostflopEngine/GtoAiPlayer）は
このファイルの内容に依存するため、ユーザーに以下のいずれかを確認してから着手する:
- SPEC-phase3c.md を再送/再配置してもらう
- または別のChatセッションで再作成してもらう

## Phase 3C: SPEC 完了内容

**ファイル**: `SPEC-phase3c.md` (セクション10B アドeンダムが最新・優先)

設計確定済みの主な要素:
- **Gap 1 解決**: `BoardAnalyzer.ts` でレンジアドバンテージスコア + `betFreqMultiplier` (0.70〜1.30)
- **Gap 2 解決**: `BluffCalculator.ts` で alpha 計算 (ブラフ頻度 = alpha × ストリート係数 × ブロッカー品質 × multiplier)
- **Fix A**: `applySPRModifier()` をカテゴリ別に分岐 (SEMI_BLUFF 高SPR → ベット増、SHOWDOWN 高SPR → チェック増)
- **Fix B**: `BetSizer.ts` で幾何学的サイジング `f = ((1+2·SPR)^(1/n) - 1) / 2`
- **ズレA修正**: DEFENDER_TABLE をベットサイズ別 3 段階 (small/medium/large) に分割、MDF 準拠
- **ズレB修正**: BLUFF の `calculateBluffFrequency()` に `betFreqMultiplier` を適用、バリュー:ブラフ比率を維持

**GTO 精度目標**:
- HU 平均: ~62-65%
- プリフロップ (テーブル参照): ~88-92%
- MVP 後: CFR 事前計算で ~90-97% を目指す予定

### Phase 3C 未着手タスク

- [ ] BetSizer.ts
- [ ] DrawDetector.ts
- [ ] HandClassifier.ts
- [ ] BoardAnalyzer.ts
- [ ] BluffCalculator.ts
- [ ] PostflopStrategy.ts
- [ ] PostflopEngine.ts
- [ ] GtoAiPlayer.ts
- [ ] テスト 5 ファイル

---

## GTOデータファイル

| ファイル名 | 説明 | 場所 |
|---|---|---|
| `gto-preflop-ranges.ts` | 6max RFI 全 5 ポジション (検証済み) | `backend/src/game/ai/data/` |
| `gto-vs-open-ranges.ts` | vs Open 全スポット (検証済み) | 同上 |
| `gto-vs-3bet-and-8max-ranges.ts` | vs 3Bet + 8max RFI (検証済み) | 同上 |
| `gto-vs-4bet-and-8max-vs3bet.ts` | vs 4Bet + 8max vs 3Bet (検証済み) | 同上 |

Phase 3B まで未使用。Phase 3C の `GtoAiPlayer.ts` 実装時に接続する。

---

## セッション履歴

### 2026-06-29 — BettingRound アクション順序バグ修正・完了
- `GameTable.getPlayersInActionOrder()` を実装（HANDOFF.md記載のHU(2人)オフセット誤り `1`→`0` を修正、座席インデックスベースの計算に変更）
- `GameEngine.runBettingRound()` を修正してこのメソッドを使用
- `TestGameEngine.ts` にアクション順序記録機能を追加
- アクション順序検証テスト3件追加、全81テストPASS (カバレッジ87.75%)
- **Phase 3C着手を試みたが `SPEC-phase3c.md` がプロジェクト内に存在しないことを確認。ユーザーへ確認待ち。**

### 2026-06-27 — Phase 3B 実装・完了 (PR マージ)
- 旧実装削除 / server.ts 最小化 / game engine 5 ファイル実装
- 78 テスト全 PASS (87.81% coverage)

### 2026-06-27 — Phase 3A 実装・完了
- core 5 ファイル / 52 テスト PASS (91.6% coverage) / CI 設定

### 2026-06-28 — Phase 3C SPEC 設計完了 (Chat)
- GTO 思考プロセスリサーチ
- 5 機能カテゴリ設計 (NUTTED/VALUE/SHOWDOWN/SEMI_BLUFF/BLUFF)
- Gap 1 (レンジアドバンテージ) / Gap 2 (alpha ブラフ) / Fix A (SPR) / Fix B (幾何学的サイジング) を設計・検証
- ズレA (defender テーブルのサイズ依存) / ズレB (multiplier 適用) を修正
- SPEC-phase3c.md 作成 (セクション10B アドeンダム含む)
- BettingRound アクション順序バグを特定 → Phase 3C 前に修正決定
