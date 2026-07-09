import { z } from "zod";

export const PANTONE_FHI_DATA_URL = "/data/pantone-colors.json";
export const PANTONE_SOLID_COATED_DATA_URL = "/data/pantone-solid-coated.json";
export const PANTONE_SOLID_UNCOATED_DATA_URL = "/data/pantone-solid-uncoated.json";
export const PANTONE_FHI_TPG_DATA_URL = "/data/pantone-fhi-tpg.json";
export const PANTONE_METALLICS_COATED_DATA_URL = "/data/pantone-metallics-coated.json";
export const PANTONE_PREMIUM_METALLICS_COATED_DATA_URL =
  "/data/pantone-premium-metallics-coated.json";
export const PANTONE_PASTELS_NEONS_COATED_DATA_URL = "/data/pantone-pastels-neons-coated.json";
export const PANTONE_PASTELS_NEONS_UNCOATED_DATA_URL = "/data/pantone-pastels-neons-uncoated.json";
export const PANTONE_BRIDGE_COATED_DATA_URL = "/data/pantone-color-bridge-coated.json";
export const PANTONE_BRIDGE_UNCOATED_DATA_URL = "/data/pantone-color-bridge-uncoated.json";
export const PANTONE_DATA_SOURCES = {
  fhiTcx: "https://github.com/Margaret2/pantone-colors/blob/master/pantone-numbers.json",
  solidCoated: "https://webtemple.design/resources/all-pantone-c-colors-with-hex-and-rgb-codes",
  solidCoatedLab:
    "https://github.com/aj90909/unofficial-pantone-solid-coated-2024-v5/blob/main/colors.csv",
} as const;

const PantoneFhiDatasetSchema = z.record(
  z.string().regex(/^\d{2}-\d{4}$/),
  z.object({
    name: z.string().min(1),
    hex: z.string().regex(/^[0-9a-fA-F]{6}$/),
  }),
);

const PantoneArrayDatasetSchema = z.array(
  z.object({
    code: z.string().min(1).optional(),
    name: z.string().min(1),
    hex: z.string().regex(/^[0-9a-fA-F]{6}$/),
  }),
);

export type PantoneCatalog =
  | "solid-coated"
  | "solid-uncoated"
  | "fhi-tcx"
  | "fhi-tpg"
  | "metallics-coated"
  | "premium-metallics-coated"
  | "pastels-neons-coated"
  | "pastels-neons-uncoated"
  | "color-bridge-coated"
  | "color-bridge-uncoated";

interface PantoneLibrarySource {
  catalog: PantoneCatalog;
  label: string;
  url: string;
  format: "record" | "array";
  optional: boolean;
}

export const PANTONE_LIBRARY_SOURCES: readonly PantoneLibrarySource[] = [
  {
    catalog: "solid-coated",
    label: "Solid Coated",
    url: PANTONE_SOLID_COATED_DATA_URL,
    format: "array",
    optional: false,
  },
  {
    catalog: "solid-uncoated",
    label: "Solid Uncoated",
    url: PANTONE_SOLID_UNCOATED_DATA_URL,
    format: "array",
    optional: true,
  },
  {
    catalog: "fhi-tcx",
    label: "Fashion + Home TCX",
    url: PANTONE_FHI_DATA_URL,
    format: "record",
    optional: false,
  },
  {
    catalog: "fhi-tpg",
    label: "Fashion + Home TPG",
    url: PANTONE_FHI_TPG_DATA_URL,
    format: "array",
    optional: true,
  },
  {
    catalog: "metallics-coated",
    label: "Metallics Coated",
    url: PANTONE_METALLICS_COATED_DATA_URL,
    format: "array",
    optional: true,
  },
  {
    catalog: "premium-metallics-coated",
    label: "Premium Metallics Coated",
    url: PANTONE_PREMIUM_METALLICS_COATED_DATA_URL,
    format: "array",
    optional: true,
  },
  {
    catalog: "pastels-neons-coated",
    label: "Pastels + Neons Coated",
    url: PANTONE_PASTELS_NEONS_COATED_DATA_URL,
    format: "array",
    optional: true,
  },
  {
    catalog: "pastels-neons-uncoated",
    label: "Pastels + Neons Uncoated",
    url: PANTONE_PASTELS_NEONS_UNCOATED_DATA_URL,
    format: "array",
    optional: true,
  },
  {
    catalog: "color-bridge-coated",
    label: "Color Bridge Coated",
    url: PANTONE_BRIDGE_COATED_DATA_URL,
    format: "array",
    optional: true,
  },
  {
    catalog: "color-bridge-uncoated",
    label: "Color Bridge Uncoated",
    url: PANTONE_BRIDGE_UNCOATED_DATA_URL,
    format: "array",
    optional: true,
  },
];

