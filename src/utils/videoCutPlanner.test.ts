import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCutWindow,
  extractRawArchivalVideoUrl,
  isLikelyRestrictedArchiveUrl,
  isPlayableSavedCutRecord,
  filterValidSavedCuts,
  shouldMountInlineVideoScrubber,
  resolveModalCharacterName,
} from './videoCutPlanner.ts';

test('normalizeCutWindow enforces positive range, bounds, and totalDuration clamping', () => {
  const normal = normalizeCutWindow(19, 28, { totalDurationSec: 120 });
  assert.deepEqual(normal, { startSec: 19, endSec: 28, durationSec: 9 });

  // End before start falls back to defaultDurationSec
  const inverted = normalizeCutWindow(30, 20, { defaultDurationSec: 8, totalDurationSec: 120 });
  assert.deepEqual(inverted, { startSec: 30, endSec: 38, durationSec: 8 });

  // Clamped to video duration
  const clamped = normalizeCutWindow(95, 110, { totalDurationSec: 100, minDurationSec: 3 });
  assert.deepEqual(clamped, { startSec: 95, endSec: 100, durationSec: 5 });

  // Start past end of video shifts back cleanly
  const pastEnd = normalizeCutWindow(150, 160, { totalDurationSec: 60, defaultDurationSec: 8 });
  assert.deepEqual(pastEnd, { startSec: 52, endSec: 60, durationSec: 8 });

  // Max duration cap
  const capped = normalizeCutWindow(10, 200, { maxDurationSec: 45 });
  assert.deepEqual(capped, { startSec: 10, endSec: 55, durationSec: 45 });
});

test('extractRawArchivalVideoUrl unwraps proxy route and strips media fragments', () => {
  const proxied =
    '/api/archival/video-stream?url=https%3A%2F%2Farchive.org%2Fdownload%2Fdemo%2Fclip.mp4#t=10,18';
  assert.equal(
    extractRawArchivalVideoUrl(proxied),
    'https://archive.org/download/demo/clip.mp4'
  );

  assert.equal(
    extractRawArchivalVideoUrl('https://archive.org/download/x/y.mp4#t=5,12'),
    'https://archive.org/download/x/y.mp4'
  );
});

test('isLikelyRestrictedArchiveUrl flags pirated BluRay/x265/Tigole archive uploads', () => {
  assert.equal(
    isLikelyRestrictedArchiveUrl(
      'https://archive.org/download/a-fistful-of-dollars-1964-rm-4-k-1080p-blu-ray-x-265-10bit-tigole/movie.mp4'
    ),
    true
  );
  assert.equal(
    isLikelyRestrictedArchiveUrl(
      'https://archive.org/download/TheOutlawJoseyWalesTrailer/trailer.mp4'
    ),
    false
  );
});

test('filterValidSavedCuts drops deleted local mp4s and YouTube HTML URLs while keeping real clips', () => {
  const existingFiles = new Set(['good-cut.mp4', 'saved-local.mp4']);
  const fileExists = (f: string) => existingFiles.has(f);

  const records = [
    { id: '1', videoUrl: '/api/youtube/cut-file/good-cut.mp4' },
    { id: '2', videoUrl: '/api/youtube/cut-file/missing-deleted.mp4' },
    { id: '3', videoUrl: 'https://www.youtube.com/shorts/abc12345678' },
    { id: '4', videoUrl: '/saved_cuts/saved-local.mp4' },
    { id: '5', videoUrl: 'https://archive.org/download/a-fistful-blu-ray-x-265-tigole/a.mp4' },
    { id: '6', videoUrl: 'https://archive.org/download/clean-trailer/trailer.mp4' },
  ];

  const valid = filterValidSavedCuts(records, fileExists);
  assert.deepEqual(
    valid.map((r) => r.id),
    ['1', '4', '6']
  );
  assert.equal(isPlayableSavedCutRecord(null, fileExists), false);
});

test('shouldMountInlineVideoScrubber allows at most one active card at a time', () => {
  assert.equal(shouldMountInlineVideoScrubber('card-1', null), false);
  assert.equal(shouldMountInlineVideoScrubber('card-1', 'card-2'), false);
  assert.equal(shouldMountInlineVideoScrubber('card-2', 'card-2'), true);
});

test('resolveModalCharacterName prioritizes current projectTitle over stale savedStoryTopic', () => {
  assert.equal(
    resolveModalCharacterName({
      projectTitle: 'Will Sampson',
      savedStoryTopic: 'Clint Eastwood',
      firstSceneNarration: 'Will Sampson stood six foot seven...',
    }),
    'Will Sampson'
  );

  // Explicit preset wins
  assert.equal(
    resolveModalCharacterName({
      presetCharacterName: 'Dolly Parton',
      projectTitle: 'Will Sampson',
      savedStoryTopic: 'Clint Eastwood',
    }),
    'Dolly Parton'
  );

  // Generic projectTitle falls back to narration name before stale savedStoryTopic
  assert.equal(
    resolveModalCharacterName({
      projectTitle: 'Dự án mới',
      activeSceneNarration: 'In 1975, Jack Nicholson praised Will Sampson on set.',
      savedStoryTopic: 'Clint Eastwood',
    }),
    'Jack Nicholson'
  );

  // Falls back to savedStoryTopic when no project/narration name exists
  assert.equal(
    resolveModalCharacterName({
      projectTitle: '',
      activeSceneNarration: 'một câu chuyện không tên',
      savedStoryTopic: 'Clint Eastwood',
    }),
    'Clint Eastwood'
  );
});
