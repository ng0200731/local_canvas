"use client";

import { useEffect, useMemo, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Check, Copy, Loader2, Palette } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import {
  contrastTextForHex,
  findPantoneColor,
  getPantoneCatalogLabel,
  loadPantoneColors,
  PANTONE_LIBRARY_SOURCES,
  searchPantoneColors,
  type PantoneCatalog,
  type PantoneColor,
} from "@/lib/nodes/pantone";
import type { PantoneCanvasNode } from "@/lib/nodes/types";
import { useCanvasActions, useConnectionHighlight, useGroupAccent } from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 284;
const PANTONE_CATALOGS = new Set<PantoneCatalog>(
  PANTONE_LIBRARY_SOURCES.map((source) => source.catalog),
);

function persistedCatalog(value: unknown): PantoneCatalog {
  return typeof value === "string" && PANTONE_CATALOGS.has(value as PantoneCatalog)
    ? (value as PantoneCatalog)
    : "fhi-tcx";
}

function persistedCatalogFilter(value: unknown): PantoneCatalog | null {
  return typeof value === "string" && PANTONE_CATALOGS.has(value as PantoneCatalog)
    ? (value as PantoneCatalog)
    : null;
}

function persistedColor(data: PantoneCanvasNode["data"]): PantoneColor | null {
  if (!data.code || !data.name || !data.hex || !data.hex.startsWith("#")) return null;
  const hex = data.hex as `#${string}`;
  return {
    code: data.code,
    name: data.name,
    displayName: data.name.includes("-")
      ? data.name
          .split("-")
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" ")
      : data.name,
    hex,
    catalog: persistedCatalog(data.catalog),
    rgb: {
      r: Number.parseInt(hex.slice(1, 3), 16),
      g: Number.parseInt(hex.slice(3, 5), 16),
      b: Number.parseInt(hex.slice(5, 7), 16),
    },
  };
}

