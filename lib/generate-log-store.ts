import "server-only";

export interface GenerateLogEntry {
  id: string;
  timestamp: number;
  ok: boolean;
  request: unknown;
  /** The compiled prompt text actually sent to the model (after reference
   * expansion, mask constraint, spec suffix, etc.). String, not structure,
   * so the user can see the literal text the model sees. */
  compiledPrompt?: string;
  /** Structured breakdown of how @aliases in the prompt resolved to the
   * attached images/mask — gives the user a map between prompt tokens and
   * the image/mask URLs in the form. */
  resolvedReferences?: Array<{
    alias: string;
    role: "base-image-with-mask" | "base-image" | "reference-image" | "pantone";
    imageUrl?: string;
    maskUrl?: string;
    description?: string;
  }>;
  /** The multipart form fields as actually sent to the provider. Lets the
   * user audit which `image[]` slot each URL landed in, what `size`/`quality`
   * were used, and whether `mask` was attached. */
  formFields?: Record<string, string>;
  response?: unknown;
  error?: string;
  durationMs?: number;
}

const MAX_ENTRIES = 20;
const entries: GenerateLogEntry[] = [];
let counter = 0;

export function writeGenerateLog(
  entry: Omit<GenerateLogEntry, "id" | "timestamp">,
): GenerateLogEntry {
  counter += 1;
  const id = `log-${Date.now()}-${counter}`;
  const full: GenerateLogEntry = {
    id,
    timestamp: Date.now(),
    ...entry,
  };
  entries.unshift(full);
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
  return full;
}

export function readGenerateLog(): readonly GenerateLogEntry[] {
  return [...entries];
}

export function clearGenerateLog(): void {
  entries.length = 0;
}

