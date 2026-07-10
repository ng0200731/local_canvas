import type { ImageGenerationReference } from "@/lib/image-generation-models";

export interface ProviderImageReference {
  alias: string;
  url: string;
  description: string;
  source: "image" | "pantone";
}

export interface CompiledReferencePrompt {
  prompt: string;
  imageUrls: string[];
}

const SVG_XMLNS = "http://www.w3.org/2000/svg";

function normalizedAlias(alias: string): string {
  return alias.trim().replace(/^@+/, "");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pantoneSwatchDataUrl(alias: string, label: string, hex: string): string {
  const textColor = "#111111";
  const svg = [
    `<svg xmlns="${SVG_XMLNS}" width="1024" height="1024" viewBox="0 0 1024 1024">`,
    `<rect width="1024" height="1024" fill="${escapeXml(hex)}"/>`,
    '<rect x="96" y="656" width="832" height="272" fill="#ffffff"/>',
    `<text x="144" y="744" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" fill="${textColor}">PANTONE</text>`,
    `<text x="144" y="814" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="${textColor}">${escapeXml(alias)}</text>`,
    `<text x="144" y="876" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="${textColor}">${escapeXml(label)}</text>`,
    `<text x="144" y="916" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#555555">${escapeXml(hex.toUpperCase())}</text>`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function referencesForProvider(
  references: readonly ImageGenerationReference[],
): ProviderImageReference[] {
  return references.map((reference, index) => {
    const alias = normalizedAlias(reference.alias) || `reference-${index + 1}`;
    if (reference.kind === "image") {
      return {
        alias,
        url: reference.url,
        source: "image",
        description: `@${alias} is a user-provided image reference.`,
      };
    }

    const label = reference.label.trim() || alias;
    const hex = reference.hex.toUpperCase();
    return {
      alias,
      url: pantoneSwatchDataUrl(alias, label, hex),
      source: "pantone",
      description: `@${alias} is the Pantone color swatch ${label} (${hex}). Use it as exact color guidance, not as text.`,
    };
  });
}

function mentionIndex(prompt: string, alias: string): number {
  return prompt.toLocaleLowerCase().indexOf(`@${alias.toLocaleLowerCase()}`);
}

function orderedReferences(
  prompt: string,
  references: readonly ProviderImageReference[],
): ProviderImageReference[] {
  return references
    .map((reference, index) => ({
      reference: {
        ...reference,
        alias: normalizedAlias(reference.alias) || `reference-${index + 1}`,
        url: reference.url,
      },
      index,
    }))
    .sort((left, right) => {
      const leftMention = mentionIndex(prompt, left.reference.alias);
      const rightMention = mentionIndex(prompt, right.reference.alias);
      const leftRank = leftMention < 0 ? Number.POSITIVE_INFINITY : leftMention;
      const rightRank = rightMention < 0 ? Number.POSITIVE_INFINITY : rightMention;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ reference }) => reference);
}

function mentionedReferences(
  prompt: string,
  references: readonly ProviderImageReference[],
): ProviderImageReference[] {
  return references.filter((reference) => mentionIndex(prompt, reference.alias) >= 0);
}

function textureTransferConstraint(
  prompt: string,
  references: readonly ProviderImageReference[],
): string | null {
  if (!/\b(texture|fabric|material|knit|pattern)\b/i.test(prompt)) return null;

  const mentioned = mentionedReferences(prompt, references);
  if (mentioned.length < 2) return null;

  const [target, source] = mentioned;
  return [
    "Texture-transfer constraint:",
    `- Use @${target.alias} as the target/base image.`,
    `- Use @${source.alias} only as the source of texture, fabric, knit, pattern, color treatment, and material character.`,
    `- Preserve @${target.alias}'s garment silhouette, construction, proportions, layout, framing, and background.`,
    `- Do not copy people, faces, bodies, poses, scenery, or unrelated objects from @${source.alias}.`,
  ].join("\n");
}

function colorTransferConstraint(
  prompt: string,
  references: readonly ProviderImageReference[],
): string | null {
  if (!/\b(colou?r|hue|shade|pantone)\b/i.test(prompt)) return null;

  const mentioned = mentionedReferences(prompt, references);
  if (mentioned.length < 2) return null;

  const [target, source] = mentioned;
  return [
    "Color-transfer constraint:",
    `- Use @${target.alias} as the target/base image.`,
    `- Use @${source.alias} only as the color reference.`,
    `- Change the target color to match @${source.alias} while preserving @${target.alias}'s shape, typography, texture, lighting, layout, framing, and background.`,
    `- Do not generate a standalone color card or literal text for @${source.alias}.`,
  ].join("\n");
}

export function compileReferencePrompt(
  userPrompt: string,
  references: readonly ImageGenerationReference[],
): CompiledReferencePrompt {
  const ordered = orderedReferences(userPrompt, referencesForProvider(references));
  if (ordered.length === 0) {
    return { prompt: userPrompt, imageUrls: [] };
  }

  const mapping = ordered
    .map(
      (reference, index) =>
        `- Reference image ${index + 1} is @${reference.alias}: ${reference.description}`,
    )
    .join("\n");
  const constraints = [
    textureTransferConstraint(userPrompt, ordered),
    colorTransferConstraint(userPrompt, ordered),
  ].filter((constraint): constraint is string => Boolean(constraint));

  return {
    prompt: [
      "Reference image mapping:",
      mapping,
      "",
      "User instruction:",
      userPrompt,
      "",
      "Resolve every @alias using the mapping above and the attached reference images in the same order. Do not interpret an @alias as unrelated text.",
      ...constraints,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n"),
    imageUrls: ordered.map((reference) => reference.url),
  };
}
