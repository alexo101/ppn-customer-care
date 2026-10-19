---
name: Live client lookups
description: Product constraint for identifying clients in chat-based live-data requests.
---

For live client information, chat users provide the client's name; they do not know or have access to the client ID.

**Why:** The user stated that names are less accurate, but chat users do not have access to IDs.

**How to apply:** Design lookup inputs and clarification around names rather than requiring users to supply IDs.

Client names are lookup keys, not authorization. A live-data endpoint must enforce access for the verified workspace user on every request; an agent-level token alone must never grant access to client records. Do not perform live lookups when no verified workspace identity is available.

**Why:** A guessed or ambiguous name cannot establish permission to view private client data, and the public widget does not inherently identify its visitor.

**How to apply:** Bind each response to the signed-in caller and return only explicitly authorized, allowlisted client fields. If a client-specific request lacks a verified identity, do not query; ask the user to sign in. Keep unrelated questions on the knowledge-base path.