export interface PantoneColor {
  code: string;
  name: string;
  displayName: string;
  hex: `#${string}`;
  catalog: PantoneCatalog;
  rgb: {
    r: number;
    g: number;
    b: number;
  };
}

function titleCaseSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toHex(value: string): `#${string}` {
  return `#${value.toLowerCase()}`;
}

export function hexToRgb(hex: `#${string}`): PantoneColor["rgb"] {
  const clean = hex.slice(1);
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  };
}

const PANTONE_SUFFIXES = new Set(["c", "u", "tcx", "tpg", "tpn"]);

function tokenizePantoneText(value: string): string[] {
  return value
    .replace(/\bpantone\b/gi, " ")
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/(\d)([a-z])/gi, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
}

function removePantoneSuffixes(tokens: readonly string[]): string[] {
  return tokens.filter((token) => !PANTONE_SUFFIXES.has(token));
}

function compact(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function compactTokens(tokens: readonly string[]): string {
  return tokens.join("");
}

export function normalizePantoneQuery(value: string): string {
  const fhiCode = extractFhiPantoneCode(value);
  if (fhiCode) return fhiCode;
  return removePantoneSuffixes(tokenizePantoneText(value)).join(" ");
}

function extractFhiPantoneCode(value: string): string | null {
  const compact = value.replace(/\bpantone\b/gi, "").replace(/\b(tcx|tpg|tpn|c|u)\b/gi, "");
  const dashed = compact.match(/\b\d{2}-\d{4}\b/);
  if (dashed) return dashed[0];
  const undashed = compact.match(/\b\d{6}\b/);
  return undashed ? `${undashed[0].slice(0, 2)}-${undashed[0].slice(2)}` : null;
}

function comparePantoneColors(a: PantoneColor, b: PantoneColor): number {
  const aIndex = PANTONE_LIBRARY_SOURCES.findIndex((source) => source.catalog === a.catalog);
  const bIndex = PANTONE_LIBRARY_SOURCES.findIndex((source) => source.catalog === b.catalog);
  if (aIndex !== bIndex) return aIndex - bIndex;
  return a.code.localeCompare(b.code);
}

export function getPantoneCatalogLabel(catalog: PantoneCatalog): string {
  return PANTONE_LIBRARY_SOURCES.find((source) => source.catalog === catalog)?.label ?? "Pantone";
}

function parsePantoneRecordDataset(raw: unknown, catalog: PantoneCatalog): PantoneColor[] {
  const parsed = PantoneFhiDatasetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${getPantoneCatalogLabel(catalog)} dataset did not match the expected schema`);
  }

  return Object.entries(parsed.data)
    .map(([code, value]) => {
      const hex = toHex(value.hex);
      return {
        code,
        name: value.name,
        displayName: titleCaseSlug(value.name),
        hex,
        catalog,
        rgb: hexToRgb(hex),
      };
    })
    .sort(comparePantoneColors);
}

function parsePantoneArrayLibraryDataset(raw: unknown, catalog: PantoneCatalog): PantoneColor[] {
  const parsed = PantoneArrayDatasetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${getPantoneCatalogLabel(catalog)} dataset did not match the expected schema`);
  }

  return parsed.data
    .map((value) => {
      const hex = toHex(value.hex);
      const code = value.code ?? value.name;
      return {
        code,
        name: value.name,
        displayName: value.name,
        hex,
        catalog,
        rgb: hexToRgb(hex),
      };
    })
    .sort(comparePantoneColors);
}

export function parsePantoneDataset(raw: unknown): PantoneColor[] {
  return parsePantoneRecordDataset(raw, "fhi-tcx");
}

export function parsePantoneSolidCoatedDataset(raw: unknown): PantoneColor[] {
  return parsePantoneArrayLibraryDataset(raw, "solid-coated");
}

export function parsePantoneLibraryDatasetForTest(
  raw: unknown,
  catalog: PantoneCatalog,
): PantoneColor[] {
  return parsePantoneArrayLibraryDataset(raw, catalog);
}

function parsePantoneLibraryDataset(raw: unknown, source: PantoneLibrarySource): PantoneColor[] {
  return source.format === "record"
    ? parsePantoneRecordDataset(raw, source.catalog)
    : parsePantoneArrayLibraryDataset(raw, source.catalog);
}

