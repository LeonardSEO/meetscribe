import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Check, Loader2 } from "../icons";
import TestConnectionButton from "../TestConnectionButton";
import { SectionHeader, SettingsPanel, SettingsPanelRow } from "../ui/SettingsSection";
import { useSettingsStore } from "../../stores/settingsStore";
import { describeProviderError } from "../../utils/describeProviderError";
import {
  fieldForTestFailure,
  foundryKeyRequired,
  ipcErrorMessage,
  parseTokenLimit,
  validateFoundryForm,
  type FoundryField,
  type FoundryFormErrors,
} from "./foundryForm";

type WireApi = "responses" | "chat";

interface ListedModel {
  id: string;
  name: string;
  description: string;
}

interface FoundryFormProps {
  /** Called after the config and key were saved. */
  onSaved?: () => void;
  /** Label of the save button; onboarding says what happens next. */
  saveLabel?: string;
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={id} role="alert" dir="auto" className="text-xs text-destructive">
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={id} dir="auto" className="text-xs text-muted-foreground/70">
      {hint}
    </p>
  ) : null;
}

/**
 * The one LLM provider for every AI task. The base URL, wire API and key live in
 * the main process: this form saves the config first and the key after, because a
 * base URL on another server removes the stored key.
 */
export function FoundryForm({ onSaved, saveLabel }: FoundryFormProps) {
  const { t } = useTranslation();
  const store = useSettingsStore();
  const keyRef = useRef<HTMLInputElement>(null);
  const [baseUrl, setBaseUrl] = useState(store.foundryBaseUrl);
  const [model, setModel] = useState(store.foundryModel);
  const [wireApi, setWireApi] = useState<WireApi>(store.foundryWireApi);
  const [maxInput, setMaxInput] = useState(String(store.foundryMaxInputTokens));
  const [maxOutput, setMaxOutput] = useState(String(store.foundryMaxOutputTokens));
  const [keyDraft, setKeyDraft] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [errors, setErrors] = useState<FoundryFormErrors>({});
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyCleared, setKeyCleared] = useState(false);
  const [testFailure, setTestFailure] = useState<{
    field: "apiKey" | "model" | "baseUrl";
    message: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [listedModels, setListedModels] = useState<ListedModel[] | null>(null);
  const [listingModels, setListingModels] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await window.electronAPI?.getFoundryConfig?.();
        const key = await window.electronAPI?.hasFoundryApiKey?.();
        if (cancelled) return;
        if (config) {
          setBaseUrl(config.baseUrl);
          setWireApi(config.wireApi);
        }
        setHasKey(Boolean(key));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    const unsubscribe = window.electronAPI?.onApiKeyUpdated?.((name: string) => {
      if (name !== "foundryApiKey") return;
      void window.electronAPI?.hasFoundryApiKey?.().then((value) => setHasKey(Boolean(value)));
    });
    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const touch = useCallback(() => {
    setDirty(true);
    setSaved(false);
    setTestFailure(null);
  }, []);

  const handleSave = async () => {
    const found = validateFoundryForm({
      baseUrl,
      model,
      maxInputTokens: maxInput,
      maxOutputTokens: maxOutput,
    });
    setKeyError(null);
    setKeyCleared(false);
    const typedKey = keyRef.current?.value.trim() ?? "";
    if (Object.keys(found).length > 0) {
      setErrors(
        Object.fromEntries(
          Object.entries(found).map(([field, key]) => [field, t(key as string)])
        ) as FoundryFormErrors
      );
      return;
    }
    if (foundryKeyRequired(baseUrl) && !hasKey && !typedKey) {
      setErrors({});
      setKeyError(t("foundry.apiKey.required"));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // Config first: a base URL on another server removes the stored key.
      let result;
      try {
        result = await window.electronAPI!.saveFoundryConfig!({
          baseUrl: baseUrl.trim(),
          wireApi,
        });
      } catch (error) {
        setErrors({
          baseUrl: t("foundry.baseUrl.refused", { message: ipcErrorMessage(error) }),
        } as FoundryFormErrors);
        return;
      }
      setBaseUrl(result.baseUrl);
      if (result.keyCleared) setHasKey(false);

      if (typedKey) {
        try {
          await window.electronAPI!.saveFoundryApiKey!(typedKey);
        } catch (error) {
          setKeyError(t("foundry.apiKey.saveFailed", { message: ipcErrorMessage(error) }));
          return;
        }
        if (keyRef.current) keyRef.current.value = "";
        setKeyDraft(false);
        setHasKey(true);
      } else if (result.keyCleared) {
        setKeyCleared(true);
        setKeyError(t("foundry.apiKey.cleared"));
        // The config is saved; there is no key to send until one is entered again.
      }

      useSettingsStore.getState().setFoundryConfig({
        foundryBaseUrl: result.baseUrl,
        foundryWireApi: result.wireApi,
        foundryModel: model,
        foundryMaxInputTokens: parseTokenLimit(maxInput) ?? undefined,
        foundryMaxOutputTokens: parseTokenLimit(maxOutput) ?? undefined,
      });
      setDirty(false);
      if (typedKey || !result.keyCleared) {
        setSaved(true);
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  };

  // Asks the saved server for its models (or agents) with the saved key.
  const handleListModels = async () => {
    setListingModels(true);
    setListError(null);
    try {
      const result = await window.electronAPI?.listFoundryModels?.();
      if (!result || result.error) {
        setListedModels(null);
        setListError(
          t("foundry.model.listFailed", {
            message: result?.error ? describeProviderError(result.error, t).description : "",
          })
        );
        return;
      }
      const models = result.models ?? [];
      setListedModels(models);
      if (models.length === 0) setListError(t("foundry.model.listEmpty"));
    } catch (error) {
      setListedModels(null);
      setListError(t("foundry.model.listFailed", { message: ipcErrorMessage(error) }));
    } finally {
      setListingModels(false);
    }
  };

  const canListModels =
    loaded && !dirty && Boolean(baseUrl.trim()) && (hasKey || !foundryKeyRequired(baseUrl));
  const pickedModel = listedModels?.find((item) => item.id === model.trim());

  const fieldProps = (field: FoundryField) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": `foundry-${field}-msg`,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel htmlFor="foundry-baseUrl">{t("foundry.baseUrl.label")}</FieldLabel>
        <Input
          id="foundry-baseUrl"
          dir="ltr"
          value={baseUrl}
          disabled={!loaded}
          onChange={(e) => {
            setBaseUrl(e.target.value);
            touch();
          }}
          placeholder="https://your-resource.openai.azure.com/openai/v1"
          className="text-sm font-mono"
          {...fieldProps("baseUrl")}
        />
        <FieldMessage
          id="foundry-baseUrl-msg"
          error={
            errors.baseUrl ?? (testFailure?.field === "baseUrl" ? testFailure.message : undefined)
          }
          hint={t("foundry.baseUrl.help")}
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel htmlFor="foundry-model">{t("foundry.model.label")}</FieldLabel>
        <Input
          id="foundry-model"
          dir="ltr"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            touch();
          }}
          placeholder="gpt-4.1"
          className="text-sm font-mono"
          {...fieldProps("model")}
        />
        <FieldMessage
          id="foundry-model-msg"
          error={errors.model ?? (testFailure?.field === "model" ? testFailure.message : undefined)}
          hint={t("foundry.model.help")}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleListModels()}
            disabled={!canListModels || listingModels}
          >
            {listingModels && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />}
            {t("foundry.model.list")}
          </Button>
          {!canListModels && (
            <span dir="auto" className="text-xs text-muted-foreground/70">
              {t("foundry.model.listNeedsSave")}
            </span>
          )}
        </div>
        {listedModels && listedModels.length > 0 && (
          <div className="space-y-1">
            <label htmlFor="foundry-modelList" className="sr-only">
              {t("foundry.model.pick")}
            </label>
            <select
              id="foundry-modelList"
              value={pickedModel ? pickedModel.id : ""}
              onChange={(e) => {
                if (!e.target.value) return;
                setModel(e.target.value);
                touch();
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">{t("foundry.model.pick")}</option>
              {listedModels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name === item.id ? item.id : `${item.name} (${item.id})`}
                </option>
              ))}
            </select>
            {pickedModel?.description && (
              <p dir="auto" className="text-xs text-muted-foreground/70">
                {pickedModel.description}
              </p>
            )}
          </div>
        )}
        {listError && (
          <p role="alert" dir="auto" className="text-xs text-destructive">
            {listError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <FieldLabel htmlFor="foundry-apiKey">{t("foundry.apiKey.label")}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="foundry-apiKey"
            ref={keyRef}
            type="password"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            placeholder={hasKey ? t("foundry.apiKey.replace") : t("foundry.apiKey.placeholder")}
            onChange={(e) => {
              setKeyDraft(e.target.value.length > 0);
              touch();
            }}
            className="text-sm font-mono"
            aria-invalid={keyError && !keyCleared ? true : undefined}
            aria-describedby="foundry-apiKey-msg"
          />
          {hasKey && !keyDraft && (
            <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
              <Check className="w-3.5 h-3.5" />
              {t("foundry.apiKey.saved")}
            </span>
          )}
        </div>
        <FieldMessage
          id="foundry-apiKey-msg"
          error={keyError ?? (testFailure?.field === "apiKey" ? testFailure.message : undefined)}
          hint={t("foundry.apiKey.help")}
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel htmlFor="foundry-wireApi">{t("foundry.wireApi.label")}</FieldLabel>
        <select
          id="foundry-wireApi"
          value={wireApi}
          onChange={(e) => {
            setWireApi(e.target.value === "chat" ? "chat" : "responses");
            touch();
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="responses">Responses</option>
          <option value="chat">Chat Completions</option>
        </select>
        <FieldMessage id="foundry-wireApi-msg" hint={t("foundry.wireApi.help")} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="foundry-maxInputTokens">
            {t("foundry.limits.input.label")}
          </FieldLabel>
          <Input
            id="foundry-maxInputTokens"
            dir="ltr"
            inputMode="numeric"
            value={maxInput}
            onChange={(e) => {
              setMaxInput(e.target.value);
              touch();
            }}
            className="text-sm font-mono"
            {...fieldProps("maxInputTokens")}
          />
          <FieldMessage
            id="foundry-maxInputTokens-msg"
            error={errors.maxInputTokens}
            hint={t("foundry.limits.input.help")}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="foundry-maxOutputTokens">
            {t("foundry.limits.output.label")}
          </FieldLabel>
          <Input
            id="foundry-maxOutputTokens"
            dir="ltr"
            inputMode="numeric"
            value={maxOutput}
            onChange={(e) => {
              setMaxOutput(e.target.value);
              touch();
            }}
            className="text-sm font-mono"
            {...fieldProps("maxOutputTokens")}
          />
          <FieldMessage
            id="foundry-maxOutputTokens-msg"
            error={errors.maxOutputTokens}
            hint={t("foundry.limits.output.help")}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
          {saving && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />}
          {saveLabel ?? t("foundry.save")}
        </Button>
        {saved && !dirty && (
          <span role="status" className="text-xs text-green-600">
            {t("foundry.saved")}
          </span>
        )}
      </div>

      {!dirty && (hasKey || !foundryKeyRequired(baseUrl)) && baseUrl && model ? (
        <TestConnectionButton
          provider="foundry"
          getConfig={() => ({ model: model.trim() })}
          onFailure={(failure) => {
            const field = failure ? fieldForTestFailure(failure.code) : null;
            setTestFailure(failure && field ? { field, message: failure.message } : null);
            return field !== null;
          }}
        />
      ) : (
        <p dir="auto" className="text-xs text-muted-foreground/70">
          {t("foundry.testNeedsSave")}
        </p>
      )}
    </div>
  );
}

export default function FoundrySection() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <SectionHeader
        title={t("foundry.section.title")}
        description={t("foundry.section.description")}
      />
      <SettingsPanel>
        <SettingsPanelRow>
          <div className="w-full">
            <FoundryForm />
          </div>
        </SettingsPanelRow>
      </SettingsPanel>
    </div>
  );
}
