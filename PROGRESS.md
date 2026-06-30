# PROGRESS.md — PokerMaster 開発進捗

> **ルール**: Claude Codeセッション終了時に必ず更新する。

---

## 現在のフェーズ

**Phase 3D: サーバー統合 完了** → **Phase 3E: フロントエンド統合**

---

## フェーズ別ステータス

| フェーズ | 内容 | ステータス |
|---|---|---|
| ✅ Phase 1 | インフラ・認証 | 完了 |
| ✅ Phase 2 | 認証 UI・ルーティング | 完了 |
| ✅ Phase 3A | コアプリミティブ | 完了 (52 tests, 91.6% coverage) |
| ✅ Phase 3B | ゲームフロー | 完了 (78 tests, 87.81% coverage) PR マージ済み |
| ✅ バグ修正 | BettingRound アクション順序 | 完了 (81 tests, 87.75% coverage) |
| ✅ Phase 3C | AI エンジン (ポストフロップ GTO) | 完了 (182 tests, ai/postflop 95.22% coverage) |
| ✅ Phase 3C後処理 | フルハウス分岐/リバーDraw修正/プリフロップAI | 完了 (193 tests) |
| ✅ Phase 3D | サーバー統合 | **完了** (217 tests, 全体カバレッジ86.95%) |
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

## Phase 3C: 完了内容

**ファイル**: `SPEC-phase3c.md` (セクション10B アドエンダム版を採用)

設計確定済みの主な要素 (全て実装済み):
- **Gap 1 解決**: `BoardAnalyzer.ts` でレンジアドバンテージスコア + `betFreqMultiplier` (0.70〜1.30)
- **Gap 2 解決**: `BluffCalculator.ts` で alpha 計算 (ブラフ頻度 = alpha × ストリート係数 × ブロッカー品質 × multiplier)
- **Fix A**: `applySPRModifier()` をカテゴリ別に分岐 (SEMI_BLUFF 高SPR → ベット増、SHOWDOWN 高SPR → チェック増)
- **Fix B**: `BetSizer.ts` で幾何学的サイジング `f = ((1+2·SPR)^(1/n) - 1) / 2`
- **ズレA修正**: DEFENDER_TABLE をベットサイズ別 3 段階 (small/medium/large) に分割、MDF 準拠
- **ズレB修正**: BLUFF の `calculateBluffFrequency()` に `betFreqMultiplier` を適用、バリュー:ブラフ比率を維持

### 完了タスク

- [x] `game.types.ts` に Phase 3C 型を追記 (DrawType, HandCategory, BetSizeBucket, PostflopContext, PostflopDecision, BoardAdvantageResult, AggressorFrequencies, DefenderFrequencies)
- [x] `BetSizer.ts` (10B-1: Fix B 幾何学的サイジング)
- [x] `DrawDetector.ts`
- [x] `HandClassifier.ts`
- [x] `BoardAnalyzer.ts` (Gap 1)
- [x] `BluffCalculator.ts` (Gap 2)
- [x] `PostflopStrategy.ts` (`selectBetSize`/`applySPRModifier` は10B版を直接採用、本文版は実装せず)
- [x] `PostflopEngine.ts` (10B-4: betAmountは選択されたサイズバケットに関わらず単一の幾何学的フラクションを使用)
- [x] `GtoAiPlayer.ts` (プリフロップは未実装スタブのまま、ポストフロップはPostflopEngine統合)
- [x] テスト 8 ファイル (仕様の5ファイル + 自主追加3ファイル、詳細は下記)

### テスト結果

- 全182テストPASS (前フェーズまでの81 + Phase3C新規101)、4回連続実行で安定（flaky再発防止のためサンプル数調整・許容範囲設定済み）
- カバレッジ: `ai/postflop/` 95.22% (目標85%を達成) / `ai/` 全体89.47% / プロジェクト全体 Stmts 90.97% / Lines 93.63%
- `npx tsc --noEmit` エラーなし

### テストファイル構成 (仕様の5ファイルから2ファイル追加)

