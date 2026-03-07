import { getConfig } from "../types/index.js";

export async function embedText(text: string): Promise<number[]> {
  const config = getConfig();
  const res = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.embedModel, input: text }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama embedding failed (${res.status}): ${res.statusText}. ` +
        `Is Ollama running at ${config.ollamaUrl}?`
    );
  }

  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings[0];
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const config = getConfig();
  const res = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.embedModel, input: texts }),
  });

  if (!res.ok) {
    throw new Error(
      `Ollama embedding failed (${res.status}): ${res.statusText}`
    );
  }

  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}
