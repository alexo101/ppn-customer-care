---
name: Fluid rule authoring with country
overview: Redesign manual rule authoring into one fluid guided sentence ("If Country is X, Category is Y, Subcategory is Z (optional), Target is W, then Action") and add a real Country condition backed by a hidden per-domain check, wired end-to-end from the embed snippet through to rule matching.
todos:
  - id: schema
    content: Add nullable conditionCountry column to orchestratorRulesTable and push schema
    status: pending
  - id: shared-country-logic
    content: Add RULE_COUNTRIES, normalizeDomain, countryMatchesDomain, and updated formatRuleSentence in api-server rule-engine.ts and mirror preview logic in frontend lib/rules.ts
    status: pending
  - id: domain-capture
    content: Add pageDomain to ConversationContext (OpenAPI), update embed snippets to send real host domain, update widget.tsx to forward it, update conversations.ts Stage 1 + matchRuleForAgent to evaluate countryMatchesDomain
    status: pending
  - id: api-surface
    content: Add conditionCountry to OrchestratorRule/RuleInput/RuleUpdate/RuleAuthoringDraft in openapi.yaml, run codegen, update routes/rules.ts insert/update/toRules
    status: pending
  - id: manual-form-redesign
    content: Rebuild manual-rule-form.tsx as one fluid guided sentence with Country/Category/Subcategory/Target single-select dropdowns and inline action, removing separated boxed sections
    status: pending
  - id: ai-flow-country
    content: Thread conditionCountry through rule-authoring-provider types, rule-authoring.ts validation/sentence, openai-rule-authoring-provider.ts schema+prompt, and rule-authoring-chat.tsx preview
    status: pending
  - id: rules-tab-tests
    content: Update rules-tab.tsx sentence/search to include country, update/add tests for country validation and domain matching
    status: pending
isProject: false
---


# Update rule authoring: fluid manual builder + hidden country/domain condition

