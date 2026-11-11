import { MAX_MEETING_SOURCES, MAX_PASSAGE_CHARS } from "../../services/tools/meetingSearchLimits";
import type { ToolCallInfo } from "./types";

export interface MeetingSource {
  ref: number;
  noteId: number;
  title: string;
  date: string;
  speaker: string | null;
  time: string | null;
  text: string;
}

export const MEETING_SOURCE_HREF_PREFIX = "#meeting-source-";

function asSource(raw: unknown): MeetingSource | null {
  if (!raw || typeof raw !== "object") return null;
  const hit = raw as Record<string, unknown>;
  const { ref, noteId } = hit;
  if (typeof ref !== "number" || !Number.isSafeInteger(ref) || ref < 1) return null;
  if (typeof noteId !== "number" || !Number.isSafeInteger(noteId) || noteId <= 0) return null;
  const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
  return {
    ref,
    noteId,
    title: str(hit.title) ?? "",
    date: str(hit.date) ?? "",
    speaker: str(hit.speaker),
    time: str(hit.time),
    text: (str(hit.text) ?? "").slice(0, MAX_PASSAGE_CHARS),
  };
}

/**
 * The sources under a reply: the passages its latest meeting search returned
 * (a later search renumbers from 1, so the answer cites the last one). They
 * come from the saved tool call, so they survive reopening the conversation.
 */
export function extractMeetingSources(toolCalls: ToolCallInfo[] | undefined): MeetingSource[] {
  if (!toolCalls) return [];
  let latest: unknown[] | null = null;
  for (const call of toolCalls) {
    if (call.name === "search_meetings" && call.status === "completed" && Array.isArray(call.metadata)) {
      latest = call.metadata;
    }
  }
  const seen = new Set<number>();
  const sources: MeetingSource[] = [];
  for (const raw of latest ?? []) {
    const source = asSource(raw);
    if (!source || seen.has(source.ref)) continue;
    seen.add(source.ref);
    sources.push(source);
    if (sources.length >= MAX_MEETING_SOURCES) break;
  }
  return sources;
}

// Code is left alone; the capture group of the split keeps the code spans in order.
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
const CITATION = /\[(\d{1,3})\](?![(:])/g;

/**
 * Turns [n] in an answer into a link to source n (handled by the message,
 * which opens that source). A number with no source stays plain text.
 */
export function parseCitations(text: string, sources: ReadonlyArray<{ ref: number }>): string {
  if (sources.length === 0) return text;
  const known = new Set(sources.map((source) => source.ref));
  return text
    .split(CODE)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(CITATION, (match, digits: string) =>
            known.has(Number(digits))
              ? `[[${digits}]](${MEETING_SOURCE_HREF_PREFIX}${digits})`
              : match
          )
    )
    .join("");
}

/** Reads the source number off a clicked citation link, or null. */
export function citationRef(href: string | null | undefined): number | null {
  if (!href || !href.startsWith(MEETING_SOURCE_HREF_PREFIX)) return null;
  const ref = Number(href.slice(MEETING_SOURCE_HREF_PREFIX.length));
  return Number.isInteger(ref) && ref > 0 ? ref : null;
}

/** A saved meeting date ("2026-11-03 09:00:00" is UTC, as SQLite stores it) in the user's language. */
export function formatMeetingDate(date: string, locale?: string): string {
  if (!date) return "";
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(date)
    ? `${date.replace(" ", "T")}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(date) ? "" : "Z"}`
    : date;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
