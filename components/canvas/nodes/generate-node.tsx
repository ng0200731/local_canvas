"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { type NodeProps } from "@xyflow/react";
import { Loader2, Plus, Sparkles, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_IMAGE_GENERATION_OUTPUT_FORMAT,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_GENERATION_RESOLUTION,
  DEFAULT_IMAGE_GENERATION_SIZE,
  getModelCatalogEntry,
  IMAGE_GENERATION_OUTPUT_FORMATS,
  IMAGE_GENERATION_RESOLUTIONS,
  IMAGE_GENERATION_SIZES,
  type ImageGenerationModelId,
  type ImageGenerationOutputFormat,
  type ImageGenerationReference,
  type ImageGenerationResolution,
  type ImageGenerationSize,
  imageGenerationErrorSchema,
  imageGenerationResponseSchema,
  MAX_IMAGE_GENERATION_REFERENCES,
  normalizeImageGenerationOutputFormat,
  normalizeImageGenerationResolution,
  normalizeImageGenerationSize,
  normalizeImageGenerationModel,
  resolutionForImageGenerationModel,
} from "@/lib/image-generation-models";
import { isStaleGenerationConfigurationError } from "@/lib/generation-errors";
import {
  compileGeneratePromptRows,
  emptyGeneratePromptRow,
  generatePromptRowState,
  generatePromptRowText,
  masksForPromptSource,
  normalizeGeneratePromptRow,
  type GeneratePromptSourceReference,
} from "@/lib/generate-prompt";
import { isAbortError } from "@/lib/generation-run";
import { persistGeneratedImage } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import {
  GENERATE_CHANGE_TYPES,
  type GenerateCanvasNode,
  type GenerateChangeType,
  type GeneratePromptRow,
} from "@/lib/nodes/types";
import {
  useCanvasActions,
  useConnectionHighlight,
  useGroupAccent,
  useReferenceHover,
  type ConnectedImageReference,
  type ConnectedInputReference,
} from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 288;
const DEFAULT_HEIGHT = 500;

function nowMs(): number {
  return Date.now();
}

type ImageProvider = "gpt" | "gemini";
type GeminiVersion = "1" | "2" | "pro";

const GPT_MODEL_OPTIONS: readonly {
  label: string;
  description: string;
  model: ImageGenerationModelId;
  status: "current" | "legacy";
  enabled: boolean;
  disabledReason?: string;
}[] = [
  {
    label: "2",
    description: "GPT Image 2",
    model: "gpt-image-2",
    status: "current",
    enabled: true,
  },
  {
    label: "1.5 Pro",
    description: "GPT Image 1.5",
    model: "gpt-image-1.5",
    status: "current",
    enabled: true,
  },
  {
    label: "1",
    description: "GPT Image 1",
    model: "gpt-image-1",
    status: "current",
    enabled: true,
  },
  {
    label: "1 Mini",
    description: "GPT Image 1 Mini",
    model: "gpt-image-1-mini",
    status: "current",
    enabled: false,
    disabledReason: "Unavailable on Xiangsu currently",
  },
  {
    label: "DALL-E 3",
    description: "Legacy generation",
    model: "dall-e-3",
    status: "legacy",
    enabled: true,
  },
  {
    label: "DALL-E 2",
    description: "Legacy generation",
    model: "dall-e-2",
    status: "legacy",
    enabled: true,
  },
];

const GEMINI_VERSION_OPTIONS: readonly {
  label: string;
  value: GeminiVersion;
  description: string;
  enabled: boolean;
  disabledReason?: string;
}[] = [
  {
    label: "Nano Banana Pro",
    value: "pro",
    description: "gemini-3-pro-image-preview",
    enabled: true,
  },
  {
    label: "Nano Banana 2",
    value: "2",
    description: "gemini-3.1-flash-image-preview",
    enabled: true,
  },
  {
    label: "Nano Banana 1",
    value: "1",
    description: "NanoBanana 1",
    enabled: false,
    disabledReason: "gemini-2.5-flash-image · unavailable on Xiangsu currently",
  },
];

const SIZE_LABELS: Record<ImageGenerationSize, string> = {
  "1024x1024": "Square",
  "1536x1024": "Wide",
  "1024x1536": "Tall",
};

const FORMAT_LABELS: Record<ImageGenerationOutputFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
};

const RESOLUTION_LABELS: Record<ImageGenerationResolution, string> = {
  preview: "Preview",
  "2K": "2K",
  "4K": "4K",
};

function providerForModel(model: ImageGenerationModelId): ImageProvider {
  return model.startsWith("gemini-") ? "gemini" : "gpt";
}

function geminiVersionForModel(model: ImageGenerationModelId): GeminiVersion {
  if (model.startsWith("gemini-3-pro-image-preview")) return "pro";
  if (model.startsWith("gemini-3.1-flash-image-preview")) return "2";
  return "1";
}

function geminiModelFor(
  version: GeminiVersion,
  resolution: ImageGenerationResolution,
): ImageGenerationModelId {
  if (version === "1") return "gemini-2.5-flash-image";
  const suffix = resolution === "preview" ? "" : `-${resolution}`;
  if (version === "pro") {
    return `gemini-3-pro-image-preview${suffix}` as ImageGenerationModelId;
  }
  return `gemini-3.1-flash-image-preview${suffix}` as ImageGenerationModelId;
}

function hasImageUrl(reference: ConnectedInputReference): reference is ConnectedImageReference {
  return reference.kind === "image" && typeof reference.imageUrl === "string";
}

