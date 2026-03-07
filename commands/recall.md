---
description: Search the Mnemo knowledge base using semantic + keyword hybrid search
argument-hint: <search query>
allowed-tools: [mnemo_recall]
---

# /recall - Search Knowledge

The user wants to search the Mnemo knowledge base.

## Steps

1. Take the user's query and call `mnemo_recall` with it.

2. If the user specified filters (project, language, framework, type), include them.

3. Present results clearly, highlighting the most relevant entries.

4. If a result is directly applicable to the current context, offer to apply it.
