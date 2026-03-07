// Placeholder entries used to initialize the projects and tasks table schemas.
// LanceDB infers schema from the first record.
// LanceDB/Arrow requires non-null values for type inference.
// These tables do NOT use vector columns (no semantic search needed).

export function createProjectPlaceholder(): Record<string, unknown> {
  return {
    id: "__placeholder__",
    name: "",
    path: "",
    description: "",
    techStack: "[]",
    language: "",
    framework: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createTaskPlaceholder(): Record<string, unknown> {
  return {
    id: "__placeholder__",
    projectId: "",
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    parentId: "",
    tags: "[]",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: "",
  };
}
