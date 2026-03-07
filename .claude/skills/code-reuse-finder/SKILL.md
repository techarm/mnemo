---
name: code-reuse-finder
description: Scan the project for duplicated code, similar patterns, and reuse opportunities. Reports findings with concrete refactoring suggestions.
argument-hint: "[focus area or pattern (optional)]"
---

# Code Reuse Finder

Analyze the codebase for duplicated code, similar patterns, and opportunities to consolidate shared logic.

## Your Task

Scan the project's source code and report:
- Functions defined identically in multiple files
- Similar code blocks that could be consolidated
- Repeated patterns that suggest a shared utility is needed

Then optionally record findings to Mnemo.

## Scope Detection

Check `$ARGUMENTS`:
- If empty → scan the entire project
- If provided → focus on that area, directory, or pattern (e.g., `src/core`, `error handling`, `formatLocalTime`)

## Step 1: Project Setup

1. **Detect project**: `mnemo_project(action: detect)`
2. **Identify language**: Check the project's language setting, or infer from file extensions
3. **Discover source files**: Use `Glob` with language-appropriate patterns:
   - TypeScript/JavaScript: `**/*.{ts,tsx,js,jsx}` (exclude `node_modules`, `dist`)
   - Python: `**/*.py`
   - Go: `**/*.go`
   - Other: adapt accordingly
4. Report file count to give scope context

## Step 2: Duplicate Function Detection

Search for function definitions that appear in multiple files:

### TypeScript/JavaScript
```
Grep: "^(export )?(async )?function \w+" → collect function names
Grep: "^(export )?const \w+ = .*(?:=>|\bfunction\b)" → collect arrow/const functions
```

### Python
```
Grep: "^def \w+" → collect function names
```

### Analysis
- Group by function name
- If a function name appears in **2+ files**, flag as duplicate candidate
- Use `Read` to compare the actual implementations
- Classify:
  - **Identical**: Exact same implementation → definitely extract
  - **Near-identical**: Same logic with minor differences (variable names, formatting) → likely extract
  - **Same name, different logic**: Not a true duplicate → skip

## Step 3: Similar Code Pattern Detection

Look beyond function names for structural similarities:

1. **Repeated error handling patterns**:
   ```
   Grep: "catch.*error.*instanceof Error.*message" → find common try/catch patterns
   ```

2. **Repeated formatting/transformation logic**:
   ```
   Grep: distinctive code fragments found in Step 2
   ```

3. **Repeated import groups**:
   ```
   Grep: frequently imported module combinations that suggest shared logic
   ```

4. For each match, `Read` the surrounding context (5-10 lines) to confirm it's a genuine pattern

## Step 4: Report

Present findings organized by severity:

```markdown
## Code Reuse Analysis — [project-name]

Scanned: X files | Language: TypeScript

### Identical Duplicates (extract immediately)

**functionName** — N files with identical implementation
- `path/to/file1.ts` (L42-55)
- `path/to/file2.ts` (L18-31)
→ Suggestion: Extract to `src/utils/xxx.ts` and import

### Near-Identical Patterns (consider consolidating)

**Pattern: [description]** — N occurrences
- `path/to/file1.ts` (L10-15): [brief code summary]
- `path/to/file2.ts` (L30-35): [brief code summary]
→ Difference: [what varies between them]
→ Suggestion: [how to consolidate]

### No Issues Found
(If nothing significant was detected, say so clearly)
```

### Guidelines for reporting
- Include file paths and line numbers for every finding
- Show the actual duplicate code (brief excerpt, not full functions)
- Provide concrete suggestions: where to extract, what to name it, how to import
- Prioritize: identical > near-identical > structural similarity
- If focused on `$ARGUMENTS`, only report findings related to that scope

## Step 5: Mnemo Integration (ask user)

After presenting the report, offer these options:

1. **Record as pattern**: For reusable patterns worth remembering
   ```
   mnemo_learn(type: "pattern", title: "...", content: "...", project: <detected>)
   ```

2. **Create refactoring task**: For duplicates that should be fixed
   ```
   mnemo_task(action: "add", project: <detected>, title: "Consolidate duplicated ...", priority: "medium")
   ```

3. **Skip**: If no action is needed

Always ask the user before recording or creating tasks.

## Example

User: `/code-reuse-finder`

```
## Code Reuse Analysis — mnemo

Scanned: 12 files | Language: TypeScript

### Identical Duplicates (1 found)

**formatLocalTime** — 2 files with identical implementation
- `src/index.ts` (L43-51)
- `bin/mnemo.ts` (L40-48)

```typescript
function formatLocalTime(isoString: string): string {
  const d = new Date(isoString);
  // ... identical 9-line implementation
}
```

→ Extract to `src/utils/format.ts` and import from both files

### Actions
- [ ] Record as pattern?
- [ ] Create refactoring task?
```

## Guidelines

- **Be conservative**: Only flag genuine duplicates, not coincidental similarities
- **Ignore test files**: Unless the user specifically asks about them
- **Ignore type definitions**: Repeated interface shapes are often intentional
- **Minimum threshold**: Don't flag functions under 3 lines — trivial duplication isn't worth extracting
- **Match user's language**: Default to Japanese for explanations if the user uses Japanese
- **Respect project conventions**: Suggest extraction locations that fit the existing directory structure