| ファイル | 内容 |
|---|---|
| `DrawDetector.test.ts` | 仕様通り |
| `HandClassifier.test.ts` | 仕様通り (フルハウステストは下記の理由でVALUE側のみ検証) |
| `BoardAnalyzer.test.ts` | 仕様通り |
| `BluffCalculator.test.ts` | 仕様通り |
| `PostflopEngine.test.ts` | 仕様の統合テスト + 10B-6のFix B betAmount確認3件 |
| `BetSizer.test.ts` | **追加**: 10B-6記載のBetSizer単体テスト + selectBetSizeの上限クリップ確認 |
| `PostflopStrategy.test.ts` | **追加**: Fix A (`applySPRModifier`)・テーブル整合性・MDF確認等の単体テスト。10B-6の「Fix A」テスト群はここに格納 |
| `GtoAiPlayer.test.ts` | **追加**: 0%だったカバレッジを補うための最小限のテスト |

### 実装中に発見した仕様との不整合 (Phase 3C時点の記録、下記「Phase 3C後処理」で対応済み)

1. **`HandClassifier.classifyHand()` の rankValue===5 (フルハウス) で `!boardPaired→NUTTED` 分岐が到達不能**:
   コミュニティカード3〜5枚 + ホール2枚という制約上、フルハウスが成立する場合は
   数学的に必ずボード側に重複ランク（ペア以上）が存在する（ホールカードは最大2枚しか
   供給できないため）。そのため `isBoardPaired(communityCards) === false` のケースは
   実戦では発生しえず、`NUTTED`分岐は事実上デッドコード。
   → **Chat判断: 対応不要、コメント追加のみ。対応済み。**

2. **SPEC section 10.5 の「リバー: SEMI_BLUFF は draw=none に再分類される」テストは実装不可**:
   `DrawDetector.ts` / `HandClassifier.ts` / `PostflopEngine.ts` のいずれにも、
   ストリート(street)に応じてドロー判定を無効化するロジックが存在しない
   (`detectComboDrawIfAny` はカード構成のみで判定し、street情報を受け取らない)。
   → **Chat判断: 修正必須（GTO的に正しい指摘）。対応済み（下記参照）。**

3. **統計的テストの安定性**: `decidePostflopAction` はRNGで最終アクションを決定するため、
   頻度を検証するテストは複数回サンプリングする統計的手法を取った。
   差分が僅か（5pt程度）な比較テストはサンプル数を増やし(n=3000)許容マージンを設けることで
   flakinessを解消した（厳密な`toBeCloseTo`は標本誤差で頻繁に失敗するため不採用）。

---

## Phase 3C 後処理 (3課題) — 完了

Chatが3課題それぞれに方針決定したため、その通りに対応した。

### 課題1: フルハウスNUTTED分岐 (対応不要・コメントのみ)

`HandClassifier.ts` のrankValue===5分岐に、到達不能であることを示すコメントを追加。
ロジック変更なし。

### 課題2: リバーでのSEMI_BLUFF誤分類 (修正必須)

`PostflopEngine.decidePostflopAction()` 内で、`context.street === 'river'` の場合に
`detectComboDrawIfAny()` の結果を強制的に `'none'` に上書きする処理を追加した。
これにより、リバーで未完成のドロー（外れたドロー）はSEMI_BLUFFではなくBLUFF
（alpha計算ベースの頻度）として扱われるようになった。

回帰テスト2件を `PostflopEngine.test.ts` に追加:
- リバーで未完成のフラッシュドロー → `drawType: 'none'`、`category: 'BLUFF'`
- フロップ/ターンでは同じカード構成でも通常通りドローが検出される（回帰確認）

実装時の注意: 当初想定していたテストフィクスチャ（hole=8s9s, board=6s7s2d）は
フラッシュドローだけでなくOESDも同時に満たし `combo_draw` になることが判明したため、
テストの期待値は `drawType !== 'none'` という形に調整した（詳細はテストコード参照）。

### 課題3: GtoAiPlayer.decidePreflopAction() 実装

