import { v4 as uuidv4 } from "uuid";
import * as path from "node:path";
import type { ProjectEntry, ProjectStats } from "../types/index.js";
import {
  addProject,
  getProjectByName,
  getAllProjects,
  updateProject,
  getTasksByProject,
  resolveProjectById,
  deleteProject,
  deleteTaskEntry,
} from "../db/project-client.js";
import { getAllKnowledgeEntries } from "../db/lance-client.js";

// --- Input types ---

export interface RegisterProjectInput {
  name: string;
  path: string;
  description?: string;
  techStack?: string[];
  language?: string;
  framework?: string;
}

// --- Core functions ---

export async function registerProject(
  input: RegisterProjectInput
): Promise<ProjectEntry> {
  // Check for duplicate name
  const existing = await getProjectByName(input.name);
  if (existing) {
    // Update existing project
    const updates: Partial<ProjectEntry> = {
      path: path.resolve(input.path),
    };
    if (input.description !== undefined) updates.description = input.description;
    if (input.techStack !== undefined)
      updates.techStack = JSON.stringify(input.techStack);
    if (input.language !== undefined) updates.language = input.language;
    if (input.framework !== undefined) updates.framework = input.framework;

    await updateProject(existing.id, updates);
    return { ...existing, ...updates, updatedAt: new Date().toISOString() };
  }

  const now = new Date().toISOString();
  const entry: ProjectEntry = {
    id: uuidv4(),
    name: input.name,
    path: path.resolve(input.path),
    description: input.description ?? "",
    techStack: input.techStack ? JSON.stringify(input.techStack) : "[]",
    language: input.language ?? "",
    framework: input.framework ?? "",
    createdAt: now,
    updatedAt: now,
  };

  await addProject(entry);
  return entry;
}

export async function listProjects(): Promise<ProjectEntry[]> {
  return getAllProjects();
}

export async function getProject(
  name: string
): Promise<ProjectEntry | null> {
  return getProjectByName(name);
}

export async function detectProject(
  workingDir: string
): Promise<ProjectEntry | null> {
  const resolved = path.resolve(workingDir);
  const projects = await getAllProjects();

  // Find projects whose path is a prefix of the working directory
  const matches = projects
    .filter((p) => resolved.startsWith(path.resolve(p.path)))
    .sort((a, b) => b.path.length - a.path.length); // Most specific first

  return matches.length > 0 ? matches[0] : null;
}

export async function removeProject(
  projectId: string
): Promise<{ project: ProjectEntry; deletedTasks: number }> {
  const project = await resolveProjectById(projectId);

  // Cascade delete: remove all tasks belonging to this project
  const tasks = await getTasksByProject(project.id);
  for (const task of tasks) {
    await deleteTaskEntry(task.id);
  }

  await deleteProject(project.id);
  return { project, deletedTasks: tasks.length };
}

export async function getProjectStats(
  projectName: string
): Promise<ProjectStats | null> {
  const project = await getProjectByName(projectName);
  if (!project) return null;

  // Get knowledge count for this project
  const allKnowledge = await getAllKnowledgeEntries();
  const projectKnowledge = allKnowledge.filter(
    (k) => k.project === projectName
  );

  const knowledgeByType: Record<string, number> = {};
  for (const k of projectKnowledge) {
    knowledgeByType[k.type] = (knowledgeByType[k.type] ?? 0) + 1;
  }

  // Get task counts
  const tasks = await getTasksByProject(project.id);
  const taskCounts = {
    todo: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    total: tasks.length,
  };

  return {
    project,
    knowledgeCount: projectKnowledge.length,
    knowledgeByType,
    taskCounts,
  };
}
