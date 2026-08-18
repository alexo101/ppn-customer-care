/*
# Seed Orchestrator Data

Populates the orchestrator with the full intent category tree, default rules,
example knowledge sources, API connectors, and the default LLM configuration.

1. Data Seeded
  - LLM config: single row with 'simulated' provider
  - 5 top-level intent categories: Information, Live Data, Analysis, Interaction, Actions
  - 27 subcategories across all top-level categories
  - 5 orchestrator rules (one per top-level category)
  - Rule-category links connecting rules to their categories
  - 4 example knowledge sources (disabled)
  - 4 example API connectors (disabled)

2. Important Notes
  - Uses DO blocks with NOT EXISTS checks for idempotency
  - All example knowledge sources and API connectors are disabled by default
  - The simulated LLM config enables the system to work without a real API key
*/

-- Seed LLM config (only if empty)
INSERT INTO llm_config (provider, model, api_key_placeholder, temperature, max_tokens)
SELECT 'simulated', 'simulated-v1', '', 0.7, 1024
WHERE NOT EXISTS (SELECT 1 FROM llm_config);

-- Seed top-level intent categories
DO $$ 
DECLARE
  v_info_id uuid;
  v_live_id uuid;
  v_analysis_id uuid;
  v_interaction_id uuid;
  v_actions_id uuid;
  v_rule_info_id uuid;
  v_rule_live_id uuid;
  v_rule_analysis_id uuid;
  v_rule_interaction_id uuid;
  v_rule_actions_id uuid;