4つのGTOレンジデータファイル（`gto-preflop-ranges.ts` / `gto-vs-open-ranges.ts` /
`gto-vs-3bet-and-8max-ranges.ts` / `gto-vs-4bet-and-8max-vs3bet.ts`）と接続し、
RFI / vsOpen / vs3Bet / vs4Bet の4シナリオに対応した。

**HANDOFF.md記載のサンプルコードには、実際には存在しないシンボル名が含まれていたため修正して実装した**:
`import { GTO_PREFLOP_RANGES } from './data/gto-preflop-ranges'` という記載があったが、
実際のエクスポート名は `GTO_RFI_RANGES` であり、`GTO_PREFLOP_RANGES` という名前のシンボルは
存在しない。他の3ファイルのインポート名（`GTO_VS_OPEN_RANGES`/`GTO_VS_3BET_RANGES`/
`GTO_8MAX_RFI_RANGES`/`GTO_8MAX_VS3BET_RANGES`/`GTO_VS4BET_RANGES`）は実際のエクスポートと一致していた。

**設計判断（HANDOFF.mdの提案から変更した点）**:
- HANDOFF.mdは「`context.currentBet`と`lastRaiseIncrement`からシナリオ(RFI/vsOpen/vs3Bet/vs4Bet)を
  推測する」という方針を提案していたが、ベットサイズからの逆算はサイジング規約（2.5BBオープン、
  3.5x/4x 3Bet等）に強く依存し脆いため採用しなかった。代わりに `PreflopDecisionContext` に
  `scenario: PreflopScenario` フィールドを明示的に持たせ、呼び出し側（Phase 3DのGameEngine）が
  実際のベッティング履歴に基づいて正しいシナリオを渡す設計にした。GtoAiPlayer自体は
  ステートレス（ベッティング履歴を保持しない）ため、この方が堅牢。
- `GTO_VS_OPEN_RANGES` はキーの網羅性が完全ではない（例: `BTN_vsHJ` や `SB_vsUTG` 等の組み合わせが
  存在しない）。完全一致が見つからない場合、同じヒーローポジションの別の相手ポジション向け
  テーブルにフォールバックする `findVsOpenTable()` を実装した（オープンレンジの形は相手の
  ポジションが変わってもおおむね近いため、フォールドよりは妥当な近似）。
- `GTO_VS4BET_RANGES` にはUTGのエントリが存在しない（UTGはほぼ3Betされないため）。
  この場合はUTG向けのvs4Betシナリオが発生したら6max UTGテーブルの代わりに暫定的に
  存在するテーブルへフォールバックするのではなく、`lookupPos`を`'UTG'`のまま検索して
  null（→フォールド）にフォールバックする設計にした。
- BBは`GTO_RFI_RANGES`にエントリが存在しない（オープンレイズという概念がBBにはないため）。
  RFIシナリオでBBの場合は常に無料でチェックする特別処理を追加した。
- 8max専用ポジション（UTG1/UTG2/LJ）は `GTO_8MAX_RFI_RANGES` / `GTO_8MAX_VS3BET_RANGES` を
  参照し、vsOpen/vs4Betでは対応する6max版テーブルで近似する（ファイルのコメントで
  「HJ/CO/BTN/SBは6maxと同一」と明記されているのと同じ方針を準用）。

新規テスト12件を `GtoAiPlayer.test.ts` に追加（RFI決定論的ケース、vsOpen混合戦略の統計確認、
vs3Bet頻度確認、フォールバック動作、BB特別処理、canCheck境界条件等）。

`throw new Error('Not yet implemented')` は削除済み。

### Phase 3C後処理 完了条件

- [x] `npx tsc --noEmit` エラーなし
- [x] `npm test` 全193件PASS（3回連続実行で安定確認）
- [x] カバレッジ: 全体91.15% / `ai/postflop/` 96.3% / `ai/` 87.65%

---

## GTOデータファイル

