"use client";

import { useEffect, useMemo, useState } from "react";
import { type NodeProps } from "@xyflow/react";
import { Check, ChevronDown, Copy, Loader2, Palette } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NODE_PORT_COLORS } from "@/lib/nodes/ports";
import {
  findPantoneColor,
  getPantoneCatalogLabel,
  loadPantoneColors,
  PANTONE_LIBRARY_SOURCES,
  searchPantoneColors,
  type PantoneCatalog,
  type PantoneColor,
} from "@/lib/nodes/pantone";
import type { PantoneCanvasNode } from "@/lib/nodes/types";
import {
  useCanvasActions,
  useConnectionHighlight,
  useGroupAccent,
  useReferenceHover,
} from "../canvas-context";
import { NodeDeleteButton } from "./delete-button";
import { InputPort, OutputPort } from "./port";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 304;
const DEFAULT_HEIGHT = 520;
const EXPANDED_HEIGHT = 700;
const MIN_DISPLAY_WIDTH = 304;
const MIN_DISPLAY_HEIGHT = 520;
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

function defaultQueryForColor(color: PantoneColor): string {
  const codeHasSuffix = /\b(c|u|tcx|tpg)$/i.test(color.code);
  if (codeHasSuffix) return `PANTONE ${color.code}`;
  if (color.catalog.endsWith("uncoated")) return `PANTONE ${color.code} U`;
  if (color.catalog.endsWith("coated")) return `PANTONE ${color.code} C`;
  if (color.catalog === "fhi-tpg") return `PANTONE ${color.code} TPG`;
  return `PANTONE ${color.code} TCX`;
}

