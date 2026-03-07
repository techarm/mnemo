---
name: learn
description: Record a piece of knowledge to Mnemo. Use when the user explicitly says "/learn" to save a lesson, pitfall, preference, pattern, or solution they discovered during the session.
disable-model-invocation: true
argument-hint: "[what you learned]"
---

# Record Knowledge to Mnemo

Save what you just learned to the Mnemo knowledge base so it can be recalled in future sessions.

## Your Task

Given the user's input (`$ARGUMENTS`), do the following:

1. **Determine the knowledge type** based on the content:
   - **pitfall**: A mistake, gotcha, or surprising behavior that caused problems. Something to avoid next time.
   - **lesson**: A general insight or takeaway from experience. Something learned through doing.
   - **solution**: A specific fix or workaround for a concrete problem.
   - **pattern**: A reusable code pattern, architecture approach, or workflow that works well.
   - **preference**: A coding style, convention, or tool choice the user wants to follow consistently.

2. **Extract metadata**:
   - **title**: A concise summary (under 60 characters). This is what appears in search results.
   - **content**: The detailed explanation. Include the "why" — not just what happened, but why it matters and how to apply it.
   - **project**: Detect from the current working directory using `mnemo_project(action: detect)`. If not detected, omit (makes it a global knowledge entry).
   - **tags**: 2-4 relevant keywords for search (e.g., `["lancedb", "query", "limit"]`).
   - **language/framework**: Set if the knowledge is specific to a language or framework.

3. **Save using `mnemo_learn`** MCP tool with the extracted fields.

4. **Confirm** what was saved, showing the type, title, and project.

## Examples

User: `/learn LanceDB query() defaults to limit 10, must use explicit limit(10000)`
- Type: pitfall
- Title: "LanceDB query()のデフォルトlimitは10件"
- Content: "LanceDBのtable.query().toArray()はデフォルトでlimit(10)が適用される。全件取得するにはquery().limit(10000).toArray()のように明示的にlimitを指定する必要がある。"
- Tags: ["lancedb", "query", "limit"]

User: `/learn TypeScript enum values should use string literals for debugging readability`
- Type: preference
- Title: "TypeScript enumは文字列リテラルを使う"
- Content: "デバッグ時の可読性のため、TypeScript の enum は数値ではなく文字列リテラルで定義する。"
- Tags: ["typescript", "enum", "convention"]

## Guidelines

- If the input is too vague, ask for clarification before saving.
- Default to Japanese for title and content if the user's input is in Japanese. Match the user's language.
- Keep titles concise — they should be scannable in a list.
- Make content specific and actionable — future you should be able to apply this without needing more context.
