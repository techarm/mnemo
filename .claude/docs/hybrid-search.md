# ハイブリッド検索

## 概要

`mnemo recall` の検索エンジン。ベクトル検索（意味的類似性）と全文検索（キーワードマッチ）を組み合わせ、Reciprocal Rank Fusion (RRF) で統合後、多次元スコアリングで最終ランキングを決定する。

## 設計判断

- **2段階検索 → 統合**: ベクトル検索だけでは正確なキーワードを見逃し、FTS だけでは意味的に関連する知識を見逃す。両方実行して RRF で統合することで、両方の強みを活かす。
- **RRF（Reciprocal Rank Fusion）**: 異なるスコア体系の結果リストを順位ベースで統合する手法。スコアの正規化が不要で、実装がシンプル。k=60 は標準的な定数。
- **多次元スコアリング**: 検索ランキングだけでなく、新しさ（recency）と信頼度（confidence）も加味。古い知識や低信頼度の知識は自然にランクが下がる。
- **重み配分**: セマンティック重視（0.6）> キーワード（0.25）> 新しさ（0.1）> 信頼度（0.05）。意味的類似性を最重要としつつ、他の要素も影響させる。

## 構成

**ファイル:** `src/core/hybrid-search.ts`

### 検索パイプライン

```
クエリ文字列
    │
    ├─→ embedText(query) → ベクトル生成
    │
    ├─→ [1] Vector Search (table.search(vector))
    │       → limit * 2 件取得（候補を多めに）
    │
    ├─→ [2] FTS Search (table.search(query, "fts"))
    │       → limit * 2 件取得
    │
    ├─→ [3] Reciprocal Rank Fusion
    │       → 両リストを順位ベースで統合
    │       → score = 1/(k + rank_vector) + 1/(k + rank_fts)
    │
    └─→ [4] Multi-dimensional Scoring
            → 最終スコア = 0.6×semantic + 0.25×bm25 + 0.1×recency + 0.05×confidence
            → 上位 limit 件を返す
```

### スコア計算

```typescript
// 各次元のスコア
semanticScore = vectorRank >= 0 ? 1/(1 + vectorRank) : 0  // ベクトル検索順位
bm25Score     = ftsRank >= 0 ? 1/(1 + ftsRank) : 0        // FTS検索順位
recencyScore  = exp(-ageDays / 60)                          // 60日指数減衰
confidenceScore = entry.confidence                          // 信頼度（0.0〜1.0）

// 重み付き合計
finalScore = 0.6 * semanticScore
           + 0.25 * bm25Score
           + 0.1 * recencyScore
           + 0.05 * confidenceScore
```

### フィルタリング

`buildFilter()` でオプションから SQL WHERE 句を構築：

```typescript
// options: { type?: "pitfall", project?: "mnemo", language?: "typescript" }
// → "type = 'pitfall' AND project = 'mnemo' AND language = 'typescript'"
```

## 主要なインターフェース

```typescript
// メイン関数
hybridSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>

// 検索オプション
interface SearchOptions {
  type?: KnowledgeType;    // lesson | pitfall | preference | pattern | solution
  project?: string;
  language?: string;
  framework?: string;
  limit?: number;          // デフォルト 10
}

// 検索結果
interface SearchResult extends KnowledgeEntry {
  score: number;           // 多次元スコア（0〜1）
}
```

## 注意点・制約

- **limit * 2 で候補取得**: 最終的に limit 件返すが、RRF 統合のため各検索で 2 倍取得する。limit=10 なら各検索で 20 件取得
- **FTS インデックスが未構築だと空**: 新しいテーブルや FTS 再構築前は FTS 結果が空になる。ベクトル検索のみで動作する
- **ベクトル検索が空テーブルで失敗**: テーブルにデータがない場合、ベクトル検索は例外を投げる。try-catch で空配列にフォールバック
- **フィルタの SQL インジェクション**: `buildFilter()` はユーザー入力を直接 SQL 文字列に埋め込む。悪意あるフィルタ値は未対応
- **重みはハードコード**: `DEFAULT_WEIGHTS` は定数。ユーザーやプロジェクトごとのカスタマイズ不可

## 関連

- 信頼度スコアの変動: `.claude/docs/confidence-decay.md`
- 検索の呼び出し元: `src/core/knowledge-store.ts` の `recall()`