BEGIN
  -- Only seed if categories table is empty
  IF EXISTS (SELECT 1 FROM intent_categories LIMIT 1) THEN
    RETURN;
  END IF;

  -- Information
  v_info_id := gen_random_uuid();
  INSERT INTO intent_categories (id, name, description, examples, keywords, confidence_threshold, sort_order)
  VALUES (v_info_id, 'Information', 'Questions about documentation, navigation, business rules, workflows, features, and compliance', 
    ARRAY['How do I...', 'Where can I find...', 'What is the policy for...', 'Show me the documentation for...'],
    ARRAY['how', 'what', 'where', 'find', 'documentation', 'docs', 'guide', 'help', 'policy', 'rule', 'navigate', 'feature'],
    0.7, 1);

  INSERT INTO intent_categories (name, parent_id, description, examples, keywords, sort_order) VALUES
    ('Documentation', v_info_id, 'Requests for documentation, guides, or reference material', ARRAY['Show me the docs for...', 'Where is the manual...'], ARRAY['docs', 'documentation', 'manual', 'guide', 'reference', 'readme'], 1),
    ('Navigation', v_info_id, 'Help finding screens, pages, or features in the application', ARRAY['Where is the settings page?', 'How do I get to...'], ARRAY['where', 'find', 'navigate', 'go to', 'page', 'screen', 'menu', 'location'], 2),
    ('Business Rules', v_info_id, 'Questions about business logic, policies, or operational rules', ARRAY['What is the policy for refunds?', 'What are the rules for...'], ARRAY['policy', 'rule', 'regulation', 'requirement', 'allowed', 'prohibited', 'limit'], 3),
    ('Workflow Guidance', v_info_id, 'Step-by-step instructions for completing tasks or processes', ARRAY['How do I submit a claim?', 'What are the steps to...'], ARRAY['how to', 'steps', 'process', 'workflow', 'procedure', 'instructions', 'tutorial'], 4),
    ('Feature Discovery', v_info_id, 'Learning about available features and capabilities', ARRAY['Can the system do...', 'Is there a way to...'], ARRAY['can', 'feature', 'capability', 'able', 'support', 'possible', 'available'], 5),
    ('Compliance', v_info_id, 'Regulatory, legal, or compliance-related questions', ARRAY['Is this GDPR compliant?', 'What are the data retention rules?'], ARRAY['compliance', 'gdpr', 'legal', 'regulation', 'audit', 'privacy', 'retention'], 6);

  -- Live Data
  v_live_id := gen_random_uuid();
  INSERT INTO intent_categories (id, name, description, examples, keywords, confidence_threshold, sort_order)
  VALUES (v_live_id, 'Live Data', 'Requests for real-time data: status checks, lookups, billing, reports, permissions, and integrations',
    ARRAY['What is the status of...', 'Show me the balance for...', 'Check the permissions for...'],
    ARRAY['status', 'check', 'balance', 'lookup', 'show', 'current', 'report', 'permission', 'billing', 'integration'],
    0.75, 2);

  INSERT INTO intent_categories (name, parent_id, description, examples, keywords, sort_order) VALUES
    ('Status Inquiry', v_live_id, 'Checking the current status of orders, tickets, or processes', ARRAY['What is the status of order #123?', 'Is my request approved?'], ARRAY['status', 'state', 'progress', 'pending', 'approved', 'rejected', 'tracking'], 1),
    ('Data Lookup', v_live_id, 'Looking up specific records, accounts, or entities', ARRAY['Find client John Smith', 'Look up contract #456'], ARRAY['find', 'lookup', 'search', 'retrieve', 'get', 'show', 'display', 'record'], 2),
    ('Billing', v_live_id, 'Billing, invoicing, and payment-related queries', ARRAY['What is the outstanding balance?', 'Show me the latest invoice'], ARRAY['billing', 'invoice', 'payment', 'balance', 'charge', 'fee', 'cost', 'price'], 3),
    ('Reporting', v_live_id, 'Requests for reports, metrics, or aggregated data', ARRAY['Show me this months sales report', 'How many tickets were closed?'], ARRAY['report', 'metric', 'analytics', 'dashboard', 'count', 'total', 'summary', 'statistics'], 4),
    ('Permissions', v_live_id, 'Checking or understanding access permissions', ARRAY['Do I have access to...', 'Who can edit this document?'], ARRAY['permission', 'access', 'role', 'authorize', 'rights', 'privilege'], 5),
    ('Integrations', v_live_id, 'Questions about connected systems and integrations', ARRAY['Is Salesforce connected?', 'What integrations are available?'], ARRAY['integration', 'connect', 'sync', 'api', 'webhook', 'salesforce', 'slack'], 6);

  -- Analysis
  v_analysis_id := gen_random_uuid();
  INSERT INTO intent_categories (id, name, description, examples, keywords, confidence_threshold, sort_order)
  VALUES (v_analysis_id, 'Analysis', 'Requests for explanations, validation, troubleshooting, comparisons, and recommendations',
    ARRAY['Why did this happen?', 'Is this data correct?', 'Compare these two options', 'What do you recommend?'],
    ARRAY['why', 'explain', 'validate', 'troubleshoot', 'compare', 'recommend', 'analyze', 'reason', 'cause'],
    0.75, 3);

  INSERT INTO intent_categories (name, parent_id, description, examples, keywords, sort_order) VALUES
    ('Explanation', v_analysis_id, 'Understanding why something happened or how something works', ARRAY['Why was this claim rejected?', 'Explain the calculation for...'], ARRAY['why', 'explain', 'reason', 'cause', 'understand', 'clarify', 'meaning'], 1),
    ('Validation', v_analysis_id, 'Checking if data, configurations, or processes are correct', ARRAY['Is this configuration correct?', 'Validate my input data'], ARRAY['validate', 'verify', 'check', 'correct', 'valid', 'confirm', 'accurate'], 2),
    ('Troubleshooting', v_analysis_id, 'Diagnosing and fixing problems or errors', ARRAY['Why am I getting this error?', 'The export is not working'], ARRAY['error', 'problem', 'issue', 'fix', 'broken', 'not working', 'fail', 'debug', 'troubleshoot'], 3),
    ('Comparison', v_analysis_id, 'Comparing options, plans, features, or data sets', ARRAY['Compare plan A vs plan B', 'What is the difference between...'], ARRAY['compare', 'difference', 'versus', 'vs', 'between', 'contrast', 'better'], 4),
    ('Recommendation', v_analysis_id, 'Seeking suggestions or best practices', ARRAY['What do you recommend for...', 'What is the best approach?'], ARRAY['recommend', 'suggest', 'best', 'advice', 'should', 'optimal', 'ideal'], 5);

  -- Interaction
  v_interaction_id := gen_random_uuid();
  INSERT INTO intent_categories (id, name, description, examples, keywords, confidence_threshold, sort_order)
  VALUES (v_interaction_id, 'Interaction', 'Bug reports, feature requests, feedback, human support requests, and general conversation',
    ARRAY['I found a bug', 'I want to request a feature', 'Can I talk to a human?', 'Thank you for your help'],
    ARRAY['bug', 'feature', 'feedback', 'human', 'agent', 'thanks', 'hello', 'request', 'report'],
    0.7, 4);

  INSERT INTO intent_categories (name, parent_id, description, examples, keywords, sort_order) VALUES
    ('Bug Report', v_interaction_id, 'Reporting software bugs, glitches, or unexpected behavior', ARRAY['I found a bug in...', 'The button does not work', 'There is an error when...'], ARRAY['bug', 'glitch', 'broken', 'crash', 'defect', 'unexpected', 'wrong'], 1),
    ('Feature Request', v_interaction_id, 'Requesting new features or enhancements', ARRAY['Can you add...', 'It would be great if...', 'I wish the system could...'], ARRAY['feature', 'request', 'add', 'wish', 'enhance', 'improvement', 'new'], 2),
    ('Feedback', v_interaction_id, 'Providing general feedback about the product or service', ARRAY['I really like the new...', 'The interface could be better', 'Great job on...'], ARRAY['feedback', 'opinion', 'suggestion', 'like', 'dislike', 'improve', 'great', 'terrible'], 3),
    ('Human Support', v_interaction_id, 'Requesting to speak with a human agent', ARRAY['Can I talk to a real person?', 'Transfer me to support', 'I need a human agent'], ARRAY['human', 'agent', 'person', 'transfer', 'escalate', 'real person', 'support team', 'speak to'], 4),
    ('General Conversation', v_interaction_id, 'Greetings, thanks, small talk, and other general messages', ARRAY['Hello', 'Thank you', 'Goodbye', 'How are you?'], ARRAY['hello', 'hi', 'thanks', 'thank', 'bye', 'goodbye', 'hey', 'good morning', 'good afternoon'], 5);

  -- Actions (future)
  v_actions_id := gen_random_uuid();
  INSERT INTO intent_categories (id, name, description, examples, keywords, confidence_threshold, is_enabled, sort_order)
  VALUES (v_actions_id, 'Actions', 'Future capability: Create, update, delete, export, and execute operations (currently disabled)',
    ARRAY['Create a new ticket', 'Update the record', 'Delete this entry', 'Export the report'],
    ARRAY['create', 'update', 'delete', 'export', 'execute', 'add', 'remove', 'change', 'modify'],
    0.9, false, 5);

  INSERT INTO intent_categories (name, parent_id, description, examples, keywords, is_enabled, sort_order) VALUES
    ('Create', v_actions_id, 'Creating new records or entities', ARRAY['Create a new ticket'], ARRAY['create', 'new', 'add', 'make'], false, 1),
    ('Update', v_actions_id, 'Updating existing records', ARRAY['Update the address'], ARRAY['update', 'edit', 'modify', 'change'], false, 2),
    ('Delete', v_actions_id, 'Deleting records or entities', ARRAY['Delete this entry'], ARRAY['delete', 'remove', 'discard'], false, 3),
    ('Export', v_actions_id, 'Exporting data or reports', ARRAY['Export to CSV'], ARRAY['export', 'download', 'extract'], false, 4),
    ('Execute', v_actions_id, 'Executing processes or workflows', ARRAY['Run the batch process'], ARRAY['execute', 'run', 'trigger', 'start', 'launch'], false, 5);

  -- Create orchestrator rules
  v_rule_info_id := gen_random_uuid();
  INSERT INTO orchestrator_rules (id, name, description, prompt_template, priority) VALUES
    (v_rule_info_id, 'Information Retrieval', 'Handles information requests by searching documentation and knowledge bases', 
     'The user is asking for information. Search the available documentation and knowledge bases to provide an accurate, helpful answer. Context: {{context}}. Question: {{question}}', 10);

  v_rule_live_id := gen_random_uuid();
  INSERT INTO orchestrator_rules (id, name, description, prompt_template, priority, requires_clarification_prompt) VALUES
    (v_rule_live_id, 'Live Data Query', 'Handles real-time data lookups by querying APIs and databases',
     'The user needs real-time data. Query the relevant APIs and databases to retrieve the requested information. Context: {{context}}. Question: {{question}}', 10,
     'I need a bit more information to look that up. Could you provide the specific identifier (like an order number, client name, or account ID)?');

  v_rule_analysis_id := gen_random_uuid();
  INSERT INTO orchestrator_rules (id, name, description, prompt_template, priority) VALUES
    (v_rule_analysis_id, 'Analysis & Reasoning', 'Handles analytical requests requiring explanation, validation, or troubleshooting',
     'The user needs analysis or troubleshooting help. Use the available context and data to provide a thorough, well-reasoned response. Context: {{context}}. Question: {{question}}', 10);

  v_rule_interaction_id := gen_random_uuid();
  INSERT INTO orchestrator_rules (id, name, description, prompt_template, priority) VALUES
    (v_rule_interaction_id, 'User Interaction', 'Handles bug reports, feature requests, feedback, and general conversation',
     'The user is providing feedback or making a request. Acknowledge their input appropriately and guide them on next steps. Context: {{context}}. Question: {{question}}', 5);

  v_rule_actions_id := gen_random_uuid();
  INSERT INTO orchestrator_rules (id, name, description, prompt_template, priority, is_enabled) VALUES
    (v_rule_actions_id, 'Action Execution', 'Future: Handles create, update, delete, export operations',
     'The user wants to perform an action. This capability is currently in development. Inform the user and suggest alternatives. Context: {{context}}. Question: {{question}}', 10, false);

  -- Link rules to categories
  INSERT INTO rule_category_links (rule_id, category_id) VALUES
    (v_rule_info_id, v_info_id),
    (v_rule_live_id, v_live_id),
    (v_rule_analysis_id, v_analysis_id),
    (v_rule_interaction_id, v_interaction_id),
    (v_rule_actions_id, v_actions_id);

  -- Seed knowledge sources (all disabled)
  INSERT INTO knowledge_sources (name, source_type, connection_config, is_enabled) VALUES
    ('Notion Knowledge Base', 'notion', '{"workspace_id": "", "api_key_ref": "NOTION_API_KEY"}', false),
    ('Confluence Wiki', 'confluence', '{"base_url": "", "api_token_ref": "CONFLUENCE_API_TOKEN"}', false),
    ('SharePoint Documents', 'sharepoint', '{"site_url": "", "client_id_ref": "SHAREPOINT_CLIENT_ID"}', false),
    ('Internal FAQ Database', 'custom', '{"endpoint": "", "api_key_ref": "FAQ_API_KEY"}', false);

  -- Seed API connectors (all disabled)
  INSERT INTO api_connectors (name, endpoint_pattern, auth_type, is_enabled) VALUES
    ('Salesforce CRM', '/api/salesforce/{{resource}}', 'oauth2', false),
    ('Billing System', '/api/billing/{{action}}', 'api_key', false),
    ('Ticketing System', '/api/tickets/{{action}}', 'bearer', false),
    ('User Directory', '/api/users/{{lookup}}', 'bearer', false);

END $$;