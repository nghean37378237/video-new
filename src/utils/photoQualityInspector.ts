export interface ImageDimensions {
  width: number;
  height: number;
}

export interface SplitCollageAnalysisResult {
  isSplitCollage: boolean;
  reason?: string;
  maxVertRidgeFrac: number;
  maxVertStepFrac: number;
  maxHorizRidgeFrac: number;
  maxHorizStepFrac: number;
  hasSolidVertBar: boolean;
  hasSolidHorizBar: boolean;
}

export interface AspectClearFaceEvaluation {
  ok: boolean;
  isPortraitIdeal: boolean;
  aspect: number;
  reason?: string;
}

/**
 * Fast, dependency-free binary header dimension reader for PNG, JPEG, and WebP buffers.
 * Ensures Bing/web photos are evaluated by their REAL pixel dimensions instead of fake defaults.
 */
export function readImageDimensionsFromBuffer(buf: Uint8Array): ImageDimensions | null {
  if (!buf || buf.length < 24) return null;

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR width@16..19, height@20..23 (big-endian)
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width > 0 && height > 0) return { width, height };
    return null;
  }

  // 2. WebP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    const chunk =
      String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

    if (chunk === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      if (width > 0 && height > 0) return { width, height };
    } else if (chunk === 'VP8 ' && buf.length >= 30) {
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      if (width > 0 && height > 0) return { width, height };
    } else if (chunk === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      if (width > 0 && height > 0) return { width, height };
    }
    return null;
  }

  // 3. JPEG: FF D8 ... scan SOF markers (C0, C1, C2, C3, C5, C6, C7, C9, CA, CB, CD, CE, CF)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < buf.length && buf[offset] === 0xff) offset++;
      if (offset >= buf.length) break;
      const marker = buf[offset++];

      // Standalone markers without length
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        continue;
      }
      if (offset + 2 > buf.length) break;
      const segLen = view.getUint16(offset, false);
      if (segLen < 2 || offset + segLen > buf.length) break;

      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && segLen >= 7) {
        const height = view.getUint16(offset + 3, false);
        const width = view.getUint16(offset + 5, false);
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      offset += segLen;
    }
  }

  return null;
}

/**
 * Evaluates whether a candidate photo's real pixel dimensions are suitable for
 * clear-face vertical storytelling without slicing off faces on the left/right edges.
 */
export function evaluateCandidateAspectForClearFace(
  width: number,
  height: number,
  targetAspect: '3:4' | '9:16' | '16:9' = '3:4',
  options: { allowClassicWideStill?: boolean } = {}
): AspectClearFaceEvaluation {
  if (!width || !height || width <= 0 || height <= 0) {
    return { ok: false, isPortraitIdeal: false, aspect: 0, reason: 'invalid-dimensions' };
  }

  const aspect = width / height;
  const minDim = Math.min(width, height);
  if (minDim < 240) {
    return {
      ok: false,
      isPortraitIdeal: false,
      aspect,
      reason: `too-small(${width}x${height})`,
    };
  }

  if (targetAspect === '16:9') {
    const ok = aspect >= 0.65 && aspect <= 2.2;
    return {
      ok,
      isPortraitIdeal: aspect >= 1.2 && aspect <= 1.85,
      aspect,
      reason: ok ? undefined : `bad-aspect-16:9(${aspect.toFixed(2)})`,
    };
  }

  // For vertical 3:4 & 9:16 storytelling:
  // Wide 16:9 / 2:1 photos are almost always 2-panel side-by-side collages, group photos, or wide stage shots
  // where center-cropping slices the character's face right off!
  const maxAllowedAspect = options.allowClassicWideStill ? 1.62 : 1.38;
  if (aspect > maxAllowedAspect) {
    return {
      ok: false,
      isPortraitIdeal: false,
      aspect,
      reason: `too-wide-for-clear-face(${width}x${height},ar=${aspect.toFixed(2)})`,
    };
  }
  if (aspect < 0.45) {
    return {
      ok: false,
      isPortraitIdeal: false,
      aspect,
      reason: `too-tall-strip(${width}x${height},ar=${aspect.toFixed(2)})`,
    };
  }

  return {
    ok: true,
    isPortraitIdeal: aspect >= 0.56 && aspect <= 1.12,
    aspect,
  };
}

