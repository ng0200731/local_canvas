import { deflateSync } from "node:zlib";

import type { ImageGenerationReference } from "@/lib/image-generation-models";

export interface ProviderImageReference {
  alias: string;
  url: string;
  maskUrl?: string;
  description: string;
  source: "image" | "pantone";
}

export interface CompiledReferencePrompt {
  prompt: string;
  imageUrls: string[];
  maskUrl?: string;
}

const PNG_SWATCH_SIZE = 512;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function normalizedAlias(alias: string): string {
  return alias.trim().replace(/^@+/, "");
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function rgbFromHex(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function solidColorPngDataUrl(hex: string): string {
  const [red, green, blue] = rgbFromHex(hex);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(PNG_SWATCH_SIZE, 0);
  ihdr.writeUInt32BE(PNG_SWATCH_SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowLength = 1 + PNG_SWATCH_SIZE * 3;
  const raw = Buffer.alloc(rowLength * PNG_SWATCH_SIZE);
  for (let y = 0; y < PNG_SWATCH_SIZE; y += 1) {
    const rowOffset = y * rowLength;
    raw[rowOffset] = 0;
    for (let x = 0; x < PNG_SWATCH_SIZE; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 3;
      raw[pixelOffset] = red;
      raw[pixelOffset + 1] = green;
      raw[pixelOffset + 2] = blue;
    }
  }

  const png = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
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
        maskUrl: reference.maskUrl,
        source: "image",
        description: `@${alias} is a user-provided image reference.`,
      };
    }

    const label = reference.label.trim() || alias;
    const hex = reference.hex.toUpperCase();
    return {
      alias,
      url: solidColorPngDataUrl(hex),
      source: "pantone",
      description: `@${alias} is a solid Pantone color reference for ${label} (${hex}). It is color-only guidance, not a subject image.`,
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
    `- Provider image 1 / @${target.alias} is the target/base image and must remain the subject.`,
    `- Provider image 2 / @${source.alias} is only a color reference.`,
    `- Recolor the existing subject in @${target.alias} to match @${source.alias}.`,
    `- Preserve every detail from @${target.alias}: garment type, silhouette, collar, cuffs, hem, folds, knit/fabric texture, lighting, shadows, camera angle, framing, background, and all visible construction details.`,
    `- Do not replace @${target.alias} with a different product, sweatshirt, logo, pose, layout, or composition.`,
    `- Do not generate a standalone color card, Pantone label, or literal text for @${source.alias}.`,
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

  const maskCarrier = ordered.find((reference) => reference.maskUrl);

  const mapping = ordered
    .map(
      (reference, index) =>
        `- Provider image ${index + 1} is @${reference.alias}: ${reference.description}`,
    )
    .join("\n");
  const constraints = [
    textureTransferConstraint(userPrompt, ordered),
    colorTransferConstraint(userPrompt, ordered),
  ].filter((constraint): constraint is string => Boolean(constraint));
  const maskConstraint = maskCarrier
    ? [
        "Mask constraint:",
        `- An alpha-channel mask is attached alongside @${maskCarrier.alias}.`,
        `- The mask is transparent (alpha = 0) in the region to regenerate, and fully opaque (alpha = 255) in the region to preserve.`,
        `- Apply the requested edit ONLY inside the transparent region of the mask.`,
        `- Every pixel outside the transparent region MUST stay pixel-identical to @${maskCarrier.alias}. Do not change color, lighting, background, or any other pixel there.`,
        `- The mask is registered to @${maskCarrier.alias} at the same pixel dimensions. Ignore any reference to "@${maskCarrier.alias} region" in the prompt as a textual region name — the mask file is the authority on which pixels to edit.`,
      ].join("\n")
    : null;

  return {
    prompt: [
      "Reference image mapping:",
      mapping,
      "",
      "User instruction:",
      userPrompt,
      "",
      "Resolve every @alias using the mapping above and the attached provider images in the same order. Do not interpret an @alias as unrelated text.",
      "When the instruction asks to change color, edit provider image 1 as the base image. Later provider images are references only.",
      ...constraints,
      maskConstraint,
    ]
      .filter((part): part is string => Boolean(part))
      .join("\n"),
    imageUrls: ordered.map((reference) => reference.url),
    maskUrl: maskCarrier?.maskUrl,
  };
}
