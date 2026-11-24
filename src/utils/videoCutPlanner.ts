export interface CutWindowResult {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface SavedCutLike {
  id?: string;
  fileName?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  [key: string]: unknown;
}

const NON_DIRECT_HTML_VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'instagram.com',
  'facebook.com',
  'fb.watch',
];

const RESTRICTED_ARCHIVE_PATTERNS = [
  /blu-?ray/i,
  /x-?265/i,
  /10bit/i,
  /tigole/i,
  /qxr/i,
  /remux/i,
  /bdrip/i,
  /web-?dl/i,
  /h265/i,
];

/**
 * Normalizes a requested [startSec, endSec] cut interval into a valid positive window
 * clamped to totalDurationSec (if known) and bounded to [minDurationSec, maxDurationSec].
 */
export function normalizeCutWindow(
  rawStartSec: number,
  rawEndSec: number,
  options?: {
    totalDurationSec?: number;
    defaultDurationSec?: number;
    minDurationSec?: number;
    maxDurationSec?: number;
  }
): CutWindowResult {
  const minDur = Math.max(1, options?.minDurationSec ?? 2);
  const maxDur = Math.max(minDur, options?.maxDurationSec ?? 60);
  const defaultDur = Math.min(maxDur, Math.max(minDur, options?.defaultDurationSec ?? 8));
  const totalDur =
    typeof options?.totalDurationSec === 'number' &&
    Number.isFinite(options.totalDurationSec) &&
    options.totalDurationSec > 0
      ? options.totalDurationSec
      : undefined;

  let start = Number.isFinite(rawStartSec) ? Math.max(0, rawStartSec) : 0;
  let end = Number.isFinite(rawEndSec) ? rawEndSec : start + defaultDur;

  if (totalDur !== undefined) {
    if (totalDur <= minDur) {
      return {
        startSec: 0,
        endSec: Number(totalDur.toFixed(2)),
        durationSec: Number(totalDur.toFixed(2)),
      };
    }
    if (start >= totalDur - 0.5) {
      start = Math.max(0, totalDur - Math.min(defaultDur, totalDur));
    }
  }

  if (end <= start + 0.2) {
    end = start + defaultDur;
  }

  let dur = end - start;
  if (dur < minDur) {
    end = start + minDur;
    dur = minDur;
  }
  if (dur > maxDur) {
    end = start + maxDur;
    dur = maxDur;
  }

  if (totalDur !== undefined && end > totalDur) {
    end = totalDur;
    if (end - start < minDur) {
      start = Math.max(0, end - minDur);
    }
  }

  const finalStart = Number(Math.max(0, start).toFixed(2));
  const finalEnd = Number(Math.max(finalStart + 0.5, end).toFixed(2));
  return {
    startSec: finalStart,
    endSec: finalEnd,
    durationSec: Number((finalEnd - finalStart).toFixed(2)),
  };
}

/**
 * Strips `/api/archival/video-stream?url=...` wrapper and any `#t=...` media fragments
 * to retrieve the underlying source URL.
 */
export function extractRawArchivalVideoUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';

  const withoutHash = trimmed.split('#')[0];
  if (withoutHash.includes('/api/archival/video-stream')) {
    try {
      const parsed = new URL(
        withoutHash.startsWith('http') ? withoutHash : `http://localhost${withoutHash}`
      );
      const inner = parsed.searchParams.get('url');
      if (inner) {
        return inner.split('#')[0].trim();
      }
    } catch {
      const match = withoutHash.match(/[?&]url=([^&]+)/);
      if (match?.[1]) {
        try {
          return decodeURIComponent(match[1]).split('#')[0].trim();
        } catch {
          return match[1].split('#')[0].trim();
        }
      }
    }
  }
  return withoutHash;
}

/**
 * Checks whether a remote Archive.org URL looks like a login-gated pirated movie rip
 * (e.g. BluRay x265 10bit Tigole) that reliably returns HTTP 401/403.
 */
export function isLikelyRestrictedArchiveUrl(url: string): boolean {
  const clean = extractRawArchivalVideoUrl(url).toLowerCase();
  if (!clean.includes('archive.org')) return false;
  return RESTRICTED_ARCHIVE_PATTERNS.some((rx) => rx.test(clean));
}

/**
 * Validates whether a saved cut manifest entry points to a real, playable video file
 * rather than a deleted local `.mp4` or a raw HTML watch URL (YouTube/TikTok/etc.).
 */
