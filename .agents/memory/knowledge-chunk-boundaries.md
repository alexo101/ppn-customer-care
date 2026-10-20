---
name: Knowledge chunk boundaries
description: Retrieval behavior when a knowledge article's FAQ question and answer are split between adjacent chunks.
---

When a retrieved chunk ends with a question matching the user's query, the answer may begin in the next chunk of the same eligible article. Retrieve the adjacent answer before deciding the knowledge base cannot answer.

**Why:** The article indexer splits content by character limits, so FAQ pairs can cross chunk boundaries; the question-only chunk alone can make the model incorrectly reject an answer that is present in the next chunk.

**How to apply:** When changing article indexing, chunk sizes, or retrieval ranking, test both chunks together for questions that match a phrase at the end of a chunk.
