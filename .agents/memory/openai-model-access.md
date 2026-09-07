---
name: OpenAI model access
description: OpenAI model catalog availability can differ from the configured project's model access.
---

An OpenAI model may be valid and listed publicly while still returning `model_not_found` for the project's API key. A project can also have model access but fail embedding requests with `credit_balance_exhausted`; keep model access and credit availability as separate failure categories.

**Why:** The rule-authoring project could list a current model in documentation but its configured project rejected that model while accepting older accessible models. The embedding project later reported exhausted credit balance even though `text-embedding-3-small` was enabled.

**How to apply:** When an OpenAI request fails, classify `model_not_found`, authentication, and credit/quota errors separately. Inspect accessible models without exposing credentials and use an explicit, logged fallback only when appropriate.