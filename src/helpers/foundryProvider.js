// Main-process model factory for the one LLM provider of the local meeting
// assistant: Azure AI Foundry's OpenAI v1 API, or any OpenAI-compatible server.
// It is reached through the enterprise streaming route (getEnterpriseAIModel),
// so the key stays in the main process and the renderer only sends a base URL.

const { isBlockedUrl } = require("./blockedHosts");
const { isPrivateIPv4, isPrivateIPv6 } = require("./enterpriseProviderErrors");

const { isAzureHost } = require("./azureHosts.js");

const METADATA_HOSTS = new Set([
  "169.254.169.254",
  "169.254.170.2",
  "100.100.100.200",
  "metadata.google.internal",
  "metadata",
]);

function hostnameOf(url) {
  // URL.hostname keeps the brackets around an IPv6 literal.
  return url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isLoopbackOrPrivateHost(hostname) {
  const embedded = embeddedIPv4(ipv6Groups(hostname));
  if (embedded) return isPrivateIPv4(embedded);
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    isPrivateIPv4(hostname) ||
    isPrivateIPv6(hostname)
  );
}

// Expands an IPv6 literal (brackets already stripped) to eight 16-bit groups.
function ipv6Groups(hostname) {
  if (!hostname.includes(":")) return null;
  let text = hostname;
  const dotted = text.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const [, head, a, b, c, d] = dotted;
    text = `${head}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? left.length !== 8 : missing < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right].map(
    (g) => parseInt(g, 16)
  );
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null;
}

// The IPv4 address an IPv6 literal carries (IPv4-mapped ::ffff:a.b.c.d,
// IPv4-compatible ::a.b.c.d and NAT64 64:ff9b::a.b.c.d), in any spelling.
function embeddedIPv4(groups) {
  if (!groups) return null;
  const headZero = groups.slice(0, 5).every((g) => g === 0);
  const mapped = headZero && (groups[5] === 0xffff || groups[5] === 0);
  const nat64 =
    groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0);
  if (!mapped && !nat64) return null;
  const hi = groups[6];
  const lo = groups[7];
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

// `new URL` already folds decimal, octal and hex IPv4 forms (2852039166,
// 0251.0376.0251.0376, 0xa9fea9fe) into dotted form, so only IPv6 needs decoding.
function isMetadataHost(hostname) {
  if (METADATA_HOSTS.has(hostname)) return true;
  const groups = ipv6Groups(hostname);
  const ipv4 = groups ? embeddedIPv4(groups) : hostname;
  if (ipv4 && /^169\.254\./.test(ipv4)) return true;
  if (!groups) return false;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  return (
    groups[0] === 0xfd00 &&
    groups[1] === 0x0ec2 &&
    groups.slice(2, 7).every((g) => g === 0) &&
    groups[7] === 0x254
  );
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
 * Runtime for the enterprise routes. Key, base URL and wire API all come from
 * main's own store; whatever the renderer put in `config` is ignored, so the
 * renderer can never choose where the stored key is sent.
 */
function resolveFoundryRuntime(env, model) {
  const saved = env?.getFoundryConfig?.() || {};
  return {
    provider: "foundry",
    model,
    apiKey: getFoundryCredential(env).apiKey,
    enterprise: {
      foundryBaseUrl: saved.baseUrl || "",
      foundryWireApi: saved.wireApi || "responses",
    },
  };
}

/**
 * Validates and stores the base URL and wire API. Moving to another origin
 * clears the stored key (via `clearKey`), so it can't follow the user to a host
 * they never entered it for.
 */
function applyFoundryConfig(env, input, clearKey) {
  const baseUrl = normalizeFoundryBaseUrl(input?.baseUrl);
  validateFoundryEndpoint(baseUrl);
  const wireApi = input?.wireApi === "chat" ? "chat" : "responses";
  const previous = env.getFoundryConfig?.()?.baseUrl;
  let keyCleared = false;
  // Fail closed: a stored key stays only when the previous URL is known, parses and
  // shares the new origin. No previous URL, or an unparsable one, clears it.
  if (env.getFoundryApiKey?.()) {
    let previousOrigin = null;
    if (previous) {
      try {
        previousOrigin = new URL(previous).origin;
      } catch {
        previousOrigin = null;
      }
    }
    if (previousOrigin === null || previousOrigin !== new URL(baseUrl).origin) {
      clearKey();
      keyCleared = true;
    }
  }
  env.saveFoundryConfig({ baseUrl, wireApi });
  return { baseUrl, wireApi, keyCleared };
}

// Models (per base URL) that answered 400 to `include`; skipped for the rest of the process.
const includeUnsupported = new Set();

// Azure's chat completions reject `max_tokens` for newer deployments; the SDK
// only renames it for models it recognises as reasoning models.
// Redirects are refused: a followed redirect would hand the API key to another host.
function createFoundryFetch(azure, baseURL) {
  return async (input, rawInit) => {
    const init = { ...rawInit, redirect: "error" };
    let body = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        // Not JSON: send it as it is.
      }
    }
    if (!body || typeof body !== "object") return globalThis.fetch(input, init);
    if (azure && "max_tokens" in body) {
      if (body.max_completion_tokens == null) body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
    }
    const compatKey = `${baseURL}|${body.model}`;
    if (includeUnsupported.has(compatKey)) delete body.include;
    const send = (payload) => globalThis.fetch(input, { ...init, body: JSON.stringify(payload) });
    const response = await send(body);
    if (response.status === 400 && Array.isArray(body.include) && body.include.length > 0) {
      const text = await response
        .clone()
        .text()
        .catch(() => "");
      if (/encrypted_content|include/i.test(text)) {
        includeUnsupported.add(compatKey);
        const { include: _dropped, ...rest } = body;
        return send(rest);
      }
    }
    return response;
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
    fetch: createFoundryFetch(azure, baseURL),
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
  applyFoundryConfig,
  isAzureHost,
};
