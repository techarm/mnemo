import * as lancedb from "@lancedb/lancedb";
import type { ProjectEntry, TaskEntry } from "../types/index.js";
import { getDb } from "./lance-client.js";
import {
  createProjectPlaceholder,
  createTaskPlaceholder,
} from "./project-schema.js";

// ============================================================
// Projects table
// ============================================================

let projectTableInstance: lancedb.Table | null = null;

export async function getProjectTable(): Promise<lancedb.Table> {
  if (projectTableInstance) return projectTableInstance;

  const db = await getDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes("projects")) {
    projectTableInstance = await db.openTable("projects");
    return projectTableInstance;
  }

  // Create table with placeholder, then delete it
  const placeholder = createProjectPlaceholder();
  const table = await db.createTable("projects", [placeholder]);
  await table.delete('id = "__placeholder__"');

  projectTableInstance = table;
  return table;
}

export async function addProject(entry: ProjectEntry): Promise<void> {
  const table = await getProjectTable();
  await table.add([entry as unknown as Record<string, unknown>]);
}

export async function getProjectByName(
  name: string
): Promise<ProjectEntry | null> {
  const table = await getProjectTable();
  const results = (await table
    .query()
    .where(`name = '${name}'`)
    .toArray()) as unknown as ProjectEntry[];
  return results.length > 0 ? results[0] : null;
}

export async function getProjectByPath(
  searchPath: string
): Promise<ProjectEntry | null> {
  const table = await getProjectTable();
  const results = (await table
    .query()
    .where(`path = '${searchPath}'`)
    .toArray()) as unknown as ProjectEntry[];
  return results.length > 0 ? results[0] : null;
}

export async function getAllProjects(): Promise<ProjectEntry[]> {
  const table = await getProjectTable();
  return table.query().toArray() as unknown as ProjectEntry[];
}

export async function updateProject(
  id: string,
  updates: Partial<ProjectEntry>
): Promise<void> {
  const table = await getProjectTable();
  // LanceDB doesn't have native update — delete + re-add
  const existing = (await table
    .query()
    .where(`id = '${id}'`)
    .toArray()) as unknown as ProjectEntry[];
  if (existing.length === 0) throw new Error(`Project not found: ${id}`);

  const updated = {
    ...existing[0],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await table.delete(`id = '${id}'`);
  await table.add([updated as unknown as Record<string, unknown>]);
}

// ============================================================
// Tasks table
// ============================================================

let taskTableInstance: lancedb.Table | null = null;

export async function getTaskTable(): Promise<lancedb.Table> {
  if (taskTableInstance) return taskTableInstance;

  const db = await getDb();
  const tableNames = await db.tableNames();

  if (tableNames.includes("tasks")) {
    taskTableInstance = await db.openTable("tasks");
    return taskTableInstance;
  }

  // Create table with placeholder, then delete it
  const placeholder = createTaskPlaceholder();
  const table = await db.createTable("tasks", [placeholder]);
  await table.delete('id = "__placeholder__"');

  taskTableInstance = table;
  return table;
}

export async function addTaskEntry(entry: TaskEntry): Promise<void> {
  const table = await getTaskTable();
  await table.add([entry as unknown as Record<string, unknown>]);
}

export async function getTasksByProject(
  projectId: string
): Promise<TaskEntry[]> {
  const table = await getTaskTable();
  return table
    .query()
    .where(`\`projectId\` = '${projectId}'`)
    .toArray() as unknown as Promise<TaskEntry[]>;
}

export async function getTaskById(id: string): Promise<TaskEntry | null> {
  const table = await getTaskTable();
  const results = (await table
    .query()
    .where(`id = '${id}'`)
    .toArray()) as unknown as TaskEntry[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Resolve a partial (prefix) task ID to a full task entry.
 * Like git's short commit hash: if the prefix uniquely matches one task, return it.
 * Throws if ambiguous (multiple matches) or not found.
 */
export async function resolveTaskById(
  partialId: string
): Promise<TaskEntry> {
  // Try exact match first
  const exact = await getTaskById(partialId);
  if (exact) return exact;

  // Prefix search: get all tasks and filter by prefix
  const table = await getTaskTable();
  const allTasks = (await table
    .query()
    .toArray()) as unknown as TaskEntry[];

  const matches = allTasks.filter((t) =>
    t.id.startsWith(partialId)
  );

  if (matches.length === 0) {
    throw new Error(`タスクが見つかりません: ${partialId}`);
  }

  if (matches.length > 1) {
    const ids = matches.map((t) => `  ${t.id.slice(0, 12)}... ${t.title}`).join("\n");
    throw new Error(
      `ID "${partialId}" は複数のタスクに一致します。もう少し長いIDを指定してください:\n${ids}`
    );
  }

  return matches[0];
}

export async function updateTaskEntry(
  id: string,
  updates: Partial<TaskEntry>
): Promise<void> {
  const table = await getTaskTable();
  const existing = (await table
    .query()
    .where(`id = '${id}'`)
    .toArray()) as unknown as TaskEntry[];
  if (existing.length === 0) throw new Error(`Task not found: ${id}`);

  const updated = {
    ...existing[0],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await table.delete(`id = '${id}'`);
  await table.add([updated as unknown as Record<string, unknown>]);
}

export async function deleteTaskEntry(id: string): Promise<void> {
  const table = await getTaskTable();
  await table.delete(`id = '${id}'`);
}

export async function getAllTasks(): Promise<TaskEntry[]> {
  const table = await getTaskTable();
  return table.query().toArray() as unknown as TaskEntry[];
}
