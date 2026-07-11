"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type UIEvent as ReactUIEvent,
} from "react";
import { type NodeProps } from "@xyflow/react";
import { Loader2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getModelCatalogEntry,
  type ImageGenerationReference,
  imageGenerationErrorSchema,
  imageGenerationResponseSchema,
  MAX_IMAGE_GENERATION_REFERENCES,
  MODEL_CATALOG_GROUPS,
  normalizeImageGenerationModel,
} from "@/lib/image-generation-models";
import { isStaleGenerationConfigurationError } from "@/lib/generation-errors";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { GenerateCanvasNode } from "@/lib/nodes/types";
import {
  useCanvasActions,
  useConnectionHighlight,
  useGroupAccent,
  useReferenceHover,
  type ConnectedInputReference,
} from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 288;
const DEFAULT_HEIGHT = 500;

interface MentionState {
  start: number;
  end: number;
  query: string;
}

interface PromptReference {
  nodeId: string;
  alias: string;
}

interface PromptPart {
  value: string;
  reference: PromptReference | null;
}

function mentionAtCaret(value: string, caret: number): MentionState | null {
  const beforeCaret = value.slice(0, caret);
  const atIndex = beforeCaret.lastIndexOf("@");
  if (atIndex < 0) return null;

  const query = beforeCaret.slice(atIndex + 1);
  if (/[\r\n@]/.test(query) || query.length > 80) return null;

  return { start: atIndex, end: caret, query };
}

function aliasMatchesQuery(alias: string, query: string): boolean {
  return alias.toLowerCase().includes(query.trim().toLowerCase());
}

function promptParts(value: string, references: readonly PromptReference[]): PromptPart[] {
  const parts: PromptPart[] = [];
  const sortedReferences = references
    .map((reference) => ({ ...reference, alias: reference.alias.trim() }))
    .filter((reference) => reference.alias.length > 0)
    .sort((left, right) => right.alias.length - left.alias.length);
  let index = 0;

  while (index < value.length) {
    const match = sortedReferences.find((reference) =>
      value.slice(index).toLowerCase().startsWith(`@${reference.alias.toLowerCase()}`),
    );

    if (match) {
      parts.push({
        value: value.slice(index, index + match.alias.length + 1),
        reference: match,
      });
      index += match.alias.length + 1;
      continue;
    }

    const nextAt = value.indexOf("@", index + 1);
    const end = nextAt < 0 ? value.length : nextAt;
    parts.push({ value: value.slice(index, end), reference: null });
    index = end;
  }

  return parts;
}

function PromptPreview({
  value,
  references,
  hoveredReferenceNodeId,
  onReferenceHover,
  onReferencePointerDown,
}: {
  value: string;
  references: readonly PromptReference[];
  hoveredReferenceNodeId: string | null;
  onReferenceHover: (nodeId: string | null) => void;
  onReferencePointerDown: () => void;
}) {
  if (!value) {
    return <span className="text-muted-foreground">Describe the image...</span>;
  }

  return promptParts(value, references).map((part, index) =>
    part.reference ? (
      <mark
        key={`${part.value}-${index}`}
        onPointerEnter={() => onReferenceHover(part.reference?.nodeId ?? null)}
        onPointerLeave={() => onReferenceHover(null)}
        onPointerCancel={() => onReferenceHover(null)}
        onPointerDown={(event) => {
          event.preventDefault();
          onReferencePointerDown();
        }}
        className={cn(
          "pointer-events-auto rounded-sm bg-yellow-200 box-decoration-clone px-0.5 font-semibold text-yellow-950 transition-colors dark:bg-yellow-300/30 dark:text-yellow-50",
          hoveredReferenceNodeId === part.reference.nodeId &&
            "bg-yellow-300 text-yellow-950 dark:bg-yellow-300/45",
        )}
      >
        {part.value}
      </mark>
    ) : (
      <span key={`${part.value}-${index}`}>{part.value}</span>
    ),
  );
}