export function PantoneNode({
  id,
  data,
  parentId,
  selected: isNodeSelected,
}: NodeProps<PantoneCanvasNode>) {
  const { updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const [colors, setColors] = useState<PantoneColor[]>([]);
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");
  const [copied, setCopied] = useState(false);
  const width = data.width ?? DEFAULT_WIDTH;
  const height = data.height ?? DEFAULT_HEIGHT;
  const catalogFilter = persistedCatalogFilter(data.catalogFilter);

  useEffect(() => {
    let active = true;
    loadPantoneColors()
      .then((nextColors) => {
        if (!active) return;
        setColors(nextColors);
        setLoadingState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadingState("error");
        toast.error(error instanceof Error ? error.message : "Unable to load Pantone colors");
      });
    return () => {
      active = false;
    };
  }, []);

  const searchableColors = useMemo(
    () => (catalogFilter ? colors.filter((color) => color.catalog === catalogFilter) : colors),
    [colors, catalogFilter],
  );

  const selected = useMemo(() => {
    const fromSearch = findPantoneColor(searchableColors, data.query);
    const persisted = persistedColor(data);
    if (fromSearch) return fromSearch;
    if (persisted && (!catalogFilter || persisted.catalog === catalogFilter)) return persisted;
    return null;
  }, [searchableColors, data, catalogFilter]);

  const suggestions = useMemo(
    () =>
      searchPantoneColors(searchableColors, data.query, 5).filter(
        (color) => color.code !== selected?.code || color.catalog !== selected.catalog,
      ),
    [searchableColors, data.query, selected],
  );

  function defaultQueryForColor(color: PantoneColor): string {
    if (color.catalog.endsWith("uncoated")) return `PANTONE ${color.code} U`;
    if (color.catalog.endsWith("coated")) return `PANTONE ${color.code} C`;
    if (color.catalog === "fhi-tpg") return `PANTONE ${color.code} TPG`;
    return `PANTONE ${color.code} TCX`;
  }

  function catalogLabel(catalog: PantoneCatalog): string {
    return getPantoneCatalogLabel(catalog);
  }

  function applyColor(color: PantoneColor, query = defaultQueryForColor(color)) {
    updateNodeData(id, {
      query,
      code: color.code,
      name: color.name,
      hex: color.hex,
      catalog: color.catalog,
    });
  }

  function handleQueryChange(query: string) {
    const match = findPantoneColor(searchableColors, query);
    updateNodeData(id, {
      query,
      code: match?.code ?? null,
      name: match?.name ?? null,
      hex: match?.hex ?? null,
      catalog: match?.catalog ?? null,
    });
  }

  function handleCatalogFilterChange(value: string) {
    const nextFilter = persistedCatalogFilter(value);
    const nextColors = nextFilter ? colors.filter((color) => color.catalog === nextFilter) : colors;
    const match = data.query.trim() ? findPantoneColor(nextColors, data.query) : null;
    updateNodeData(id, {
      catalogFilter: nextFilter,
      ...(data.query.trim()
        ? {
            code: match?.code ?? null,
            name: match?.name ?? null,
            hex: match?.hex ?? null,
            catalog: match?.catalog ?? null,
          }
        : {}),
    });
  }

  async function copyHex() {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.hex);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const swatchTextColor = selected ? contrastTextForHex(selected.hex) : undefined;

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
        isNodeSelected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.pantone} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <Palette className="size-4" />
        Pantone
      </div>

      <select
        value={catalogFilter ?? "all"}
        onChange={(event) => handleCatalogFilterChange(event.target.value)}
        className="nodrag bg-background focus-visible:border-ring focus-visible:ring-ring/30 h-8 w-full rounded-md border px-2 text-xs outline-none focus-visible:ring-2"
        aria-label="Pantone series"
      >
        <option value="all">All Pantone libraries</option>
        {PANTONE_LIBRARY_SOURCES.map((source) => (
          <option key={source.catalog} value={source.catalog}>
            {source.label}
          </option>
        ))}
      </select>

      <Input
        value={data.query}
        placeholder="Red 032 C, Red032C, 032, 17-5641"
        onChange={(event) => handleQueryChange(event.target.value)}
        className="nodrag h-8 rounded-md text-sm"
      />

      <div
        className="flex min-h-24 flex-col justify-between rounded-md border p-3"
        style={selected ? { backgroundColor: selected.hex, color: swatchTextColor } : undefined}
      >
        {loadingState === "loading" && !selected ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Loading colors
          </div>
        ) : selected ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide">
              <span className="truncate">{selected.code}</span>
              <span className="shrink-0 opacity-75">{catalogLabel(selected.catalog)}</span>
            </div>
            <div className="text-lg leading-tight font-semibold">{selected.displayName}</div>
          </>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            {loadingState === "error" ? "Dataset unavailable" : "No match"}
          </div>
        )}
      </div>

      {selected && (
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
          <div className="text-muted-foreground min-w-0">
            <div className="text-foreground truncate font-medium">{selected.hex.toUpperCase()}</div>
            <div>
              RGB {selected.rgb.r}, {selected.rgb.g}, {selected.rgb.b}
            </div>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="Copy HEX"
            aria-label="Copy HEX"
            onClick={() => void copyHex()}
            className="nodrag"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="flex min-h-0 flex-col gap-1">
          <span className="text-muted-foreground text-xs">Matches</span>
          <div className="flex flex-col gap-1">
            {suggestions.map((color) => (
              <button
                key={color.code}
                type="button"
                onClick={() => applyColor(color)}
                className="nodrag focus-visible:ring-ring hover:bg-muted grid h-7 grid-cols-[1rem_5.25rem_1fr] items-center gap-2 rounded-md px-1.5 text-left text-xs transition-colors outline-none focus-visible:ring-2"
              >
                <span
                  className="size-4 rounded-sm border"
                  style={{ backgroundColor: color.hex }}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{color.code}</span>
                <span className="text-muted-foreground truncate">
                  {color.displayName}
                  {!catalogFilter ? ` · ${catalogLabel(color.catalog)}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <OutputPort color={NODE_PORT_COLORS.pantone} />
      <ResizeHandle nodeId={id} width={width} height={height} minWidth={248} minHeight={236} />
    </div>
  );
}
