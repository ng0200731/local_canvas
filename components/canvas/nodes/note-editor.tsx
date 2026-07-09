"use client";

import { useEffect, useRef } from "react";

import { useCanvasActions } from "../canvas-context";

/**
 * Lightweight rich-text editor for note nodes: a contentEditable area with a
 * compact formatting toolbar (bold / italic / underline / bullet list). No
 * editor dependency — formatting uses `document.execCommand`, and the HTML is
 * stored directly in the node's `text` field.
 *
 * The editor is uncontrolled: we write `html` into the DOM only on mount and
 * when it changes from the outside (never while the user is typing), so the
 * caret/selection is never reset.
 */
const TOOLBAR = [
  { cmd: "bold", label: "B", className: "font-semibold" },
  { cmd: "italic", label: "I", className: "italic" },
  { cmd: "underline", label: "U", className: "underline" },
  { cmd: "insertUnorderedList", label: "•", className: "" },
] as const;

export function NoteEditor({ id, html }: { id: string; html: string }) {
  const { updateNodeData } = useCanvasActions();
  const ref = useRef<HTMLDivElement>(null);

  // Sync external changes (load, undo) into the DOM — but never while focused,
  // since overwriting innerHTML mid-typing resets the caret.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }, [html]);

  function apply(cmd: string) {
    // Marked `nodrag` so this doesn't start a node drag; the editor keeps focus.
    document.execCommand(cmd, false);
    if (ref.current) updateNodeData(id, { text: ref.current.innerHTML });
  }

  return (
    <div className="nodrag flex min-h-0 flex-1 flex-col">
      <div className="mb-1 flex gap-0.5">
        {TOOLBAR.map((t) => (
          <button
            key={t.cmd}
            type="button"
            tabIndex={-1}
            aria-label={t.cmd}
            // mousedown (not click) + preventDefault keeps the selection in the
            // editor so the command applies to it.
            onMouseDown={(e) => {
              e.preventDefault();
              apply(t.cmd);
            }}
            className={`text-muted-foreground flex size-5 items-center justify-center rounded text-xs hover:bg-amber-200/60 hover:text-amber-900 dark:hover:bg-amber-900/40 dark:hover:text-amber-100 ${t.className}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder="Type a note…"
        onInput={() => {
          if (ref.current) updateNodeData(id, { text: ref.current.innerHTML });
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto text-sm leading-snug break-words outline-none"
      />
    </div>
  );
}
