"use client";

import { type NodeProps } from "@xyflow/react";

import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { GroupCanvasNode } from "@/lib/nodes/types";
import { useCanvasActions, useConnectionHighlight } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 192;

export function GroupNode({ id, data }: NodeProps<GroupCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  return (
    <div
      style={{ width, height, ...(data.color ? { borderColor: data.color } : {}), ...highlight }}
      className="group border-border bg-muted/20 relative flex flex-col rounded-lg border-2 border-dashed p-2"
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.group} />
      <input
        value={data.label}
        placeholder="Group label"
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        className="text-muted-foreground placeholder:text-muted-foreground/50 w-full bg-transparent text-xs font-medium tracking-wide uppercase outline-none"
      />
      <OutputPort color={NODE_PORT_COLORS.group} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={200} minHeight={120} />
    </div>
  );
}