/**
 * Pure pixel-level split-screen / before-and-after / collage seam detector on raw RGB24 buffers.
 * Detects:
 * 1) Thin bright/dark vertical or horizontal divider lines (e.g. 1-4px white/black border between 2 photos)
 *    using isolated 1D ridge response compared to surrounding columns/rows.
 * 2) Solid vertical/horizontal divider bars.
 * 3) Borderless hard-cut side-by-side / top-bottom panel seams spanning >=70% of the frame.
 */
export function analyzeRawRgbForSplitOrBadFraming(
  raw: Uint8Array,
  W: number,
  H: number
): SplitCollageAnalysisResult {
  if (!raw || raw.length < W * H * 3 || W < 32 || H < 32) {
    return {
      isSplitCollage: false,
      maxVertRidgeFrac: 0,
      maxVertStepFrac: 0,
      maxHorizRidgeFrac: 0,
      maxHorizStepFrac: 0,
      hasSolidVertBar: false,
      hasSolidHorizBar: false,
    };
  }

  const lum = (x: number, y: number): number => {
    const i = (y * W + x) * 3;
    return 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2];
  };

  // --- 1. Vertical split-screen seam scan (middle 20%..80% of width) ---
  const xMin = Math.max(4, Math.floor(W * 0.2));
  const xMax = Math.min(W - 5, Math.ceil(W * 0.8));
  const yPad = Math.max(4, Math.floor(H * 0.08));
  const ySpan = Math.max(1, H - yPad * 2);

  const vertRidgeByX = new Float32Array(W);
  let maxVertRidgeFrac = 0;
  let maxVertStepFrac = 0;
  let hasSolidVertBar = false;

  for (let x = Math.max(3, xMin - 4); x <= Math.min(W - 4, xMax + 4); x++) {
    let ridgeCount = 0;
    let stepCount = 0;
    let sum = 0;
    let sumSq = 0;
    let adjDiff = 0;

    for (let y = yPad; y < H - yPad; y++) {
      const v = lum(x, y);
      sum += v;
      sumSq += v * v;

      // Ridge detector catches 1-3px bright OR dark vertical divider lines between two panels
      const ridge = Math.abs(v - 0.5 * (lum(x - 2, y) + lum(x + 2, y)));
      if (ridge > 22) ridgeCount++;

      // Step-edge detector catches borderless hard cuts between two adjacent photos
      const step = Math.abs(lum(x + 1, y) - lum(x - 1, y));
      const leftSmooth = Math.abs(lum(x - 1, y) - lum(x - 2, y));
      const rightSmooth = Math.abs(lum(x + 2, y) - lum(x + 1, y));
      if (step > 22 && step > (leftSmooth + rightSmooth) * 1.35 + 9) {
        stepCount++;
      }

      adjDiff += Math.abs(v - lum(x - 2, y)) + Math.abs(v - lum(x + 2, y));
    }

    const ridgeFrac = ridgeCount / ySpan;
    vertRidgeByX[x] = ridgeFrac;

    if (x >= xMin && x <= xMax) {
      const stepFrac = stepCount / ySpan;
      const mean = sum / ySpan;
      const std = Math.sqrt(Math.max(0, sumSq / ySpan - mean * mean));

      if (std < 12 && adjDiff / (2 * ySpan) > 16) {
        hasSolidVertBar = true;
      }
      if (stepFrac > maxVertStepFrac) maxVertStepFrac = stepFrac;
    }
  }

  // Require vertical ridge to be isolated (artificial divider line, not a dense striped background)
  for (let x = xMin; x <= xMax; x++) {
    const r = vertRidgeByX[x];
    const leftBg = x - 4 >= 0 ? vertRidgeByX[x - 4] : 0;
    const rightBg = x + 4 < W ? vertRidgeByX[x + 4] : 0;
    if (r > maxVertRidgeFrac && (leftBg + rightBg) / 2 < 0.38) {
      maxVertRidgeFrac = r;
    }
  }

  // --- 2. Horizontal split-screen seam scan (middle 20%..80% of height) ---
  const yMin = Math.max(4, Math.floor(H * 0.2));
  const yMax = Math.min(H - 5, Math.ceil(H * 0.8));
  const xPad = Math.max(4, Math.floor(W * 0.08));
  const xSpan = Math.max(1, W - xPad * 2);

  const horizRidgeByY = new Float32Array(H);
  let maxHorizRidgeFrac = 0;
  let maxHorizStepFrac = 0;
  let hasSolidHorizBar = false;

  for (let y = Math.max(3, yMin - 4); y <= Math.min(H - 4, yMax + 4); y++) {
    let ridgeCount = 0;
    let stepCount = 0;
    let sum = 0;
    let sumSq = 0;
    let adjDiff = 0;

    for (let x = xPad; x < W - xPad; x++) {
      const v = lum(x, y);
      sum += v;
      sumSq += v * v;

      const ridge = Math.abs(v - 0.5 * (lum(x, y - 2) + lum(x, y + 2)));
      if (ridge > 22) ridgeCount++;

      const step = Math.abs(lum(x, y + 1) - lum(x, y - 1));
      const topSmooth = Math.abs(lum(x, y - 1) - lum(x, y - 2));
      const botSmooth = Math.abs(lum(x, y + 2) - lum(x, y + 1));
      if (step > 22 && step > (topSmooth + botSmooth) * 1.35 + 9) {
        stepCount++;
      }

      adjDiff += Math.abs(v - lum(x, y - 2)) + Math.abs(v - lum(x, y + 2));
    }

    const ridgeFrac = ridgeCount / xSpan;
    horizRidgeByY[y] = ridgeFrac;

    if (y >= yMin && y <= yMax) {
      const stepFrac = stepCount / xSpan;
      const mean = sum / xSpan;
      const std = Math.sqrt(Math.max(0, sumSq / xSpan - mean * mean));

      if (std < 12 && adjDiff / (2 * xSpan) > 16) {
        hasSolidHorizBar = true;
      }
      if (stepFrac > maxHorizStepFrac) maxHorizStepFrac = stepFrac;
    }
  }

  for (let y = yMin; y <= yMax; y++) {
    const r = horizRidgeByY[y];
    const topBg = y - 4 >= 0 ? horizRidgeByY[y - 4] : 0;
    const botBg = y + 4 < H ? horizRidgeByY[y + 4] : 0;
    if (r > maxHorizRidgeFrac && (topBg + botBg) / 2 < 0.38) {
      maxHorizRidgeFrac = r;
    }
  }

  const isSplitCollage =
    hasSolidVertBar ||
    hasSolidHorizBar ||
    maxVertRidgeFrac >= 0.72 ||
    maxHorizRidgeFrac >= 0.72 ||
    maxVertStepFrac >= 0.7 ||
    maxHorizStepFrac >= 0.7;

  return {
    isSplitCollage,
    reason: isSplitCollage
      ? `split-seam(vr=${maxVertRidgeFrac.toFixed(2)},vs=${maxVertStepFrac.toFixed(2)},hr=${maxHorizRidgeFrac.toFixed(2)},hs=${maxHorizStepFrac.toFixed(2)},vb=${hasSolidVertBar},hb=${hasSolidHorizBar})`
      : undefined,
    maxVertRidgeFrac,
    maxVertStepFrac,
    maxHorizRidgeFrac,
    maxHorizStepFrac,
    hasSolidVertBar,
    hasSolidHorizBar,
  };
}
