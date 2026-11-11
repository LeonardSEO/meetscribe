// Azure OpenAI / AI Foundry hosts, the only Foundry servers that need an API key.
// ESM, shared by main (require(esm)) and the renderer.
export const AZURE_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".services.ai.azure.com",
  ".cognitiveservices.azure.com",
];

export function isAzureHost(hostname) {
  const host = String(hostname).toLowerCase();
  return AZURE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