## Current state (relevant files)
- Manual rule UI is boxed into disconnected `<section>`s in [manual-rule-form.tsx](artifacts/support-orchestrator/src/components/manual-rule-form.tsx): Rule details / When should it run (operator + multi-select category tree) / What should happen (action + sources/connectors/templates) / Who does it applies to (multi-checklist targets) / Settings.
- Rule matching happens server-side in `matchRuleForAgent` (`artifacts/api-server/src/routes/conversations.ts:838-917`), gated by `categoryMatchesOperator` and `matchesAudienceTarget` from [rule-engine.ts](artifacts/api-server/src/lib/rule-engine.ts) and [targets.ts](artifacts/api-server/src/lib/targets.ts). There is currently **no concept of country or requesting domain anywhere** in the schema, API, or runtime.
- The chat widget is always loaded via a same-origin-to-the-orchestrator `<iframe>` (`widgetUrlFor` in [deployment-editor.tsx](artifacts/support-orchestrator/src/components/deployment-editor.tsx)); `window.location.href` inside that iframe ([widget.tsx](artifacts/support-orchestrator/src/pages/widget.tsx):87) is the iframe's own URL, never the host page's domain (e.g. `app.papernest.es`). So the "hidden" domain check needs new plumbing: the embed snippet (which runs in the customer page's own context) must capture and forward the real page domain.
- AI-authored rules go through [rule-authoring.ts](artifacts/api-server/src/lib/rule-authoring.ts) + [openai-rule-authoring-provider.ts](artifacts/api-server/src/lib/llm/openai-rule-authoring-provider.ts), sharing the same `RuleAuthoringDraft` shape defined in [rule-authoring-provider.ts](artifacts/api-server/src/lib/llm/rule-authoring-provider.ts).

## Design decisions (assumptions, called out for visibility)
- Country is stored as a single nullable column `conditionCountry: "ES" | "FR" | "IT" | null`. `null` = "Not relevant" = no domain filtering (always passes).
- Domain mapping is fixed: `ES -> app.papernest.es`, `FR -> app.papernest.com`, `IT -> app.papernest.it`. Match is done on the normalized hostname (strip protocol/path/query, strip leading `www.`, case-insensitive exact match).
- If a rule requires a specific country but the request's domain is unknown (e.g. internal dashboard test chat), the rule is treated as **not matching** — it falls through to the next-priority rule rather than risking serving the wrong country's content.
- Category/Subcategory/Target become **single-select** dropdowns in the manual form (per the confirmed cardinality decision), but the underlying storage stays as the existing `categoryIds`/`audienceTargetIds` arrays (max 2 and max 1 entries respectively) so the DB schema, AI-authoring flow, and any existing multi-category rules keep working unchanged.

## 1. Data model: add the Country condition
- [lib/db/src/schema/rules.ts](lib/db/src/schema/rules.ts): add `conditionCountry: text("condition_country")` (nullable, no default) to `orchestratorRulesTable`.
- Run `pnpm --filter @workspace/db run push` to apply the column (dev push, no migration files per this repo's convention).

## 2. Shared country/domain logic
- In [rule-engine.ts](artifacts/api-server/src/lib/rule-engine.ts) add:
  - `RULE_COUNTRIES = [{ code: "ES", label: "Spain", domain: "app.papernest.es" }, { code: "FR", label: "France", domain: "app.papernest.com" }, { code: "IT", label: "Italy", domain: "app.papernest.it" }]`.
  - `normalizeDomain(value)` and `countryMatchesDomain(conditionCountry, requestDomain)` implementing the rule above.
  - Extend `formatRuleSentence` to optionally prepend `Country is {label} and ` when `conditionCountry` is set (omit entirely when not relevant, so existing rule sentences don't change).
- Mirror the same `RULE_COUNTRIES` list, `countryMatchesDomain`-free preview logic, and updated `formatRuleSentence` signature in the frontend [lib/rules.ts](artifacts/support-orchestrator/src/lib/rules.ts) (client-side preview only, no domain matching needed there).

## 3. Capture the requesting domain end-to-end
- **OpenAPI** ([openapi.yaml](lib/api-spec/openapi.yaml) `ConversationContext`, ~line 2030): add optional `pageDomain: string`.
- **Embed snippets** in [deployment-editor.tsx](artifacts/support-orchestrator/src/components/deployment-editor.tsx): update all four generated snippets (`htmlSnippet`, `reactSnippet`, `vueSnippet`, `angularSnippet`) so the `iframe.src` assignment appends the *runtime* host page hostname, e.g. `iframe.src = WIDGET_URL + "&pageDomain=" + encodeURIComponent(window.location.hostname);`. This is evaluated in the customer's page context, so it captures the real `app.papernest.{es,com,it}` host.
- **Widget** ([widget.tsx](artifacts/support-orchestrator/src/pages/widget.tsx)): read `pageDomain` from `useSearch()` alongside `agentId`; include it in `context` on every `sendMessage.mutate` call (rule matching happens on send, so create-time propagation isn't required).
- **API server** ([conversations.ts](artifacts/api-server/src/routes/conversations.ts) Stage 1, ~line 266): extract `requestDomain` from `requestContext.pageDomain`, persist it into `conversation.metadata.context` (same merge pattern already used for `currentUrl`) so it's remembered across turns, and pass it into `matchRuleForAgent`.
- **`matchRuleForAgent`** (`conversations.ts:838-917`): thread `requestDomain` through and add `countryMatchesDomain(rule.conditionCountry, requestDomain)` as an additional predicate alongside the existing category/audience checks.

## 4. API surface for the new field
- [openapi.yaml](lib/api-spec/openapi.yaml): add optional nullable `conditionCountry` (`enum: [ES, FR, IT, null]`) to `OrchestratorRule`, `RuleInput`, `RuleUpdate`, `RuleAuthoringDraft` schemas (not added to any `required` list, matching how `requiresClarificationPrompt` is handled).
- Run `pnpm --filter @workspace/api-spec run codegen` to regenerate zod schemas and the React Query client.
- [routes/rules.ts](artifacts/api-server/src/routes/rules.ts): include `conditionCountry` in the `POST /rules` insert, the `PATCH /rules/:id` updatable-fields loop, and the `toRules()` mapper.

## 5. Manual rule form: the fluid redesign (core of this task)
Rebuild [manual-rule-form.tsx](artifacts/support-orchestrator/src/components/manual-rule-form.tsx) as a single guided flow instead of separate bordered `<section>`s:
- One continuous "sentence" area (still a form, but visually one connected block, e.g. a single soft-bordered card with an internal flowing paragraph/flex-wrap layout, not multiple `SectionHeading` + bordered boxes):
  - "If the visitor is in **[Country ▾]**, the topic is **[Category ▾]** **[Subcategory ▾ (optional)]**, and it applies to **[Target ▾]**, then **[Action ▾]**."
  - Country: new single-select `<Select>` with options Spain / France / Italy / Not relevant (default), backed by `conditionCountry`. No domain field is ever shown — the mapping is fully hidden.
  - Category: replace `CategoryHierarchyPicker`'s multi-select checkbox tree with a single `<Select>` of top-level categories.
  - Subcategory: a second, dependent `<Select>` populated from the chosen category's children, with a "None" option; disabled/hidden until a category is chosen. Together they write `categoryIds = [categoryId, subcategoryId?]`.
  - Target: replace `MultiCheckList` with a single `<Select>` (`Everyone` + each audience target), writing `audienceTargetIds = target ? [target] : []`.
  - Action: keep the existing `VocabPicker` dropdown (already a dropdown), restyled to sit inline in the sentence rather than in its own section.
- Response configuration continues directly beneath the sentence as its natural next step (progressive disclosure, unchanged components — `MultiCheckList` for sources/connectors, `Field`/`Textarea` for prompt template & clarification question) — but without a separate bordered "section" header; use lightweight inline labels so it reads as one continuing flow.
- Name + Description stay as the first small step ("Name this rule so you can find it later") and Enabled/Escalation become compact inline toggles near the end, not a distinct "Settings" box.
- Update the live "Rule preview" sentence at the bottom to include the country clause via the updated `formatRuleSentence`.
- Update `canSave` / validation copy: still requires name + category; country/subcategory/target remain optional.

## 6. Wire Country into the AI ("Describe to AI") flow
- [rule-authoring-provider.ts](artifacts/api-server/src/lib/llm/rule-authoring-provider.ts): add `conditionCountry?: "ES" | "FR" | "IT" | null` to `RuleAuthoringDraft`/`NormalizedRuleAuthoringDraft`, and add `countries` to `RuleAuthoringContext` so the model knows the valid options.
- [rule-authoring.ts](artifacts/api-server/src/lib/rule-authoring.ts): pass `conditionCountry` through `normalizeRuleAuthoringDraft` (default `null`), validate it's one of `ES/FR/IT/null` in `validateDraft` (push `conditionCountry` to `unresolvedFields` only if an invalid value is supplied — never require it), include it in the returned draft, add a `clarificationMessage` label for it, and include it in the `formatRuleSentence` call.
- [openai-rule-authoring-provider.ts](artifacts/api-server/src/lib/llm/openai-rule-authoring-provider.ts): add `conditionCountry` to `RESPONSE_SCHEMA` (nullable enum, required key defaulting to `null`), and mention the country options + "default to null/not relevant unless the user names a country" in the system prompt.
- [rules.ts](artifacts/api-server/src/routes/rules.ts) rule-authoring context builder (`/agents/:agentId/rule-authoring/messages`): include the `countries` list in the context payload sent to `authorRule`.
- [rule-authoring-chat.tsx](artifacts/support-orchestrator/src/components/rule-authoring-chat.tsx): update local `normalizeDraft`/`draftFromRule` to carry `conditionCountry`, and add a "Country" row to `RulePreview` (only rendered when set).

## 7. Rules list & misc
- [rules-tab.tsx](artifacts/support-orchestrator/src/components/rules-tab.tsx): pass `countryLabel` (via `RULE_COUNTRIES` lookup) into `formatRuleSentence` calls so each rule row shows the same rich natural-language sentence (e.g. *"When the user is accessing Spain, asks about Billing → Remuneration... call the Billing API..."*) as the builder preview; include the country label in the search filter string.
- Update [rule-authoring.test.ts](artifacts/api-server/src/lib/rule-authoring.test.ts) fixtures/assertions for the new optional field (should remain green since it's optional/nullable, but add at least one test covering a country round-trip and one covering `countryMatchesDomain`/domain normalization in `rule-engine.ts`).

## Todos
