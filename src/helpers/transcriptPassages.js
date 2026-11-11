// Splits a note's transcript into searchable passages: consecutive segments of one
// speaker joined up to MAX_PASSAGE_CHARS, labelled the way get_note labels them.
// Main-process CommonJS, so the label rules in src/utils/transcriptEvidence.ts and
// transcriptSpeakerState.ts are mirrored here and pinned by
// test/helpers/transcriptPassages.test.js.

const MAX_PASSAGE_CHARS = 800;
const NOTE_TAKER_LABEL = "Note taker";
const MAX_LABEL_LENGTH = 80;

function isSpeakerLocked(segment) {
  return (
    !!segment.speakerLocked ||
    segment.speakerLockSource === "user" ||
    segment.speakerStatus === "locked" ||
    segment.speakerStatus === "user_locked"
  );
}

function resolveMappedName(segment, names) {
  if (segment.speakerName && isSpeakerLocked(segment)) return undefined;
  return segment.speaker && !(segment.speaker === "you" && segment.recorderName)
    ? names?.[segment.speaker]
    : undefined;
}

// Mirrors speakerLabel() in src/utils/transcriptEvidence.ts.
function segmentSpeakerLabel(segment, names = {}) {
  const recorderLabel =
    typeof segment.recorderName === "string" && segment.recorderName
      ? segment.recorderName
      : NOTE_TAKER_LABEL;
  const resolved = resolveMappedName(segment, names) || segment.speakerName;
  let label;
  if (typeof resolved === "string" && resolved) {
    const isYou = resolved.trim().toLowerCase() === "you";
    label = isYou && !resolveMappedName(segment, names) ? recorderLabel : resolved;
  } else if (segment.speaker === "you") {
    label = recorderLabel;
  } else {
    const numbered = typeof segment.speaker === "string" && /^speaker_(\d+)$/.exec(segment.speaker);
    if (numbered) label = `Speaker ${Number(numbered[1]) + 1}`;
    else if (segment.source === "mic") label = recorderLabel;
    else if (typeof segment.speaker === "string" && segment.speaker) label = segment.speaker;
    else label = segment.source === "system" ? "Others" : "";
  }
  return cut(label, MAX_LABEL_LENGTH);
}

// Never split a surrogate pair at a cut.
function cut(text, index) {
  if (text.length <= index) return text;
  const code = text.charCodeAt(index);
  const end = index > 0 && code >= 0xdc00 && code <= 0xdfff ? index - 1 : index;
  return text.slice(0, end);
}

function splitLong(text) {
  const pieces = [];
  let rest = text.trim();
  while (rest.length > MAX_PASSAGE_CHARS) {
    const window = rest.slice(0, MAX_PASSAGE_CHARS + 1);
    let at = window.search(/\s\S*$/);
    if (at < MAX_PASSAGE_CHARS / 2) at = cut(rest, MAX_PASSAGE_CHARS).length;
    pieces.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function parseSegments(transcript) {
  if (!transcript.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(transcript);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function plainPassages(text) {
  const passages = [];
  let current = "";
  const flush = () => {
    if (current) passages.push(current);
    current = "";
  };
  for (const line of text.split(/\n+/)) {
    for (const piece of splitLong(line)) {
      if (current && current.length + 1 + piece.length > MAX_PASSAGE_CHARS) flush();
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  flush();
  return passages.map((passage, seq) => ({
    seq,
    speaker: null,
    startSeconds: null,
    endSeconds: null,
    text: passage,
  }));
}

function buildPassages(transcript, speakerNames = {}) {
  if (typeof transcript !== "string" || !transcript.trim()) return [];
  const parsed = parseSegments(transcript);
  if (!parsed) return plainPassages(transcript);

  const segments = parsed.filter(
    (segment) => segment && typeof segment === "object" && typeof segment.text === "string"
  );
  // Live recordings store epoch milliseconds; diarized and uploaded ones, seconds
  // from the start (as readableSegments() in transcriptEvidence.ts reads them).
  let first = Infinity;
  for (const segment of segments) {
    if (Number.isFinite(segment.timestamp)) first = Math.min(first, segment.timestamp);
  }
  const seconds = (timestamp) =>
    Number.isFinite(timestamp) ? (first > 1e9 ? (timestamp - first) / 1000 : timestamp) : null;

  const passages = [];
  let current = null;
  for (const segment of segments) {
    const label = segmentSpeakerLabel(segment, speakerNames) || null;
    const time = seconds(segment.timestamp);
    for (const piece of splitLong(segment.text)) {
      if (
        current &&
        current.speaker === label &&
        current.text.length + 1 + piece.length <= MAX_PASSAGE_CHARS
      ) {
        current.text += ` ${piece}`;
        if (time != null) current.endSeconds = time;
        if (current.startSeconds == null) current.startSeconds = time;
      } else {
        current = {
          seq: passages.length,
          speaker: label,
          startSeconds: time,
          endSeconds: time,
          text: piece,
        };
        passages.push(current);
      }
    }
  }
  return passages;
}

module.exports = { buildPassages, segmentSpeakerLabel, MAX_PASSAGE_CHARS };
