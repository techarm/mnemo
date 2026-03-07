import type { KnowledgeEntry } from "../types/index.js";

// Placeholder entry used to initialize the knowledge table schema.
// LanceDB infers schema from the first record.
// LanceDB/Arrow requires non-null values for type inference on the first record.
// We use empty strings instead of null for optional fields.
export function createPlaceholderEntry(
  vector: number[]
): Record<string, unknown> {
  return {
    id: "__placeholder__",
    type: "lesson",
    title: "",
    content: "",
    vector,
    project: "",
    tags: "[]",
    language: "",
    framework: "",
    confidence: 0,
    accessCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
