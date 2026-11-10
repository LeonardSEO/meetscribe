// Local-only has exactly one speech route: the Orukeet model on this device. Stored
// values from an upstream profile (cloud mode, Whisper, a cloud toggle) must never
// reach a request, so every reader of the effective settings goes through this.
import { isLocalOnly } from "../config/localOnly.js";
import {
  DEFAULT_LOCAL_SPEECH_MODEL,
  DEFAULT_LOCAL_SPEECH_PROVIDER,
} from "../config/localOnlyDefaults.js";
import { getASRModelOrganization } from "../helpers/localASROrganization";

const MODE_KEYS = ["transcriptionMode", "meetingTranscriptionMode", "uploadTranscriptionMode"];
const LOCAL_TOGGLE_KEYS = ["useLocalWhisper", "meetingUseLocalWhisper", "uploadUseLocalWhisper"];
const PROVIDER_KEYS = [
  "localTranscriptionProvider",
  "meetingLocalTranscriptionProvider",
  "uploadLocalTranscriptionProvider",
];
const MODEL_KEYS = ["parakeetModel", "meetingParakeetModel", "uploadParakeetModel"];

const cache = new WeakMap<object, object>();

export function clampLocalOnlySpeech<T extends object>(settings: T): T {
  if (!isLocalOnly()) return settings;
  const cached = cache.get(settings);
  if (cached) return cached as T;

  const source = settings as Record<string, unknown>;
  const clamped: Record<string, unknown> = { ...source };
  let changed = false;
  const set = (key: string, value: unknown): void => {
    if (clamped[key] !== value) {
      clamped[key] = value;
      changed = true;
    }
  };
  for (const key of MODE_KEYS) set(key, "local");
  for (const key of LOCAL_TOGGLE_KEYS) set(key, true);
  for (const key of PROVIDER_KEYS) set(key, DEFAULT_LOCAL_SPEECH_PROVIDER);
  for (const key of MODEL_KEYS) {
    const stored = source[key];
    const isOruk =
      typeof stored === "string" && stored !== "" && getASRModelOrganization(stored) === "oruk";
    set(key, isOruk ? stored : DEFAULT_LOCAL_SPEECH_MODEL);
  }
  const result = (changed ? clamped : settings) as T;
  cache.set(settings, result);
  return result;
}