export function isPlayableSavedCutRecord(
  record: SavedCutLike | null | undefined,
  fileExistsFn: (fileName: string) => boolean
): boolean {
  if (!record || typeof record !== 'object') return false;
  const rawUrl = String(record.videoUrl || '').trim();
  if (!rawUrl) return false;

  // Local cut served by /api/youtube/cut-file/<fileName>
  const cutFileMatch = rawUrl.match(/\/api\/youtube\/cut-file\/([^?#]+)/i);
  if (cutFileMatch?.[1]) {
    const fileName = decodeURIComponent(cutFileMatch[1]);
    return fileExistsFn(fileName);
  }

  // Local static cut served by /saved_cuts/<fileName>
  const savedCutMatch = rawUrl.match(/\/saved_cuts\/([^?#]+)/i);
  if (savedCutMatch?.[1]) {
    const fileName = decodeURIComponent(savedCutMatch[1]);
    return fileExistsFn(fileName);
  }

  // Raw YouTube/TikTok/Instagram HTML pages cannot play in <video src="...">
  const unwrapped = extractRawArchivalVideoUrl(rawUrl).toLowerCase();
  if (NON_DIRECT_HTML_VIDEO_HOSTS.some((host) => unwrapped.includes(host))) {
    return false;
  }

  if (isLikelyRestrictedArchiveUrl(unwrapped)) {
    return false;
  }

  // Allow direct media extensions or blob/data/proxied archival streams
  if (
    rawUrl.startsWith('blob:') ||
    rawUrl.startsWith('data:video/') ||
    rawUrl.startsWith('/api/archival/video-stream?') ||
    /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(unwrapped)
  ) {
    return true;
  }

  return false;
}

export function filterValidSavedCuts<T extends SavedCutLike>(
  records: T[],
  fileExistsFn: (fileName: string) => boolean
): T[] {
  if (!Array.isArray(records)) return [];
  return records.filter((rec) => isPlayableSavedCutRecord(rec, fileExistsFn));
}

/**
 * Enforces that at most ONE inline `<video>` scrubber is mounted at a time inside
 * the media modal to prevent Chrome's 6-connection HTTP/1.1 pool from being starved.
 */
export function shouldMountInlineVideoScrubber(
  cardId: string,
  activeScrubberId: string | null | undefined
): boolean {
  if (!cardId || !activeScrubberId) return false;
  return cardId === activeScrubberId;
}

const GENERIC_PROJECT_TITLES = new Set([
  '',
  'untitled',
  'new project',
  'my project',
  'dự án mới',
  'du an moi',
  'video mới',
  'video moi',
  'story',
  'classic hollywood',
]);

function extractPersonNameFromText(text: string): string {
  const cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  // Match sequences of 2-3 capitalized words (e.g. "Will Sampson", "Dolly Parton", "Clint Eastwood")
  const matches = cleaned.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g);
  if (!matches) return '';

  const skipWords = new Set([
    'The',
    'This',
    'That',
    'When',
    'Before',
    'After',
    'During',
    'Inside',
    'Hollywood',
    'American',
    'United States',
    'New York',
    'Los Angeles',
    'Classic Hollywood',
    'One Flew',
    'Chief Bromden',
  ]);

  for (const candidate of matches) {
    if (!skipWords.has(candidate) && candidate.length >= 5 && candidate.length <= 40) {
      return candidate;
    }
  }
  return '';
}

/**
 * Resolves the character name for SceneMediaSearchModal by preferring:
 * 1. Explicit preset character name (if provided)
 * 2. Current projectTitle (when non-generic — prevents stale localStorage topic from winning!)
 * 3. Person name extracted from the active scene or first scene narration
 * 4. Saved audio preference storyTopic (fallback)
 */
export function resolveModalCharacterName(params: {
  presetCharacterName?: string;
  projectTitle?: string;
  activeSceneNarration?: string;
  firstSceneNarration?: string;
  savedStoryTopic?: string;
}): string {
  const preset = String(params.presetCharacterName || '').trim();
  if (preset && !GENERIC_PROJECT_TITLES.has(preset.toLowerCase())) {
    return preset;
  }

  const rawTitle = String(params.projectTitle || '')
    .replace(/\s*[-–|:]\s*.*$/, '')
    .trim();
  if (rawTitle && !GENERIC_PROJECT_TITLES.has(rawTitle.toLowerCase())) {
    // If project title contains a proper name like "Will Sampson" or "Dolly Parton"
    const nameInTitle = extractPersonNameFromText(rawTitle);
    if (nameInTitle) return nameInTitle;
    if (rawTitle.split(/\s+/).length <= 4) {
      return rawTitle;
    }
  }

  const fromActive = extractPersonNameFromText(params.activeSceneNarration || '');
  if (fromActive) return fromActive;

  const fromFirst = extractPersonNameFromText(params.firstSceneNarration || '');
  if (fromFirst) return fromFirst;

  const saved = String(params.savedStoryTopic || '').trim();
  if (saved) return saved;

  return rawTitle || 'Classic Actor';
}
