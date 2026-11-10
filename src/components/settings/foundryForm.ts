export type FoundryField = "baseUrl" | "model" | "maxInputTokens" | "maxOutputTokens";

export interface FoundryFormValues {
  baseUrl: string;
  model: string;
  maxInputTokens: string;
  maxOutputTokens: string;
}

export type FoundryFormErrors = Partial<Record<FoundryField, string>>;

/** Whole numbers above zero only; anything else is shown against its own field. */
export function parseTokenLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Returns translation keys per field; an empty object means the form can be saved. */
export function validateFoundryForm(values: FoundryFormValues): FoundryFormErrors {
  const errors: FoundryFormErrors = {};
  const baseUrl = values.baseUrl.trim();
  if (!baseUrl) errors.baseUrl = "foundry.baseUrl.required";
  else if (!/^https?:\/\//i.test(baseUrl)) errors.baseUrl = "foundry.baseUrl.scheme";
  if (!values.model.trim()) errors.model = "foundry.model.required";
  if (parseTokenLimit(values.maxInputTokens) === null)
    errors.maxInputTokens = "foundry.limits.invalid";
  if (parseTokenLimit(values.maxOutputTokens) === null)
    errors.maxOutputTokens = "foundry.limits.invalid";
  return errors;
}

/** Electron prefixes a handler's message; the user only needs the handler's own words. */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "").trim();
}

/** Which field a failed connection test concerns, from the provider error code. */
export function fieldForTestFailure(
  code: string | undefined
): "apiKey" | "model" | "baseUrl" | null {
  switch (code) {
    case "PROVIDER_AUTH_FAILED":
    case "PROVIDER_ACCESS_DENIED":
    case "API_KEY_MISSING":
      return "apiKey";
    case "PROVIDER_MODEL_NOT_FOUND":
      return "model";
    case "PROVIDER_UNREACHABLE":
    case "PROVIDER_TIMEOUT":
    case "PROVIDER_NO_RESPONSE":
    case "PROVIDER_UNAVAILABLE":
      return "baseUrl";
    default:
      return null;
  }
}
