import { z } from "zod";

export type MeetingMinutes = {
  language: string;
  summary: string;
  topics: { title: string; points: string[] }[];
  decisions: string[];
  actionItems: { task: string; owner: string | null; deadline: string | null }[];
};

export type ParseMinutesResult =
  { ok: true; minutes: MeetingMinutes } | { ok: false; reason: string };

// Model output is data: collapse every whitespace run (newlines included) to one
// space so a string can never open a new heading, list item or paragraph.
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const text = z.string().transform(oneLine);
const optionalText = z
  .string()
  .nullish()
  .transform((value) => {
    const cleaned = value == null ? "" : oneLine(value);
    return cleaned === "" ? null : cleaned;
  });
const textList = z.array(z.string()).transform((items) => items.map(oneLine).filter(Boolean));

const minutesSchema = z.object({
  language: z
    .string()
    .nullish()
    .transform((value) => oneLine(value ?? "") || "en"),
  summary: text,
  topics: z
    .array(z.object({ title: text, points: textList }))
    .transform((topics) => topics.filter((topic) => topic.title !== "")),
  decisions: textList,
  actionItems: z
    .array(z.object({ task: text, owner: optionalText, deadline: optionalText }))
    .transform((items) => items.filter((item) => item.task !== "")),
});

function stripFence(reply: string): string {
  const fenced = reply.trim().match(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/);
  return fenced ? fenced[1].trim() : reply.trim();
}

/** Returns the one balanced `{...}` in `source` if there is exactly one, else null. */
function extractSingleObject(source: string): string | null {
  const start = source.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      return source.slice(i + 1).includes("{") ? null : source.slice(start, i + 1);
    }
  }
  return null;
}

export function parseMinutes(reply: string): ParseMinutesResult {
  if (typeof reply !== "string" || reply.trim() === "") {
    return { ok: false, reason: "Empty reply" };
  }
  const body = stripFence(reply);

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    const candidate = extractSingleObject(body);
    if (!candidate) return { ok: false, reason: "Reply does not contain a single JSON object" };
    try {
      data = JSON.parse(candidate);
    } catch {
      return { ok: false, reason: "Reply is not valid JSON" };
    }
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "Reply is not a JSON object" };
  }
  const parsed = minutesSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: `Invalid minutes: ${issue.path.join(".") || "root"}: ${issue.message}`,
    };
  }
  const { language, summary, topics, decisions, actionItems } = parsed.data;
  return {
    ok: true,
    minutes: {
      language: language ?? "en",
      summary: summary ?? "",
      topics: (topics ?? []).map((t) => ({ title: t.title ?? "", points: t.points ?? [] })),
      decisions: decisions ?? [],
      actionItems: (actionItems ?? []).map((item) => ({
        task: item.task ?? "",
        owner: item.owner ?? null,
        deadline: item.deadline ?? null,
      })),
    },
  };
}

const HEADINGS = {
  nl: {
    summary: "Samenvatting",
    topics: "Bespreekpunten",
    decisions: "Besluiten",
    actions: "Actiepunten",
  },
  en: {
    summary: "Summary",
    topics: "Discussion points",
    decisions: "Decisions",
    actions: "Action items",
  },
} as const;

function headingsFor(language: string) {
  return language.trim().toLowerCase().split(/[-_]/)[0] === "nl" ? HEADINGS.nl : HEADINGS.en;
}

// Text that starts with a block marker would turn into a heading, quote, list,
// fence, rule, table or checkbox; a leading backslash keeps it literal text.
const literalStart = (value: string) =>
  value
    .replace(/^(#|[-+*>]|\d+[.)])(?=\s|#|$)/, "\\$1")
    .replace(/^(?=```|~~~|-{3}|\*{3}|_{3}|={3}|\||\[[ xX]\])/, "\\");

// The action line shape must stay compatible with tagActionItemOwners
// (`- [ ] Task — Owner`): the deadline sits in the task part, the owner is last.
const OWNER_SEPARATOR = " — ";

export function renderMinutesMarkdown(minutes: MeetingMinutes): string {
  const h = headingsFor(minutes.language);
  const line = (value: string) => oneLine(value);
  const sections: string[] = [];

  const summary = line(minutes.summary);
  if (summary) sections.push(`## ${h.summary}\n${literalStart(summary)}`);

  const topics = minutes.topics
    .map((topic) => ({ title: line(topic.title), points: topic.points.map(line).filter(Boolean) }))
    .filter((topic) => topic.title);
  if (topics.length) {
    const body = topics
      .map((t) => [`### ${t.title}`, ...t.points.map((p) => `- ${literalStart(p)}`)].join("\n"))
      .join("\n\n");
    sections.push(`## ${h.topics}\n${body}`);
  }

  const decisions = minutes.decisions.map(line).filter(Boolean);
  if (decisions.length) {
    sections.push(`## ${h.decisions}\n${decisions.map((d) => `- ${literalStart(d)}`).join("\n")}`);
  }

  const actions = minutes.actionItems
    .map((item) => ({
      task: line(item.task),
      owner: item.owner ? line(item.owner) : "",
      deadline: item.deadline ? line(item.deadline) : "",
    }))
    .filter((item) => item.task);
  if (actions.length) {
    const body = actions
      .map(({ task, owner, deadline }) => {
        const head = deadline ? `${task} (${deadline})` : task;
        return `- [ ] ${head}${owner ? `${OWNER_SEPARATOR}${owner}` : ""}`;
      })
      .join("\n");
    sections.push(`## ${h.actions}\n${body}`);
  }

  return sections.join("\n\n") + "\n";
}
