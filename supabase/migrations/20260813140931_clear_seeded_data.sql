/*
# Clear all seeded orchestrator data

Removes all pre-seeded categories, subcategories, rules, rule-category links,
knowledge sources, API connectors, rule data sources, and LLM config.
The system will start with a clean slate so users can create their own
categories and rules from scratch.

1. Data Removed
  - All rows from `rule_data_sources` (links between rules and data sources)
  - All rows from `rule_category_links` (links between rules and categories)
  - All rows from `orchestrator_rules` (pre-seeded rules)
  - All rows from `intent_categories` (all pre-seeded categories and subcategories)
  - All rows from `knowledge_sources` (pre-seeded example sources)
  - All rows from `api_connectors` (pre-seeded example connectors)
  - All rows from `llm_config` (pre-seeded LLM configuration)

2. Important Notes
  - Only deletes seed data; table structures and policies remain unchanged.
  - Conversations, messages, logs, and feedback are NOT affected.
  - After this migration the admin UI starts empty -- users create categories from scratch.
*/

DELETE FROM rule_data_sources;
DELETE FROM rule_category_links;
DELETE FROM orchestrator_rules;
DELETE FROM intent_categories;
DELETE FROM knowledge_sources;
DELETE FROM api_connectors;
DELETE FROM llm_config;
