export interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  title: string;
  content: string;
  vector: number[];
  project: string; // empty string = cross-project
  tags: string; // JSON array string
  language: string; // empty string = not specified
  framework: string; // empty string = not specified
  confidence: number;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
  // Reference-specific fields (empty/0 for non-reference types)
  rawContent: string; // Full fetched text cache (empty string = none)
  sourceUrl: string; // Source URL or Context7 libraryId (empty string = none)
  sourceType: string; // "web" | "context7" | "" (empty for non-reference)
  fetchedAt: string; // ISO timestamp of when content was fetched (empty string = N/A)
  ttlDays: number; // Days until expiry (0 = never expires)
}

export type KnowledgeType =
  | "lesson"
  | "pitfall"
  | "preference"
  | "pattern"
  | "solution"
  | "reference";

export interface SearchOptions {
  type?: KnowledgeType;
  project?: string;
  language?: string;
  framework?: string;
  limit?: number;
}

export interface SearchResult extends KnowledgeEntry {
  score: number;
}

export interface ScoreWeights {
  semanticWeight: number;
  bm25Weight: number;
  recencyWeight: number;
  confidenceWeight: number;
}

export interface MnemoConfig {
  dataDir: string;
  ollamaUrl: string;
  embedModel: string;
  defaultLimit: number;
}

// --- Project & Task types ---

export interface ProjectEntry {
  id: string;
  name: string;
  path: string;
  description: string; // empty string = not set
  techStack: string; // JSON array string '["typescript","lancedb"]'
  language: string; // empty string = not set
  framework: string; // empty string = not set
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface TaskEntry {
  id: string;
  projectId: string; // FK → ProjectEntry.id
  title: string;
  description: string; // empty string = none
  status: TaskStatus;
  priority: TaskPriority;
  parentId: string; // parent task ID (empty string = root task)
  tags: string; // JSON array string
  createdAt: string;
  updatedAt: string;
  completedAt: string; // empty string = not completed
}

export interface ProjectStats {
  project: ProjectEntry;
  knowledgeCount: number;
  knowledgeByType: Record<string, number>;
  taskCounts: {
    todo: number;
    inProgress: number;
    done: number;
    total: number;
  };
}

export interface TaskTreeNode {
  task: TaskEntry;
  children: TaskTreeNode[];
}

// --- Doc types ---

export type DocScope = "global" | "feature" | "api";

export interface DocEntry {
  id: string; // URL-safe slug
  filename: string;
  title: string;
  summary: string; // 120文字以内
  scope: DocScope;
  relatedFiles: string[]; // プロジェクトルートからの相対パス
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocIndex {
  version: "1.0";
  docs: DocEntry[];
}

export function getConfig(): MnemoConfig {
  return {
    dataDir: process.env.MNEMO_DATA_DIR || `${process.env.HOME}/.mnemo`,
    ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
    embedModel: process.env.EMBED_MODEL || "nomic-embed-text",
    defaultLimit: 10,
  };
}
