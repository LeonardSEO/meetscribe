import { isLocalOnly } from "../../config/localOnly.js";
import type { ComponentType } from "react";
import { Calendar, Key, Link2, Network, SkillStack, Terminal } from "../icons";

export type IntegrationsSection = "connectors" | "skills" | "calendars" | "api" | "mcp" | "cli";

export const DEFAULT_INTEGRATIONS_SECTION: IntegrationsSection = "calendars";

// Connectors, API keys and MCP are paid cloud features; a local-only build has no plan to
// unlock them, so they are hidden rather than shown with an upsell.
const CLOUD_ONLY_SECTIONS: ReadonlySet<IntegrationsSection> = new Set(["connectors", "api", "mcp"]);

export const INTEGRATIONS_SECTION_GROUPS: ReadonlyArray<{
  id: "assistant" | "meetings" | "developer";
  sections: readonly IntegrationsSection[];
}> = (
  [
    { id: "meetings", sections: ["calendars"] },
    { id: "assistant", sections: ["connectors", "skills"] },
    { id: "developer", sections: ["api", "mcp", "cli"] },
  ] as const
)
  .map((group) => ({
    id: group.id,
    sections: isLocalOnly()
      ? group.sections.filter((section) => !CLOUD_ONLY_SECTIONS.has(section))
      : group.sections,
  }))
  .filter((group) => group.sections.length > 0);

export const INTEGRATIONS_SECTION_ICONS: Record<
  IntegrationsSection,
  ComponentType<{ size?: number; className?: string }>
> = {
  connectors: Link2,
  skills: SkillStack,
  calendars: Calendar,
  api: Key,
  mcp: Network,
  cli: Terminal,
};

export type SectionMeta =
  { kind: "count"; value: number } | { kind: "badge"; badge: "pro" | "free" };

export interface SectionMetaInput {
  isPaid: boolean;
  /** Connectors decide their plan and org policy as the Connectors pane does. */
  connectors: { isPaid: boolean; blockedByOrg: boolean; ready: number };
  connectedCalendars: number;
}

/** The status shown beside a section in the nav: what's connected, or which plan it needs. */
export function sectionMeta(
  section: IntegrationsSection,
  { isPaid, connectors, connectedCalendars }: SectionMetaInput
): SectionMeta | null {
  switch (section) {
    case "connectors":
      // Turned off by the organization: no plan would change that, and no login can act.
      if (connectors.blockedByOrg) return null;
      if (!connectors.isPaid) return { kind: "badge", badge: "pro" };
      return connectors.ready > 0 ? { kind: "count", value: connectors.ready } : null;
    case "calendars":
      return connectedCalendars > 0 ? { kind: "count", value: connectedCalendars } : null;
    case "skills":
      return null;
    case "api":
    case "mcp":
      return isPaid ? null : { kind: "badge", badge: "pro" };
    case "cli":
      // Local mode is free; saying so is the point of surfacing it to free plans.
      return isPaid ? null : { kind: "badge", badge: "free" };
  }
}

export const INTEGRATIONS_SECTIONS: readonly IntegrationsSection[] =
  INTEGRATIONS_SECTION_GROUPS.flatMap((group) => group.sections);
