import {
  GENERATE_CHANGE_TYPES,
  type GenerateChangeType,
  type GeneratePromptRow,
} from "@/lib/nodes/types";

export interface GeneratePromptMaskReference {
  id: string;
  name: string;
}

export interface GeneratePromptSourceReference {
  nodeId: string;
  alias: string;
  masks: readonly GeneratePromptMaskReference[];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function emptyGeneratePromptRow(id: string): GeneratePromptRow {
  return { id, sourceNodeId: "", maskId: "", changeType: "color", targetText: "" };
}

export function masksForPromptSource(
  references: readonly GeneratePromptSourceReference[],
  sourceNodeId: string,
): readonly GeneratePromptMaskReference[] {
  return references.find((reference) => reference.nodeId === sourceNodeId)?.masks ?? [];
}

export function normalizeGeneratePromptRow(
  value: unknown,
  references: readonly GeneratePromptSourceReference[],
  fallbackId: string,
): GeneratePromptRow {
  if (typeof value !== "object" || value === null) return emptyGeneratePromptRow(fallbackId);
  const record = value as Record<string, unknown>;
  const legacySourceAlias = stringValue(record.sourceAlias).replace(/^@/, "").trim();
  const sourceNodeId =
    stringValue(record.sourceNodeId) ||
    references.find(
      (reference) => reference.alias.toLocaleLowerCase() === legacySourceAlias.toLocaleLowerCase(),
    )?.nodeId ||
    "";
  const masks = masksForPromptSource(references, sourceNodeId);
  const legacyMaskName = stringValue(record.maskName).trim();
  const maskId =
    stringValue(record.maskId) ||
    masks.find((mask) => mask.name.toLocaleLowerCase() === legacyMaskName.toLocaleLowerCase())
      ?.id ||
    "";
  const rawChangeType = stringValue(record.changeType);
  const changeType: GenerateChangeType = GENERATE_CHANGE_TYPES.includes(
    rawChangeType as GenerateChangeType,
  )
    ? (rawChangeType as GenerateChangeType)
    : "color";

  return {
    id: stringValue(record.id) || fallbackId,
    sourceNodeId,
    maskId,
    changeType,
    targetText: stringValue(record.targetText) || stringValue(record.targetAlias),
  };
}

export type GeneratePromptRowState = "empty" | "partial" | "complete";

export function generatePromptRowState(
  row: GeneratePromptRow,
  references: readonly GeneratePromptSourceReference[],
): GeneratePromptRowState {
  const hasUserValue = Boolean(row.sourceNodeId || row.maskId || row.targetText.trim());
  if (!hasUserValue) return "empty";
  const source = references.find((reference) => reference.nodeId === row.sourceNodeId);
  const mask = source?.masks.find((candidate) => candidate.id === row.maskId);
  return source && mask && row.targetText.trim() ? "complete" : "partial";
}

export function generatePromptRowText(
  row: GeneratePromptRow,
  references: readonly GeneratePromptSourceReference[],
): string {
  const source = references.find((reference) => reference.nodeId === row.sourceNodeId);
  const mask = source?.masks.find((candidate) => candidate.id === row.maskId);
  const sourceToken = source ? `@${source.alias}` : "";
  const target = row.targetText.trim();
  return [sourceToken, "use", mask?.name ?? "", "region", "change", row.changeType, "to", target]
    .filter(Boolean)
    .join(" ");
}

export function compileGeneratePromptRows(
  rows: readonly GeneratePromptRow[],
  references: readonly GeneratePromptSourceReference[],
): string {
  return rows
    .filter((row) => generatePromptRowState(row, references) === "complete")
    .map((row) => `- ${generatePromptRowText(row, references)}`)
    .join("\n");
}
