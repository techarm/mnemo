# Mnemo

Knowledge memory system for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Mnemo helps Claude Code remember what you've learned across sessions. It stores lessons, pitfalls, patterns, and solutions in a local vector database, then automatically injects relevant knowledge into future sessions via semantic search.

## Features

- **Semantic Knowledge Search** — Hybrid search (vector + full-text) with Reciprocal Rank Fusion scoring
- **7 Knowledge Types** — lesson, pitfall, pattern, preference, solution, reference, procedure
- **Confidence Decay** — Old, unused knowledge fades naturally; frequently accessed knowledge stays fresh
- **CLAUDE.md Auto-Generation** — Automatically maintains project context from stored knowledge
- **Session Continuity** — Session logs bridge context between conversations
- **User Profile** — Persistent preferences (tools, coding style, communication language)
- **Setup Procedures** — Save and replay tool setup guides across projects
- **Obsidian Export** — Export your knowledge base to an Obsidian vault with wikilinks and frontmatter
- **MCP + CLI** — Use from Claude Code (MCP tools) or terminal (CLI commands)

## Prerequisites

- **Node.js** 18+
- **Ollama** with `nomic-embed-text` model (for local embedding generation)

Install Ollama from [ollama.com](https://ollama.com/download), then:

```bash
ollama pull nomic-embed-text
```

## Installation

```bash
npm install -g @techarm/mnemo
```

## Setup

### Project Setup (recommended for first-time users)

Set up Mnemo for a single project. This configures MCP server, hooks, and skills within the project:

```bash
cd your-project
mnemo init
```

This will:
- Add MCP server config to `.mcp.json`
- Copy hook scripts to `.claude/hooks/`
- Configure hooks in `.claude/settings.json`
- Copy skill definitions to `.claude/skills/`
- Register the project in Mnemo

### Global Setup (all projects)

Set up Mnemo globally so it's available in all Claude Code sessions:

```bash
mnemo init --global
```

This will:
- Register MCP server globally via `claude mcp add --scope user`
- Copy hook scripts to `~/.mnemo/hooks/`
- Configure hooks in `~/.claude/settings.json`

> **Note:** Skills (slash commands) are project-specific. Run `mnemo init` in each project to add skills.

### Removing Configuration

Remove Mnemo configuration from the current project:

```bash
mnemo cleanup
```

Remove global configuration:

```bash
mnemo cleanup --global
```

> **Note:** `cleanup` removes configuration only. Your knowledge data in `~/.mnemo/` is preserved.

## CLI Usage

### Record Knowledge

```bash
# Record a lesson
mnemo learn "Always use explicit limit with LanceDB" \
  -t pitfall \
  -c "LanceDB query().toArray() defaults to limit(10). Use .limit(N) explicitly." \
  -p my-project \
  --tags lancedb,query

# Record a solution
mnemo learn "Fix Docker build cache" \
  -t solution \
  -c "Add --no-cache flag to docker build when dependencies change."
```

### Search Knowledge

```bash
# Semantic search
mnemo recall "database query performance"

# Filter by type
mnemo recall "setup" -t procedure

# Filter by project
mnemo recall "authentication" -p my-app
```

### Project Management

```bash
# Register a project
mnemo project register my-app --path /path/to/my-app --lang typescript

# Detect project from current directory
mnemo project detect

# List projects
mnemo project list
```

### Task Management

```bash
# Add a task
mnemo task add "Implement user auth" -p my-app --priority high

# List tasks
mnemo task list -p my-app

# Mark task as done
mnemo task done <task-id>
```

### Other Commands

```bash
# View statistics
mnemo stats

# Generate CLAUDE.md for a project
mnemo generate my-project

# Export to Markdown
mnemo export

# Export to Obsidian vault
mnemo export -f obsidian

# Manage user profile
mnemo profile show
mnemo profile set tools linter oxlint
mnemo profile set communication language Japanese

# Backup & restore
mnemo backup create
mnemo backup restore <path>

# Session logs
mnemo session list -p my-project
mnemo session recent -p my-project
```

## MCP Tools (Claude Code)

When connected as an MCP server, Claude Code can use these tools:

| Tool | Description |
|------|-------------|
| `mnemo_learn` | Store knowledge (lesson, pitfall, pattern, solution, reference, procedure) |
| `mnemo_recall` | Search knowledge with hybrid semantic + keyword search |
| `mnemo_project` | Register, list, detect projects |
| `mnemo_task` | Manage tasks (add, list, update, done) |
| `mnemo_doc` | Create/update project specification documents |
| `mnemo_generate` | Generate CLAUDE.md from stored knowledge |
| `mnemo_profile` | Manage user profile (identity, tools, coding style) |
| `mnemo_backup` | Create/restore backups |
| `mnemo_stats` | View knowledge base statistics |
| `mnemo_export` | Export to Markdown or Obsidian |
| `mnemo_delete` | Delete knowledge, tasks, or projects |

## Skills (Slash Commands)

| Skill | Command | Description |
|-------|---------|-------------|
| Learn | `/learn` | Extract and record knowledge from the current session |
| Research | `/research` | Research a topic via web/Context7, save as reference |
| Setup | `/setup` | Research tool setup, organize into procedure, save for reuse |
| Session Review | `/session-review` | End-of-session review: extract learnings, update tasks & docs |
| Doc | `/doc` | Create or update project specification documents |
| Code Reuse Finder | `/code-reuse-finder` | Scan for code duplication and reuse opportunities |

## Configuration

Mnemo uses environment variables for configuration:

| Variable | Default | Description |
|----------|---------|-------------|
| `MNEMO_DATA_DIR` | `~/.mnemo` | Data storage directory (LanceDB, sessions, profile) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `EMBED_MODEL` | `nomic-embed-text` | Embedding model name |

## Architecture

```
User Input
    |
    +-- MCP Tools --> src/index.ts --> Core Layer --> LanceDB (~/.mnemo/)
    |                                    |
    +-- CLI ---------> bin/mnemo.ts --> Core Layer --> Ollama (embeddings)
                                         |
                                         +--> .claude/docs/ (project specs)
                                         +--> ~/.mnemo/profile.json (user profile)
                                         +--> ~/.mnemo/sessions/ (session logs)
```

**Stack:** TypeScript, LanceDB (embedded vector DB), Ollama (local embeddings), MCP SDK

## License

[MIT](LICENSE)
