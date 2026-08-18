export type ConversationStatus = 'active' | 'pending_clarification' | 'escalated' | 'resolved' | 'closed';

export interface Conversation {
  id: string;
  status: ConversationStatus;
  metadata: Record<string, unknown>;
  last_activity_at: string;
  resolved_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface IntentCategory {
  id: string;
  name: string;
  parent_id: string | null;
  description: string;
  examples: string[];
  confidence_threshold: number;
  keywords: string[];
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OrchestratorRule {
  id: string;
  name: string;
  description: string;
  prompt_template: string;
  priority: number;
  requires_clarification_prompt: string;
  escalation_trigger: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface RuleCategoryLink {
  id: string;
  rule_id: string;
  category_id: string;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  source_type: string;
  connection_config: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiConnector {
  id: string;
  name: string;
  endpoint_pattern: string;
  auth_type: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrchestratorLog {
  id: string;
  conversation_id: string;
  message_id: string | null;
  detected_category: string;
  confidence_score: number;
  secondary_categories: string[];
  detected_entities: Record<string, unknown>;
  rule_used: string;
  data_sources_queried: string[];
  prompt_assembled: string;
  tokens_used: number;
  latency_ms: number;
  llm_model: string;
  resolution_status: string;
  created_at: string;
}

export interface ConversationFeedback {
  id: string;
  conversation_id: string;
  message_id: string | null;
  rating: 'positive' | 'negative';
  comment: string | null;
  created_at: string;
}

export interface LlmConfig {
  id: string;
  provider: string;
  model: string;
  api_key_placeholder: string;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface ClassificationResult {
  primary_category: string;
  primary_category_id: string;
  confidence: number;
  secondary_categories: string[];
  entities: Record<string, unknown>;
  rule: string;
  rule_id: string;
}

export interface OrchestratorStage {
  stage: number;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  details?: Record<string, unknown>;
}

export interface OrchestratorResult {
  response: string;
  classification: ClassificationResult;
  stages: OrchestratorStage[];
  log: Omit<OrchestratorLog, 'id' | 'created_at'>;
  shouldAskResolution: boolean;
}
