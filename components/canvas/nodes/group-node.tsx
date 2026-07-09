"use client";

import { type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { GroupCanvasNode } from "@/lib/nodes/types";
import { useCanvasActions, useConnectionHighlight } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 192;

export function GroupNode({ id, data, selected }: NodeProps<GroupCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;

  return (
    <div
      style={{ width, height, ...(data.color ? { borderColor: data.color } : {}), ...highlight }}
      className={cn(
        "group border-border bg-muted/25 relative flex flex-col rounded-lg border-2 border-dashed p-3 shadow-sm",
        selected && "ring-primary ring-offset-background ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.group} />
      <input
        value={data.label}
        placeholder="Group label"
        onChange={(e) => updateNodeData(id, { label: e.target.value })}
        className="text-muted-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring/30 w-full rounded-sm bg-transparent text-xs font-medium tracking-wide uppercase outline-none focus-visible:ring-2"
      />
      <OutputPort color={NODE_PORT_COLORS.group} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={200} minHeight={120} />
    </div>
  );
}
