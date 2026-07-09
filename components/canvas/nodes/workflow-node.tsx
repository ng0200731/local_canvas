"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import type { NodeType } from "@/lib/nodes/types";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

export interface WorkflowNodeData {
  title: string;
  notes: string;
  status: string;
  width?: number;
  height?: number;
}

export interface WorkflowStatusOption {
  value: string;
  label: string;
}

interface WorkflowNodeProps {
  id: string;
  parentId?: string;
  type: Extract<NodeType, "suppler" | "action">;
  label: string;
  icon: ReactNode;
  data: WorkflowNodeData;
  statusOptions: readonly WorkflowStatusOption[];
  selected?: boolean;
}

const DEFAULT_WIDTH = 248;
const DEFAULT_HEIGHT = 188;

export function WorkflowNode({
  id,
  parentId,
  type,
  label,
  icon,
  data,
  statusOptions,
  selected = false,
}: WorkflowNodeProps) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;
  const color = NODE_PORT_COLORS[type];

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
      <InputPort color={color} />
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
      <input
        value={data.title}
        placeholder={`${label} title`}
        onChange={(e) => updateNodeData(id, { title: e.target.value })}
        className="bg-background focus-visible:border-ring focus-visible:ring-ring/30 h-8 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
      />
      <textarea
        value={data.notes}
        placeholder="Notes"
        onChange={(e) => updateNodeData(id, { notes: e.target.value })}
        className="bg-background focus-visible:border-ring focus-visible:ring-ring/30 min-h-16 flex-1 resize-none rounded-md border p-2 text-sm outline-none focus-visible:ring-2"
      />
      <select
        value={data.status}
        onChange={(e) => updateNodeData(id, { status: e.target.value })}
        className="bg-background focus-visible:border-ring focus-visible:ring-ring/30 h-8 w-full rounded-md border px-2 text-xs outline-none focus-visible:ring-2"
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <OutputPort color={color} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={200} minHeight={156} />
    </div>
  );
}
