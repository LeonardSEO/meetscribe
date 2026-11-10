import { registryData as modelData } from "../models/registryData.js";
import { isLocalOnly } from "../config/localOnly.js";
import { LOCAL_ONLY_ORGANIZATION_ID, localOnlyOrganizations } from "./localOnlyEngine.js";

const catalog = (): typeof modelData.parakeetModels => modelData.parakeetModels;
// Oruk leads: it is the recommended local route, so it is the first tab everywhere.
const UPSTREAM_LOCAL_ASR_ORGANIZATIONS = [
  { id: "oruk", name: "Oruk" },
  { id: "whisper", name: "OpenAI" },
  { id: "nvidia", name: "NVIDIA" },
  { id: "cohere", name: "Cohere" },
];

// Local-only offers Orukeet and nothing else.
export const LOCAL_ASR_ORGANIZATIONS = localOnlyOrganizations(UPSTREAM_LOCAL_ASR_ORGANIZATIONS);

export function getASRModelOrganization(modelId: string): string {
  return (
    catalog()[modelId]?.organization?.id ||
    (catalog()[modelId]?.modelType === "cohere-transcribe" ? "cohere" : "nvidia")
  );
}

// Organization labels are separate from the existing installation/IPC backend.
export function getSelectedASROrganization(backend: string, modelId: string): string {
  // Whatever backend or blank model is saved, the only tab there is is Oruk.
  if (isLocalOnly()) return LOCAL_ONLY_ORGANIZATION_ID;
  return backend === "nvidia" ? getASRModelOrganization(modelId) : backend;
}

export function usesParakeetManager(organizationId: string): boolean {
  return organizationId === "oruk" || organizationId === "nvidia" || organizationId === "cohere";
}
