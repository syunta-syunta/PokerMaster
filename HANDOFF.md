# HANDOFF.md — セッション引き継ぎ文書

> **ルール**:
> - **Chat→Code**: ChatがこのファイルにNext Stepsを記載 → Codeが冒頭で必ず読む
> - **Code→Chat**: Codeがセッション終了時に「現在地」と「未解決事項」を更新

---

## 🔄 現在地

**フェーズ**: Phase 3C 後処理 (3課題) **完了** → **Phase 3D: サーバー統合**
**ステータス**: Chatが方針決定した3課題（フルハウス分岐コメント追加・リバーDraw再分類修正・
　　　　　　　プリフロップAI実装）全て対応完了。全193テストPASS（3回連続実行で安定確認）。
　　　　　　　`SPEC-phase3d.md` の内容はまだ読んでいない（冒頭のみ前セッションで確認済み）。
**最終更新**: Claude Code (2026-06-29)

---

## ✅ Phase 3C 後処理 (3課題) 完了内容

### 課題1: フルハウスNUTTED分岐 → コメント追加のみ（対応不要と判断されたため）

`HandClassifier.ts` のrankValue===5分岐に、到達不能であることを示すコメントを追加した。
ロジック変更なし。

### 課題2: リバーでのSEMI_BLUFF誤分類 → 修正済み

`PostflopEngine.decidePostflopAction()` 内で `context.street === 'river'` の場合に
`draw` を強制的に `'none'` に上書きする処理を追加した。回帰テスト2件を
`PostflopEngine.test.ts` に追加（リバーでBLUFFに分類されること、フロップ/ターンでは
従来通りドローが検出されること）。

**実装時の注意**: HANDOFF.mdが提案していたテストフィクスチャ（hole=8s9s, board=6s7s2d）は、
実際にはフラッシュドローとOESDを同時に満たし `combo_draw` になることが判明した
（`flush_draw` 単体ではない）。テストの期待値はこれを踏まえて `drawType !== 'none'` という
形に調整してある。

### 課題3: GtoAiPlayer.decidePreflopAction() → 実装済み

4つのGTOレンジデータファイルと接続し、RFI/vsOpen/vs3Bet/vs4Betの4シナリオに対応した。

**🚨 HANDOFF.mdの提案コードに存在しないシンボル名があった**: `import { GTO_PREFLOP_RANGES } from
'./data/gto-preflop-ranges'` という記載があったが、実際のエクスポート名は `GTO_RFI_RANGES`。
修正して実装した。他の3ファイルのインポート名は提案通りで問題なかった。

**HANDOFF.mdの提案から変更した設計判断**:
- シナリオ(RFI/vsOpen/vs3Bet/vs4Bet)判定を「`currentBet`と`lastRaiseIncrement`から推測する」
  という提案を採用せず、`PreflopDecisionContext.scenario` を呼び出し側が明示的に渡す設計にした
  （ベットサイズからの逆算はサイジング規約に依存し脆いため）。
  **Phase 3DでGameEngineからGtoAiPlayerを呼び出す際は、必ず `scenario` フィールドを
  正しく設定すること。** ベッティング履歴（誰が何回レイズしたか）はGameEngine/BettingRound側が
  把握しているはずなので、そこから判定して渡す。
- `GTO_VS_OPEN_RANGES` のキー網羅性が不完全（例: `BTN_vsHJ`等が存在しない）ため、
  `findVsOpenTable()` で同じヒーローポジションの別テーブルにフォールバックする処理を実装。
- `GTO_VS4BET_RANGES` にUTGエントリなし（仕様通り、UTGはほぼ3Betされないため）。
  該当する場合はnull→フォールドにフォールバック。
- BBは`GTO_RFI_RANGES`にエントリなし。RFIシナリオでBBの場合は常にcheckする特別処理を追加。
- 8max専用ポジション(UTG1/UTG2/LJ)はRFI/vs3Betは専用テーブル、vsOpen/vs4Betは6max版で近似。

詳細はPROGRESS.mdの「Phase 3C 後処理」セクション参照。新規テスト12件追加、
`throw new Error('Not yet implemented')` は削除済み。

### 全体テスト結果

`npx tsc --noEmit` エラーなし。`npm test` 全193件PASS（3回連続実行で安定確認）。
カバレッジ: 全体91.15% / `ai/postflop/` 96.3% / `ai/` 87.65%。

---

## 📋 次のセッションでやること (Code向け: Phase 3D)

### 最初にやること

1. `PROGRESS.md` と `HANDOFF.md` (このファイル) を読む
2. `SPEC-phase3d.md` を読む（**まだ読んでいない**。冒頭だけ確認した内容: MVP構成は
   「1人の人間プレイヤー vs 最大5体のGTO AI」、`GameManager`(Singleton) → `GameRoom` →
   `AIGameEngine`(GameEngineの具体実装) という構成で、人間プレイヤーの`requestAction()`は
   Socket.IOイベント待機、AIプレイヤーは`GtoAiPlayer.decide()`を呼ぶ設計。詳細は未確認）
3. SPEC-phase3d.mdの指示に従って実装する

### ⚠️ Phase 3D実装時の重要な注意点

- **`GtoAiPlayer.decidePreflopAction()` を呼ぶ際は `PreflopDecisionContext.scenario` を
  正しく設定すること。** 自動判定は行われない。GameEngine/BettingRound側でベッティング
  履歴（レイズ回数）を追跡し、RFI(誰もレイズしていない)/vsOpen(1回レイズされている)/
  vs3Bet(自分のオープンが3Betされた)/vs4Bet(自分の3Betが4Betされた)を判定して渡す必要がある。
  vsOpenの場合は `raiserPosition` も必須。
