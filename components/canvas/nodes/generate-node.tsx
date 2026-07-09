"use client";

import { useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { isFalConfigured } from "@/lib/env";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { GenerateCanvasNode } from "@/lib/nodes/types";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const MODELS = [
  { value: "flux", label: "Flux — text → image" },
  { value: "flux-kontext", label: "Flux Kontext — edit image" },
] as const;

const DEFAULT_WIDTH = 288;
const DEFAULT_HEIGHT = 440;

export function GenerateNode({ id, data, parentId }: NodeProps<GenerateCanvasNode>) {
  const { updateNodeData, spawnImageNode } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const [loading, setLoading] = useState(false);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  const model = data.model === "flux-kontext" ? "flux-kontext" : "flux";
  const references = data.references;
  const hasRefs = references.length > 0;

  function addReference(url: string) {
    if (!references.includes(url)) {
      updateNodeData(id, { references: [...references, url] });
    }
  }
  function removeReference(url: string) {
    updateNodeData(id, { references: references.filter((r) => r !== url) });
  }

  async function onGenerate() {
    if (!data.prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    setLoading(true);
    updateNodeData(id, { status: "loading", error: undefined });
    try {
      const imageUrl = hasRefs ? references[0] : null;
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: data.prompt, imageUrl }),
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
      spawnImageNode(id, json.url, { prompt: data.prompt, model });
      toast.success("Image generated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      updateNodeData(id, { status: "error", error: message });
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
      className="group bg-card relative flex flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-md border p-3 shadow-sm"
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.generate} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4" /> Generate
      </div>

      <textarea
        rows={3}
        placeholder="Describe the image…"
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        className="bg-background focus-visible:border-ring w-full resize-none rounded-md border p-2 text-sm outline-none"
      />

      <select
        value={model}
        onChange={(e) => updateNodeData(id, { model: e.target.value })}
        className="bg-background focus-visible:border-ring h-9 w-full rounded-md border px-2 text-sm outline-none"
      >
        {MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Reference images</span>
        <div
          className="flex min-h-9 flex-wrap gap-1 rounded-md border border-dashed p-1"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const url = e.dataTransfer.getData("application/ica-image-url");
            if (url) addReference(url);
          }}
        >
          {hasRefs ? (
            references.map((url) => (
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
            ))
          ) : (
            <span className="text-muted-foreground px-1 py-1 text-xs">
              Drag an image node here to use it as a reference
            </span>
          )}
        </div>
      </div>

      <ConfirmDialog
        title="Generate image?"
        description="This runs the model and may use API credits."
        confirmLabel="Generate"
        destructive={false}
        onConfirm={() => void onGenerate()}
        trigger={
          <Button type="button" size="sm" disabled={loading || !isFalConfigured} className="w-full">
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Generating…" : "Generate"}
          </Button>
        }
      />

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
