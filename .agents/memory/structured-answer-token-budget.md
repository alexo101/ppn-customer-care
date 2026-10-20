---
name: Structured answer token budget
description: GPT-5 completion limits must allow both reasoning and the structured answer body.
---

Structured-output limits must leave room for both model reasoning and the serialized answer. Inspect the provider finish reason separately from parsing and grounding outcomes; a `length` response can contain no usable JSON even when the requested answer is short.

**Why:** Reasoning and JSON share the completion budget, so a valid short answer can still be truncated before any structured content is returned.

**How to apply:** After changing a structured response schema, test output-limit behavior, record the finish reason, reserve a bounded completion budget for the full schema, and recover at most once using the same evidence.

Identical support questions can still vary after the bounded retry: provider output may be malformed on both attempts and valid on a later repeat. Do not weaken grounding validation to force an answer; exact FAQ-title matches may use only the directly adjacent, same-language source answer.

**Why:** Recent runtime diagnostics showed the same documented callback question retrieved knowledge but produced invalid structured output twice, then returned a valid answer on a later repeat.

**How to apply:** Keep exact-source fallback narrow and language-aligned. Use model generation for paraphrases until a safe matching strategy is separately validated.