function toGenerationReference(
  reference: ConnectedInputReference,
): ImageGenerationReference | null {
  if (reference.kind === "image") {
    return {
      kind: "image",
      alias: reference.alias,
      url: reference.imageUrl,
    };
  }

  return {
    kind: "pantone",
    alias: reference.alias,
    label: reference.label,
    hex: reference.swatchHex,
  };
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPromptRow(): GeneratePromptRow {
  return emptyGeneratePromptRow(uid());
}

interface MentionMatch {
  start: number;
  end: number;
  query: string;
}

function mentionAtCaret(value: string, caret: number): MentionMatch | null {
  const match = value.slice(0, caret).match(/@([^\s@]*)$/);
  if (!match || match.index === undefined) return null;
  return { start: match.index, end: caret, query: match[1] ?? "" };
}

function aliasAtOffset(
  value: string,
  offset: number,
  aliases: readonly { nodeId: string; alias: string; label: string }[],
  masks: readonly { nodeId: string; name: string }[] = [],
): string | null {
  // Empty / whitespace-only prompts used to hang the tab: `(@?[^\s@]*)` can match
  // zero-length tokens, so RegExp.lastIndex never advances and the loop never exits.
  // Require a non-empty token (`+`) — same shape as renderHighlightedAliases.
  if (!value || offset < 0 || offset > value.length) return null;
  const match = /(^|\s)(@?[^\s@]+)/g;
  let token: RegExpExecArray | null;
  while ((token = match.exec(value))) {
    // Defensive: never spin forever if a future pattern can match empty.
    if (token[0].length === 0) {
      match.lastIndex += 1;
      continue;
    }
    const start = (token.index ?? 0) + token[1].length;
    const end = start + token[2].length;
    if (offset < start || offset > end) continue;
    const rawName = token[2] ?? "";
    const isAlias = rawName.startsWith("@");
    const name = (isAlias ? rawName.slice(1) : rawName).toLocaleLowerCase();
    if (!name) continue;
    return (
      (isAlias
        ? aliases.find((option) => option.alias.toLocaleLowerCase() === name)?.nodeId
        : undefined) ??
      masks.find((mask) => mask.name.toLocaleLowerCase() === name)?.nodeId ??
      null
    );
  }
  return null;
}

function caretOffsetFromPoint(event: ReactMouseEvent<HTMLTextAreaElement>): number | null {
  const documentWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = documentWithCaret.caretPositionFromPoint?.(event.clientX, event.clientY);
  if (position?.offsetNode === event.currentTarget) return position.offset;
  const range = documentWithCaret.caretRangeFromPoint?.(event.clientX, event.clientY);
  return range?.startContainer === event.currentTarget ? range.startOffset : null;
}

function renderHighlightedAliases(
  value: string,
  aliases: readonly { nodeId: string; alias: string; label: string }[],
  masks: readonly { nodeId: string; name: string }[] = [],
) {
  const tokenPattern = /(^|\s)(@?[^\s@]+)/g;
  const parts: Array<{ text: string; highlight: "alias" | "mask" | null }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(value))) {
    const token = match[2] ?? "";
    const tokenStart = (match.index ?? 0) + (match[1]?.length ?? 0);
    const tokenEnd = tokenStart + token.length;
    const isAlias = token.startsWith("@");
    const name = (isAlias ? token.slice(1) : token).toLocaleLowerCase();
    const highlight =
      isAlias && aliases.some((option) => option.alias.toLocaleLowerCase() === name)
        ? "alias"
        : !isAlias && masks.some((mask) => mask.name.toLocaleLowerCase() === name)
          ? "mask"
          : null;
    if (!highlight) continue;
    if (tokenStart > cursor) parts.push({ text: value.slice(cursor, tokenStart), highlight: null });
    parts.push({ text: value.slice(tokenStart, tokenEnd), highlight });
    cursor = tokenEnd;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), highlight: null });
  return parts.length ? parts : [{ text: value, highlight: null }];
}