| ファイル名 | 説明 | 場所 |
|---|---|---|
| `gto-preflop-ranges.ts` | 6max RFI 全 5 ポジション (検証済み) | `backend/src/game/ai/data/` |
| `gto-vs-open-ranges.ts` | vs Open 全スポット (検証済み) | 同上 |
| `gto-vs-3bet-and-8max-ranges.ts` | vs 3Bet + 8max RFI (検証済み) | 同上 |
| `gto-vs-4bet-and-8max-vs3bet.ts` | vs 4Bet + 8max vs 3Bet (検証済み) | 同上 |

**Phase 3C後処理で接続完了**。`GtoAiPlayer.decidePreflopAction()` がこれら4ファイルを参照する。
呼び出し側（Phase 3DのGameEngine）は `PreflopDecisionContext.scenario` でRFI/vsOpen/vs3Bet/vs4Betの
いずれかを明示的に指定する必要がある（ベットサイズからの自動判定は行わない設計、理由は上記参照）。
Phase 3Dの`AIGameEngine.determinePreflopScenario()`がこれを実装し、実際に接続されている。

---

## Phase 3D: サーバー統合 — 完了

**ファイル**: `SPEC-phase3d.md`

MVP構成「1人の人間プレイヤー vs 最大5体のGTO AI」をSocket.IO経由で動作させるサーバー統合層を実装した。

### 着手前に発見した課題（HANDOFF.md記載の「ギャップ1・2」+ 追加で発見した3件）

SPEC-phase3d.md と実装済みコードの間にインターフェースの不一致が複数見つかったため、
実装前に解消した。

1. **ギャップ1 (HANDOFF.md記載済み)**: `preflopAggressorId` / `onAggression` コールバック機構が
   実際には未実装だった（HANDOFF.md/SPEC-phase3d.md双方が「実装済み」と記載していたが、
   `GameEngine.ts`/`BettingRound.ts`を直接確認したところ存在しなかった）。
   `BettingRoundConfig` に `onAggression?: (playerId: string) => void` を追加し、
   `applyRaise()`/`applyAllIn()`（レイズ相当の場合のみ）から呼び出すよう実装。
   `GameEngine` に `preflopAggressorId` / `preflopRaiseCount` フィールドを追加し、
   `playHand()`冒頭でリセット（デフォルトはBB）、`runBettingRound()`でコールバックを配線した。
   `BettingRound.test.ts`に5テスト、`GameEngine.test.ts`に4テスト追加。

2. **ギャップ2 (HANDOFF.md記載済み)**: `isIP` のハードコード問題。これは
   `GtoAiPlayer.decidePostflopAction()`のシグネチャ自体を修正して解決した（後述）。

3. **新発見: `GtoAiPlayer`の実シグネチャがSPEC/HANDOFFの想定と異なっていた**:
   - `decidePostflopAction()`は`(communityCards, context)`の**2引数**であり、
     SPECが想定する`(holeCards, communityCards, context)`の3引数ではない。
     `holeCards`は事前に`setHoleCards()`でセットする方式。
   - `isPFA`/`isIP`は元々`GtoAiConfig`（コンストラクタ引数、ハンドごとに変化しない想定）に
     含まれていたが、これは設計として誤り（`isPFA`はハンドごとに変わる値）。
     `decidePostflopAction()`の`context`に`isPFA`/`isIP`を必須フィールドとして追加し、
     呼び出し側が毎回算出して渡す方式に変更した。`GtoAiConfig`から`isPFA`を削除。
   - `position`もディーラーボタン移動で毎ハンド変わるため、`setPosition()`メソッドを新設し、
     `AIGameEngine.broadcastSnapshot('preflop')`内で毎ハンド更新するようにした。
   - これらの修正に伴い`GtoAiPlayer.test.ts`の該当テストを更新・1件追加。

4. **新発見: `GameConfig.maxPlayers`の型が`2|6|8|9`に限定されていた**:
   Phase 3Bからの既存バグ。`GameTable`のポジション定義は2-9人全てに対応しているにも関わらず、
   型が3,4,5,7を除外していた。`RoomConfig.tableSize`(2-6)を`GameConfig.maxPlayers`に
   代入する際にコンパイルエラーとなるため、`2|3|4|5|6|7|8|9`に拡張した。