- `GtoAiPlayer.decidePostflopAction()` の `isIP` は現状ハードコードで `false` になっている
  (`// TODO: ゲームエンジンからポジション情報を受け取る`というコメントが残っている)。
  Phase 3Dで実際のポジション情報から正しく設定する必要がある。

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
| BettingRound 順序 | 座席インデックスベースで修正済み | 6-max AI 実装で即壊れるため |
| services/ディレクトリ | 全削除ではなく `game-service.ts` のみ削除 | `memory-storage.ts` は認証で使用中 |
| Phase 3C selectBetSize/applySPRModifier | セクション10Bアドエンダム版のみ実装 | アドエンダムが本文を上書きする仕様のため |
| Phase 3C betAmount計算 | サイズバケットに関わらず単一の幾何学的フラクションを使用 (Fix B) | ストリートを跨いだスタック投入の一貫性を確保 |
| フルハウス NUTTED分岐 | 対応不要・コメントのみ追加 | 数学的に到達不能なデッドコード |
| リバーの draw 判定 | street==='river' で強制的に 'none' | ドローは未来のカードへの期待であり、リバーには未来がない |
| プリフロップAIのシナリオ判定 | ベットサイズから推測せず、呼び出し側が明示的に指定 | サイジング規約への依存を避け、堅牢性を優先 |
| vsOpenテーブルのフォールバック | 完全一致がない場合、同ヒーローポジションの別テーブルで近似 | 存在しないキーでの即フォールドより妥当な近似 |

---

## 📁 ファイル状態

### 既存ファイル（変更なし）
- `backend/src/app.ts` / `routes/` / `middleware/` / `controllers/auth-controller.ts`
- `backend/src/services/memory-storage.ts`
- `backend/src/types/auth-types.ts`, `pokersolver.d.ts`
- `backend/src/game/core/*.ts` (5ファイル)
- `backend/src/game/engine/*.ts` (5ファイル)
- `backend/src/server.ts`（最小構成）

### Phase 3Cで作成・Phase 3C後処理で更新したファイル
```
backend/src/game/ai/
  GtoAiPlayer.ts             ← 今回 decidePreflopAction() を実装
  postflop/
    BetSizer.ts
    DrawDetector.ts
    HandClassifier.ts        ← 今回コメント追加 (課題1)
    BoardAnalyzer.ts
    BluffCalculator.ts
    PostflopStrategy.ts
    PostflopEngine.ts        ← 今回リバーdraw修正 (課題2)
backend/src/game/__tests__/ai/
  DrawDetector.test.ts
  HandClassifier.test.ts
  BoardAnalyzer.test.ts
  BluffCalculator.test.ts
  PostflopEngine.test.ts     ← 今回回帰テスト2件追加
  BetSizer.test.ts
  PostflopStrategy.test.ts
  GtoAiPlayer.test.ts        ← 今回プリフロップテスト12件追加、書き直し
```

### Phase 3Dで実装予定
- `SPEC-phase3d.md` 参照（未読了）。`GameManager`/`GameRoom`/`AIGameEngine` 等のサーバー統合層

---

## ⚠️ 未解決事項

1. `GtoAiPlayer.decidePostflopAction()` の `isIP` がハードコード `false`。Phase 3Dで実際の
   ポジション情報から設定する必要がある。
2. `backend/src/game/engine/GameTable.ts` の `getUTGPlayer()` / `getFirstPostflopPlayer()` が
   依然未使用（`getPlayersInActionOrder()`に置き換わって以降）。バックグラウンドタスクとして
   削除提案済み(task_2d9a3f39)だが未対応の場合は残っている可能性がある。

---

## 🐛 既知の問題

| 問題 | 状態 |
|---|---|
| pokersolver が Royal Flush を返さない | 対応済み |
| BettingRound のアクション順序が座席順依存 | 対応済み |
| フルハウス NUTTED 分岐が到達不能 | 対応不要と判断・コメント追加のみ |
| リバーで SEMI_BLUFF に誤分類される | 対応済み |
| GtoAiPlayer プリフロップ未実装 | 対応済み |
| GtoAiPlayer.decidePostflopAction の isIP がハードコード | 未対応・Phase 3Dで対応予定 |

---

## 📖 参照すべきドキュメント

- `SPEC-phase3d.md` — **Phase 3Dの詳細仕様（次セッションで必読、まだ読んでいない）**
- `SPEC-phase3c.md` — Phase 3C仕様（完了済み、参照用。セクション10Bが最終版）
- `backend/src/game/types/game.types.ts` — 全型定義（Phase 3A+3B+3C分）
- `backend/src/game/ai/data/` — GTOレンジデータ4ファイル（接続済み）

---

## 🔚 Codeセッション終了時のチェックリスト

**Phase 3C 後処理セッション（完了）:**
- [x] 課題1: HandClassifier.ts にコメント追加
- [x] 課題2: PostflopEngine.ts に street==='river' → draw='none' 修正
- [x] 課題2: リバードロー再分類テスト追加・PASS
- [x] 課題3: decidePreflopAction() 実装完了
- [x] 課題3: GtoAiPlayer 新規テスト PASS
- [x] `throw new Error('Not yet implemented')` が削除されている
- [x] `npx tsc --noEmit` エラーなし
- [x] `npm test` 全件 PASS（193件、3回連続実行で安定）
- [x] PROGRESS.md 更新
- [x] HANDOFF.md 更新（次は Phase 3D と明記）
