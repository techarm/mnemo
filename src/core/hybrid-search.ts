import { getKnowledgeTable } from "../db/lance-client.js";
import { embedText } from "../embedding/ollama.js";
import type {
  KnowledgeEntry,
  SearchOptions,
  SearchResult,
  ScoreWeights,
} from "../types/index.js";

const DEFAULT_WEIGHTS: ScoreWeights = {
  semanticWeight: 0.6,
  bm25Weight: 0.25,
  recencyWeight: 0.1,
  confidenceWeight: 0.05,
};

export async function hybridSearch(
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  const table = await getKnowledgeTable();
  const limit = (options?.limit ?? 10) * 2;
  const filter = buildFilter(options);

  // Generate query embedding
  const queryVector = await embedText(query);

  // 1. Vector search (semantic similarity)
  let vectorResults: KnowledgeEntry[] = [];
  try {
    let vectorQuery = table.search(queryVector).limit(limit);
    if (filter) {
      vectorQuery = vectorQuery.where(filter);
    }
    vectorResults = (await vectorQuery.toArray()) as unknown as KnowledgeEntry[];
  } catch {
    // Vector search may fail if table is empty
  }

  // 2. FTS search (keyword matching)
  let ftsResults: KnowledgeEntry[] = [];
  try {
    let ftsQuery = table.search(query, "fts").limit(limit);
    if (filter) {
      ftsQuery = ftsQuery.where(filter);
    }
    ftsResults = (await ftsQuery.toArray()) as unknown as KnowledgeEntry[];
  } catch {
    // FTS may fail if index doesn't exist yet
  }

  // 3. Reciprocal Rank Fusion
  const fused = reciprocalRankFusion(vectorResults, ftsResults);

  // 4. Multi-dimensional scoring
  const scored = fused.map((entry) => ({
    ...entry,
    score: computeScore(entry, DEFAULT_WEIGHTS),
  }));

  // Sort by score descending and limit
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, options?.limit ?? 10);
}

function buildFilter(options?: SearchOptions): string | undefined {
  if (!options) return undefined;

  const conditions: string[] = [];

  if (options.type) {
    conditions.push(`type = '${options.type}'`);
  }
  if (options.project) {
    conditions.push(`project = '${options.project}'`);
  }
  if (options.language) {
    conditions.push(`language = '${options.language}'`);
  }
  if (options.framework) {
    conditions.push(`framework = '${options.framework}'`);
  }

  return conditions.length > 0 ? conditions.join(" AND ") : undefined;
}

/**
 * Reciprocal Rank Fusion: merges two ranked result lists.
 * Each result gets a score of 1/(k + rank), then scores from both lists
 * are summed for the same document.
 */
function reciprocalRankFusion(
  vectorResults: KnowledgeEntry[],
  ftsResults: KnowledgeEntry[]
): (KnowledgeEntry & { vectorRank: number; ftsRank: number })[] {
  const k = 60; // standard RRF constant
  const scoreMap = new Map<
    string,
    {
      entry: KnowledgeEntry;
      vectorScore: number;
      ftsScore: number;
      vectorRank: number;
      ftsRank: number;
    }
  >();

  // Score from vector results
  vectorResults.forEach((entry, idx) => {
    const existing = scoreMap.get(entry.id);
    if (existing) {
      existing.vectorScore = 1 / (k + idx);
      existing.vectorRank = idx;
    } else {
      scoreMap.set(entry.id, {
        entry,
        vectorScore: 1 / (k + idx),
        ftsScore: 0,
        vectorRank: idx,
        ftsRank: -1,
      });
    }
  });

  // Score from FTS results
  ftsResults.forEach((entry, idx) => {
    const existing = scoreMap.get(entry.id);
    if (existing) {
      existing.ftsScore = 1 / (k + idx);
      existing.ftsRank = idx;
    } else {
      scoreMap.set(entry.id, {
        entry,
        vectorScore: 0,
        ftsScore: 1 / (k + idx),
        vectorRank: -1,
        ftsRank: idx,
      });
    }
  });

  // Combine and sort by fusion score
  return Array.from(scoreMap.values())
    .sort(
      (a, b) =>
        b.vectorScore + b.ftsScore - (a.vectorScore + a.ftsScore)
    )
    .map((item) => ({
      ...item.entry,
      vectorRank: item.vectorRank,
      ftsRank: item.ftsRank,
    }));
}

function computeScore(
  entry: KnowledgeEntry & { vectorRank: number; ftsRank: number },
  weights: ScoreWeights
): number {
  // Semantic score: inverse of rank (closer to 0 = better)
  const semanticScore =
    entry.vectorRank >= 0 ? 1 / (1 + entry.vectorRank) : 0;

  // BM25 score: inverse of FTS rank
  const bm25Score = entry.ftsRank >= 0 ? 1 / (1 + entry.ftsRank) : 0;

  // Recency score: exponential decay over 60 days
  const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyScore = Math.exp(-ageDays / 60);

  // Confidence score: direct value
  const confidenceScore = entry.confidence;

  return (
    weights.semanticWeight * semanticScore +
    weights.bm25Weight * bm25Score +
    weights.recencyWeight * recencyScore +
    weights.confidenceWeight * confidenceScore
  );
}
