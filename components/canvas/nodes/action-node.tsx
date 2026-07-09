"use client";

import { type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

import type { ActionCanvasNode } from "@/lib/nodes/types";
import { WorkflowNode } from "./workflow-node";

const STATUS_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "queued", label: "Queued" },
  { value: "done", label: "Done" },
] as const;

export function ActionNode({ id, data, parentId, selected }: NodeProps<ActionCanvasNode>) {
  return (
    <WorkflowNode
      id={id}
      parentId={parentId}
      type="action"
      label="Action"
      icon={<Zap className="size-4" />}
      data={data}
      statusOptions={STATUS_OPTIONS}
      selected={selected}
    />
  );
}
