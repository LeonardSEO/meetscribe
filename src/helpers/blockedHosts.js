// Hosts the account-free, local-only app must never contact. Enforced on every
// Electron session (main.js) and guarded in the main-process download helpers.
const { isLocalOnly } = require("../config/localOnly");

const BLOCKED_DOMAINS = ["openwhispr.com", "gizmovoice.ai"];

// Exact host -> number of leading path segments before the owner segment.
const BLOCKED_GITHUB_OWNERS = {
  "github.com": { prefix: [], owner: "openwhispr" },
  "api.github.com": { prefix: ["repos"], owner: "openwhispr" },
  "raw.githubusercontent.com": { prefix: [], owner: "openwhispr" },
};

function isBlockedUrl(url) {
  if (!isLocalOnly()) return false;
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  const rule = BLOCKED_GITHUB_OWNERS[host];
  if (!rule) return false;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const prefixMatches = rule.prefix.every((part, i) => segments[i]?.toLowerCase() === part);
  // GitHub owners are case-insensitive.
  return prefixMatches && segments[rule.prefix.length]?.toLowerCase() === rule.owner;
}

// Host only, for logs: paths and queries can carry identifiers.
function hostOf(url) {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return "unknown";
  }
}

// Cancels blocked requests on one Electron session, including code with no guard of its own.
// Electron keeps one onBeforeRequest listener per session; nothing else registers one here,
// so call this once per session (onBeforeSendHeaders is a separate hook and stays untouched).
function blockDisabledHosts(targetSession, log = () => {}) {
  if (!isLocalOnly()) return;
  targetSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
    if (isBlockedUrl(details.url)) {
      log(hostOf(details.url));
      callback({ cancel: true });
      return;
    }
    callback({});
  });
}

module.exports = { isBlockedUrl, hostOf, blockDisabledHosts };
