import { normalizeCutWindow } from './videoCutPlanner';

export interface ClientVideoCutOptions {
  /** Either a local File/Blob or a CORS/same-origin playable video URL */
  source: File | Blob | string;
  startSec: number;
  endSec: number;
  frameMode?: '3:4-sharp' | '3:4-cinema' | '3:4-full-wide';
  focusX?: 'left' | 'center' | 'right';
  /** Max duration in seconds to re-encode via MediaRecorder (default 20s) */
  maxRecordSeconds?: number;
  onProgress?: (pct: number, label: string) => void;
}

export interface ClientVideoCutResult {
  videoUrl: string;
  thumbnailUrl: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  width: number;
  height: number;
  mode: 'browser-reencoded' | 'browser-direct-trim';
  mimeType: string;
}

function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/mp4',
    'video/webm',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // continue
    }
  }
  return '';
}

function drawFramedVideoToCanvas(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  outW: number,
  outH: number,
  frameMode: '3:4-sharp' | '3:4-cinema' | '3:4-full-wide',
  focusX: 'left' | 'center' | 'right'
): void {
  const vw = video.videoWidth || outW;
  const vh = video.videoHeight || outH;
  if (!vw || !vh) return;

  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, outW, outH);

  if (frameMode === '3:4-full-wide') {
    // Blurred ambient backdrop + full centered frame
    ctx.save();
    ctx.filter = 'blur(18px) brightness(0.45)';
    const bgScale = Math.max(outW / vw, outH / vh);
    const bgW = vw * bgScale;
    const bgH = vh * bgScale;
    ctx.drawImage(video, (outW - bgW) / 2, (outH - bgH) / 2, bgW, bgH);
    ctx.restore();

    const fgScale = Math.min(outW / vw, outH / vh);
    const fgW = vw * fgScale;
    const fgH = vh * fgScale;
    ctx.drawImage(video, (outW - fgW) / 2, (outH - fgH) / 2, fgW, fgH);
    return;
  }

  // Cover crop to 3:4 portrait with optional cinema subtle zoom & horizontal focus
  const targetRatio = outW / outH;
  const srcRatio = vw / vh;
  let cropW = vw;
  let cropH = vh;
  let sx = 0;
  let sy = 0;

  if (srcRatio > targetRatio) {
    cropW = vh * targetRatio;
    const maxShiftX = Math.max(0, vw - cropW);
    sx =
      focusX === 'left'
        ? maxShiftX * 0.12
        : focusX === 'right'
        ? maxShiftX * 0.88
        : maxShiftX * 0.5;
  } else {
    cropH = vw / targetRatio;
    sy = Math.max(0, (vh - cropH) * 0.25);
  }

  if (frameMode === '3:4-cinema') {
    const zoom = 1.06;
    const newW = cropW / zoom;
    const newH = cropH / zoom;
    sx += (cropW - newW) * 0.5;
    sy += (cropH - newH) * 0.35;
    cropW = newW;
    cropH = newH;
  }

  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH);
}

function captureCanvasThumbnail(canvas: HTMLCanvasElement): string {
  try {
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return '';
  }
}

/**
 * Cuts and frames a video cleanly in the browser (720×960 3:4 HD) without needing
 * server-side FFmpeg. Ideal for Vercel deployments and large local files (>4.5MB).
 *
 * Strategy:
 * 1. Load metadata + seek to `startSec` and capture a crisp 3:4 HD JPEG thumbnail.
 * 2. If `MediaRecorder` + `canvas.captureStream` is available and duration <= maxRecordSeconds,
 *    record the exact `[startSec, endSec]` window in 720×960 3:4 HD into a real trimmed Blob URL.
 * 3. Otherwise (or if playback stalls), fall back cleanly to returning a direct playable Blob/URL
 *    with exact `startSec` / `endSec` metadata so the Timeline/Canvas player trims seamlessly.
 */
