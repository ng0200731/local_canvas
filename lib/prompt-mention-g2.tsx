"use client";

/**
 * Isolated @alias mention primitives for the G2 node prompt.
 *
 * Deliberately NOT shared with the Generate node (kept self-contained per the
 * G2 redesign) to avoid touching generate-node.tsx. The Generate node has its
 * own richer copy coupled to its prompt-row model.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cn } from "@/lib/utils";

export interface MentionCandidate {
  /** Stable id used as the key — nodeId for images/refs, region id for regions. */
  id: string;
  /** Text inserted after the "@", e.g. "shoe" -> "@shoe ". */
  alias: string;
  /** Human label shown in the dropdown. */
  label: string;
  /** Optional group heading for the dropdown. */
  group: string;
}

interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

export function mentionAtCaret(value: string, caret: number): MentionMatch | null {
  const match = value.slice(0, caret).match(/@([^\s@]*)$/);
  if (!match || match.index === undefined) return null;
  return { start: match.index, end: caret, query: match[1] ?? "" };
}

/**
 * Resolve which candidate a mouse hover over the textarea is on (used to dim the
 * other thumbnails / highlight the matched one). Returns the candidate id or null.
 */
export function aliasAtOffset(
  value: string,
  offset: number,
  aliases: readonly MentionCandidate[],
): string | null {
  if (!value || offset < 0 || offset > value.length) return null;
  const match = /(^|\s)(@[^\s@]+)/g;
  let token: RegExpExecArray | null;
  while ((token = match.exec(value))) {
    if (token[0].length === 0) {
      match.lastIndex += 1;
      continue;
    }
    const start = (token.index ?? 0) + token[1].length;
    const end = start + token[2].length;
    if (offset < start || offset > end) continue;
    const rawName = (token[2] ?? "").slice(1).toLocaleLowerCase();
    if (!rawName) continue;
    return aliases.find((a) => a.alias.toLocaleLowerCase() === rawName)?.id ?? null;
  }
  return null;
}

/**
 * Split the prompt into parts, flagging which ranges are recognized @alias
 * mentions so the highlight backdrop can render them as <mark>.
 */
export function renderHighlightedAliases(
  value: string,
  aliases: readonly MentionCandidate[],
): Array<{ text: string; highlight: boolean }> {
  const pattern = /(^|\s)(@[^\s@]+)/g;
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const token = match[2] ?? "";
    const tokenStart = (match.index ?? 0) + (match[1]?.length ?? 0);
    const tokenEnd = tokenStart + token.length;
    const name = token.slice(1).toLocaleLowerCase();
    const isAlias = aliases.some((a) => a.alias.toLocaleLowerCase() === name);
    if (!isAlias) continue;
    if (tokenStart > cursor) parts.push({ text: value.slice(cursor, tokenStart), highlight: false });
    parts.push({ text: value.slice(tokenStart, tokenEnd), highlight: true });
    cursor = tokenEnd;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), highlight: false });
  return parts.length ? parts : [{ text: value, highlight: false }];
}

export interface G2MentionTextareaProps {
  value: string;
  disabled: boolean;
  aliases: readonly MentionCandidate[];
  onChange: (value: string) => void;
  onHoverAlias?: (id: string | null) => void;
  placeholder?: string;
  className?: string;
}

export function G2MentionTextarea({
  value,
  disabled,
  aliases,
  onChange,
  onHoverAlias,
  placeholder,
  className,
}: G2MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const [mention, setMention] = useState<MentionMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = mention
    ? aliases.filter((option) => {
        const query = mention.query.toLocaleLowerCase();
        return (
          option.alias.toLocaleLowerCase().includes(query) ||
          option.label.toLocaleLowerCase().includes(query)
        );
      })
    : [];

  function updateMention(nextValue: string, caret: number | null) {
    setMention(caret === null ? null : mentionAtCaret(nextValue, caret));
    setActiveIndex(0);
  }

  function insertAlias(alias: string) {
    if (!mention) return;
    const nextValue = `${value.slice(0, mention.start)}@${alias} ${value.slice(mention.end)}`;
    const nextCaret = mention.start + alias.length + 2;
    selectionRef.current = { start: nextCaret, end: nextCaret };
    onChange(nextValue);
    setMention(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  // Restore the selection we deferred when patching value via the parent.
  useLayoutEffect(() => {
    const selection = selectionRef.current;
    if (!selection || !textareaRef.current) return;
    textareaRef.current.setSelectionRange(selection.start, selection.end);
    selectionRef.current = null;
  }, [value]);

  // Keep the highlight overlay scrolled in sync with the textarea.
  function syncScroll() {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!mention || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const suggestion = suggestions[activeIndex];
      if (suggestion) {
        event.preventDefault();
        insertAlias(suggestion.alias);
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setMention(null);
    }
  }

  function caretOffsetFromPoint(event: ReactMouseEvent<HTMLTextAreaElement>): number | null {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (position?.offsetNode === event.currentTarget) return position.offset;
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    return range?.startContainer === event.currentTarget ? range.startOffset : null;
  }

  const highlighted = renderHighlightedAliases(value, aliases);

  return (
    <div className={cn("relative", className)}>
      {/* Highlight backdrop — sits behind the transparent textarea. */}
      <div
        ref={highlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-2 text-xs leading-5"
      >
        {highlighted.map((part, i) =>
          part.highlight ? (
            <mark
              key={i}
              className="rounded bg-yellow-300/40 px-0.5 text-foreground"
            >
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
          updateMention(event.target.value, event.target.selectionStart);
        }}
        onKeyUp={(event) => updateMention(event.currentTarget.value, event.currentTarget.selectionStart)}
        onClick={(event) => {
          const caret = caretOffsetFromPoint(event);
          if (caret !== null) updateMention(event.currentTarget.value, caret);
          if (onHoverAlias) {
            const caret2 = caretOffsetFromPoint(event);
            const id = caret2 === null ? null : aliasAtOffset(value, caret2, aliases);
            onHoverAlias(id);
          }
        }}
        onMouseMove={(event) => {
          if (!onHoverAlias) return;
          const caret = caretOffsetFromPoint(event);
          onHoverAlias(caret === null ? null : aliasAtOffset(value, caret, aliases));
        }}
        onMouseLeave={() => onHoverAlias?.(null)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        className={cn(
          "nodrag nopan caret-foreground placeholder:text-muted-foreground relative z-10 min-h-16 w-full resize-y rounded-md border bg-transparent p-2 text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      {mention && suggestions.length > 0 && (
        <div className="nodrag nopan bg-popover text-popover-foreground absolute bottom-full left-0 z-30 mb-1 max-h-48 w-56 overflow-y-auto rounded-md border shadow-lg">
          {suggestions.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                insertAlias(candidate.alias);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs",
                index === activeIndex ? "bg-accent text-accent-foreground" : "",
              )}
            >
              <span className="font-medium">@{candidate.alias}</span>
              <span className="text-muted-foreground truncate">· {candidate.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
