import { OpenAIRuleAuthoringProvider } from "./openai-rule-authoring-provider";
import {
  RuleAuthoringProviderError,
  type RuleAuthoringProvider,
} from "./rule-authoring-provider";

export * from "./rule-authoring-provider";

export function createRuleAuthoringProvider(): RuleAuthoringProvider {
  const provider = (process.env.RULE_AUTHORING_LLM_PROVIDER ?? "openai")
    .trim()
    .toLowerCase();

  if (provider === "openai") {
    return getOpenAIProvider();
  }

  throw new RuleAuthoringProviderError(
    `Unsupported rule-authoring provider "${provider}".`,
  );
}

let openAIProvider: RuleAuthoringProvider | undefined;

function getOpenAIProvider(): RuleAuthoringProvider {
  openAIProvider ??= new OpenAIRuleAuthoringProvider();
  return openAIProvider;
}
