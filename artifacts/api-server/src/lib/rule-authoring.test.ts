import { describe, expect, it, vi } from "vitest";
import {
  authorRule,
  normalizeRuleAuthoringDraft,
  validateDraft,
} from "./rule-authoring";
import type {
  RuleAuthoringContext,
  RuleAuthoringDraft,
  RuleAuthoringProvider,
} from "./llm";

const context: RuleAuthoringContext = {
  categories: [
    { id: "billing", name: "Billing" },
    { id: "refunds", name: "Refunds" },
  ],
  sources: [
    { id: "help-center", name: "Help Center" },
    { id: "payments-api", name: "Payments API" },
  ],
  operators: [{ label: "is" }, { label: "contains" }],
  actions: [
    { label: "search answer", requiresSource: true },
    { label: "ask clarification", requiresSource: false },
    { label: "escalate", requiresSource: false },
  ],
  audienceTargets: [
    { id: "acme-users", name: "Acme users", description: "Users at Acme" },
  ],
};

const validDraft: RuleAuthoringDraft = {
  name: "draft",
  description: "draft",
  promptTemplate: "",
  priority: 10,
  requiresClarificationPrompt: "",
  escalationTrigger: false,
  isEnabled: true,
  conditionOperator: "is",
  action: "search answer",
  categoryIds: ["billing"],
  sourceIds: ["help-center"],
  audienceTargetIds: [],
};