function colorSearchKeys(color: PantoneColor): string[] {
  const keys = new Set<string>();
  for (const value of [color.code, color.name, color.displayName]) {
    const tokens = tokenizePantoneText(value);
    const significant = removePantoneSuffixes(tokens);
    const full = tokens.join(" ");
    const plain = significant.join(" ");
    const fullCompact = compactTokens(tokens);
    const plainCompact = compactTokens(significant);
    if (full) keys.add(full);
    if (plain) keys.add(plain);
    if (fullCompact) keys.add(fullCompact);
    if (plainCompact) keys.add(plainCompact);
    keys.add(compact(value));
    for (const token of significant) {
      if (/^\d+$/.test(token)) keys.add(token);
    }
  }
  return Array.from(keys).filter(Boolean);
}

function querySearchKeys(query: string): string[] {
  const keys = new Set<string>();
  const fhiCode = extractFhiPantoneCode(query);
  if (fhiCode) {
    keys.add(fhiCode);
    keys.add(compact(fhiCode));
  }
  const tokens = tokenizePantoneText(query);
  const significant = removePantoneSuffixes(tokens);
  const full = tokens.join(" ");
  const plain = significant.join(" ");
  const fullCompact = compactTokens(tokens);
  const plainCompact = compactTokens(significant);
  if (full) keys.add(full);
  if (plain) keys.add(plain);
  if (fullCompact) keys.add(fullCompact);
  if (plainCompact) keys.add(plainCompact);
  for (const token of significant) {
    if (/^\d+$/.test(token)) keys.add(token);
  }
  return Array.from(keys).filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

function isOrderedSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function scoreColor(color: PantoneColor, query: string): number {
  const normalized = normalizePantoneQuery(query);
  if (!normalized) return 0;

  const queryKeys = querySearchKeys(query);
  const candidateKeys = colorSearchKeys(color);
  let score = 0;

  for (const queryKey of queryKeys) {
    for (const candidateKey of candidateKeys) {
      if (candidateKey === queryKey) score = Math.max(score, 100);
      else if (candidateKey.startsWith(queryKey)) score = Math.max(score, 65);
      else if (candidateKey.includes(queryKey)) score = Math.max(score, 35);
      else if (queryKey.length >= 3 && candidateKey.length <= 32) {
        const distance = levenshteinDistance(queryKey, candidateKey);
        const allowedDistance = queryKey.length <= 5 ? 1 : 2;
        if (distance <= allowedDistance) score = Math.max(score, 25 - distance * 4);
        else if (isOrderedSubsequence(queryKey, candidateKey)) score = Math.max(score, 12);
      }
    }
  }

  const isUncoated = color.catalog.includes("uncoated");
  if (color.catalog.includes("coated") && !isUncoated && /\b(c|coated)\b/i.test(query)) {
    score += 4;
  }
  if (isUncoated && /\b(u|uncoated)\b/i.test(query)) score += 4;
  if (color.catalog.includes("tcx") && /\btcx\b/i.test(query)) score += 4;
  if (color.catalog.includes("tpg") && /\btpg\b/i.test(query)) score += 4;
  return score;
}

export function findPantoneColor(
  colors: readonly PantoneColor[],
  query: string,
): PantoneColor | null {
  const normalized = normalizePantoneQuery(query);
  if (!normalized) return null;

  const code = extractFhiPantoneCode(query);
  if (code) {
    const exactCode = colors.find((color) => color.code === code);
    if (exactCode) return exactCode;
  }

  const suffixAwareName = tokenizePantoneText(query).join(" ");
  const exactName = colors.find(
    (color) => tokenizePantoneText(color.name).join(" ") === suffixAwareName,
  );
  if (exactName) return exactName;

  return searchPantoneColors(colors, query, 1)[0] ?? null;
}

export function searchPantoneColors(
  colors: readonly PantoneColor[],
  query: string,
  limit = 6,
): PantoneColor[] {
  const normalized = normalizePantoneQuery(query);
  if (!normalized) return [];

  const ranked = colors
    .map((color) => ({ color, score: scoreColor(color, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || comparePantoneColors(a.color, b.color));

  return ranked.slice(0, limit).map((entry) => entry.color);
}

let cachedPantoneColors: Promise<PantoneColor[]> | null = null;

export function loadPantoneColors(): Promise<PantoneColor[]> {
  cachedPantoneColors ??= Promise.all(
    PANTONE_LIBRARY_SOURCES.map(async (source) => {
      const response = await fetch(source.url);
      if (!response.ok) {
        if (source.optional && response.status === 404) return [];
        throw new Error(
          `${getPantoneCatalogLabel(source.catalog)} dataset request failed with ${
            response.status
          }`,
        );
      }
      const raw: unknown = await response.json();
      return parsePantoneLibraryDataset(raw, source);
    }),
  ).then((libraries) => libraries.flat().sort(comparePantoneColors));
  return cachedPantoneColors;
}

export function contrastTextForHex(hex: `#${string}`): "#111827" | "#ffffff" {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#111827" : "#ffffff";
}
