import { getLocalModel, isEnterpriseProvider } from "../../models/ModelRegistry";

export const LOCAL_TOOL_MIN_PARAMS_B = 4;

const HOSTED_PROVIDERS = [
  "openai",
  "groq",
  "custom",
  "anthropic",
  "gemini",
  "tinfoil",
  "openrouter",
  "corti",
];

export function estimateModelSizeB(modelId: string): number {
  const match = modelId.match(/-([\d.]+)[bB]/);
  return match ? parseFloat(match[1]) : 0;
}

/** Providers that are neither a hosted cloud nor an enterprise cloud (Foundry included). */
export function isLocalChatProvider(provider: string): boolean {
  return !isEnterpriseProvider(provider) && !HOSTED_PROVIDERS.includes(provider);
}

/**
 * Whether the chat model is offered tools. Hosted and enterprise models always
 * are; a local model only when its catalog entry (or, lacking one, its size) allows.
 */
export function chatSupportsTools({
  llmConfig,
  isCloudAgent,
}: {
  llmConfig: { provider: string; model: string };
  isCloudAgent: boolean;
}): boolean {
  const isLocalProvider = isLocalChatProvider(llmConfig.provider);
  const localModelCanUseTool =
    isLocalProvider &&
    (getLocalModel(llmConfig.model)?.supportsTools ??
      estimateModelSizeB(llmConfig.model) >= LOCAL_TOOL_MIN_PARAMS_B);
  return isCloudAgent || !isLocalProvider || localModelCanUseTool;
}
