// SHA-256 of the published archive for models whose hash the app pins itself.
// The vendored registry (src/models/modelRegistryData.json) must not be edited
// by hand, and it carries no hash for Orukeet; pinning here makes the download
// fail closed on a mismatch instead of running an unchecked archive.
// ESM so the renderer and main (require(esm)) share one copy.
export const PINNED_MODEL_SHA256 = Object.freeze({
  "orukeet-v0.1.0": "f9191f30178cc9122ce2f023bf9fefafc822028307b0efa4caff645ba3fe8d0a",
});

export function pinnedSha256(modelId) {
  return Object.prototype.hasOwnProperty.call(PINNED_MODEL_SHA256, modelId)
    ? PINNED_MODEL_SHA256[modelId]
    : undefined;
}
