"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnConnectStartParams,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanvas } from "@/lib/hooks/use-canvas";
import { getCanvasStore } from "@/lib/store";
import { createNode } from "@/lib/nodes/registry";
import { colorForNodeType, DEFAULT_EDGE_COLOR, EDGE_WIDTH } from "@/lib/nodes/ports";
import type { CanvasContent, CanvasEdge, CanvasNode, NodeType } from "@/lib/nodes/types";
import {
  CanvasActionsContext,
  ConnectionHighlightContext,
  type ConnectedInputReference,
} from "./canvas-context";
import { NodePalette } from "./node-palette";
import { DeletableEdge } from "./edges/canvas-edge";
import { ActionNode } from "./nodes/action-node";
import { GenerateNode } from "./nodes/generate-node";
import { GroupNode } from "./nodes/group-node";
import { InputNode } from "./nodes/input-node";
import { ImageNode } from "./nodes/image-node";
import { NoteNode } from "./nodes/note-node";
import { OutputNode } from "./nodes/output-node";
import { PantoneNode } from "./nodes/pantone-node";
import { SupplerNode } from "./nodes/suppler-node";

const AUTOSAVE_DEBOUNCE_MS = 600;
const NEW_NODE_DISPLACEMENT = 32;
const POSITION_EPSILON = 1;
const MAX_PLACEMENT_PROBES = 40;

/**
 * Reorder so each parent appears before its children. React Flow paints nodes in
 * array order, so this keeps child nodes on top of their group container.
 */
function reorderChildrenAfterParents(nodes: CanvasNode[]): CanvasNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const ordered: CanvasNode[] = [];
  const seen = new Set<string>();
  const visit = (n: CanvasNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    if (parent) visit(parent);
    ordered.push(n);
  };
  for (const n of nodes) visit(n);
  return ordered;
}

/**
 * Absolute geometry of a node. With `nodeOrigin [0.5,0.5]`, React Flow's
 * `internals.positionAbsolute` is the **top-left** corner and the stored
 * `position` is the center — so we expose top-left (`x`,`y`), size, and the
 * center (`cx`,`cy`) to keep reparenting math reference-correct.
 */
type Rectable =
  | {
      internals?: { positionAbsolute?: XYPosition };
      measured?: { width?: number; height?: number };
    }
  | undefined;

function rectOf(
  n: Rectable,
): { x: number; y: number; w: number; h: number; cx: number; cy: number } | null {
  const abs = n?.internals?.positionAbsolute;
  const w = n?.measured?.width ?? 0;
  const h = n?.measured?.height ?? 0;
  if (!abs || !w || !h) return null;
  return { x: abs.x, y: abs.y, w, h, cx: abs.x + w / 2, cy: abs.y + h / 2 };
}

function isSamePosition(a: XYPosition, b: XYPosition): boolean {
  return Math.abs(a.x - b.x) < POSITION_EPSILON && Math.abs(a.y - b.y) < POSITION_EPSILON;
}

function findNewNodePosition(base: XYPosition, nodes: CanvasNode[]): XYPosition {
  const isOccupied = (position: XYPosition) =>
    nodes.some((node) => !node.parentId && isSamePosition(node.position, position));

  for (let step = 0; step <= MAX_PLACEMENT_PROBES; step += 1) {
    const position =
      step === 0
        ? base
        : {
            x: base.x + NEW_NODE_DISPLACEMENT * step,
            y: base.y + NEW_NODE_DISPLACEMENT * step,
          };
    if (!isOccupied(position)) return position;
  }

  return {
    x: base.x + NEW_NODE_DISPLACEMENT * (MAX_PLACEMENT_PROBES + 1),
    y: base.y + NEW_NODE_DISPLACEMENT * (MAX_PLACEMENT_PROBES + 1),
  };
}

function appendSelectedNode(nodes: CanvasNode[], node: CanvasNode): CanvasNode[] {
  return nodes
    .map((n) => (n.selected ? { ...n, selected: false } : n))
    .concat({
      ...node,
      selected: true,
    });
}

function findConnectedOutputNodeId(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  generateNodeId: string,
): string | null {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));

  for (const edge of edges) {
    const otherNodeId =
      edge.source === generateNodeId
        ? edge.target
        : edge.target === generateNodeId
          ? edge.source
          : null;

    if (otherNodeId && nodesById.get(otherNodeId)?.type === "imageOutput") {
      return otherNodeId;
    }
  }

  return null;
}

