import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, FileText } from "../icons";
import { cn } from "../lib/utils";
import { formatMeetingDate, type MeetingSource } from "./meetingCitations";

interface MeetingSourcesProps {
  sources: MeetingSource[];
  /** A citation the user clicked: that source opens. `nonce` lets the same one open again. */
  focus?: { ref: number; nonce: number } | null;
  onOpenNote?: (noteId: number) => void;
}

/** The passages an answer was built from, so each claim can be checked against the meeting. */
export function MeetingSources({ sources, focus, onOpenNote }: MeetingSourcesProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!focus) return;
    setOpen((current) => new Set(current).add(focus.ref));
    listRef.current
      ?.querySelector(`[data-source-ref="${focus.ref}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [focus]);

  if (sources.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border/70 pt-2 text-xs" data-meeting-sources>
      <p className="font-medium">{t("meetingSources.title")}</p>
      <ol ref={listRef} className="mt-1 space-y-1">
        {sources.map((source) => {
          const expanded = open.has(source.ref);
          const date = formatMeetingDate(source.date, i18n?.resolvedLanguage);
          const details = [
            date,
            source.speaker,
            source.time ? t("meetingSources.atTime", { time: source.time }) : null,
          ].filter(Boolean);
          return (
            <li
              key={source.ref}
              data-source-ref={source.ref}
              className="rounded-md border border-border/70"
            >
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={t("meetingSources.sourceLabel", { ref: source.ref })}
                title={expanded ? t("meetingSources.hidePassage") : t("meetingSources.showPassage")}
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (!next.delete(source.ref)) next.add(source.ref);
                    return next;
                  })
                }
                className="flex w-full items-center gap-2 px-2 py-1.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md"
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">[{source.ref}]</span>
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate font-medium text-foreground">
                    {source.title || t("meetingSources.untitled")}
                  </span>
                  <span dir="auto" className="block truncate text-muted-foreground">
                    {details.join(" · ")}
                  </span>
                </span>
                {expanded ? (
                  <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight
                    size={12}
                    className="shrink-0 text-muted-foreground rtl:rotate-180"
                  />
                )}
              </button>
              {expanded && (
                <div className="border-t border-border/70 px-2 py-1.5">
                  <p dir="auto" className="whitespace-pre-wrap break-words text-foreground">
                    {source.text}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenNote
                        ? onOpenNote(source.noteId)
                        : window.electronAPI?.agentOpenNote?.(source.noteId)
                    }
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
                    )}
                  >
                    <FileText size={11} />
                    {t("meetingSources.openMeeting")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
