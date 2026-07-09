"use client";

import { type NodeProps } from "@xyflow/react";
import { Package } from "lucide-react";

import type { SupplerCanvasNode } from "@/lib/nodes/types";
import { WorkflowNode } from "./workflow-node";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "blocked", label: "Blocked" },
] as const;

export function SupplerNode({ id, data, parentId }: NodeProps<SupplerCanvasNode>) {
  return (
    <WorkflowNode
      id={id}
      parentId={parentId}
      type="suppler"
      label="Suppler"
      icon={<Package className="size-4" />}
      data={data}
      statusOptions={STATUS_OPTIONS}
    />
  );
}