5. **新発見・修正必須: `GameEngine.handleAllFolded()`が`broadcastHandResult()`を呼んでいなかった**:
   Phase 3Bからの既存バグ。`runShowdown()`は`broadcastHandResult()`を呼ぶが、
   フォールドで決着した場合のパス`handleAllFolded()`は呼んでいなかった。
   Phase 3BのテストではこのコールバックがTestGameEngineの空no-opスタブだったため発覚しなかったが、
   Phase 3Dで実際にSocket.IOイベント送信に使うようになって初めて顕在化した
   （integration.test.tsの「hand-result受信」テストがタイムアウトしたことで発見）。
   `handleAllFolded()`を`async`化し`broadcastHandResult()`を呼ぶよう修正、
   `playHand()`内の4箇所の呼び出しに`await`を追加した。

6. **新発見: `auth-middleware.ts`のファイル名**: SPECは`../middleware/auth`からの
   importを想定していたが、実際のファイル名は`auth-middleware.ts`。修正して実装。

### 実装ファイル

- `backend/src/game/engine/AIGameEngine.ts` — `GameEngine`の具体実装。人間はSocket.IO待機、
  AIは`GtoAiPlayer`を呼ぶ。`preflopRaiseCount`からシナリオ判定、`currentBettingRound`から
  進行中の正確なポット額を算出する仕組みも追加（後述）。
- `backend/src/server/GameRoom.ts` / `GameManager.ts`（シングルトン）/ `socketHandlers.ts`
- `backend/src/routes/gameRoutes.ts` — 最小REST API (`POST /api/game/start`, `GET /api/game/:id/status`)
- `backend/src/app.ts` / `server.ts` 更新（ルート登録・Socket.IOハンドラ登録）

### 追加で発見・対応した設計課題: 進行中ベッティングラウンドのポット額取得

`potManager`はベッティングラウンド完了後にしか更新されないため、ラウンド進行中
（AIが意思決定する瞬間）に正確な現在ポット額を取得する手段が存在しなかった。
`GameEngine`に`protected currentBettingRound: BettingRound | null`を追加し、
`runBettingRound()`内でセット/クリアするようにした。`AIGameEngine.getCurrentPot()`は
`potManager.getTotalPot() + currentBettingRound.getCollectedAmount()`で正確な値を算出する。

### テスト結果

- 全217テストPASS（Phase 3C後処理までの193 + Phase 3D新規24）、3回連続実行で安定確認
- カバレッジ: 全体86.95% (Stmts) / 89.12% (Lines)
- `npx tsc --noEmit` エラーなし
- Socket.IO統合テスト (`integration.test.ts`) で join→joined-room、game-state受信、
  action-required→player-action→hand-resultの一往復を実際のhttp.Server+socket.io-clientで検証
- タイムアウト自動フォールドは`AIGameEngine.test.ts`で高速な単体テストとして実装
  （実際の30秒待機はテストとして非現実的なため、`actionTimeoutSeconds`を短く設定した
  独立したGameTableで検証する方式を採用）

### 既知の未対応事項

- `gameRoutes.ts`（REST API）のテストカバレッジ0%。supertest等の追加インストールが必要なため
  今回は見送った。ロジック自体は単純（UUID発行とルーム状態参照のみ）。
- `AIGameEngine.ts`のカバレッジ58%程度。`isPlayerIP()`、`determinePreflopScenario()`の
  vs3Bet/vs4Bet分岐、`getCurrentPot()`等、複雑なマルチストリートのシナリオを経由しないと
  到達しないコードパスが多く、今回のテストでは基本的な往復・タイムアウトのみ検証した。
- `GameRoom.test.ts`の「startGameLoop()後にplayingになる」テストはバックグラウンドの
  ゲームループ（1500msのハンド間隔待機）が完全には停止しきらず、稀にJestの
  "did not exit"警告が出ることがある（テスト自体は成功する。実害なし、本番動作には影響しない）。

