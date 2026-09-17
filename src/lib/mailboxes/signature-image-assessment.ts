/**
 * Preview-only checks for signature images.
 *
 * This deliberately accepts dimensions measured by the browser. It never
 * fetches an image, rewrites stored HTML, or attempts to decide whether an
 * image is the correct customer's brand.
 */

export type SignatureImageAssessmentInput = {
  intrinsicWidth: number;
  intrinsicHeight: number;
  renderedWidth: number;
  renderedHeight: number;
};

export type SignatureImageAssessment = {
  intrinsicRatio: number;
  renderedRatio: number;
  renderedWidth: number;
  renderedHeight: number;
  distorted: boolean;
  unusuallySmall: boolean;
  message: string | null;
};

const MAX_RATIO_ERROR = 0.08;
const MIN_RENDERED_WIDTH = 120;
const MIN_RENDERED_HEIGHT = 28;

function validDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function formatPixels(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatRatio(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(2);
}

/**
 * Compare the image's natural aspect ratio with the size the preview actually
 * rendered. A wide source image can be perfectly valid; it is only reported
 * as small when its measured display size is unusually constrained.
 */
export function assessSignatureImage(
  input: SignatureImageAssessmentInput,
): SignatureImageAssessment | null {
  if (
    !validDimension(input.intrinsicWidth) ||
    !validDimension(input.intrinsicHeight) ||
    !validDimension(input.renderedWidth) ||
    !validDimension(input.renderedHeight)
  ) {
    return null;
  }

  const intrinsicRatio = input.intrinsicWidth / input.intrinsicHeight;
  const renderedRatio = input.renderedWidth / input.renderedHeight;
  const ratioError = Math.abs(renderedRatio - intrinsicRatio) / intrinsicRatio;
  const distorted = ratioError > MAX_RATIO_ERROR;
  const unusuallySmall =
    input.renderedWidth < MIN_RENDERED_WIDTH ||
    input.renderedHeight < MIN_RENDERED_HEIGHT;

  let message: string | null = null;
  if (distorted) {
    message =
      `Logo proportions differ from the source image (${formatPixels(input.renderedWidth)} × ${formatPixels(input.renderedHeight)} px rendered, ` +
      `source ratio ${formatRatio(intrinsicRatio)}:1 versus rendered ratio ${formatRatio(renderedRatio)}:1). ` +
      "This may be intentional; check the result against the company-approved logo and confirm the display dimensions.";
  } else if (unusuallySmall) {
    message =
      `Logo renders at ${formatPixels(input.renderedWidth)} × ${formatPixels(input.renderedHeight)} px and may be hard to read. ` +
      "Consider a larger display width or an image asset with less empty space. A wide logo can be intentional, so check it against the company-approved artwork.";
  }

  return {
    intrinsicRatio,
    renderedRatio,
    renderedWidth: input.renderedWidth,
    renderedHeight: input.renderedHeight,
    distorted,
    unusuallySmall,
    message,
  };
}
