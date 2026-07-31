import {
  aspectRatioForImageGenerationSize,
  gptImageSizeForResolution,
  type ImageGenerationResolution,
  type ImageGenerationSize,
} from "@/lib/image-generation-models";

export interface ImageOutputSpecInput {
  isGptModel: boolean;
  matchSourceSize: boolean | undefined;
  size?: ImageGenerationSize;
  resolution?: ImageGenerationResolution;
}

export function imageOutputSpecLine(input: ImageOutputSpecInput): string {
  if (!input.isGptModel) return "";
  if (!input.matchSourceSize && input.size) {
    const gptSize = gptImageSizeForResolution(
      input.size,
      input.resolution ?? "preview",
    );
    const ratio = aspectRatioForImageGenerationSize(input.size);
    return `\n\n图像输出规格：必须严格按 ${ratio} 宽高比生成，输出分辨率必须为 ${gptSize}。不要因为参考图尺寸改变最终画幅。`;
  }
  return `\n\n图像输出规格：输出画幅与参考图1保持完全一致的尺寸和宽高比，不进行任何裁剪或缩放。`;
}
