import { v4 as uuidv4 } from "uuid";
import type {
  TaskEntry,
  TaskStatus,
  TaskPriority,
  TaskTreeNode,
} from "../types/index.js";
import {
  addTaskEntry,
  getTasksByProject,
  getTaskById,
  resolveTaskById,
  updateTaskEntry,
  deleteTaskEntry,
} from "../db/project-client.js";
import { getProjectByName } from "../db/project-client.js";

// --- Input types ---

export interface AddTaskInput {
  projectName: string; // project name (resolved to projectId internally)
  title: string;
  description?: string;
  priority?: TaskPriority;
  parentId?: string;
  tags?: string[];
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}

// --- Core functions ---

export async function addTask(input: AddTaskInput): Promise<TaskEntry> {
  // Resolve project name to ID
  const project = await getProjectByName(input.projectName);
  if (!project) {
    throw new Error(
      `プロジェクト "${input.projectName}" が見つかりません。先に mnemo project register で登録してください。`
    );
  }

  const now = new Date().toISOString();
  const entry: TaskEntry = {
    id: uuidv4(),
    projectId: project.id,
    title: input.title,
    description: input.description ?? "",
    status: "todo",
    priority: input.priority ?? "medium",
    parentId: input.parentId ?? "",
    tags: input.tags ? JSON.stringify(input.tags) : "[]",
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  };

  await addTaskEntry(entry);
  return entry;
}

export async function listTasks(
  projectName: string,
  filter?: TaskFilter
): Promise<TaskEntry[]> {
  const project = await getProjectByName(projectName);
  if (!project) {
    throw new Error(`プロジェクト "${projectName}" が見つかりません。`);
  }

  let tasks = await getTasksByProject(project.id);

  if (filter?.status) {
    tasks = tasks.filter((t) => t.status === filter.status);
  }
  if (filter?.priority) {
    tasks = tasks.filter((t) => t.priority === filter.priority);
  }

  // Sort: in_progress first, then todo, then done. Within same status: high > medium > low
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    todo: 1,
    done: 2,
  };
  const priorityOrder: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  tasks.sort((a, b) => {
    const statusDiff =
      (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return (
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
    );
  });

  return tasks;
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus
): Promise<TaskEntry> {
  const existing = await resolveTaskById(taskId);

  const updates: Partial<TaskEntry> = { status };
  if (status === "done") {
    updates.completedAt = new Date().toISOString();
  } else {
    updates.completedAt = "";
  }

  await updateTaskEntry(existing.id, updates);
  return { ...existing, ...updates, updatedAt: new Date().toISOString() };
}

export async function updateTask(
  taskId: string,
  updates: UpdateTaskInput
): Promise<TaskEntry> {
  const existing = await resolveTaskById(taskId);

  const patchedUpdates: Partial<TaskEntry> = {};
  if (updates.title !== undefined) patchedUpdates.title = updates.title;
  if (updates.description !== undefined)
    patchedUpdates.description = updates.description;
  if (updates.priority !== undefined) patchedUpdates.priority = updates.priority;
  if (updates.status !== undefined) {
    patchedUpdates.status = updates.status;
    if (updates.status === "done") {
      patchedUpdates.completedAt = new Date().toISOString();
    } else {
      patchedUpdates.completedAt = "";
    }
  }

  await updateTaskEntry(existing.id, patchedUpdates);
  return {
    ...existing,
    ...patchedUpdates,
    updatedAt: new Date().toISOString(),
  };
}

export async function removeTask(taskId: string): Promise<TaskEntry> {
  const existing = await resolveTaskById(taskId);
  await deleteTaskEntry(existing.id);
  return existing;
}

export async function getTaskTree(
  projectName: string
): Promise<TaskTreeNode[]> {
  const project = await getProjectByName(projectName);
  if (!project) {
    throw new Error(`プロジェクト "${projectName}" が見つかりません。`);
  }

  const allTasks = await getTasksByProject(project.id);
  const taskMap = new Map<string, TaskTreeNode>();
  const roots: TaskTreeNode[] = [];

  // Create nodes
  for (const task of allTasks) {
    taskMap.set(task.id, { task, children: [] });
  }

  // Build tree
  for (const node of taskMap.values()) {
    if (node.task.parentId) {
      const parent = taskMap.get(node.task.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node); // Orphaned subtask becomes root
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}