export async function cutVideoInBrowser(
  options: ClientVideoCutOptions
): Promise<ClientVideoCutResult> {
  const outW = 720;
  const outH = 960;
  const frameMode = options.frameMode || '3:4-sharp';
  const focusX = options.focusX || 'center';
  const maxRecordSeconds = Math.min(25, Math.max(4, options.maxRecordSeconds ?? 18));

  const isFileOrBlob = options.source instanceof Blob;
  const objectUrl =
    options.source instanceof Blob
      ? URL.createObjectURL(options.source)
      : String(options.source);
  const directPlaybackUrl = objectUrl;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (!isFileOrBlob && !objectUrl.startsWith('blob:') && !objectUrl.startsWith('data:')) {
    video.crossOrigin = 'anonymous';
  }
  video.src = objectUrl;

  const cleanupVideo = () => {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {
      // ignore
    }
  };

  try {
    options.onProgress?.(10, 'Đang đọc thông tin video trong trình duyệt...');

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Hết thời gian đọc video nguồn')), 14000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Trình duyệt không thể tải nguồn video này'));
      };
    });

    const totalDur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
    const windowSpec = normalizeCutWindow(options.startSec, options.endSec, {
      totalDurationSec: totalDur,
      defaultDurationSec: 8,
      minDurationSec: 2,
      maxDurationSec: 45,
    });

    const seekTo = async (sec: number) => {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.removeEventListener('seeked', finish);
          resolve();
        };
        const timer = window.setTimeout(finish, 4000);
        video.addEventListener(
          'seeked',
          () => {
            window.clearTimeout(timer);
            finish();
          },
          { once: true }
        );
        try {
          video.currentTime = Math.max(0, sec);
        } catch {
          window.clearTimeout(timer);
          finish();
        }
      });
    };

    // Seek near the middle of the cut window for a clean thumbnail first
    const thumbTime = Math.min(
      windowSpec.endSec - 0.1,
      windowSpec.startSec + Math.min(1.2, windowSpec.durationSec * 0.35)
    );
    await seekTo(thumbTime);

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    let thumbnailUrl = '';
    if (ctx) {
      drawFramedVideoToCanvas(ctx, video, outW, outH, frameMode, focusX);
      thumbnailUrl = captureCanvasThumbnail(canvas);
    }

    const mimeType = pickSupportedRecorderMime();
    const canCanvasRecord =
      Boolean(ctx) &&
      Boolean(mimeType) &&
      typeof canvas.captureStream === 'function' &&
      windowSpec.durationSec <= maxRecordSeconds;

    if (!canCanvasRecord || !ctx) {
      cleanupVideo();
      return {
        videoUrl: directPlaybackUrl,
        thumbnailUrl,
        startSec: windowSpec.startSec,
        endSec: windowSpec.endSec,
        durationSec: windowSpec.durationSec,
        width: video.videoWidth || outW,
        height: video.videoHeight || outH,
        mode: 'browser-direct-trim',
        mimeType: isFileOrBlob ? (options.source as Blob).type || 'video/mp4' : 'video/mp4',
      };
    }

    // Rewind to exact startSec and record exact cut window into a standalone 3:4 HD Blob
    await seekTo(windowSpec.startSec);
    options.onProgress?.(25, `Đang cắt đoạn ${windowSpec.startSec}s → ${windowSpec.endSec}s (3:4 HD)...`);

    const stream = canvas.captureStream(25);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_200_000,
    });
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const recordedBlob = await new Promise<Blob | null>((resolve) => {
      let stopped = false;
      let rafId = 0;

      const finish = () => {
        if (stopped) return;
        stopped = true;
        if (rafId) cancelAnimationFrame(rafId);
        try {
          video.pause();
        } catch {
          // ignore
        }
        try {
          if (recorder.state !== 'inactive') recorder.stop();
        } catch {
          resolve(null);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        resolve(blob.size > 5000 ? blob : null);
      };
      recorder.onerror = () => resolve(null);

      // Hard safety deadline (duration * 1.6 + 4s)
      const safetyTimer = window.setTimeout(
        finish,
        Math.round(windowSpec.durationSec * 1600) + 4000
      );

      const renderFrame = () => {
        if (stopped) return;
        const cur = video.currentTime;
        drawFramedVideoToCanvas(ctx, video, outW, outH, frameMode, focusX);
        const pct = Math.min(
          95,
          25 + Math.round(((cur - windowSpec.startSec) / Math.max(0.5, windowSpec.durationSec)) * 70)
        );
        options.onProgress?.(pct, `Đang xuất đoạn cắt (${cur.toFixed(1)}s / ${windowSpec.endSec}s)...`);

        if (cur >= windowSpec.endSec - 0.05 || video.ended) {
          window.clearTimeout(safetyTimer);
          finish();
          return;
        }
        rafId = requestAnimationFrame(renderFrame);
      };

      try {
        recorder.start(250);
        video
          .play()
          .then(() => {
            rafId = requestAnimationFrame(renderFrame);
          })
          .catch(() => {
            window.clearTimeout(safetyTimer);
            finish();
          });
      } catch {
        window.clearTimeout(safetyTimer);
        finish();
      }
    });

    cleanupVideo();

    if (recordedBlob && recordedBlob.size > 5000) {
      // Revoke the temporary raw objectUrl if we created a separate Blob for the cut
      if (isFileOrBlob) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
      const cutUrl = URL.createObjectURL(recordedBlob);
      options.onProgress?.(100, 'Đã cắt xong đoạn video 3:4 HD!');
      return {
        videoUrl: cutUrl,
        thumbnailUrl,
        startSec: 0,
        endSec: windowSpec.durationSec,
        durationSec: windowSpec.durationSec,
        width: outW,
        height: outH,
        mode: 'browser-reencoded',
        mimeType: recordedBlob.type || mimeType || 'video/webm',
      };
    }

    // Fallback to direct playback with trim markers if MediaRecorder produced empty blob
    return {
      videoUrl: directPlaybackUrl,
      thumbnailUrl,
      startSec: windowSpec.startSec,
      endSec: windowSpec.endSec,
      durationSec: windowSpec.durationSec,
      width: video.videoWidth || outW,
      height: video.videoHeight || outH,
      mode: 'browser-direct-trim',
      mimeType: isFileOrBlob ? (options.source as Blob).type || 'video/mp4' : 'video/mp4',
    };
  } catch (err) {
    cleanupVideo();
    // Even if metadata failed for a remote URL, return direct trim info rather than crashing
    if (!isFileOrBlob) {
      const windowSpec = normalizeCutWindow(options.startSec, options.endSec, {
        defaultDurationSec: 8,
      });
      return {
        videoUrl: directPlaybackUrl,
        thumbnailUrl: '',
        startSec: windowSpec.startSec,
        endSec: windowSpec.endSec,
        durationSec: windowSpec.durationSec,
        width: outW,
        height: outH,
        mode: 'browser-direct-trim',
        mimeType: 'video/mp4',
      };
    }
    throw err;
  }
}
