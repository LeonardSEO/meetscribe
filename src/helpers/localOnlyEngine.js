// The one speech engine of the local-only meeting assistant is Orukeet. These pure
// helpers narrow upstream's engine and mode lists to it; upstream keeps every list
// when local-only is off. ESM, shared by the renderer and tests.
import { isLocalOnly } from "../config/localOnly.js";

export const LOCAL_ONLY_ORGANIZATION_ID = "oruk";

// Dictation, meetings and upload offer only the local mode.
export function localOnlySpeechModes(options) {
  return isLocalOnly() ? options.filter((option) => option.id === "local") : options;
}

// The stored mode of a speech scope, which can only be local in local-only.
export function localOnlySpeechMode(mode) {
  return isLocalOnly() ? "local" : mode;
}

export function localOnlyOrganizations(organizations) {
  return isLocalOnly()
    ? organizations.filter((organization) => organization.id === LOCAL_ONLY_ORGANIZATION_ID)
    : organizations;
}

// Orukeet runs on macOS 15.5 or later. Same value as parakeetCapability.js, which is
// CommonJS and cannot be imported by the renderer (test/components/localOnlyPicker.test.js
// pins that they agree).
export const ORUKEET_MINIMUM_MACOS_VERSION = "15.5";

// Main's last line of defence: whatever the renderer asks for, the only streaming
// speech session in local-only is the local meeting engine. Dictation realtime
// sessions dial a remote service (cloud, BYOK or a custom Orukeet server) and are
// refused; local dictation decodes on this computer through other channels.
// Returns an Error with code LOCAL_ONLY_BLOCKED to refuse, else null.
export function localOnlySpeechRefusal(surface, options = {}) {
  if (!isLocalOnly()) return null;
  if (surface === "meeting" && options.provider === "local") return null;
  return Object.assign(new Error("Cloud speech engines are disabled in local-only mode"), {
    code: "LOCAL_ONLY_BLOCKED",
  });
}
