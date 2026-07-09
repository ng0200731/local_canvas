"use client";

import {
  Image as ImageIcon,
  Package,
  Palette,
  Sparkles,
  Square,
  StickyNote,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { NODE_META, PALETTE_NODE_TYPES } from "@/lib/nodes/registry";
import type { NodeType } from "@/lib/nodes/types";

const ICONS: Record<NodeType, LucideIcon> = {
  note: StickyNote,
  image: ImageIcon,
  group: Square,
  generate: Sparkles,
  suppler: Package,
  action: Zap,
  pantone: Palette,
};

export function NodePalette({ onAdd }: { onAdd: (type: NodeType) => void }) {
  return (
    <aside className="bg-background flex w-40 shrink-0 flex-col gap-1.5 border-r p-2">
      <span className="text-muted-foreground px-2 py-1 text-xs font-medium tracking-wide uppercase">
        Add node
      </span>
      {PALETTE_NODE_TYPES.map((type) => {
        const meta = NODE_META[type];
        const Icon = ICONS[type];
        return (
          <button
            key={type}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/ica-node", type);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onAdd(type)}
            className="bg-background hover:bg-muted flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors active:cursor-grabbing"
          >
            <Icon className="text-muted-foreground size-4 shrink-0" />
            {meta.label}
          </button>
        );
      })}
      <p className="text-muted-foreground mt-2 px-2 text-xs">
        Drag onto the canvas, or click to drop at the center.
      </p>
    </aside>
  );
}
