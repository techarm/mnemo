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

export async function countKnowledgeEntries(): Promise<number> {
  const table = await getKnowledgeTable();
  return table.countRows();
}

export async function getAllKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const table = await getKnowledgeTable();
  return table.query().toArray() as unknown as KnowledgeEntry[];
}
