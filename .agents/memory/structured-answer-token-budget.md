---
name: Structured answer token budget
description: GPT-5 completion limits must allow both reasoning and the structured answer body.
---

Structured-output limits must leave room for both model reasoning and the serialized answer. Inspect the provider finish reason separately from parsing and grounding outcomes; a `length` response can contain no usable JSON even when the requested answer is short.

**Why:** Reasoning and JSON share the completion budget, so a valid short answer can still be truncated before any structured content is returned.

**How to apply:** After changing a structured response schema, test output-limit behavior, record the finish reason, reserve a bounded completion budget for the full schema, and recover at most once using the same evidence.
