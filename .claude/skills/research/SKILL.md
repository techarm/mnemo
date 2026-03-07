---
name: research
description: Research a topic using web search and Context7, then persist the findings as reference knowledge in Mnemo for future recall.
argument-hint: "<topic to research>"
---

# Research & Persist Knowledge

Research a topic and save the results to Mnemo as `reference` type knowledge so it can be recalled in future sessions without re-researching.

## Your Task

Given the user's input (`$ARGUMENTS`), do the following:

1. **Detect the current project** using `mnemo_project(action: detect)`.

2. **Determine the research approach** based on the topic:
   - **Library/framework documentation** (e.g., "React 19 Server Components", "LanceDB API"): Use Context7 first (`resolve-library-id` then `query-docs`). If Context7 is unavailable or returns insufficient results, fall back to Web Search + WebFetch.
   - **General topics** (e.g., "best practices for error handling", "OAuth2 PKCE flow"): Use Web Search + WebFetch.
   - **Mixed**: Use both Context7 and Web Search as appropriate.

3. **For each source**, extract:
   - **content** (summary): A concise summary of the key findings (under 500 characters). This is used for semantic search and embedding. Focus on "what is it, when to use it, key takeaways."
   - **rawContent** (full text): The full fetched text content. Preserve code examples, API details, and important context.
   - **sourceUrl**: The URL of the source, or Context7 libraryId (e.g., "/vercel/next.js").
   - **sourceType**: `"web"` or `"context7"`.

4. **Save each finding** using `mnemo_learn` with:
   - `type: "reference"`
   - `title`: Descriptive title (under 60 chars, in the user's language)
   - `content`: The summary (for embedding/search)
   - `rawContent`: The full text
   - `sourceUrl`: Source URL or libraryId
   - `sourceType`: `"web"` or `"context7"`
   - `ttlDays`: Based on content type (see guidelines below)
   - `project`: Detected project (or omit for global)
   - `tags`: 2-4 relevant keywords

5. **Report results**: List what was saved with titles, sources, and TTL.

## TTL Guidelines

Set `ttlDays` based on content freshness expectations:

| Content Type | TTL (days) | Examples |
|-------------|-----------|---------|
| Library docs (stable) | 90 | API reference, getting started guides |
| Blog posts / tutorials | 180 | Technical articles, how-to guides |
| News / announcements | 30 | Release announcements, changelogs |
| Specifications / RFCs | 365 | W3C specs, IETF RFCs |
| Stack Overflow answers | 180 | Solutions, workarounds |

## Context7 Strategy

1. **Try Context7 first** for library/framework topics:
   - Call `resolve-library-id` with the library name
   - If found, call `query-docs` with the specific question
   - Save with `sourceType: "context7"` and `sourceUrl: "<libraryId>"`

2. **Fall back to Web Search** if:
   - Context7 doesn't have the library
   - The returned docs don't answer the question
   - The topic isn't library-specific

3. **Use both** when the topic benefits from multiple perspectives (e.g., official docs from Context7 + community tutorials from web).

## Example

User: `/research React 19 Server Components best practices`

1. Context7: resolve "react" -> query "Server Components best practices"
2. Web Search: "React 19 Server Components best practices 2026"
3. Save 2-3 reference entries:
   - "React 19 Server Components 概要" (context7, TTL 90)
   - "Server Components ベストプラクティス" (web, TTL 180)

## Guidelines

- Don't save trivially simple information that's easy to look up
- Consolidate related findings into a single entry when they come from the same source
- Prefer quality over quantity: 2-3 well-structured references are better than 10 shallow ones
- Match the user's language for titles and summaries
- If the topic has already been researched (check with `mnemo_recall`), inform the user and offer to update the existing references instead of creating duplicates
