import { useTranslation } from "react-i18next";
import { Toggle } from "../ui/toggle";
import { SettingsPanel, SettingsPanelRow, SettingsRow } from "../ui/SettingsSection";
import { useSettingsStore } from "../../stores/settingsStore";
import { useAgentName } from "../../utils/agentName";

interface LocalOnlyAiTogglesProps {
  useCleanupModel: boolean;
  setUseCleanupModel: (value: boolean) => void;
}

// Local-only has one model (Foundry) for every AI task, so the only choices left
// are whether dictation text is sent to it for cleanup, the assistant or translation.
export default function LocalOnlyAiToggles({
  useCleanupModel,
  setUseCleanupModel,
}: LocalOnlyAiTogglesProps) {
  const { t } = useTranslation();
  const { agentName } = useAgentName();
  const useDictationAgent = useSettingsStore((s) => s.useDictationAgent);
  const setUseDictationAgent = useSettingsStore((s) => s.setUseDictationAgent);
  const useDictationTranslation = useSettingsStore((s) => s.useDictationTranslation);
  const setUseDictationTranslation = useSettingsStore((s) => s.setUseDictationTranslation);

  return (
    <SettingsPanel>
      <SettingsPanelRow>
        <SettingsRow
          label={t("settingsPage.aiModels.enableTextCleanup")}
          description={t("settingsPage.aiModels.enableTextCleanupDescription")}
        >
          <Toggle checked={useCleanupModel} onChange={setUseCleanupModel} />
        </SettingsRow>
      </SettingsPanelRow>
      <SettingsPanelRow>
        <SettingsRow
          label={t("dictationAgent.enabled")}
          description={t("dictationAgent.enabledDescription", { agentName })}
        >
          <Toggle checked={useDictationAgent} onChange={setUseDictationAgent} />
        </SettingsRow>
      </SettingsPanelRow>
      <SettingsPanelRow>
        <SettingsRow
          label={t("dictationTranslation.enabled")}
          description={t("dictationTranslation.enabledDescription")}
        >
          <Toggle checked={useDictationTranslation} onChange={setUseDictationTranslation} />
        </SettingsRow>
      </SettingsPanelRow>
    </SettingsPanel>
  );
}
