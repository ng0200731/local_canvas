"use client";

import { type NodeProps } from "@xyflow/react";

import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { NoteCanvasNode } from "@/lib/nodes/types";
import { useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { NoteEditor } from "./note-editor";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 224;
const DEFAULT_HEIGHT = 128;

export function NoteNode({ id, data, parentId }: NodeProps<NoteCanvasNode>) {
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
      className="group relative flex flex-col rounded-md border border-amber-200 bg-amber-50 p-2 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.note} />
      <NoteEditor id={id} html={data.text} />
      <OutputPort color={NODE_PORT_COLORS.note} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={160} minHeight={96} />
    </div>
  );
}