describe("authorRule", () => {
  it("approves a valid draft without calling the model or persisting anything", async () => {
    const generate = vi.fn();
    const result = await authorRule(
      {
        message: "OK",
        draft: validDraft,
        awaitingConfirmation: true,
        context,
      },
      { generate } as RuleAuthoringProvider,
    );

    expect(result.status).toBe("approved");
    expect(result.draft?.name).toBe(
      "If Category is Billing then search answer in Help Center",
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("asks what to change after a bare rejection", async () => {
    const generate = vi.fn();
    const result = await authorRule(
      {
        message: "No",
        draft: validDraft,
        awaitingConfirmation: true,
        context,
      },
      { generate } as RuleAuthoringProvider,
    );

    expect(result.status).toBe("needs_changes");
    expect(result.assistantMessage).toContain("What would you like");
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects invented category and source IDs returned by the model", async () => {
    const provider: RuleAuthoringProvider = {
      generate: vi.fn().mockResolvedValue({
        status: "ready",
        assistantMessage: "Please confirm.",
        draft: {
          ...validDraft,
          categoryIds: ["invented-category"],
          sourceIds: ["invented-source"],
        },
        unresolvedFields: [],
      }),
    };

    const result = await authorRule(
      { message: "Handle billing questions", context },
      provider,
    );

    expect(result.status).toBe("clarifying");
    expect(result.unresolvedFields).toEqual(
      expect.arrayContaining(["categoryIds", "sourceIds"]),
    );
    expect(result.assistantMessage).not.toBe("Please confirm.");
    expect(result.assistantMessage).toContain("category");
  });

  it("requires a source for source-backed actions", async () => {
    const provider: RuleAuthoringProvider = {
      generate: vi.fn().mockResolvedValue({
        status: "ready",
        assistantMessage: "Please confirm.",
        draft: { ...validDraft, sourceIds: [] },
        unresolvedFields: [],
      }),
    };

    const result = await authorRule(
      { message: "Search for billing answers", context },
      provider,
    );

    expect(result.status).toBe("clarifying");
    expect(result.unresolvedFields).toContain("sourceIds");
  });

  it("rejects invented audience target IDs", async () => {
    const provider: RuleAuthoringProvider = {
      generate: vi.fn().mockResolvedValue({
        status: "ready",
        assistantMessage: "Please confirm.",
        draft: {
          ...validDraft,
          audienceTargetIds: ["invented-target"],
        },
        unresolvedFields: [],
      }),
    };

    const result = await authorRule(
      { message: "Target Acme users", context },
      provider,
    );

    expect(result.status).toBe("clarifying");
    expect(result.unresolvedFields).toContain("audienceTargetIds");
  });

  it("preserves a valid audience target ID", async () => {
    const provider: RuleAuthoringProvider = {
      generate: vi.fn().mockResolvedValue({
        status: "ready",
        assistantMessage: "Please confirm.",
        draft: {
          ...validDraft,
          audienceTargetIds: ["acme-users"],
        },
        unresolvedFields: [],
      }),
    };

    const result = await authorRule(
      { message: "Target Acme users", context },
      provider,
    );

    expect(result.status).toBe("ready_for_confirmation");
    expect(result.draft?.audienceTargetIds).toEqual(["acme-users"]);
  });

  it("defaults omitted audience targets to an empty array for preview", async () => {
    const { audienceTargetIds: _omitted, ...draftWithoutAudience } = validDraft;
    const provider: RuleAuthoringProvider = {
      generate: vi.fn().mockResolvedValue({
        status: "ready",
        assistantMessage: "Please confirm this rule.",
        draft: draftWithoutAudience,
        unresolvedFields: [],
      }),
    };

    const result = await authorRule(
      { message: "Handle billing questions", context },
      provider,
    );

    expect(result.status).toBe("ready_for_confirmation");
    expect(result.draft?.audienceTargetIds).toEqual([]);
    expect(result.draft?.categoryIds).toEqual(["billing"]);
    expect(result.draft?.sourceIds).toEqual(["help-center"]);
  });

  it("preserves a model clarification instead of guessing an ambiguous value", async () => {
    const provider: RuleAuthoringProvider = {
      generate: vi.fn().mockResolvedValue({
        status: "clarifying",
        assistantMessage: "Do you mean Billing or Refunds?",
        draft: null,
        unresolvedFields: ["categoryIds"],
      }),
    };

    const result = await authorRule(
      { message: "Handle payment questions", context },
      provider,
    );

    expect(result.status).toBe("clarifying");
    expect(result.assistantMessage).toBe("Do you mean Billing or Refunds?");
  });

  it("sends revision requests back to the model with the current draft", async () => {
    const generate = vi.fn().mockResolvedValue({
      status: "ready",
      assistantMessage: "I changed the action to escalate. Is this correct?",
      draft: {
        ...validDraft,
        action: "escalate",
        sourceIds: [],
      },
      unresolvedFields: [],
    });
    const provider = { generate } as RuleAuthoringProvider;

    const revised = await authorRule(
      {
        message: "Escalate instead",
        history: [{ role: "assistant", content: "Please confirm." }],
        draft: validDraft,
        awaitingConfirmation: true,
        context,
      },
      provider,
    );

    expect(revised.status).toBe("ready_for_confirmation");
    expect(revised.draft?.action).toBe("escalate");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ currentDraft: validDraft }),
    );

    const approved = await authorRule(
      {
        message: "Looks good",
        draft: revised.draft,
        awaitingConfirmation: true,
        context,
      },
      provider,
    );
    expect(approved.status).toBe("approved");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("handles malformed model output as an unresolved rule", async () => {
    const provider: RuleAuthoringProvider = {
      generate: vi.fn().mockResolvedValue({
        status: "ready",
        assistantMessage: "Done",
        draft: { action: "search answer" },
        unresolvedFields: [],
      }),
    };

    const result = await authorRule(
      { message: "Make a rule", context },
      provider,
    );
    expect(result.status).toBe("clarifying");
    expect(result.unresolvedFields).toContain("rule");
  });
});

describe("normalizeRuleAuthoringDraft", () => {
  it("fills missing optional arrays so previews can read length safely", () => {
    const { audienceTargetIds: _a, sourceIds: _s, categoryIds: _c, ...rest } =
      validDraft;
    const normalized = normalizeRuleAuthoringDraft(rest);

    expect(normalized.categoryIds).toEqual([]);
    expect(normalized.sourceIds).toEqual([]);
    expect(normalized.audienceTargetIds).toEqual([]);
  });
});

describe("validateDraft", () => {
  it("requires a clarification prompt for the clarification action", () => {
    const result = validateDraft(
      {
        ...validDraft,
        action: "ask clarification",
        sourceIds: [],
        requiresClarificationPrompt: "",
      },
      context,
    );

    expect(result.unresolvedFields).toContain("requiresClarificationPrompt");
  });

  it("rejects fractional priorities before database persistence", () => {
    const result = validateDraft({ ...validDraft, priority: 10.5 }, context);
    expect(result.unresolvedFields).toContain("priority");
  });

  it("accepts drafts that omit audience targets and returns an empty array", () => {
    const { audienceTargetIds: _omitted, ...draftWithoutAudience } = validDraft;
    const result = validateDraft(draftWithoutAudience, context);

    expect(result.unresolvedFields).toEqual([]);
    expect(result.draft?.audienceTargetIds).toEqual([]);
  });
});
