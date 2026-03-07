# 信頼度減衰システム

## 概要

知識エントリの「鮮度」を自動管理する仕組み。時間経過で `confidence` スコアが指数減衰し、古い知識は自然に検索ランキングが下がる。recall 時にアクセスされた知識は信頼度がブーストされ、「よく使う知識は残り、使われない知識はフェードする」サイクルを実現する。

## 設計判断

- **指数減衰（Exponential Decay）**: 線形減衰だとある時点でゼロになるが、指数減衰は緩やかに下がり続ける。時定数 τ=180日で、180日後に約37%、365日後に約13%まで減衰する
- **フロア値 0.1**: 信頼度がゼロにならないよう最低保証。古い知識でも完全に消えず、必要なとき検索すれば見つかる
- **recall ブースト +0.1**: 検索でヒットしてユーザーに提示された知識は「まだ有用」と判断し、信頼度を回復させる。上限は 1.0
- **起動時に一括実行**: MCPサーバー起動時（`checkAndMigrate()`）にまとめて減衰処理。リアルタイム計算ではなくバッチ処理でシンプルに
- **変化量 > 0.01 のみ更新**: 微小な変化を無視して不要な DB 書き込みを削減

## 構成

**ファイル:** `src/core/knowledge-store.ts`（`decayConfidence()` 関数）
**実行トリガー:** `src/core/backup.ts`（`checkAndMigrate()` から呼び出し）

### 減衰フロー

```
MCPサーバー起動 / CLI 実行
    │
    └─→ checkAndMigrate()
            │
            ├─→ スキーマバージョンチェック（必要ならバックアップ + 更新）
            │
            └─→ decayConfidence()
                    │
                    ├─→ getAllKnowledgeEntries() で全エントリ取得
                    │
                    ├─→ 各エントリの ageDays を計算
                    │     ageDays = (now - updatedAt) / (1000 * 60 * 60 * 24)
                    │
                    ├─→ 新しい信頼度を算出
                    │     newConfidence = max(0.1, e^(-ageDays / 180))
                    │
                    ├─→ 変化量 > 0.01 のエントリだけ収集
                    │
                    └─→ batchUpdateConfidence(updates) で一括更新
```

### recall ブーストフロー

```
recall(query)
    │
    ├─→ hybridSearch() で検索結果取得
    │
    └─→ 結果のうち confidence < 1.0 のエントリを収集
            │
            └─→ confidence + 0.1（上限 1.0）で batchUpdateConfidence()
                    （fire-and-forget: エラーは無視）
```

### 数式

```typescript
// 減衰の計算
const CONFIDENCE_TIME_CONSTANT = 180;  // 時定数 τ: 180日
const CONFIDENCE_FLOOR = 0.1;          // 最低保証

newConfidence = Math.max(
  CONFIDENCE_FLOOR,
  Math.exp(-ageDays / CONFIDENCE_TIME_CONSTANT)
);
```

### 信頼度の時間変化（目安）

| 経過日数 | confidence | 備考 |
|---------|-----------|------|
| 0日 | 1.00 | 登録直後 |
| 30日 | 0.85 | ほぼ影響なし |
| 90日 | 0.61 | やや下がる |
| 125日 | 0.50 | ここで半減 |
| 180日 | 0.37 | 時定数 τ（e^-1） |
| 365日 | 0.13 | かなり低い |
| 500日+ | 0.10 | フロア値で下げ止まり |

### 検索への影響

ハイブリッド検索の多次元スコアリングで `confidence` は重み 0.05 で最終スコアに反映：

```
finalScore = 0.6 × semantic + 0.25 × bm25 + 0.1 × recency + 0.05 × confidence
```

さらに CLAUDE.md 生成時には `confidence >= 0.5` のフィルタがかかるため、信頼度が 0.5 未満に落ちた知識は CLAUDE.md に表示されなくなる。

## 主要なインターフェース

```typescript
// 一括減衰（起動時に呼ばれる）
decayConfidence(): Promise<number>  // 更新件数を返す

// recall 内で自動ブースト
// confidence < 1.0 のヒット結果に +0.1
batchUpdateConfidence(updates: { id: string; confidence: number }[]): Promise<void>
```

## 注意点・制約

- **起動時のみ実行**: 長時間セッション中に減衰は進まない。次回起動時にまとめて計算される
- **updatedAt 基準**: `createdAt` ではなく `updatedAt` が減衰の基準日。知識を更新すれば信頼度もリセットされる
- **時定数はハードコード**: `CONFIDENCE_TIME_CONSTANT = 180` は定数。ユーザー設定で変更不可
- **delete + re-add パターン**: LanceDB に UPDATE がないため、`batchUpdateConfidence()` は内部で delete → re-add を行う。大量エントリの一括更新はパフォーマンスに注意

## 関連

- ハイブリッド検索での利用: `.claude/docs/hybrid-search.md`
- CLAUDE.md 生成時の 0.5 フィルタ: `.claude/docs/claude-md-generation.md`
- バックアップ・起動時処理: `src/core/backup.ts`
