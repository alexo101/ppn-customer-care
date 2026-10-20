---
name: Structured answer token budget
description: GPT-5 completion limits must allow both reasoning and the structured answer body.
---

When expanding GPT-5 answer schemas with evidence fields or longer structured output, verify that the completion cap covers reasoning tokens plus the final JSON. A response can finish with `length` and no message content even when the requested answer itself is short.

**Why:** An isolated support-answer evaluation used all 700 completion tokens for reasoning and returned no content. A larger bounded cap allowed the structured answer to complete.

**How to apply:** After changing the response schema, run an isolated provider call, check the finish reason and output, and set a bounded completion cap appropriate to the schema rather than assuming the prior cap still fits.