function findConnectedInputReferences(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  nodeId: string,
): ConnectedInputReference[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const seen = new Set<string>();
  const references: ConnectedInputReference[] = [];

  for (const edge of edges) {
    const otherNodeId =
      edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : null;
    if (!otherNodeId || seen.has(otherNodeId)) continue;

    const node = nodesById.get(otherNodeId);
    if (!node) continue;

    if (node.type === "imageInput") {
      const imageUrl = typeof node.data.imageUrl === "string" ? node.data.imageUrl : null;
      if (!imageUrl) continue;

      const alias =
        typeof node.data.alias === "string" && node.data.alias.trim()
          ? node.data.alias.trim()
          : "image";

      seen.add(otherNodeId);
      references.push({ nodeId: otherNodeId, kind: "image", alias, label: alias, imageUrl });
      continue;
    }

    if (node.type === "pantone") {
      const swatchHex =
        typeof node.data.hex === "string" && node.data.hex.startsWith("#") ? node.data.hex : null;
      if (!swatchHex) continue;

      const name = typeof node.data.name === "string" && node.data.name.trim()
        ? node.data.name.trim()
        : null;
      const code = typeof node.data.code === "string" && node.data.code.trim()
        ? node.data.code.trim()
        : null;
      const alias = name ?? code ?? "pantone";
      const label = name
        ? name
            .split("-")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ")
        : (code ?? "Pantone");

      seen.add(otherNodeId);
      references.push({
        nodeId: otherNodeId,
        kind: "pantone",
        alias,
        label,
        swatchHex,
      });
    }
  }

  return references;
}

function normalizeNodeType(node: CanvasNode): CanvasNode {
  if ((node.type as string) !== "output") return node;
  return { ...node, type: "imageOutput" };
}

