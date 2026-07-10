export function isStaleGenerationConfigurationError(error: unknown): boolean {
  if (typeof error !== "string") return false;
  const normalized = error.replace(/\s+/g, "").toLowerCase();
  return normalized.includes("aigenerationisdisabled") && normalized.includes("xiangsu_api_key");
}