---

## セッション履歴

### 2026-06-29 — Phase 3D 実装・完了
- ユーザーがHANDOFF.mdに「ギャップ1・2」を記載した上でPhase 3D着手を指示
- 着手前にHANDOFF.md「最優先タスク: Phase 3D 着手前に必読」記載の通りGtoAiPlayer.tsを直接確認
- ギャップ1の根本（`preflopAggressorId`/`onAggression`が実は未実装）を発見し、
  `BettingRound.ts`/`GameEngine.ts`に実装（テスト9件追加）
- `GtoAiPlayer`の実シグネチャがSPEC/HANDOFFの想定と異なる3点を発見・修正
  （decidePostflopActionの引数構成、isPFA/isIPの受け渡し方式、position更新方式）
- `GameConfig.maxPlayers`型のバグ（2,6,8,9のみで3,4,5,7が抜けていた）を発見・修正
- `GameEngine.handleAllFolded()`が`broadcastHandResult()`を呼んでいないPhase 3Bからの
  既存バグを発見・修正（integration testでhand-result未着信から発覚）
- `AIGameEngine.ts`/`GameRoom.ts`/`GameManager.ts`/`socketHandlers.ts`/`gameRoutes.ts`実装
- socket.io-clientをインストールし、実サーバーでのSocket.IO統合テストを実装
- 全217テストPASS（3回連続実行で安定）、カバレッジ全体86.95%
- 次セッションは Phase 3E（フロントエンド統合）へ。HANDOFF.md参照

### 2026-06-29 — Phase 3C 後処理 (3課題) 実装・完了
- Chatが3課題（フルハウス分岐/リバーDraw誤分類/プリフロップAI未実装）に方針決定し、その通りに対応
- 課題1: `HandClassifier.ts` にコメント追加のみ（対応不要と判断）
- 課題2: `PostflopEngine.ts` でリバー時にdrawを強制的に`'none'`にする修正 + 回帰テスト2件追加
- 課題3: `GtoAiPlayer.decidePreflopAction()` を4つのGTOレンジファイルと接続して実装
  - HANDOFF.md記載の `GTO_PREFLOP_RANGES` という誤ったシンボル名を発見・修正（実際は`GTO_RFI_RANGES`）
  - シナリオ判定はベットサイズからの推測ではなく、呼び出し側が明示的に渡す設計に変更
  - `GTO_VS_OPEN_RANGES`のキー網羅性不足に対するフォールバック機構を実装
  - 新規テスト12件追加
- 全193テストPASS（3回連続実行で安定）、カバレッジ全体91.15% / ai/postflop 96.3%
- 次セッションは Phase 3D（サーバー統合）へ。`SPEC-phase3d.md`は未読了、HANDOFF.md参照

### 2026-06-29 — Phase 3C 実装・完了
- ユーザーが `SPEC-phase3c.md`（および `SPEC-phase3d.md`）を追加配置したことを確認し実装を開始
- `game.types.ts` にPhase3C型を追記、`backend/src/game/ai/postflop/` 配下に7ファイル実装
  (BetSizer/DrawDetector/HandClassifier/BoardAnalyzer/BluffCalculator/PostflopStrategy/PostflopEngine)
  + `backend/src/game/ai/GtoAiPlayer.ts`
- セクション10Bアドエンダム（Fix A/Fix B）を本文版の代わりに直接実装（本文版は作成せず）
- テスト8ファイル作成（仕様5ファイル+自主追加3ファイル: BetSizer/PostflopStrategy/GtoAiPlayer）
- 全182テストPASS（4回連続実行で安定）、`ai/postflop/`カバレッジ95.22%
- 実装中に2件の仕様不整合を発見（フルハウスNUTTED分岐の到達不能性、リバーDraw再分類テストの未実装ロジック依存）→ PROGRESS.md記載、Chat確認待ち
- 次セッションは Phase 3D（サーバー統合）へ。HANDOFF.md参照

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