function Editor({
  projectId,
  canvasId,
  embedded = false,
  onBack,
}: {
  projectId: string;
  canvasId: string;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const { data: canvas, isLoading } = useCanvas(canvasId);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>([]);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { screenToFlowPosition, getNodes, getInternalNode } = useReactFlow();
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [canvasName, setCanvasName] = useState("");
  const [saving, setSaving] = useState(false);

  // Live connection drag: which node the wire started from (source highlight)
  // and which node + dot the pointer is currently hovering over (target highlight).
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null);
  const [connectionTargetId, setConnectionTargetId] = useState<string | null>(null);
  const [connectionTargetDot, setConnectionTargetDot] = useState<"left" | "right" | null>(null);

  // ComfyUI style: the in-progress wire and both highlight rings share the
  // source node's type color.
  const connectionColor = connectionSourceId
    ? colorForNodeType(nodes.find((n) => n.id === connectionSourceId)?.type)
    : DEFAULT_EDGE_COLOR;

  // Load the canvas content once it arrives.
  useEffect(() => {
    if (canvas && !loadedRef.current) {
      loadedRef.current = true;
      setNodes(reorderChildrenAfterParents(canvas.content.nodes.map(normalizeNodeType)));
      // Force the custom (deletable) edge type so the remove button renders.
      // Older edges were saved before dots had explicit ids — backfill
      // sourceHandle/targetHandle (right=source, left=target under the old
      // model) so they keep attaching instead of going limp.
      setEdges(
        canvas.content.edges.map((e) => ({
          ...e,
          type: "deletable",
          sourceHandle: e.sourceHandle ?? "right",
          targetHandle: e.targetHandle ?? "left",
        })),
      );
    }
  }, [canvas, setNodes, setEdges]);

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
    },
    [setNodes],
  );

  const getConnectedInputReferences = useCallback(
    (nodeId: string) => findConnectedInputReferences(nodes, edges, nodeId),
    [edges, nodes],
  );

  const hasConnectedOutputNode = useCallback(
    (generateNodeId: string) => findConnectedOutputNodeId(nodes, edges, generateNodeId) !== null,
    [edges, nodes],
  );

  function openSaveDialog() {
    setCanvasName(canvas?.name ?? "");
    setSaveOpen(true);
  }

  async function saveCanvas(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = canvasName.trim();
    if (!name) {
      toast.error("Enter a canvas name");
      return;
    }

    setSaving(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const content: CanvasContent = { nodes, edges };
      await getCanvasStore().renameCanvas(canvasId, name);
      await getCanvasStore().saveCanvasContent(canvasId, content);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["canvas", canvasId] }),
        queryClient.invalidateQueries({ queryKey: ["canvases", projectId] }),
      ]);
      setSaveOpen(false);
      toast.success("Canvas saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save canvas");
    } finally {
      setSaving(false);
    }
  }

  // Debounced autosave whenever nodes/edges change (after the initial load).
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const content: CanvasContent = { nodes, edges };
      void getCanvasStore().saveCanvasContent(canvasId, content);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, canvasId]);

  const onConnect = useCallback(
    (connection: Connection) => {
      // ComfyUI-style: color the wire to match its source port's node type.
      const source = getNodes().find((n) => n.id === connection.source);
      const color = colorForNodeType(source?.type);
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "deletable",
            style: { stroke: color, strokeWidth: EDGE_WIDTH },
          },
          eds,
        ),
      );
    },
    [setEdges, getNodes],
  );

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, { nodeId }: OnConnectStartParams) => {
      // Light up the node the wire is coming from (both its dots); clear stale target.
      setConnectionSourceId(nodeId);
      setConnectionTargetId(null);
      setConnectionTargetDot(null);
    },
    [],
  );

  const onConnectEnd = useCallback(() => {
    setConnectionSourceId(null);
    setConnectionTargetId(null);
    setConnectionTargetDot(null);
  }, []);

  // Auto-attach grouping: when a node is dropped with its center over a group,
  // parent it to that group (so it moves with the group); when dropped outside
  // any group, release it back to the canvas. Positions are converted between
  // absolute and parent-relative (nodeOrigin is [0.5,0.5], so position = center).
  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: CanvasNode, draggedNodes: CanvasNode[]) => {
      const allNodes = getNodes();
      // Group bounds (top-left + size); absolute geometry comes from the
      // internal node store (plain nodes only carry parent-relative positions).
      const groups = new Map<string, { x: number; y: number; w: number; h: number }>();
      for (const n of allNodes) {
        if (n.type !== "group") continue;
        const r = rectOf(getInternalNode(n.id));
        if (r) groups.set(n.id, r);
      }
      if (groups.size === 0) return;

      const draggedIds = new Set(draggedNodes.map((n) => n.id));
      const reparent = new Map<string, { parentId: string | null; position: XYPosition }>();
      for (const n of allNodes) {
        if (!draggedIds.has(n.id) || n.type === "group") continue;
        const r = rectOf(getInternalNode(n.id));
        if (!r) continue;
        // Attach when the node's CENTER lands inside a group's bounds.
        let target: string | null = null;
        for (const [gid, g] of groups) {
          if (r.cx >= g.x && r.cx <= g.x + g.w && r.cy >= g.y && r.cy <= g.y + g.h) {
            target = gid;
            break;
          }
        }
        const current = n.parentId ?? null;
        if (target === current) continue;
        if (target) {
          const g = groups.get(target)!;
          // Keep the node's center fixed: stored position (center, nodeOrigin
          // 0.5) relative to the group's top-left = center - groupTopLeft.
          reparent.set(n.id, { parentId: target, position: { x: r.cx - g.x, y: r.cy - g.y } });
        } else {
          // Detach to top-level: stored position = absolute center.
          reparent.set(n.id, { parentId: null, position: { x: r.cx, y: r.cy } });
        }
      }
      if (reparent.size === 0) return;

      setNodes((nds) => {
        const next = nds.map((n) => {
          const r = reparent.get(n.id);
          if (!r) return n;
          const updated = { ...n, position: r.position };
          if (r.parentId) updated.parentId = r.parentId;
          else delete updated.parentId;
          return updated;
        });
        return reorderChildrenAfterParents(next);
      });
    },
    [getNodes, getInternalNode, setNodes],
  );

  // Release children to the canvas when their group is removed via React Flow's
  // own deletion path (e.g. the Delete/Backspace key) — otherwise their
  // parentId would dangle and they'd jump or vanish. Only intercepts "remove"
  // changes; everything else passes through untouched.
  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const removeIds = changes.filter((c) => c.type === "remove").map((c) => c.id);
      if (removeIds.length > 0) {
        const releases = new Map<string, XYPosition>();
        for (const n of getNodes()) {
          if (n.parentId && removeIds.includes(n.parentId)) {
            const r = rectOf(getInternalNode(n.id));
            if (r) releases.set(n.id, { x: r.cx, y: r.cy });
          }
        }
        if (releases.size > 0) {
          setNodes((nds) =>
            nds.map((n) => {
              if (!releases.has(n.id)) return n;
              const detached = { ...n };
              delete detached.parentId;
              return { ...detached, position: releases.get(n.id)! };
            }),
          );
        }
      }
      onNodesChange(changes);
    },
    [getNodes, getInternalNode, setNodes, onNodesChange],
  );

  // While dragging a wire, highlight whichever node the pointer is over (node
  // ring) and, when it's over a specific dot, that dot too. Loose mode lets any
  // dot connect to any dot, so we report the hovered dot's side directly. Hit-
  // tests the DOM so it tracks exactly what's on screen regardless of zoom/pan.
  useEffect(() => {
    if (!connectionSourceId) return;
    const handlePointerMove = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const nodeEl = element?.closest<HTMLElement>(".react-flow__node");
      const handleEl = element?.closest<HTMLElement>(".react-flow__handle");
      const nodeId = nodeEl?.getAttribute("data-id") ?? null;
      const handlePos = handleEl?.getAttribute("data-handlepos");
      const targetId = nodeId && nodeId !== connectionSourceId ? nodeId : null;
      const dot: "left" | "right" | null =
        targetId && (handlePos === "left" || handlePos === "right") ? handlePos : null;
      setConnectionTargetId((prev) => (prev === targetId ? prev : targetId));
      setConnectionTargetDot((prev) => (prev === dot ? prev : dot));
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [connectionSourceId]);

  const connectionHighlight = useMemo(
    () => ({
      sourceId: connectionSourceId,
      targetId: connectionTargetId,
      targetDot: connectionTargetDot,
      color: connectionColor,
    }),
    [connectionSourceId, connectionTargetId, connectionTargetDot, connectionColor],
  );

  const updateConnectedOutputData = useCallback(
    (generateNodeId: string, patch: Record<string, unknown>) => {
      const outputNodeId = findConnectedOutputNodeId(nodes, edges, generateNodeId);
      if (!outputNodeId) return false;

      setNodes((nds) =>
        nds.map((node) =>
          node.id === outputNodeId ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      );

      return true;
    },
    [edges, nodes, setNodes],
  );

  const writeGeneratedImageToOutput = useCallback(
    (generateNodeId: string, url: string, meta: { prompt: string; model: string }) => {
      const updated = updateConnectedOutputData(generateNodeId, {
        resultUrl: url,
        prompt: meta.prompt,
        model: meta.model,
        status: "done",
        error: undefined,
      });

      if (!updated) return false;

      void getCanvasStore().recordImage({
        canvasId,
        source: "generated",
        url,
        prompt: meta.prompt,
        model: meta.model,
      });

      return true;
    },
    [canvasId, updateConnectedOutputData],
  );

  const deleteNode = useCallback(
    (id: string) => {
      // If a group is being removed, release its children back to the canvas at
      // their current absolute centers (otherwise their parentId dangles).
      const centerById = new Map<string, XYPosition>();
      for (const n of getNodes()) {
        if (n.id === id || n.parentId === id) {
          const r = rectOf(getInternalNode(n.id));
          if (r) centerById.set(n.id, { x: r.cx, y: r.cy });
        }
      }
      setNodes((nds) =>
        nds
          .filter((n) => n.id !== id)
          .map((n) => {
            if (n.parentId !== id) return n;
            const center = centerById.get(n.id);
            const detached = { ...n };
            delete detached.parentId;
            return { ...detached, position: center ?? n.position };
          }),
      );
      // Drop any wires that were attached to the removed node.
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    },
    [getNodes, getInternalNode, setNodes, setEdges],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== id));
    },
    [setEdges],
  );

  const deleteAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    toast.success("Canvas cleared");
  }, [setNodes, setEdges]);

  const resizeNode = useCallback(
    (id: string, width: number, height: number) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          // nodeOrigin is [0.5, 0.5], so `position` is the node's CENTER. To
          // keep the visible top-left corner pinned while resizing, recompute
          // the center from the (fixed) top-left and the new size.
          // Prefer the stored size (no measurement lag) over `measured`.
          const oldW = (n.data.width as number | undefined) ?? n.measured?.width ?? width;
          const oldH = (n.data.height as number | undefined) ?? n.measured?.height ?? height;
          const topLeftX = n.position.x - oldW / 2;
          const topLeftY = n.position.y - oldH / 2;
          return {
            ...n,
            position: { x: topLeftX + width / 2, y: topLeftY + height / 2 },
            data: { ...n.data, width, height },
          };
        }),
      );
    },
    [setNodes],
  );

  const addNodeAtCenter = useCallback(
    (type: NodeType) => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      setNodes((nds) => {
        const node = createNode(type, findNewNodePosition(position, nds));
        return appendSelectedNode(nds, node);
      });
    },
    [screenToFlowPosition, setNodes],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/ica-node") as NodeType;
      if (!type) return;
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setNodes((nds) => {
        const node = createNode(type, findNewNodePosition(position, nds));
        return appendSelectedNode(nds, node);
      });
    },
    [screenToFlowPosition, setNodes],
  );

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      note: NoteNode,
      image: ImageNode,
      imageInput: InputNode,
      group: GroupNode,
      generate: GenerateNode,
      imageOutput: OutputNode,
      suppler: SupplerNode,
      action: ActionNode,
      pantone: PantoneNode,
    }),
    [],
  );

  // Smooth bezier links, color-matched to the source port (ComfyUI style).
  const defaultEdgeOptions = useMemo(
    () => ({
      type: "deletable" as const,
      style: { stroke: DEFAULT_EDGE_COLOR, strokeWidth: EDGE_WIDTH },
    }),
    [],
  );

  const edgeTypes = useMemo<EdgeTypes>(() => ({ deletable: DeletableEdge }), []);

  const actions = useMemo(
    () => ({
      updateNodeData,
      getConnectedInputReferences,
      hasConnectedOutputNode,
      updateConnectedOutputData,
      writeGeneratedImageToOutput,
      deleteNode,
      deleteEdge,
      resizeNode,
    }),
    [
      updateNodeData,
      getConnectedInputReferences,
      hasConnectedOutputNode,
      updateConnectedOutputData,
      writeGeneratedImageToOutput,
      deleteNode,
      deleteEdge,
      resizeNode,
    ],
  );

  return (
    <div
      className={
        embedded
          ? "bg-background flex h-[calc(100dvh-6rem)] flex-col"
          : "bg-background flex h-[calc(100dvh-3.5rem)] flex-col"
      }
    >
      <div className="bg-background/90 supports-[backdrop-filter]:bg-background/70 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur">
        {onBack ? (
          <Button size="icon-sm" variant="ghost" aria-label="Back to project" onClick={onBack}>
            <ChevronLeft />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Back to project"
            render={<Link href={`/projects/${projectId}`} />}
          >
            <ChevronLeft />
          </Button>
        )}
        {isLoading || !canvas ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <div className="min-w-0">
            <p className="text-muted-foreground text-[0.7rem] font-medium tracking-wide uppercase">
              Canvas
            </p>
            <span className="block truncate text-sm font-semibold">{canvas.name}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ConfirmDialog
            title="Delete all nodes?"
            description="This removes every node and wire from this canvas."
            confirmLabel="Delete all"
            onConfirm={deleteAll}
            trigger={
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={isLoading || !canvas || (nodes.length === 0 && edges.length === 0)}
                className="shadow-sm"
              >
                <Trash2 />
                Delete all
              </Button>
            }
          />
          <Button
            type="button"
            size="sm"
            className="shadow-sm"
            disabled={isLoading || !canvas || saving}
            onClick={openSaveDialog}
          >
            <Save />
            Save canvas
          </Button>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <form onSubmit={saveCanvas} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Save canvas</DialogTitle>
              <DialogDescription>
                Add a name and save this canvas content to the active database.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Label htmlFor="canvas-save-name">Canvas name</Label>
              <Input
                id="canvas-save-name"
                autoFocus
                className="h-10"
                placeholder="Canvas name"
                value={canvasName}
                onChange={(event) => setCanvasName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={saving || !canvasName.trim()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 flex-1">
        <CanvasActionsContext.Provider value={actions}>
          <NodePalette onAdd={addNodeAtCenter} />
          <ConnectionHighlightContext.Provider value={connectionHighlight}>
            <div className="relative flex-1" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
              {isLoading || !canvas ? (
                <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                  Loading canvas...
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onConnectStart={onConnectStart}
                  onConnectEnd={onConnectEnd}
                  onNodeDragStop={onNodeDragStop}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  nodeOrigin={[0.5, 0.5]}
                  connectionMode={ConnectionMode.Loose}
                  connectionLineType={ConnectionLineType.Bezier}
                  connectionLineStyle={{
                    stroke: connectionColor,
                    strokeWidth: EDGE_WIDTH,
                  }}
                  defaultEdgeOptions={defaultEdgeOptions}
                  deleteKeyCode={["Delete", "Backspace"]}
                  fitView
                  className="bg-background"
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={24}
                    size={1}
                    color="color-mix(in oklch, var(--muted-foreground), transparent 62%)"
                  />
                  <Controls />
                  <MiniMap pannable zoomable />
                </ReactFlow>
              )}
            </div>
          </ConnectionHighlightContext.Provider>
        </CanvasActionsContext.Provider>
      </div>
    </div>
  );
}

export function CanvasEditor({
  projectId,
  canvasId,
  embedded = false,
  onBack,
}: {
  projectId: string;
  canvasId: string;
  embedded?: boolean;
  onBack?: () => void;
}) {
  return (
    <ReactFlowProvider>
      <Editor projectId={projectId} canvasId={canvasId} embedded={embedded} onBack={onBack} />
    </ReactFlowProvider>
  );
}
