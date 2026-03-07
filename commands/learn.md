---
description: Record knowledge (lesson, pitfall, pattern, preference, solution) into Mnemo for cross-project retrieval
argument-hint: [description of what you learned]
allowed-tools: [mnemo_learn]
---

# /learn - Record Knowledge

The user wants to capture knowledge from this session into Mnemo.

## Steps

1. If the user provided a description, analyze it to determine:
   - **type**: lesson (general learning), pitfall (something that went wrong), pattern (reusable code/approach), preference (coding style), solution (fix for a specific problem)
   - **title**: A concise summary (1 line)
   - **content**: Detailed explanation including the problem, solution, and lessons learned
   - **project**: Current project name if relevant
   - **tags**: Relevant keywords
   - **language**: Programming language if applicable
   - **framework**: Framework if applicable

2. If the user did NOT provide a description, review the current session and suggest what could be captured. Ask the user to confirm.

3. Call `mnemo_learn` with the structured data.

4. Confirm what was stored.
