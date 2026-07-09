"use client";

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { type NodeProps } from "@xyflow/react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { isFalConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { GenerateCanvasNode } from "@/lib/nodes/types";
import {
  useCanvasActions,
  useConnectionHighlight,
  useGroupAccent,
  type ConnectedInputReference,
} from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 288;
const DEFAULT_HEIGHT = 428;

interface MentionState {
  start: number;
  end: number;
  query: string;
}

function mentionAtCaret(value: string, caret: number): MentionState | null {
  const beforeCaret = value.slice(0, caret);
  const atIndex = beforeCaret.lastIndexOf("@");
  if (atIndex < 0) return null;

  const query = beforeCaret.slice(atIndex + 1);
  if (/\s/.test(query)) return null;

  return { start: atIndex, end: caret, query };
}

function PromptPreview({ value }: { value: string }) {
  if (!value) {
    return <span className="text-muted-foreground">Describe the image...</span>;
  }

  return value.split(/(@[^\s@]+)/g).map((part, index) =>
    part.startsWith("@") ? (
      <strong key={`${part}-${index}`} className="text-foreground font-semibold">
        {part}
      </strong>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function hasImageUrl(reference: ConnectedInputReference): reference is ConnectedInputReference & {
  imageUrl: string;
} {
  return reference.kind === "image" && typeof reference.imageUrl === "string";
}

export function GenerateNode({ id, data, parentId, selected }: NodeProps<GenerateCanvasNode>) {
  const {
    updateNodeData,
    getConnectedInputReferences,
    hasConnectedOutputNode,
    updateConnectedOutputData,
    writeGeneratedImageToOutput,
  } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(false);
  const [mention, setMention] = useState<MentionState | null>(null);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  const hasOutput = hasConnectedOutputNode(id);
  const connectedReferences = getConnectedInputReferences(id);
  const connectedImageReferences = connectedReferences.filter(hasImageUrl);
  const connectedReferenceUrls = new Set(
    connectedImageReferences.map((reference) => reference.imageUrl),
  );
  const manualImageReferences = data.references.filter((url) => !connectedReferenceUrls.has(url));
  const allReferenceImageUrls = connectedImageReferences
    .map((reference) => reference.imageUrl)
    .concat(manualImageReferences);
  const hasReferenceItems = connectedReferences.length > 0 || manualImageReferences.length > 0;
  const hasImageRefs = allReferenceImageUrls.length > 0;
  const model = hasImageRefs ? "flux-kontext" : "flux";
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

  const renderedReferences = connectedReferences.map((reference) => {
    if (reference.kind === "pantone") {
      return (
        <div
          key={reference.nodeId}
          title={`@${reference.alias}`}
          className="relative size-9 overflow-hidden rounded border"
        >
          <div
            className="size-full"
            style={{ backgroundColor: reference.swatchHex }}
            aria-hidden="true"
          />
          <span className="absolute right-0 bottom-0 left-0 truncate bg-black/55 px-0.5 text-[0.55rem] leading-3 text-white">
            {reference.label}
          </span>
        </div>
      );
    }

    return (
      <div
        key={reference.nodeId}
        title={`@${reference.alias}`}
        className="relative size-9 overflow-hidden rounded"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={reference.imageUrl} alt="" className="size-full object-cover" />
        <span className="absolute right-0 bottom-0 left-0 truncate bg-black/55 px-0.5 text-[0.55rem] leading-3 text-white">
          @{reference.alias}
        </span>
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

  function updatePrompt(value: string, caret: number | null) {
    updateNodeData(id, { prompt: value });
    setMention(caret === null ? null : mentionAtCaret(value, caret));
  }

  function insertAlias(alias: string) {
    if (!mention) return;
    const nextPrompt = `${data.prompt.slice(0, mention.start)}@${alias} ${data.prompt.slice(
      mention.end,
    )}`;
    const nextCaret = mention.start + alias.length + 2;
    updateNodeData(id, { prompt: nextPrompt });
    setMention(null);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab" || !mention || !firstMentionSuggestion) return;
    event.preventDefault();
    insertAlias(firstMentionSuggestion.alias);
  }

  async function onGenerate() {
    const prompt = data.prompt.trim();
    if (!prompt) {
      toast.error("Enter a prompt first");
      return;
    }

    const outputReady = updateConnectedOutputData(id, {
      status: "loading",
      error: undefined,
    });
    if (!outputReady) {
      toast.error("Connect an Output node before generating");
      return;
    }

    setLoading(true);
    updateNodeData(id, { status: "loading", error: undefined, model });
    try {
      const imageUrl = hasImageRefs ? allReferenceImageUrls[0] : null;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, imageUrl }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Generation failed");
      }
      updateNodeData(id, {
        status: "done",
        resultUrl: json.url,
        error: undefined,
      });
      const outputWritten = writeGeneratedImageToOutput(id, json.url, { prompt, model });
      if (!outputWritten) {
        throw new Error("Output node was disconnected before generation finished");
      }
      toast.success("Image generated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      updateNodeData(id, { status: "error", error: message });
      updateConnectedOutputData(id, { status: "error", error: message });
      toast.error(message);
    } finally {
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
        "group bg-card relative flex flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-lg border p-3 shadow-md",
        selected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.generate} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4" /> Generate
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Reference image</span>
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
                <div key={url} className="relative size-9 overflow-hidden rounded">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove reference"
                    onClick={() => removeReference(url)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
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

      <div className="relative">
        <div className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words rounded-md border border-transparent p-2 text-sm">
          <PromptPreview value={data.prompt} />
        </div>
        <textarea
          ref={textareaRef}
          rows={4}
          placeholder="Describe the image..."
          value={data.prompt}
          onChange={(event) => updatePrompt(event.target.value, event.target.selectionStart)}
          onClick={(event) =>
            updatePrompt(event.currentTarget.value, event.currentTarget.selectionStart)
          }
          onKeyUp={(event) =>
            updatePrompt(event.currentTarget.value, event.currentTarget.selectionStart)
          }
          onKeyDown={handlePromptKeyDown}
          onBlur={() => window.setTimeout(() => setMention(null), 120)}
          className="nodrag bg-background/60 focus-visible:border-ring focus-visible:ring-ring/30 caret-foreground placeholder:text-transparent relative w-full resize-none rounded-md border p-2 text-sm text-transparent outline-none focus-visible:ring-2"
        />
        {mention && connectedReferences.length > 0 && (
          <div className="bg-popover text-popover-foreground absolute right-0 left-0 z-20 mt-1 max-h-32 overflow-y-auto rounded-md border p-1 shadow-md">
            {mentionSuggestions.length > 0 ? (
              mentionSuggestions.map((reference) => (
                <button
                  key={reference.nodeId}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertAlias(reference.alias);
                  }}
                  className="hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none focus-visible:ring-2"
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
        title="Generate image?"
        description="This runs the model and may use API credits."
        confirmLabel="Generate"
        destructive={false}
        onConfirm={() => void onGenerate()}
        trigger={
          <Button
            type="button"
            size="sm"
            disabled={loading || !isFalConfigured || !hasOutput}
            className="w-full"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Generating..." : "Generate"}
          </Button>
        }
      />

      {!hasOutput && <p className="text-muted-foreground text-xs">Connect an Output node.</p>}
      {!isFalConfigured && (
        <p className="text-muted-foreground text-xs">
          Add <code>FAL_KEY</code> to enable generation.
        </p>
      )}
      {data.status === "error" && data.error && (
        <p className="text-destructive text-xs">{data.error}</p>
      )}
      <OutputPort color={NODE_PORT_COLORS.generate} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={260} minHeight={320} />
    </div>
  );
}
