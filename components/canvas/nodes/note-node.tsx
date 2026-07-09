"use client";

import { type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { NoteCanvasNode } from "@/lib/nodes/types";
import { useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { NoteEditor } from "./note-editor";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 224;
const DEFAULT_HEIGHT = 128;

export function NoteNode({ id, data, parentId, selected }: NodeProps<NoteCanvasNode>) {
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  return (
    <div
      style={{
        width,
        height,
        ...(accent ? { outline: `2px solid ${accent}`, outlineOffset: 2 } : {}),
        ...highlight,
      }}
      className={cn(
        "group relative flex flex-col rounded-lg border border-amber-200 bg-amber-50/90 p-2 shadow-md dark:border-amber-900/50 dark:bg-amber-950/30",
        selected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.note} />
      <NoteEditor id={id} html={data.text} />
      <OutputPort color={NODE_PORT_COLORS.note} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={160} minHeight={96} />
    </div>
  );
}