function hasImageUrl(reference: ConnectedInputReference): reference is ConnectedInputReference & {
  imageUrl: string;
} {
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

function isAutocompleteControlKey(key: string) {
  return key === "ArrowDown" || key === "ArrowUp" || key === "Tab" || key === "Enter";
}

export function GenerateNode({ id, data, parentId, selected }: NodeProps<GenerateCanvasNode>) {
  const {
    updateNodeData,
    getConnectedInputReferences,
    hasConnectedOutputNode,
    getConnectedOutputState,
    updateConnectedOutputData,
    writeGeneratedImageToOutput,
    deleteEdge,
  } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const { hoveredReferenceNodeId, setHoveredReferenceNodeId } = useReferenceHover();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const generatingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [promptDraft, setPromptDraft] = useState(data.prompt);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  useEffect(() => {
    if (document.activeElement === textareaRef.current || promptDraft === data.prompt) return;
    setPromptDraft(data.prompt);
  }, [data.prompt, promptDraft]);

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

  const hasOutput = hasConnectedOutputNode(id);
  const connectedOutput = getConnectedOutputState(id);
  const connectedOutputHasImage = Boolean(connectedOutput?.resultUrl);
  const connectedReferences = getConnectedInputReferences(id);
  const connectedImageReferences = connectedReferences.filter(hasImageUrl);
  const connectedReferenceUrls = new Set(
    connectedImageReferences.map((reference) => reference.imageUrl),
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
  const selectedModel = getModelCatalogEntry(model);
  const isGenerating = loading || data.status === "loading";
  const mentionSuggestions = mention
    ? connectedReferences.filter((reference) => {
        const query = mention.query.toLowerCase();
        return (
          reference.alias.toLowerCase().includes(query) ||
          reference.label.toLowerCase().includes(query)
        );
      })
    : [];

  const firstMentionSuggestion = mentionSuggestions[0];
  const activeMentionSuggestion =
    mentionSuggestions[activeSuggestionIndex] ?? firstMentionSuggestion;

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

  function updatePrompt(value: string, caret: number | null) {
    setPromptDraft(value);
    updateNodeData(id, { prompt: value });
    const nextMention = caret === null ? null : mentionAtCaret(value, caret);
    setMention(
      nextMention &&
        connectedReferences.some((reference) =>
          aliasMatchesQuery(reference.alias, nextMention.query),
        )
        ? nextMention
        : null,
    );
    setActiveSuggestionIndex(0);
  }

  function insertAlias(alias: string) {
    if (!mention) return;
    const currentPrompt = textareaRef.current?.value ?? promptDraft;
    const nextPrompt = `${currentPrompt.slice(0, mention.start)}@${alias} ${currentPrompt.slice(
      mention.end,
    )}`;
    const nextCaret = mention.start + alias.length + 2;
    setPromptDraft(nextPrompt);
    updateNodeData(id, { prompt: nextPrompt });
    setMention(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!mention || mentionSuggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((index) => (index + 1) % mentionSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex(
        (index) => (index - 1 + mentionSuggestions.length) % mentionSuggestions.length,
      );
      return;
    }

    if (event.key !== "Tab" && event.key !== "Enter") return;
    event.preventDefault();
    insertAlias(activeMentionSuggestion.alias);
  }

  function handlePromptScroll(event: ReactUIEvent<HTMLTextAreaElement>) {
    if (!previewRef.current) return;
    previewRef.current.scrollTop = event.currentTarget.scrollTop;
  }

  async function onGenerate() {
    if (generatingRef.current) return;
    const prompt = promptDraft.trim();
    if (!prompt) {
      toast.error("Enter a prompt first");
      return;
    }
    if (allGenerationReferences.length > MAX_IMAGE_GENERATION_REFERENCES) {
      toast.error(`Use no more than ${MAX_IMAGE_GENERATION_REFERENCES} reference images`);
      return;
    }

    generatingRef.current = true;
    setLoading(true);

    const outputReady = updateConnectedOutputData(id, {
      status: "loading",
      error: undefined,
    });
    if (!outputReady) {
      generatingRef.current = false;
      setLoading(false);
      toast.error("Connect an Output node before generating");
      return;
    }

    updateNodeData(id, { status: "loading", error: undefined, model });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          references: allGenerationReferences,
        }),
      });
      const json: unknown = await res.json();
      const parsed = imageGenerationResponseSchema.safeParse(json);
      if (!res.ok || !parsed.success) {
        const error = imageGenerationErrorSchema.safeParse(json);
        throw new Error(error.success ? error.data.error : "Generation failed");
      }
      updateNodeData(id, {
        status: "done",
        resultUrl: parsed.data.url,
        model: parsed.data.model,
        error: undefined,
      });
      const outputWritten = writeGeneratedImageToOutput(id, parsed.data.url, {
        prompt,
        model: parsed.data.model,
      });
      if (!outputWritten) {
        throw new Error("Output node was disconnected before generation finished");
      }
      toast.success("Image generated. Download it from Output if you need to keep this version.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      updateNodeData(id, { status: "error", error: message });
      updateConnectedOutputData(id, { status: "error", error: message });
      toast.error(message);
    } finally {
      generatingRef.current = false;
      setLoading(false);
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Model</span>
          <Select
            value={model}
            onValueChange={(value) => {
              const nextModel = normalizeImageGenerationModel(value);
              updateNodeData(id, { model: nextModel });
            }}
          >
            <SelectTrigger className="nodrag nopan h-auto min-h-11 w-full py-1.5">
              <SelectValue>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold">
                    {selectedModel.aliases.join(" / ")}
                  </span>
                  <span className="text-muted-foreground block truncate font-mono text-[0.65rem]">
                    {selectedModel.officialName}
                  </span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" className="nodrag nopan min-w-80">
              {MODEL_CATALOG_GROUPS.map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel className="font-semibold">{group.label}</SelectLabel>
                  {group.entries.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id} disabled={!entry.enabled}>
                      <span className="flex min-w-0 flex-1 flex-col items-start">
                        <span className="flex w-full items-center gap-2">
                          <span className="truncate text-xs font-semibold">
                            {entry.aliases.join(" / ")}
                          </span>
                          {!entry.enabled && (
                            <Badge variant="outline" className="ml-auto h-4 px-1 text-[0.6rem]">
                              {entry.capability}
                            </Badge>
                          )}
                        </span>
                        <span className="text-muted-foreground truncate font-mono text-[0.65rem]">
                          {entry.officialName}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

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

        <div className="focus-within:border-ring focus-within:ring-ring/30 bg-background/60 relative rounded-md border focus-within:ring-2">
          <div
            ref={previewRef}
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden p-2 text-sm leading-5 font-semibold break-words whitespace-pre-wrap"
            aria-hidden="true"
          >
            <PromptPreview
              value={promptDraft}
              references={connectedReferences.map((reference) => ({
                nodeId: reference.nodeId,
                alias: reference.alias,
              }))}
              hoveredReferenceNodeId={hoveredReferenceNodeId}
              onReferenceHover={setHoveredReferenceNodeId}
              onReferencePointerDown={() => textareaRef.current?.focus()}
            />
          </div>
          <textarea
            ref={textareaRef}
            rows={7}
            placeholder="Describe the image..."
            value={promptDraft}
            onChange={(event) => updatePrompt(event.target.value, event.target.selectionStart)}
            onClick={(event) =>
              updatePrompt(event.currentTarget.value, event.currentTarget.selectionStart)
            }
            onKeyUp={(event) => {
              if (mention && isAutocompleteControlKey(event.key)) return;
              updatePrompt(event.currentTarget.value, event.currentTarget.selectionStart);
            }}
            onKeyDown={handlePromptKeyDown}
            onScroll={handlePromptScroll}
            onBlur={() => window.setTimeout(() => setMention(null), 120)}
            className="nodrag caret-foreground relative z-10 block min-h-36 w-full resize-none overflow-y-auto rounded-md border border-transparent bg-transparent p-2 text-sm leading-5 font-semibold text-transparent outline-none placeholder:text-transparent"
          />
          {mention && connectedReferences.length > 0 && (
            <div className="nodrag nopan bg-popover text-popover-foreground absolute right-0 left-0 z-30 mt-1 max-h-32 overflow-y-auto rounded-md border p-1 shadow-md">
              {mentionSuggestions.length > 0 ? (
                mentionSuggestions.map((reference, index) => (
                  <button
                    key={reference.nodeId}
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      insertAlias(reference.alias);
                    }}
                    onMouseEnter={() => setActiveSuggestionIndex(index)}
                    className={cn(
                      "nodrag nopan focus-visible:ring-ring flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none focus-visible:ring-2",
                      index === activeSuggestionIndex ? "bg-accent" : "hover:bg-accent",
                    )}
                  >
                    {reference.kind === "pantone" ? (
                      <span
                        className="size-7 shrink-0 rounded border"
                        style={{ backgroundColor: reference.swatchHex }}
                        aria-hidden="true"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={reference.imageUrl}
                        alt=""
                        className="size-7 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">@{reference.alias}</span>
                      {reference.kind === "pantone" && (
                        <span className="text-muted-foreground block truncate">
                          {reference.label}
                        </span>
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-muted-foreground px-2 py-1.5 text-xs">No matching input</div>
              )}
            </div>
          )}
        </div>

        <ConfirmDialog
          title={connectedOutputHasImage ? "Replace output image?" : "Generate image?"}
          description={
            connectedOutputHasImage
              ? `This will replace the current Output image as soon as generation starts. Download it first if you need to keep it. Run ${selectedModel.aliases[0]} at 1024x1024?`
              : `Run ${selectedModel.aliases[0]} at 1024x1024? This may use API credits.`
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
                allGenerationReferences.length > MAX_IMAGE_GENERATION_REFERENCES
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
        {data.status === "error" && data.error && (
          <p className="text-destructive text-xs">{data.error}</p>
        )}
      </div>
      <OutputPort color={NODE_PORT_COLORS.generate} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={280} minHeight={400} />
    </div>
  );
}
