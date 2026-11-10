import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { FoundryForm } from "../settings/FoundrySection";

interface FoundrySetupStepProps {
  /** Finish onboarding, whether the provider was saved or skipped. */
  onDone: () => void;
  isFinishing: boolean;
}

/** The last local-only step. Skippable: transcription works without an LLM. */
export default function FoundrySetupStep({ onDone, isFinishing }: FoundrySetupStepProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-1 pb-4">
      <FoundryForm saveLabel={t("foundry.onboarding.save")} onSaved={onDone} />
      <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
        <p dir="auto" className="text-xs text-muted-foreground/70">
          {t("foundry.onboarding.skipHint")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isFinishing}>
          {t("foundry.onboarding.skip")}
        </Button>
      </div>
    </div>
  );
}
