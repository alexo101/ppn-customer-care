---
name: OpenAI model access
description: OpenAI model catalog availability can differ from the configured project's model access.
---

An OpenAI model may be valid and listed publicly while still returning `model_not_found` for the project's API key. Handle that error explicitly and use a verified accessible model rather than treating the model ID as globally available.

**Why:** The rule-authoring project could list a current model in documentation but its configured project rejected that model while accepting older accessible models.

**How to apply:** When an OpenAI request fails with `model_not_found`, inspect accessible models without exposing credentials and use an explicit, logged fallback only when appropriate.