export function PantoneNode({
  id,
  data,
  parentId,
  selected: isNodeSelected,
}: NodeProps<PantoneCanvasNode>) {
  const { resizeNode, updateNodeData } = useCanvasActions();
  const highlight = useConnectionHighlight(id);
  const accent = useGroupAccent(parentId);
  const { hoveredReferenceNodeId } = useReferenceHover();
  const [colors, setColors] = useState<PantoneColor[]>([]);
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");
  const [copied, setCopied] = useState(false);
  const [matchesExpanded, setMatchesExpanded] = useState(true);
  const width = Math.max(data.width ?? DEFAULT_WIDTH, MIN_DISPLAY_WIDTH);
  const height = Math.max(data.height ?? DEFAULT_HEIGHT, MIN_DISPLAY_HEIGHT);
  const isPanelExpanded = height > MIN_DISPLAY_HEIGHT + 8;
  const catalogFilter = persistedCatalogFilter(data.catalogFilter);
  const isReferenceHovered = hoveredReferenceNodeId === id;

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

  function toggleMatchesPanel() {
    const nextExpanded = !isPanelExpanded;
    resizeNode(id, width, nextExpanded ? EXPANDED_HEIGHT : MIN_DISPLAY_HEIGHT);
    setMatchesExpanded(nextExpanded);
  }

  const swatchColor = selected?.hex ?? "#e9e8e3";
  const displayCode = selected?.code ?? "PANTONE";
  const displayCatalog = selected ? catalogLabel(selected.catalog) : "Library";
  const hasDistinctName =
    selected && selected.displayName.trim().toLowerCase() !== selected.code.trim().toLowerCase();
  const displayName = hasDistinctName
    ? selected.displayName
    : selected
      ? displayCatalog
      : "Search a color";
  const displayHex = selected?.hex.toUpperCase() ?? "";
  const rgbLabel = selected
    ? `RGB ${selected.rgb.r}, ${selected.rgb.g}, ${selected.rgb.b}`
    : loadingState === "loading"
      ? "Loading libraries"
      : "No match";

  return (
    <div
      style={{
        width,
        height,
        ...(accent ? { outline: `2px solid ${accent}`, outlineOffset: 2 } : {}),
        ...highlight,
      }}
      className={cn(
        "group relative flex flex-col overflow-hidden border border-neutral-200 bg-white text-neutral-950 shadow-[0_18px_32px_rgba(15,23,42,0.24)] dark:border-neutral-800 dark:bg-neutral-950",
        isReferenceHovered &&
          "ring-offset-background shadow-lg ring-2 ring-yellow-400 ring-offset-2",
        isNodeSelected && "ring-primary ring-offset-background shadow-lg ring-2 ring-offset-2",
      )}
    >
      <NodeDeleteButton id={id} />
      <InputPort color={NODE_PORT_COLORS.pantone} />

      <div className="flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-neutral-200 bg-white px-3 pr-8 text-sm font-bold text-neutral-950 select-none active:cursor-grabbing dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50">
        <Palette className="size-4 text-orange-500" aria-hidden="true" />
        <span>Pantone</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto p-3 pb-11">
        <div className="nodrag grid gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
          <select
            value={catalogFilter ?? "all"}
            onChange={(event) => handleCatalogFilterChange(event.target.value)}
            className="h-8 w-full rounded-none border border-neutral-300 bg-white px-2 text-xs font-semibold text-neutral-950 outline-none focus-visible:border-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-950/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:focus-visible:border-neutral-50 dark:focus-visible:ring-neutral-50/20"
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
            className="h-8 rounded-none border-neutral-300 bg-white text-sm text-neutral-950 placeholder:text-neutral-500 focus-visible:border-neutral-950 focus-visible:ring-neutral-950/20 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:placeholder:text-neutral-500 dark:focus-visible:border-neutral-50 dark:focus-visible:ring-neutral-50/20"
          />
        </div>

        <div className="mt-3 min-h-[342px] overflow-hidden bg-white shadow-[0_12px_24px_rgba(15,23,42,0.18)]">
          <div
            className="relative flex h-[202px] items-center justify-center border-b border-neutral-200"
            style={{ backgroundColor: swatchColor }}
          >
            {loadingState === "loading" && !selected ? (
              <div className="flex items-center gap-2 bg-white/85 px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm">
                <Loader2 className="size-3.5 animate-spin" />
                Loading
              </div>
            ) : null}
          </div>

          <div className="flex min-h-[140px] flex-col bg-white px-5 py-4 text-neutral-950">
            <div className="truncate text-[28px] leading-tight font-black">
              PANTONE<sup className="ml-0.5 align-super text-[11px] leading-none">&reg;</sup>
            </div>
            <div className="mt-1 truncate text-[19px] leading-tight font-medium">{displayCode}</div>
            <div className="truncate text-[19px] leading-tight font-bold">{displayName}</div>
            <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pt-2 text-xs font-semibold text-neutral-500">
              <span className="min-w-0 truncate">{displayCatalog}</span>
              <span className="shrink-0">{displayHex}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
          <div className="min-w-0 text-neutral-500 dark:text-neutral-400">
            <div className="truncate font-semibold text-neutral-950 dark:text-neutral-50">
              {displayHex || displayCode}
            </div>
            <div className="truncate">{rgbLabel}</div>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            title="Copy HEX"
            aria-label="Copy HEX"
            onClick={() => void copyHex()}
            disabled={!selected}
            className="nodrag rounded-none border-neutral-300 bg-white text-neutral-950 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50 dark:hover:bg-neutral-900"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-2 flex min-h-0 flex-col gap-1">
            <div className="flex h-8 items-center justify-between text-xs font-bold text-neutral-500 dark:text-neutral-400">
              <span>Matches</span>
              <div className="flex items-center gap-1">
                <span className="font-semibold tabular-nums">{suggestions.length}</span>
              </div>
            </div>
            {matchesExpanded && (
              <div className="flex max-h-24 flex-col gap-1 overflow-x-hidden overflow-y-auto">
                {suggestions.map((color) => (
                  <button
                    key={`${color.catalog}-${color.code}`}
                    type="button"
                    onClick={() => applyColor(color)}
                    className="nodrag grid h-7 grid-cols-[1rem_5.5rem_1fr] items-center gap-2 px-1.5 text-left text-xs text-neutral-950 transition-colors outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-neutral-950/30 dark:text-neutral-50 dark:hover:bg-neutral-900 dark:focus-visible:ring-neutral-50/30"
                  >
                    <span
                      className="size-4 border border-neutral-300 dark:border-neutral-700"
                      style={{ backgroundColor: color.hex }}
                      aria-hidden="true"
                    />
                    <span className="truncate font-medium">{color.code}</span>
                    <span className="truncate text-neutral-500 dark:text-neutral-400">
                      {color.displayName}
                      {!catalogFilter ? ` / ${catalogLabel(color.catalog)}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <button
          type="button"
          title={isPanelExpanded ? "Collapse matches" : "Expand matches"}
          aria-expanded={isPanelExpanded}
          aria-label={isPanelExpanded ? "Collapse matches" : "Expand matches"}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMatchesPanel();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (event.detail === 0) {
              toggleMatchesPanel();
            }
          }}
          className="nodrag nopan pointer-events-auto absolute bottom-2 left-1/2 z-30 grid size-9 -translate-x-1/2 touch-manipulation place-items-center rounded-full border-2 border-white bg-orange-500 text-white shadow-[0_6px_14px_rgba(249,115,22,0.5)] transition duration-150 ease-out outline-none hover:bg-orange-600 hover:shadow-[0_8px_18px_rgba(249,115,22,0.6)] focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-95 dark:border-neutral-950 dark:focus-visible:ring-offset-neutral-950"
        >
          <ChevronDown
            className={cn(
              "size-5 transition-transform duration-200 ease-out will-change-transform",
              isPanelExpanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      )}

      <OutputPort color={NODE_PORT_COLORS.pantone} />
      <ResizeHandle
        nodeId={id}
        width={width}
        height={height}
        minWidth={MIN_DISPLAY_WIDTH}
        minHeight={MIN_DISPLAY_HEIGHT}
      />
    </div>
  );
}
