import { supabase } from './supabase';
import type {
  IntentCategory,
  OrchestratorRule,
  ClassificationResult,
  OrchestratorStage,
  OrchestratorResult,
  Message,
} from './types';

type StageCallback = (stages: OrchestratorStage[]) => void;

const RESOLUTION_KEYWORDS = ['thanks', 'thank you', 'solved', 'that works', 'perfect', 'got it', 'great', 'resolved'];
const GREETING_PATTERNS = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'];
const GREETING_RESPONSES = [
  "Hello! I'm your AI support assistant. How can I help you today?",
  "Hi there! What can I assist you with?",
  "Welcome! I'm here to help. What do you need?",
];

function makeStage(stage: number, name: string, status: OrchestratorStage['status'], details?: Record<string, unknown>): OrchestratorStage {
  return { stage, name, status, details };
}

async function loadCategories(): Promise<IntentCategory[]> {
  const { data, error } = await supabase
    .from('intent_categories')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

async function loadRulesForCategory(categoryId: string): Promise<OrchestratorRule | null> {
  const { data: links, error: linkErr } = await supabase
    .from('rule_category_links')
    .select('rule_id')
    .eq('category_id', categoryId);
  if (linkErr) throw linkErr;
  if (!links?.length) return null;

  const parentCat = await supabase
    .from('intent_categories')
    .select('parent_id')
    .eq('id', categoryId)
    .maybeSingle();

  let ruleIds = links.map((l) => l.rule_id);

  if (parentCat.data?.parent_id) {
    const { data: parentLinks } = await supabase
      .from('rule_category_links')
      .select('rule_id')
      .eq('category_id', parentCat.data.parent_id);
    if (parentLinks?.length) {
      ruleIds = [...ruleIds, ...parentLinks.map((l) => l.rule_id)];
    }
  }

  const { data: rules, error: ruleErr } = await supabase
    .from('orchestrator_rules')
    .select('*')
    .in('id', ruleIds)
    .eq('is_enabled', true)
    .order('priority', { ascending: false })
    .limit(1);
  if (ruleErr) throw ruleErr;
  return rules?.[0] ?? null;
}

function classifyIntent(
  message: string,
  categories: IntentCategory[],
): { primary: IntentCategory | null; secondary: IntentCategory[]; confidence: number; entities: Record<string, unknown> } {
  const lower = message.toLowerCase().trim();
  const scored: { cat: IntentCategory; score: number }[] = [];

  for (const cat of categories) {
    let score = 0;
    const kws = cat.keywords ?? [];
    for (const kw of kws) {
      if (lower.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    const exs = cat.examples ?? [];
    for (const ex of exs) {
      const exLower = ex.toLowerCase().replace('...', '');
      if (lower.includes(exLower) || exLower.includes(lower)) {
        score += 2;
      }
    }
    if (score > 0) {
      scored.push({ cat, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      primary: categories[0] ?? null,
      secondary: [],
      confidence: categories.length > 0 ? 0.5 : 0,
      entities: {},
    };
  }

  const maxScore = scored[0].score;
  const confidence = Math.min(0.99, 0.5 + maxScore * 0.1);
  const primary = scored[0].cat;
  const secondary = scored.slice(1, 3).filter((s) => s.score > 0).map((s) => s.cat);

  const entities: Record<string, unknown> = {};
  const uuidMatch = lower.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (uuidMatch) entities.detected_uuid = uuidMatch[0];
  const numberMatch = lower.match(/#(\d+)/);
  if (numberMatch) entities.reference_number = numberMatch[1];
  const emailMatch = lower.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) entities.email = emailMatch[0];

  return { primary, secondary, confidence, entities };
}

function generateSimulatedResponse(
  message: string,
  categoryName: string,
  rule: OrchestratorRule | null,
  conversationHistory: Message[],
): { response: string; shouldAskResolution: boolean } {
  const lower = message.toLowerCase().trim();
  const isFirstMessage = conversationHistory.length <= 1;

  if (GREETING_PATTERNS.some((g) => lower.startsWith(g))) {
    return { response: GREETING_RESPONSES[Math.floor(Math.random() * GREETING_RESPONSES.length)], shouldAskResolution: false };
  }

  if (RESOLUTION_KEYWORDS.some((k) => lower.includes(k)) && !isFirstMessage) {
    return {
      response: "I'm glad I could help! Is there anything else you'd like to know, or is your issue fully resolved?",
      shouldAskResolution: true,
    };
  }

  const interactionCount = conversationHistory.filter((m) => m.sender === 'assistant').length;
  const shouldAskResolution = interactionCount >= 2 && !isFirstMessage;

  if (categoryName === 'Unknown' || !categoryName) {
    return {
      response: "I received your message but I'm not sure how to categorize it yet. Could you provide more details so I can assist you better?",
      shouldAskResolution: false,
    };
  }

  const response = `I've processed your request under the **${categoryName}** category.\n\n` +
    (rule
      ? `Using the **${rule.name}** rule to handle this.\n\n`
      : '') +
    `Here's what I can tell you based on the available information:\n\n` +
    `Your question has been analyzed and categorized. ` +
    `In a production environment, this is where the system would query connected knowledge sources and APIs to provide a detailed, contextual answer.\n\n` +
    `*To get real answers, connect an LLM provider and knowledge sources in the Admin panel.*`;

  return { response, shouldAskResolution };
}

export async function processMessage(
  conversationId: string,
  userMessage: string,
  conversationHistory: Message[],
  onStageUpdate?: StageCallback,
): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const stages: OrchestratorStage[] = [
    makeStage(1, 'Intent Classification', 'pending'),
    makeStage(2, 'Rule Execution & Data Retrieval', 'pending'),
    makeStage(3, 'Response Generation', 'pending'),
    makeStage(4, 'Request Closing', 'pending'),
  ];

  const notify = () => onStageUpdate?.([...stages]);

  // --- Stage 1: Intent Classification ---
  stages[0].status = 'running';
  notify();

  const categories = await loadCategories();
  const { primary, secondary, confidence, entities } = classifyIntent(userMessage, categories);

  const rule = primary ? await loadRulesForCategory(primary.id) : null;

  const classification: ClassificationResult = {
    primary_category: primary?.name ?? 'Unknown',
    primary_category_id: primary?.id ?? '',
    confidence,
    secondary_categories: secondary.map((s) => s.name),
    entities,
    rule: rule?.name ?? 'Default',
    rule_id: rule?.id ?? '',
  };

  stages[0].status = 'completed';
  stages[0].details = {
    category: classification.primary_category,
    confidence: classification.confidence,
    secondary: classification.secondary_categories,
    entities: classification.entities,
  };
  notify();

  // --- Stage 2: Rule Execution & Data Retrieval ---
  stages[1].status = 'running';
  notify();

  const dataSources: string[] = [];
  if (rule) {
    const { data: rds } = await supabase
      .from('rule_data_sources')
      .select('knowledge_source_id, api_connector_id')
      .eq('rule_id', rule.id);
    if (rds?.length) {
      for (const ds of rds) {
        if (ds.knowledge_source_id) {
          const { data: ks } = await supabase
            .from('knowledge_sources')
            .select('name')
            .eq('id', ds.knowledge_source_id)
            .maybeSingle();
          if (ks) dataSources.push(`Knowledge: ${ks.name}`);
        }
        if (ds.api_connector_id) {
          const { data: ac } = await supabase
            .from('api_connectors')
            .select('name')
            .eq('id', ds.api_connector_id)
            .maybeSingle();
          if (ac) dataSources.push(`API: ${ac.name}`);
        }
      }
    }
  }

  const needsClarification = rule?.requires_clarification_prompt &&
    Object.keys(entities).length === 0 &&
    userMessage.split(' ').length < 5;

  stages[1].status = 'completed';
  stages[1].details = {
    rule: rule?.name ?? 'None',
    data_sources: dataSources,
    needs_clarification: !!needsClarification,
  };
  notify();

  // --- Stage 3: Response Generation ---
  stages[2].status = 'running';
  notify();

  let responseText: string;
  let shouldAskResolution = false;

  if (needsClarification && rule?.requires_clarification_prompt) {
    responseText = rule.requires_clarification_prompt;
  } else if (rule?.escalation_trigger) {
    responseText = "I'm connecting you with a human support agent. They'll be able to assist you further. Please hold on while I transfer your conversation.";
  } else {
    const result = generateSimulatedResponse(
      userMessage,
      classification.primary_category,
      rule,
      conversationHistory,
    );
    responseText = result.response;
    shouldAskResolution = result.shouldAskResolution;
  }

  if (shouldAskResolution) {
    responseText += '\n\n---\n*Has your question been answered? If so, I can close this conversation. If not, feel free to ask a follow-up question.*';
  }

  const promptAssembled = `[Category: ${classification.primary_category}] [Rule: ${rule?.name ?? 'None'}] [Context: ${conversationHistory.length} messages] [Data Sources: ${dataSources.join(', ') || 'None'}]\n\nUser: ${userMessage}`;

  const latencyMs = Date.now() - startTime;
  const tokensUsed = Math.floor(userMessage.length / 4) + Math.floor(responseText.length / 4);

  stages[2].status = 'completed';
  stages[2].details = {
    tokens: tokensUsed,
    latency_ms: latencyMs,
    model: 'simulated-v1',
  };
  notify();

  // --- Stage 4: Request Closing ---
  stages[3].status = 'running';
  notify();

  let resolutionStatus = 'active';
  if (rule?.escalation_trigger) {
    resolutionStatus = 'escalated';
  } else if (needsClarification) {
    resolutionStatus = 'pending_clarification';
  } else if (shouldAskResolution) {
    resolutionStatus = 'pending_resolution';
  }

  stages[3].status = 'completed';
  stages[3].details = {
    resolution_status: resolutionStatus,
    should_ask_resolution: shouldAskResolution,
  };
  notify();

  return {
    response: responseText,
    classification,
    stages,
    log: {
      conversation_id: conversationId,
      message_id: null,
      detected_category: classification.primary_category,
      confidence_score: classification.confidence,
      secondary_categories: classification.secondary_categories,
      detected_entities: classification.entities,
      rule_used: rule?.name ?? 'None',
      data_sources_queried: dataSources,
      prompt_assembled: promptAssembled,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
      llm_model: 'simulated-v1',
      resolution_status: resolutionStatus,
    },
    shouldAskResolution,
  };
}

export async function closeInactiveConversations(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('conversations')
    .update({ status: 'closed' })
    .in('status', ['active', 'pending_clarification'])
    .lt('last_activity_at', oneHourAgo)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
