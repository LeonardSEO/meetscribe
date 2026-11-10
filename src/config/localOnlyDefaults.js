// Settings defaults for the local-only meeting assistant: every scope runs the
// checked local Orukeet model and nothing falls back to a cloud engine.
// ESM, shared by the renderer and main (require(esm)).
import { isLocalOnly } from "./localOnly.js";

export const DEFAULT_LOCAL_SPEECH_MODEL = "orukeet-v0.1.0";
export const DEFAULT_LOCAL_SPEECH_PROVIDER = "nvidia";

export const LOCAL_ONLY_DEFAULTS = Object.freeze({
  useLocalWhisper: true,
  meetingUseLocalWhisper: true,
  uploadUseLocalWhisper: true,
  transcriptionMode: "local",
  meetingTranscriptionMode: "local",
  uploadTranscriptionMode: "local",
  localTranscriptionProvider: DEFAULT_LOCAL_SPEECH_PROVIDER,
  meetingLocalTranscriptionProvider: DEFAULT_LOCAL_SPEECH_PROVIDER,
  uploadLocalTranscriptionProvider: DEFAULT_LOCAL_SPEECH_PROVIDER,
  parakeetModel: DEFAULT_LOCAL_SPEECH_MODEL,
  meetingParakeetModel: DEFAULT_LOCAL_SPEECH_MODEL,
  uploadParakeetModel: DEFAULT_LOCAL_SPEECH_MODEL,
  allowOpenAIFallback: false,
  allowLocalFallback: false,
  useCleanupModel: false,
  cleanupMode: "enterprise",
  noteFormattingMode: "enterprise",
});

// The fallback for a setting nothing has stored yet. A stored value always wins
// because callers pass this only as the read helper's fallback.
export function localOnlyDefault(key, upstreamFallback) {
  return isLocalOnly() && Object.hasOwn(LOCAL_ONLY_DEFAULTS, key)
    ? LOCAL_ONLY_DEFAULTS[key]
    : upstreamFallback;
}

// The one answer to "does speech stay on this device": always in local-only,
// otherwise the stored toggle.
export function usesLocalSpeech(settings) {
  return isLocalOnly() || Boolean(settings?.useLocalWhisper);
}

// Local-only has no cloud engine to fall back to, whatever the stored toggle says.
export function cloudFallbackAllowed(allowOpenAIFallback) {
  return !isLocalOnly() && allowOpenAIFallback === true;
}

// Pre-warm env on a fresh install, before anything has written the .env file.
// The pre-warm itself skips a model whose files aren't on disk yet.
export function startupSpeechEnv(env) {
  const provider = env.LOCAL_TRANSCRIPTION_PROVIDER || "";
  const model = env.PARAKEET_MODEL;
  if (!isLocalOnly() || provider || env.LOCAL_WHISPER_MODEL) {
    return { localTranscriptionProvider: provider, parakeetModel: model };
  }
  return {
    localTranscriptionProvider: DEFAULT_LOCAL_SPEECH_PROVIDER,
    parakeetModel: model || DEFAULT_LOCAL_SPEECH_MODEL,
  };
}
