---
description: Show Mnemo knowledge base status and statistics
allowed-tools: [mnemo_stats]
---

# /mnemo - Status Overview

Show the current state of the Mnemo knowledge management system.

## Steps

1. Call `mnemo_stats` to get knowledge base statistics.

2. Display the results including:
   - Total knowledge entries
   - Breakdown by type (lessons, pitfalls, patterns, etc.)
   - Breakdown by project
   - Breakdown by language

3. Remind the user of available commands:
   - `/learn` - Record new knowledge
   - `/recall <query>` - Search the knowledge base
   - `/project` - Project management (register, list, info, detect)
   - `/task` - Task management (add, list, update, done)
   - `mnemo learn/recall/stats/export/project/task` - CLI commands
