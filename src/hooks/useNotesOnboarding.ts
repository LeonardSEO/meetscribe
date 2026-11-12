import { useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  selectIsCloudCleanupMode,
  selectPolicyEffectiveSettings,
  useSettingsStore,
} from "../stores/settingsStore";
import { useUsage } from "./useUsage";
import { usePolicySnapshot } from "./usePolicy";
import { isLocalOnly } from "../config/localOnly.js";
import { isFoundryConfigured } from "../components/settings/foundryForm";

interface UseNotesOnboardingReturn {
  isComplete: boolean;
  isProUser: boolean;
  isProLoading: boolean;
  isLLMConfigured: boolean;
  complete: () => void;
}

export function useNotesOnboarding(): UseNotesOnboardingReturn {
  const usage = useUsage();
  const localOnly = isLocalOnly();
  // Local-only has no plans: every AI task runs on the user's own Foundry provider.
  const isProUser = !localOnly && usage?.hasPaidAccess === true;
  const isProLoading = !localOnly && usage !== null && usage.status !== "success";
  const foundryConfigured = useSettingsStore((settings) => isFoundryConfigured(settings));
  const policyState = usePolicySnapshot();
  const { useCleanupModel, effectiveModel, isCloudCleanup } = useSettingsStore(
    useShallow((settings) => {
      const effective = selectPolicyEffectiveSettings(settings, policyState);
      return {
        useCleanupModel: effective.useCleanupModel,
        effectiveModel: effective.cleanupModel,
        isCloudCleanup: selectIsCloudCleanupMode(effective),
      };
    })
  );

  const [isComplete, setIsComplete] = useState(
    () => localStorage.getItem("notesOnboardingComplete") === "true"
  );

  const isLLMConfigured = localOnly
    ? foundryConfigured
    : isCloudCleanup || (useCleanupModel && !!effectiveModel);

  const complete = useCallback(() => {
    localStorage.setItem("notesOnboardingComplete", "true");
    setIsComplete(true);
  }, []);

  return { isComplete, isProUser, isProLoading, isLLMConfigured, complete };
}