function AliasMentionInput({
  value,
  disabled,
  ariaLabel,
  aliases,
  className,
  onChange,
}: {
  value: string;
  disabled: boolean;
  ariaLabel: string;
  aliases: readonly { nodeId: string; alias: string; label: string }[];
  className?: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mention, setMention] = useState<MentionMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = mention
    ? aliases.filter((option) =>
        option.alias.toLocaleLowerCase().includes(mention.query.toLocaleLowerCase()),
      )
    : [];

  function updateMention(nextValue: string, caret: number | null) {
    setMention(caret === null ? null : mentionAtCaret(nextValue, caret));
    setActiveIndex(0);
  }

  function insertAlias(alias: string) {
    if (!mention) return;
    const nextValue = `${value.slice(0, mention.start)}@${alias} ${value.slice(mention.end)}`;
    const nextCaret = mention.start + alias.length + 2;
    onChange(nextValue);
    setMention(null);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
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
    if (event.key === "Escape") {
      setMention(null);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const suggestion = suggestions[activeIndex] ?? suggestions[0];
      if (suggestion) insertAlias(suggestion.alias);
    }
  }

  return (
    <div className="relative min-w-0">
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        placeholder="@pantone red"
        aria-label={ariaLabel}
        className={cn("nodrag nopan h-8 px-2 text-xs", className)}
        onChange={(event) => {
          onChange(event.target.value);
          updateMention(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) =>
          updateMention(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
          updateMention(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => window.setTimeout(() => setMention(null), 120)}
      />
      {mention ? (
        <div className="nodrag nopan bg-popover text-popover-foreground absolute top-full right-0 left-0 z-40 mt-1 max-h-32 overflow-y-auto rounded-md border p-1 shadow-md">
          {suggestions.length ? (
            suggestions.map((option, index) => (
              <button
                key={option.nodeId}
                type="button"
                className={cn(
                  "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs",
                  index === activeIndex ? "bg-accent" : "hover:bg-accent",
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  insertAlias(option.alias);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="truncate">@{option.alias}</span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">No matching alias</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AliasMentionTextarea({
  value,
  disabled,
  aliases,
  masks = [],
  onChange,
}: {
  value: string;
  disabled: boolean;
  aliases: readonly { nodeId: string; alias: string; label: string }[];
  masks?: readonly { nodeId: string; name: string }[];
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const [mention, setMention] = useState<MentionMatch | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { setHoveredReferenceNodeId } = useReferenceHover();
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
    onChange(nextValue);
    setMention(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  useLayoutEffect(() => {
    const selection = selectionRef.current;
    if (!selection || !textareaRef.current) return;
    textareaRef.current.setSelectionRange(selection.start, selection.end);
    selectionRef.current = null;
  }, [value]);

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
    if (event.key === "Escape") {
      setMention(null);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const suggestion = suggestions[activeIndex] ?? suggestions[0];
      if (suggestion) insertAlias(suggestion.alias);
    }
  }

  return (
    <div className="bg-background/60 border-input focus-within:border-ring focus-within:ring-ring/30 relative rounded-md border focus-within:ring-2">
      <textarea
        ref={textareaRef}
        rows={5}
        value={value}
        disabled={disabled}
        placeholder="Describe the image... use @ to mention connected aliases"
        className="nodrag nopan caret-foreground placeholder:text-muted-foreground relative z-10 block min-h-28 w-full resize-none rounded-md border-0 bg-transparent p-2 text-sm leading-5 text-transparent outline-none selection:bg-yellow-300/40 disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) => {
          selectionRef.current = {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          };
          onChange(event.target.value);
          updateMention(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) =>
          updateMention(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
          updateMention(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onMouseMove={(event) => {
          // Hover-highlight connected sources named in the prompt. Skip empty
          // prompts entirely so we never pay the token scan cost on click/focus.
          if (!value) {
            setHoveredReferenceNodeId(null);
            return;
          }
          const offset = caretOffsetFromPoint(event);
          const nextHover =
            offset === null ? null : aliasAtOffset(value, offset, aliases, masks);
          setHoveredReferenceNodeId(nextHover);
        }}
        onScroll={(event) => {
          if (highlightRef.current) {
            highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
        onMouseLeave={() => setHoveredReferenceNodeId(null)}
        onBlur={() => {
          window.setTimeout(() => setMention(null), 120);
          setHoveredReferenceNodeId(null);
        }}
      />
      <div
        ref={highlightRef}
        aria-hidden="true"
        className="text-foreground pointer-events-none absolute inset-0 z-0 overflow-hidden p-2 text-sm leading-5 break-words whitespace-pre-wrap"
      >
        {renderHighlightedAliases(value, aliases, masks).map((part, index) =>
          part.highlight ? (
            <mark
              key={`${part.text}-${index}`}
              className={cn(
                "text-foreground rounded-sm",
                part.highlight === "alias" ? "bg-yellow-300/70" : "bg-cyan-300/70",
              )}
            >
              {part.text}
            </mark>
          ) : (
            <span key={`${part.text}-${index}`}>{part.text}</span>
          ),
        )}
      </div>
      {mention ? (
        <div className="nodrag nopan bg-popover text-popover-foreground absolute right-2 left-2 z-40 mt-1 max-h-36 overflow-y-auto rounded-md border p-1 shadow-md">
          {suggestions.length ? (
            suggestions.map((option, index) => (
              <button
                key={option.nodeId}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
                  index === activeIndex ? "bg-accent" : "hover:bg-accent",
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  insertAlias(option.alias);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="truncate">@{option.alias}</span>
                <span className="text-muted-foreground truncate">{option.label}</span>
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">No matching alias</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function GenerateNode({ id, data, parentId, selected }: NodeProps<GenerateCanvasNode>) {
  const {
    updateNodeData,
    getConnectedInputReferences,
    hasConnectedOutputNode,
    getConnectedOutputState,
    updateConnectedOutputData,
    startGenerationRun,
    isGenerationRunCurrent,
    finishGenerationRun,
    cancelGenerationRun,
    writeGeneratedImageToOutput,
    deleteEdge,
  } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const { hoveredReferenceNodeId, setHoveredReferenceNodeId } = useReferenceHover();
  const [invalidPromptRows, setInvalidPromptRows] = useState<ReadonlySet<string>>(new Set());
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;
  useEffect(() => {
    if (data.status !== "error" || !isStaleGenerationConfigurationError(data.error)) return;
    updateNodeData(id, { status: "idle", error: undefined });
  }, [data.error, data.status, id, updateNodeData]);

  useEffect(
    () => () => {
      setHoveredReferenceNodeId(null);
    },
    [setHoveredReferenceNodeId],
  );

  // Stable fallback row id so empty generate nodes don't churn keys / autosave on every render.
  const fallbackPromptRowIdRef = useRef<string | null>(null);
  if (fallbackPromptRowIdRef.current === null) {
    fallbackPromptRowIdRef.current = uid();
  }

  const hasOutput = hasConnectedOutputNode(id);
  const connectedOutput = getConnectedOutputState(id);
  const connectedOutputHasImage = Boolean(connectedOutput?.resultUrl);
  // Memoize on the stable action identity (edges + graphEpoch) so we don't allocate
  // new reference arrays every parent render / drag frame.
  const connectedReferences = useMemo(
    () => getConnectedInputReferences(id),
    [getConnectedInputReferences, id],
  );
  const connectedImageReferences = useMemo(
    () => connectedReferences.filter(hasImageUrl),
    [connectedReferences],
  );
  const promptReferences: GeneratePromptSourceReference[] = useMemo(
    () =>
      connectedImageReferences.map((reference) => ({
        nodeId: reference.nodeId,
        alias: reference.alias,
        masks: reference.masks.map((mask) => ({ id: mask.id, name: mask.name })),
      })),
    [connectedImageReferences],
  );
  const promptRows = useMemo(() => {
    if (Array.isArray(data.promptRows) && data.promptRows.length) {
      return data.promptRows.map((row) => {
        const existingId = typeof row?.id === "string" && row.id ? row.id : null;
        return normalizeGeneratePromptRow(
          row,
          promptReferences,
          existingId ?? fallbackPromptRowIdRef.current!,
        );
      });
    }
    return [emptyGeneratePromptRow(fallbackPromptRowIdRef.current!)];
  }, [data.promptRows, promptReferences]);

  // Persist a stable empty row once so subsequent renders reuse the same id.
  useEffect(() => {
    if (Array.isArray(data.promptRows) && data.promptRows.length > 0) return;
    updateNodeData(id, {
      promptRows: [emptyGeneratePromptRow(fallbackPromptRowIdRef.current!)],
    });
  }, [data.promptRows, id, updateNodeData]);

  const connectedReferenceUrls = useMemo(
    () => new Set(connectedImageReferences.map((reference) => reference.imageUrl)),
    [connectedImageReferences],
  );
  const manualImageReferences = data.references.filter((url) => !connectedReferenceUrls.has(url));
  const allGenerationReferences = connectedReferences
    .map(toGenerationReference)
    .filter((reference): reference is ImageGenerationReference => reference !== null)
    .concat(
      manualImageReferences.map((url, index) => ({
        kind: "image" as const,
        alias: `reference-${index + 1}`,
        url,
      })),
    );
  const hasReferenceItems = connectedReferences.length > 0 || manualImageReferences.length > 0;
  const hasGenerationReferences = allGenerationReferences.length > 0;
  const model = normalizeImageGenerationModel(data.model);
  const provider = providerForModel(model);
  const size = normalizeImageGenerationSize(data.size ?? DEFAULT_IMAGE_GENERATION_SIZE);
  const outputFormat = normalizeImageGenerationOutputFormat(
    data.outputFormat ?? DEFAULT_IMAGE_GENERATION_OUTPUT_FORMAT,
  );
  const resolution = normalizeImageGenerationResolution(
    data.resolution ??
      resolutionForImageGenerationModel(model) ??
      DEFAULT_IMAGE_GENERATION_RESOLUTION,
  );
  const geminiVersion = geminiVersionForModel(model);
  const selectedModel = getModelCatalogEntry(model);
  const isGenerating = data.status === "loading";
  const aliasOptions = connectedReferences.map((reference) => ({
    nodeId: reference.nodeId,
    alias: reference.alias,
    label: reference.label,
  }));
  const selectedGptOption = GPT_MODEL_OPTIONS.find((option) => option.model === model);
  const currentModelUnavailable =
    provider === "gpt"
      ? Boolean(selectedGptOption && !selectedGptOption.enabled)
      : geminiVersion === "1";
  const currentModelBlockedByReferences =
    provider === "gpt" &&
    Boolean(selectedGptOption?.status === "legacy" && hasGenerationReferences);

  const renderedReferences = connectedReferences.map((reference) => {
    const isReferenceHovered = hoveredReferenceNodeId === reference.nodeId;

    if (reference.kind === "pantone") {
      return (
        <div
          key={reference.nodeId}
          title={`@${reference.alias}`}
          onPointerEnter={() => setHoveredReferenceNodeId(reference.nodeId)}
          onPointerLeave={() => setHoveredReferenceNodeId(null)}
          onPointerCancel={() => setHoveredReferenceNodeId(null)}
          className={cn(
            "group/reference relative size-9 overflow-hidden rounded border transition-[box-shadow,transform]",
            isReferenceHovered &&
              "ring-offset-background shadow-lg ring-2 ring-yellow-400 ring-offset-1",
          )}
        >
          <div
            className="size-full"
            style={{ backgroundColor: reference.swatchHex }}
            aria-hidden="true"
          />
          <span className="absolute right-0 bottom-0 left-0 truncate bg-black/55 px-0.5 text-[0.55rem] leading-3 text-white">
            {reference.label}
          </span>
          <ConfirmDialog
            title="Remove reference?"
            description={`Disconnect @${reference.alias} from this Generate node?`}
            confirmLabel="Remove"
            onConfirm={() => deleteEdge(reference.edgeId)}
            trigger={
              <button
                type="button"
                aria-label={`Remove @${reference.alias} reference`}
                className="nodrag nopan bg-background/90 text-foreground focus-visible:ring-ring absolute top-0.5 right-0.5 z-10 flex size-5 items-center justify-center rounded-sm border opacity-0 shadow-sm transition-opacity group-hover/reference:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
              >
                <X className="size-3" />
              </button>
            }
          />
        </div>
      );
    }

    return (
      <div
        key={reference.nodeId}
        title={`@${reference.alias}`}
        onPointerEnter={() => setHoveredReferenceNodeId(reference.nodeId)}
        onPointerLeave={() => setHoveredReferenceNodeId(null)}
        onPointerCancel={() => setHoveredReferenceNodeId(null)}
        className={cn(
          "group/reference relative size-9 overflow-hidden rounded transition-[box-shadow,transform]",
          isReferenceHovered &&
            "ring-offset-background shadow-lg ring-2 ring-yellow-400 ring-offset-1",
        )}
      >
        <ImagePreviewDialog
          src={reference.imageUrl}
          alt={`@${reference.alias} reference`}
          title={`@${reference.alias} reference image`}
          trigger={
            <button
              type="button"
              className="nodrag nopan focus-visible:ring-ring size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-inset"
              aria-label={`Enlarge @${reference.alias} reference image`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={reference.imageUrl} alt="" className="size-full object-cover" />
            </button>
          }
        />
        <span className="absolute right-0 bottom-0 left-0 truncate bg-black/55 px-0.5 text-[0.55rem] leading-3 text-white">
          @{reference.alias}
        </span>
        <ConfirmDialog
          title="Remove reference?"
          description={`Disconnect @${reference.alias} from this Generate node?`}
          confirmLabel="Remove"
          onConfirm={() => deleteEdge(reference.edgeId)}
          trigger={
            <button
              type="button"
              aria-label={`Remove @${reference.alias} reference`}
              className="nodrag nopan bg-background/90 text-foreground focus-visible:ring-ring absolute top-0.5 right-0.5 z-10 flex size-5 items-center justify-center rounded-sm border opacity-0 shadow-sm transition-opacity group-hover/reference:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
            >
              <X className="size-3" />
            </button>
          }
        />
      </div>
    );
  });

  function addReference(url: string) {
    if (!manualImageReferences.includes(url)) {
      updateNodeData(id, { references: [...manualImageReferences, url] });
    }
  }
  function removeReference(url: string) {
    updateNodeData(id, { references: manualImageReferences.filter((r) => r !== url) });
  }

  function removeAllReferences() {
    connectedReferences.forEach((reference) => deleteEdge(reference.edgeId));
    updateNodeData(id, { references: [] });
  }

  function updatePromptRows(rows: GeneratePromptRow[]) {
    updateNodeData(id, { promptRows: rows });
  }

  function autoMatchedPromptRow(): GeneratePromptRow {
    const source = promptReferences[0];
    const mask = source?.masks[0];
    return {
      ...emptyPromptRow(),
      sourceNodeId: source?.nodeId ?? "",
      maskId: mask?.id ?? "",
    };
  }

  function appendPromptRowText(row: GeneratePromptRow) {
    if (!row.sourceNodeId || !row.targetText.trim()) return;
    const line = generatePromptRowText(row, promptReferences).trim();
    if (!line) return;
    const nextPrompt = [data.prompt.trim(), `- ${line}`].filter(Boolean).join("\n");
    updateNodeData(id, { prompt: nextPrompt });
  }

  function patchPromptRow(rowId: string, patch: Partial<GeneratePromptRow>) {
    setInvalidPromptRows((current) => {
      if (!current.has(rowId)) return current;
      const next = new Set(current);
      next.delete(rowId);
      return next;
    });
    updatePromptRows(promptRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function promptRowMissingFields(row: GeneratePromptRow): string[] {
    const missing: string[] = [];
    if (!row.sourceNodeId) missing.push("source");
    if (!row.changeType) missing.push("change");
    if (!row.targetText.trim()) missing.push("target");
    return missing;
  }

  function addPromptRow() {
    const incompleteRows = promptRows.filter((row) => promptRowMissingFields(row).length > 0);
    if (incompleteRows.length > 0) {
      setInvalidPromptRows(new Set(incompleteRows.map((row) => row.id)));
      return;
    }

    const lastRow = promptRows[promptRows.length - 1];
    if (lastRow) appendPromptRowText(lastRow);
    updatePromptRows([...promptRows, autoMatchedPromptRow()]);
    setInvalidPromptRows(new Set());
  }

  function deletePromptRow(rowId: string) {
    const nextRows = promptRows.filter((row) => row.id !== rowId);
    updatePromptRows(nextRows.length ? nextRows : [emptyPromptRow()]);
  }

  async function onGenerate() {
    const rowPrompt = compileGeneratePromptRows(promptRows, promptReferences).trim();
    const existingPrompt = data.prompt.trim();
    const missingRows = rowPrompt
      .split("\n")
      .filter(
        (line) =>
          line.trim() &&
          !existingPrompt.split("\n").some((existing) => existing.trim() === line.trim()),
      );
    const prompt = [existingPrompt, ...missingRows].filter(Boolean).join("\n");
    if (!prompt) {
      toast.error("Enter prompt text or complete at least one prompt row first");
      return;
    }
    if (allGenerationReferences.length > MAX_IMAGE_GENERATION_REFERENCES) {
      toast.error(`Use no more than ${MAX_IMAGE_GENERATION_REFERENCES} reference images`);
      return;
    }

    const run = startGenerationRun(id);
    if (!run) return;

    const outputReady = updateConnectedOutputData(id, {
      status: "loading",
      error: undefined,
    });
    if (!outputReady) {
      finishGenerationRun(id, run.runId);
      toast.error("Connect an Output node before generating");
      return;
    }

    updateNodeData(id, {
      status: "loading",
      error: undefined,
      model,
      size,
      outputFormat,
      resolution,
    });
    const generationStartedAt = nowMs();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: run.signal,
        body: JSON.stringify({
          model,
          prompt,
          size,
          outputFormat,
          resolution,
          references: allGenerationReferences,
        }),
      });
      if (!isGenerationRunCurrent(id, run.runId)) return;
      const json: unknown = await res.json();
      if (!isGenerationRunCurrent(id, run.runId)) return;
      const parsed = imageGenerationResponseSchema.safeParse(json);
      if (!res.ok || !parsed.success) {
        const error = imageGenerationErrorSchema.safeParse(json);
        throw new Error(error.success ? error.data.error : "Generation failed");
      }
      const persisted = await persistGeneratedImage(parsed.data.url, outputFormat, run.signal);
      if (!isGenerationRunCurrent(id, run.runId)) return;
      const generationDurationMs = Math.max(0, nowMs() - generationStartedAt);
      updateNodeData(id, {
        status: "done",
        resultUrl: persisted.url,
        model: parsed.data.model,
        size,
        outputFormat,
        resolution,
        generationDurationMs,
        error: undefined,
      });
      const outputWritten = writeGeneratedImageToOutput(id, persisted.url, {
        prompt,
        model: parsed.data.model,
        size,
        resolution,
        outputFormat,
        storagePath: persisted.storagePath,
        durationMs: generationDurationMs,
      });
      if (!outputWritten) {
        throw new Error("Output node was disconnected before generation finished");
      }
      toast.success("Image generated and saved to Renders.");
    } catch (err) {
      const cancelled =
        run.signal.aborted || !isGenerationRunCurrent(id, run.runId) || isAbortError(err);
      if (cancelled) return;
      const message = err instanceof Error ? err.message : "Generation failed";
      updateNodeData(id, { status: "error", error: message });
      updateConnectedOutputData(id, { status: "error", error: message });
      toast.error(message);
    } finally {
      finishGenerationRun(id, run.runId);
    }
  }

  function stopGeneration() {
    if (cancelGenerationRun(id)) {
      toast.info("Generation stopped.");
    }
  }

  return (
    <div
      style={{
        width,
        height,
        ...(accent ? { outline: `2px solid ${accent}`, outlineOffset: 2 } : {}),
        ...highlight,
      }}
      aria-busy={isGenerating}
      className={cn(
        "group bg-card relative flex flex-col overflow-hidden rounded-lg border shadow-md",
        selected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.generate} top={16} zIndex={30} />
      <div className="bg-card relative z-20 flex h-11 shrink-0 items-center gap-2 border-b px-3 pr-10 text-sm font-medium shadow-sm">
        <Sparkles className="size-4" />
        Generate
        {isGenerating ? (
          <Button
            type="button"
            size="icon-sm"
            variant="destructive"
            title="Stop generation"
            aria-label="Stop generation"
            className="nodrag nopan ml-auto"
            onClick={stopGeneration}
          >
            <Square className="fill-current" />
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-xs">Provider</span>
            <Select
              value={provider}
              disabled={isGenerating}
              onValueChange={(value) => {
                const nextProvider = value === "gemini" ? "gemini" : "gpt";
                updateNodeData(id, {
                  model:
                    nextProvider === "gemini"
                      ? geminiModelFor("pro", resolution)
                      : DEFAULT_IMAGE_GENERATION_MODEL,
                });
              }}
            >
              <SelectTrigger className="nodrag nopan w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="nodrag nopan">
                <SelectItem value="gpt">GPT Image</SelectItem>
                <SelectItem value="gemini">NanoBanana</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-xs">Version</span>
            {provider === "gemini" ? (
              <Select
                value={geminiVersion}
                disabled={isGenerating}
                onValueChange={(value) => {
                  const nextVersion = value === "1" || value === "2" ? value : "pro";
                  const nextResolution = nextVersion === "1" ? "preview" : resolution;
                  updateNodeData(id, {
                    model: geminiModelFor(nextVersion, nextResolution),
                    resolution: nextResolution,
                  });
                }}
              >
                <SelectTrigger className="nodrag nopan w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="nodrag nopan">
                  <SelectGroup>
                    <SelectLabel>Latest first</SelectLabel>
                    {GEMINI_VERSION_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={!option.enabled}
                      >
                        <span className="flex flex-col items-start">
                          <span>{option.label}</span>
                          <span className="text-muted-foreground text-[0.65rem]">
                            {option.enabled
                              ? option.description
                              : (option.disabledReason ?? option.description)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={model}
                disabled={isGenerating}
                onValueChange={(value) => {
                  updateNodeData(id, { model: normalizeImageGenerationModel(value) });
                }}
              >
                <SelectTrigger className="nodrag nopan w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="nodrag nopan">
                  <SelectGroup>
                    <SelectLabel>Latest first</SelectLabel>
                    {GPT_MODEL_OPTIONS.filter((option) => option.status === "current").map(
                      (option) => (
                        <SelectItem
                          key={option.model}
                          value={option.model}
                          disabled={!option.enabled}
                        >
                          <span className="flex flex-col items-start">
                            <span>{option.label}</span>
                            <span className="text-muted-foreground text-[0.65rem]">
                              {option.enabled
                                ? option.description
                                : (option.disabledReason ?? option.description)}
                            </span>
                          </span>
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Legacy</SelectLabel>
                    {GPT_MODEL_OPTIONS.filter((option) => option.status === "legacy").map(
                      (option) => (
                        <SelectItem
                          key={option.model}
                          value={option.model}
                          disabled={hasGenerationReferences}
                        >
                          <span className="flex flex-col items-start">
                            <span>{option.label}</span>
                            <span className="text-muted-foreground text-[0.65rem]">
                              {hasGenerationReferences
                                ? "Prompt-only only, remove references first"
                                : option.description}
                            </span>
                          </span>
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-xs">Resolution</span>
            <Select
              value={resolution}
              disabled={isGenerating || provider === "gpt" || geminiVersion === "1"}
              onValueChange={(value) => {
                const nextResolution = normalizeImageGenerationResolution(value);
                updateNodeData(id, {
                  resolution: nextResolution,
                  model:
                    provider === "gemini" ? geminiModelFor(geminiVersion, nextResolution) : model,
                });
              }}
            >
              <SelectTrigger className="nodrag nopan w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="nodrag nopan">
                {IMAGE_GENERATION_RESOLUTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {RESOLUTION_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-xs">Size</span>
            <Select
              value={size}
              disabled={isGenerating}
              onValueChange={(value) => {
                updateNodeData(id, { size: normalizeImageGenerationSize(value) });
              }}
            >
              <SelectTrigger className="nodrag nopan w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="nodrag nopan">
                {IMAGE_GENERATION_SIZES.map((option) => (
                  <SelectItem key={option} value={option}>
                    <span className="flex flex-col items-start">
                      <span>{SIZE_LABELS[option]}</span>
                      <span className="text-muted-foreground font-mono text-[0.65rem]">
                        {option}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground text-xs">Format</span>
            <Select
              value={outputFormat}
              disabled={isGenerating}
              onValueChange={(value) => {
                updateNodeData(id, {
                  outputFormat: normalizeImageGenerationOutputFormat(value),
                });
              }}
            >
              <SelectTrigger className="nodrag nopan w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="nodrag nopan">
                {IMAGE_GENERATION_OUTPUT_FORMATS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {FORMAT_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-muted-foreground truncate font-mono text-[0.65rem]">
          {selectedModel.officialName}
        </p>

        <div className="flex flex-col gap-1">
          <div className="flex min-h-7 items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Reference image</span>
            {hasReferenceItems && (
              <ConfirmDialog
                title="Remove all references?"
                description="This disconnects every connected reference and removes all dropped reference images from this Generate node."
                confirmLabel="Remove all"
                onConfirm={removeAllReferences}
                trigger={
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={isGenerating}
                    className="nodrag nopan text-destructive hover:text-destructive"
                  >
                    <Trash2 />
                    Clear all
                  </Button>
                }
              />
            )}
          </div>
          <div
            className="bg-background/60 flex min-h-14 flex-wrap gap-1 rounded-md border border-dashed p-1"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (isGenerating) return;
              e.preventDefault();
              const url = e.dataTransfer.getData("application/ica-image-url");
              if (url) addReference(url);
            }}
          >
            {hasReferenceItems ? (
              <>
                {renderedReferences}
                {manualImageReferences.map((url) => (
                  <div
                    key={url}
                    className="group/reference relative size-9 overflow-hidden rounded"
                  >
                    <ImagePreviewDialog
                      src={url}
                      alt="Dropped reference"
                      title="Dropped reference image"
                      trigger={
                        <button
                          type="button"
                          className="nodrag nopan focus-visible:ring-ring size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-inset"
                          aria-label="Enlarge dropped reference image"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="size-full object-cover" />
                        </button>
                      }
                    />
                    <ConfirmDialog
                      title="Remove reference?"
                      description="Remove this dropped image from the Generate node?"
                      confirmLabel="Remove"
                      onConfirm={() => removeReference(url)}
                      trigger={
                        <button
                          type="button"
                          aria-label="Remove reference"
                          className="nodrag nopan bg-background/90 text-foreground focus-visible:ring-ring absolute top-0.5 right-0.5 z-10 flex size-5 items-center justify-center rounded-sm border opacity-0 shadow-sm transition-opacity group-hover/reference:opacity-100 focus-visible:opacity-100 focus-visible:ring-2"
                        >
                          <X className="size-3" />
                        </button>
                      }
                    />
                  </div>
                ))}
              </>
            ) : (
              <span className="text-muted-foreground px-1 py-1 text-xs">
                Drop an image reference
              </span>
            )}
          </div>
        </div>

        <div className="bg-background/60 grid gap-2 rounded-md border p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">Prompt program</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={isGenerating}
              className="nodrag nopan"
              onClick={addPromptRow}
            >
              <Plus />
              Add row
            </Button>
          </div>
          <div className="grid gap-2">
            {promptRows.map((row, index) => {
              const sourceMasks = masksForPromptSource(promptReferences, row.sourceNodeId);
              const selectedSourceReference = promptReferences.find(
                (reference) => reference.nodeId === row.sourceNodeId,
              );
              const selectedMaskReference = sourceMasks.find((mask) => mask.id === row.maskId);
              const preview = generatePromptRowText(row, promptReferences);
              const rowState = generatePromptRowState(row, promptReferences);
              const complete = rowState === "complete";
              const rowInvalid = invalidPromptRows.has(row.id);
              const missingFields = promptRowMissingFields(row);

              return (
                <div
                  key={row.id}
                  className={cn(
                    "bg-background grid gap-1 rounded-md border p-2",
                    rowState === "partial" && "border-amber-400/70",
                  )}
                >
                  <div className="grid grid-cols-[1fr_1fr_0.9fr_1fr_auto] gap-1">
                    <Select
                      value={row.sourceNodeId || "__source__"}
                      disabled={isGenerating}
                      onValueChange={(value) =>
                        patchPromptRow(row.id, {
                          sourceNodeId: value === "__source__" ? "" : (value ?? ""),
                          maskId: "",
                        })
                      }
                    >
                      <SelectTrigger
                        className={cn(
                          "nodrag nopan h-8 px-2 text-xs",
                          rowInvalid &&
                            missingFields.includes("source") &&
                            "border-destructive ring-destructive/40 ring-1",
                        )}
                        aria-label={`Prompt row ${index + 1} source alias`}
                      >
                        <span
                          data-slot="select-value"
                          className={cn(
                            "flex flex-1 items-center truncate text-left",
                            !selectedSourceReference && "text-muted-foreground",
                          )}
                        >
                          {selectedSourceReference
                            ? `@${selectedSourceReference.alias}`
                            : "@source"}
                        </span>
                      </SelectTrigger>
                      <SelectContent align="start" className="nodrag nopan">
                        <SelectItem value="__source__">@source</SelectItem>
                        {promptReferences.map((reference) => (
                          <SelectItem key={reference.nodeId} value={reference.nodeId}>
                            @{reference.alias}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.maskId || "__mask__"}
                      disabled={isGenerating || !row.sourceNodeId}
                      onValueChange={(value) => {
                        const nextValue = value ?? "__mask__";
                        patchPromptRow(row.id, {
                          maskId: nextValue === "__mask__" ? "" : nextValue,
                        });
                      }}
                    >
                      <SelectTrigger
                        className={cn("nodrag nopan h-8 px-2 text-xs")}
                        aria-label={`Prompt row ${index + 1} mask`}
                      >
                        <span
                          data-slot="select-value"
                          className={cn(
                            "flex flex-1 items-center truncate text-left",
                            !selectedMaskReference && "text-muted-foreground",
                          )}
                        >
                          {selectedMaskReference?.name ??
                            (row.sourceNodeId && sourceMasks.length === 0
                              ? "No mask (optional)"
                              : "mask (optional)")}
                        </span>
                      </SelectTrigger>
                      <SelectContent align="start" className="nodrag nopan">
                        <SelectItem value="__mask__">
                          {row.sourceNodeId && sourceMasks.length === 0
                            ? "No mask (optional)"
                            : "mask (optional)"}
                        </SelectItem>
                        {sourceMasks.map((mask) => (
                          <SelectItem key={mask.id} value={mask.id}>
                            {mask.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.changeType}
                      disabled={isGenerating}
                      onValueChange={(value) =>
                        patchPromptRow(row.id, {
                          changeType: GENERATE_CHANGE_TYPES.includes(value as GenerateChangeType)
                            ? (value as GenerateChangeType)
                            : "color",
                        })
                      }
                    >
                      <SelectTrigger
                        className={cn(
                          "nodrag nopan h-8 px-2 text-xs",
                          rowInvalid &&
                            missingFields.includes("change") &&
                            "border-destructive ring-destructive/40 ring-1",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start" className="nodrag nopan">
                        {GENERATE_CHANGE_TYPES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <AliasMentionInput
                      value={row.targetText}
                      disabled={isGenerating}
                      aliases={aliasOptions}
                      ariaLabel={`Prompt row ${index + 1} target`}
                      className={cn(
                        rowInvalid &&
                          missingFields.includes("target") &&
                          "border-destructive ring-destructive/40 ring-1",
                      )}
                      onChange={(targetText) => patchPromptRow(row.id, { targetText })}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={isGenerating || (promptRows.length === 1 && rowState === "empty")}
                      aria-label={`Delete prompt row ${index + 1}`}
                      className="nodrag nopan size-8"
                      onClick={() => deletePromptRow(row.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  <p
                    className={cn(
                      "truncate font-mono text-[0.65rem]",
                      complete ? "text-foreground" : "text-muted-foreground",
                    )}
                    title={preview}
                  >
                    {preview || "@product use collar region change color to @pantone red"}
                  </p>
                  {rowState === "partial" ? (
                    <p className="text-[0.65rem] text-amber-600 dark:text-amber-300">
                      Complete the source and target to include this row. Mask is optional.
                    </p>
                  ) : null}
                  {rowInvalid ? (
                    <p className="text-destructive text-[0.65rem]">
                      Complete the highlighted field{missingFields.length === 1 ? "" : "s"} before
                      adding another row.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-1">
          <span className="text-muted-foreground text-xs">Prompt</span>
          <AliasMentionTextarea
            value={data.prompt}
            disabled={isGenerating}
            aliases={aliasOptions}
            masks={promptReferences.flatMap((reference) =>
              reference.masks.map((mask) => ({ nodeId: reference.nodeId, name: mask.name })),
            )}
            onChange={(prompt) => updateNodeData(id, { prompt })}
          />
          <span className="text-muted-foreground text-[0.65rem]">
            Add context or refine the generated prompt here.
          </span>
        </div>

        <ConfirmDialog
          title={connectedOutputHasImage ? "Replace output image?" : "Generate image?"}
          description={
            connectedOutputHasImage
              ? `This will replace the current Output image as soon as generation starts. Download it first if you need to keep it. Run ${selectedModel.aliases[0]} at ${size}?`
              : `Run ${selectedModel.aliases[0]} at ${size}? This may use API credits.`
          }
          confirmLabel="Generate"
          destructive={false}
          onConfirm={() => void onGenerate()}
          trigger={
            <Button
              type="button"
              size="sm"
              disabled={
                isGenerating ||
                !hasOutput ||
                allGenerationReferences.length > MAX_IMAGE_GENERATION_REFERENCES ||
                currentModelUnavailable ||
                currentModelBlockedByReferences
              }
              className={cn("w-full", isGenerating && "cursor-not-allowed")}
            >
              {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
          }
        />

        {!hasOutput && <p className="text-muted-foreground text-xs">Connect an Output node.</p>}
        {hasGenerationReferences && (
          <p className="text-muted-foreground text-xs">
            {allGenerationReferences.length} reference
            {allGenerationReferences.length === 1 ? "" : "s"} will guide this generation.
          </p>
        )}
        {allGenerationReferences.length > MAX_IMAGE_GENERATION_REFERENCES && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Remove references until there are no more than {MAX_IMAGE_GENERATION_REFERENCES}.
          </p>
        )}
        {provider === "gemini" && geminiVersion === "1" && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            NanoBanana 1 is currently unavailable on Xiangsu. Use NanoBanana 2 or Pro.
          </p>
        )}
        {provider === "gpt" && selectedGptOption && !selectedGptOption.enabled && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {selectedGptOption.label} is currently unavailable on Xiangsu. Use GPT Image 2, 1.5 Pro,
            or 1.
          </p>
        )}
        {provider === "gpt" && currentModelBlockedByReferences && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            DALL-E works only with prompt-only generation. Remove references or switch to a GPT
            Image model.
          </p>
        )}
        {data.status === "error" && data.error && (
          <p className="text-destructive text-xs">{data.error}</p>
        )}
      </div>
      <OutputPort color={NODE_PORT_COLORS.generate} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={280} minHeight={400} />
    </div>
  );
}
