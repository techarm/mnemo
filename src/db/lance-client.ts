import * as lancedb from "@lancedb/lancedb";
import * as fs from "node:fs";
import * as path from "node:path";
import type { KnowledgeEntry } from "../types/index.js";
import { getConfig } from "../types/index.js";
import { embedText } from "../embedding/ollama.js";
import { createPlaceholderEntry } from "./schema.js";

let dbInstance: lancedb.Connection | null = null;

export async function getDb(): Promise<lancedb.Connection> {
  if (dbInstance) return dbInstance;

  const config = getConfig();
  const dbPath = path.join(config.dataDir, "lancedb");

  // Ensure data directory exists
  fs.mkdirSync(dbPath, { recursive: true });

  dbInstance = await lancedb.connect(dbPath);
  return dbInstance;
}

export async function getKnowledgeTable(): Promise<lancedb.Table> {
  const db = await getDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes("knowledge")) {
    return db.openTable("knowledge");
  }

  // Create table with a placeholder to define the schema
  const placeholderVector = await embedText("placeholder");
  const placeholder = createPlaceholderEntry(placeholderVector);
  const table = await db.createTable("knowledge", [placeholder as unknown as Record<string, unknown>]);

  // Create FTS indexes
  try {
    await table.createIndex("content", {
      config: lancedb.Index.fts({
        withPosition: false,
        stem: true,
        removeStopWords: true,
        lowercase: true,
      }),
    });
    await table.createIndex("title", {
      config: lancedb.Index.fts({
        withPosition: false,
        stem: true,
        removeStopWords: true,
        lowercase: true,
      }),
    });
  } catch {
    // FTS index creation may fail on small tables; that's ok, will retry later
  }

  // Remove the placeholder
  await table.delete('id = "__placeholder__"');

  return table;
}

export async function addKnowledgeEntry(
  entry: KnowledgeEntry
): Promise<void> {
  const table = await getKnowledgeTable();
  await table.add([entry as unknown as Record<string, unknown>]);
  // Rebuild FTS indexes after adding data
  await rebuildFtsIndexes(table);
}

async function rebuildFtsIndexes(table: lancedb.Table): Promise<void> {
  try {
    await table.createIndex("content", {
      config: lancedb.Index.fts({
        withPosition: false,
        stem: true,
        removeStopWords: true,
        lowercase: true,
      }),
      replace: true,
    });
    await table.createIndex("title", {
      config: lancedb.Index.fts({
        withPosition: false,
        stem: true,
        removeStopWords: true,
        lowercase: true,
      }),
      replace: true,
    });
  } catch {
    // FTS index rebuild may fail; non-critical
  }
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const table = await getKnowledgeTable();
  await table.delete(`id = "${id}"`);
}

export async function getKnowledgeById(id: string): Promise<KnowledgeEntry | null> {
  const table = await getKnowledgeTable();
  const results = (await table
    .query()
    .where(`id = '${id}'`)
    .toArray()) as unknown as KnowledgeEntry[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Resolve a partial (prefix) knowledge ID to a full entry.
 * Like git's short commit hash: if the prefix uniquely matches, return it.
 */
export async function resolveKnowledgeById(
  partialId: string
): Promise<KnowledgeEntry> {
  const exact = await getKnowledgeById(partialId);
  if (exact) return exact;

  const table = await getKnowledgeTable();
  const all = (await table.query().limit(10000).toArray()) as unknown as KnowledgeEntry[];
  const matches = all.filter((e) => e.id.startsWith(partialId));

  if (matches.length === 0) {
    throw new Error(`ナレッジが見つかりません: ${partialId}`);
  }
  if (matches.length > 1) {
    const ids = matches.map((e) => `  ${e.id.slice(0, 12)}... ${e.title}`).join("\n");
    throw new Error(
      `ID "${partialId}" は複数のナレッジに一致します。もう少し長いIDを指定してください:\n${ids}`
    );
  }
  return matches[0];
}

export async function countKnowledgeEntries(): Promise<number> {
  const table = await getKnowledgeTable();
  return table.countRows();
}

export async function getAllKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const table = await getKnowledgeTable();
  return table.query().limit(10000).toArray() as unknown as KnowledgeEntry[];
}
