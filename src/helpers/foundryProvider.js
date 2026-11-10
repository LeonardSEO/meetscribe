// Main-process model factory for the one LLM provider of the local meeting
// assistant: Azure AI Foundry's OpenAI v1 API, or any OpenAI-compatible server.
// It is reached through the enterprise streaming route (getEnterpriseAIModel),
// so the key stays in the main process and the renderer only sends a base URL.

const { isBlockedUrl } = require("./blockedHosts");
const { isPrivateIPv4, isPrivateIPv6 } = require("./enterpriseProviderErrors");

const AZURE_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".services.ai.azure.com",
  ".cognitiveservices.azure.com",
];

const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "169.254.170.2",
  "100.100.100.200",
  "metadata.google.internal",
  "metadata",
  "fd00:ec2::254",
]);

function hostnameOf(url) {
  // URL.hostname keeps the brackets around an IPv6 literal.
  return url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isAzureHost(hostname) {
  return AZURE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function isLoopbackOrPrivateHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isPrivateIPv4(hostname) ||
    isPrivateIPv6(hostname)
  );
}

function isMetadataHost(hostname) {
  // The whole IPv4 link-local range holds the metadata services.
  return METADATA_HOSTS.has(hostname) || /^169\.254\./.test(hostname);
}

/** Turns what the user pasted into the OpenAI v1 base URL the SDK appends paths to. */
function normalizeFoundryBaseUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("A base URL is required.");
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("The base URL is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The base URL must start with https:// or http://.");
  }
  if (isAzureHost(hostnameOf(url))) return `${url.origin}/openai/v1`;
  // Query strings and fragments (api-version, keys) never belong in a base URL.
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/**
 * https is allowed on any public host. http is only for a server on this
 * machine or the local network. Cloud metadata hosts are always refused, and so
 * are OpenWhispr hosts in the account-free build.
 */
function validateFoundryEndpoint(endpoint) {
  let url;
  try {
    url = new URL(String(endpoint));
  } catch {
    throw new Error("The base URL is not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The base URL must start with https:// or http://.");
  }
  const hostname = hostnameOf(url);
  if (isMetadataHost(hostname)) throw new Error("Cloud metadata endpoints are not allowed.");
  if (isBlockedUrl(url.href)) throw new Error("This host is not allowed in the local-only app.");
  if (url.protocol === "http:" && !isLoopbackOrPrivateHost(hostname)) {
    throw new Error("Endpoint must use HTTPS unless it is on this machine or your local network.");
  }
}

/** The only place that reads the Foundry credential; Entra sign-in replaces it later. */
function getFoundryCredential(env) {
  return { apiKey: (env?.getFoundryApiKey?.() || "").trim() };
}

/**
 * Runtime for the enterprise routes. The key comes from main's secure store;
 * whatever the renderer put in `config.apiKey` or `managedContext` is ignored.
 */
function resolveFoundryRuntime(env, model, config = {}) {
  const { pickEnterpriseConfig } = require("./enterpriseProviderErrors");
  return {
    provider: "foundry",
    model,
    apiKey: getFoundryCredential(env).apiKey,
    enterprise: pickEnterpriseConfig(config),
  };
}

// Azure's chat completions reject `max_tokens` for newer deployments; the SDK
// only renames it for models it recognises as reasoning models.
function createFoundryFetch(azure) {
  return async (input, init) => {
    if (azure && typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body);
        if (body && "max_tokens" in body) {
          if (body.max_completion_tokens == null) body.max_completion_tokens = body.max_tokens;
          delete body.max_tokens;
          return globalThis.fetch(input, { ...init, body: JSON.stringify(body) });
        }
      } catch {
        // Not JSON: send it as it is.
      }
    }
    return globalThis.fetch(input, init);
  };
}

function createFoundryModel(modelId, apiKey, config = {}) {
  const { createOpenAI } = require("@ai-sdk/openai");
  const { wrapLanguageModel } = require("ai");
  const baseURL = normalizeFoundryBaseUrl(config.foundryBaseUrl);
  validateFoundryEndpoint(baseURL);
  const azure = isAzureHost(hostnameOf(new URL(baseURL)));
  if (azure && !apiKey) {
    const { providerError, PROVIDER_ERROR_CODES } = require("./providerHttpErrors");
    throw providerError(PROVIDER_ERROR_CODES.KEY_MISSING, {
      provider: "Azure AI Foundry",
      surface: "llm",
    });
  }
  const wire = config.foundryWireApi === "chat" ? "chat" : "responses";
  const provider = createOpenAI({
    // Local servers often need no key, but the SDK refuses an empty one.
    apiKey: apiKey || "not-needed",
    baseURL,
    fetch: createFoundryFetch(azure),
  });
  const model = wire === "chat" ? provider.chat(modelId) : provider.responses(modelId);
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v3",
      transformParams: async ({ params }) => {
        const { temperature: _dropped, ...rest } = params;
        if (wire !== "responses") return rest;
        // Azure keeps stored responses for 30 days unless told not to.
        return {
          ...rest,
          providerOptions: {
            ...rest.providerOptions,
            openai: {
              ...rest.providerOptions?.openai,
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        };
      },
    },
  });
}

module.exports = {
  normalizeFoundryBaseUrl,
  validateFoundryEndpoint,
  createFoundryModel,
  getFoundryCredential,
  resolveFoundryRuntime,
};
