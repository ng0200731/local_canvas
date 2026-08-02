"use client";

/**
 * Isolated @alias mention primitives for the G2 node prompt.
 *
 * Deliberately NOT shared with the Generate node (kept self-contained per the
 * G2 redesign) to avoid touching generate-node.tsx. The Generate node has its
 * own richer copy coupled to its prompt-row model.
 */

import {
  useEffect,
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

/**
 * Detect a FRESH "@" trigger at the caret.
 *
 * Fresh = caret is positioned RIGHT AFTER a "@" that has nothing but
 * whitespace (or start-of-text) immediately before it AND nothing after it
 * yet (empty query). The user just typed "@" and the dropdown opens once.
 *
 * On any existing @alias token (caret inside or right after "@region-1"),
 * either (a) the char-before is a non-space word char, or (b) the query is
 * non-empty — both make us return null, so the menu NEVER reopens while the
 * user edits an existing token. The user picks from the list only at the
 * moment they type a brand-new "@", and thereafter the token is plain text.
 */
export function mentionAtCaret(value: string, caret: number): MentionMatch | null {
  // Caret must sit immediately after a "@".
  if (caret < 1 || value[caret - 1] !== "@") return null;
  const start = caret - 1;
  const charBefore = start > 0 ? value[start - 1] : "";
  // "@" must be preceded by nothing OR whitespace. Glued to a word char? Skip.
  if (charBefore !== "" && !/\s/.test(charBefore)) return null;
  // Nothing but "@" up to the caret (empty query) → fresh trigger.
  return { start, end: caret, query: "" };
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
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [mention, setMention] = useState<MentionMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = mention ? aliases : [];

  function updateMention(nextValue: string, caret: number | null) {
    setMention(caret === null ? null : mentionAtCaret(nextValue, caret));
    setActiveIndex(0);
  }

  // Restore the selection we deferred when patching value via the parent.
  useLayoutEffect(() => {
    const selection = selectionRef.current;
    if (!selection || !textareaRef.current) return;
    textareaRef.current.setSelectionRange(selection.start, selection.end);
    selectionRef.current = null;
  }, [value]);

  // Keep the active row visible while navigating by keyboard. Manual scroll
  // (rather than scrollIntoView, which can fight the textarea/viewport).
  useEffect(() => {
    if (!mention) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.children[activeIndex] as HTMLElement | undefined;
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [activeIndex, mention]);

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

  function aliasAtOffset(offset: number): string | null {
    if (!value || offset < 0 || offset > value.length) return null;
    const pattern = /(^|\s)(@[^\s@]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      const start = (match.index ?? 0) + (match[1]?.length ?? 0);
      const end = start + (match[2] ?? "").length;
      if (offset < start || offset > end) continue;
      const rawName = (match[2] ?? "").slice(1).toLocaleLowerCase();
      if (!rawName) continue;
      return aliases.find((a) => a.alias.toLocaleLowerCase() === rawName)?.id ?? null;
    }
    return null;
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

  return (
    <div className={cn("relative", className)}>
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
        onKeyUp={(event) => {
          // Only the "@" key opens the dropdown. Re-running mentionAtCaret on
          // every keyup is what re-opened it while editing existing tokens.
          if (event.key !== "@") {
            if (event.key === "Escape" || event.key === " ") setMention(null);
            return;
          }
          updateMention(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onClick={(event) => {
          const caret = caretOffsetFromPoint(event);
          if (caret !== null) updateMention(event.currentTarget.value, caret);
          if (onHoverAlias) onHoverAlias(caret === null ? null : aliasAtOffset(caret));
        }}
        onMouseMove={(event) => {
          if (!onHoverAlias) return;
          const caret = caretOffsetFromPoint(event);
          onHoverAlias(caret === null ? null : aliasAtOffset(caret));
        }}
        onMouseLeave={() => onHoverAlias?.(null)}
        onKeyDown={handleKeyDown}
        className={cn(
          "nodrag nopan caret-foreground placeholder:text-muted-foreground min-h-16 w-full resize-y rounded-md border bg-background/60 p-2 text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        )}
      />
      {mention && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="nodrag nopan bg-popover text-popover-foreground absolute bottom-full left-0 z-30 mb-1 max-h-56 w-60 overflow-y-auto rounded-md border p-0 shadow-lg"
        >
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
                "flex w-full items-center px-2 py-1.5 text-left text-xs",
                index === activeIndex ? "bg-accent text-accent-foreground" : "",
              )}
            >
              <span className="font-medium">@{candidate.alias}</span>
              <span className="text-muted-foreground ml-2 truncate">· {candidate.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

