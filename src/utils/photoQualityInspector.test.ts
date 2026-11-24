import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  analyzeRawRgbForSplitOrBadFraming,
  evaluateCandidateAspectForClearFace,
  readImageDimensionsFromBuffer,
} from './photoQualityInspector';

test('readImageDimensionsFromBuffer reads real PNG and JPEG dimensions accurately', () => {
  const realPng = fs.readFileSync('public/assets/aistudio/image_ec839620.png');
  const pngDims = readImageDimensionsFromBuffer(realPng);
  assert.ok(pngDims, 'should parse PNG dimensions');
  assert.ok(pngDims.width > 100 && pngDims.height > 100);

  const syntheticJpeg = execFileSync(
    'ffmpeg',
    [
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=1280x720:duration=1',
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const jpegDims = readImageDimensionsFromBuffer(syntheticJpeg);
  assert.deepEqual(jpegDims, { width: 1280, height: 720 });
});

test('evaluateCandidateAspectForClearFace accepts clear portraits and rejects wide split/group banners', () => {
  const idealPortrait = evaluateCandidateAspectForClearFace(800, 1066, '3:4');
  assert.equal(idealPortrait.ok, true);
  assert.equal(idealPortrait.isPortraitIdeal, true);

  const squareHeadshot = evaluateCandidateAspectForClearFace(900, 900, '3:4');
  assert.equal(squareHeadshot.ok, true);
  assert.equal(squareHeadshot.isPortraitIdeal, true);

  const wideTwoPanelCollage = evaluateCandidateAspectForClearFace(1600, 900, '3:4');
  assert.equal(wideTwoPanelCollage.ok, false);
  assert.match(wideTwoPanelCollage.reason || '', /too-wide-for-clear-face/);

  const tinyThumb = evaluateCandidateAspectForClearFace(180, 220, '3:4');
  assert.equal(tinyThumb.ok, false);
});

test('analyzeRawRgbForSplitOrBadFraming catches the real user-reported split-screen collage image', () => {
  const realBadBuf = fs.readFileSync('public/assets/aistudio/image_ec839620.png');
  const W = 128;
  const H = 128;
  const raw = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      'pipe:0',
      '-vf',
      `scale=${W}:${H}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ],
    { input: realBadBuf }
  );

  const result = analyzeRawRgbForSplitOrBadFraming(raw, W, H);
  assert.equal(
    result.isSplitCollage,
    true,
    `Expected split-screen collage image_ec839620.png to be rejected, got: ${JSON.stringify(result)}`
  );
  assert.ok(result.maxVertRidgeFrac >= 0.72);
});

test('analyzeRawRgbForSplitOrBadFraming passes smooth single-subject portrait and catches borderless hard splits', () => {
  const W = 96;
  const H = 128;

  // 1. Smooth natural studio portrait gradient with centered oval face -> MUST PASS
  const portrait = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W * 0.25);
      const dy = (y - H * 0.4) / (H * 0.25);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const skin = Math.max(0, 1 - dist);
      const r = Math.min(255, Math.round(45 + skin * 160));
      const g = Math.min(255, Math.round(40 + skin * 125));
      const b = Math.min(255, Math.round(38 + skin * 100));
      const idx = (y * W + x) * 3;
      portrait[idx] = r;
      portrait[idx + 1] = g;
      portrait[idx + 2] = b;
    }
  }
  const portraitResult = analyzeRawRgbForSplitOrBadFraming(portrait, W, H);
  assert.equal(portraitResult.isSplitCollage, false);

  // 2. Borderless 2-panel side-by-side split (left dark panel vs right bright panel) -> MUST REJECT
  const hardSplit = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = x < W / 2 ? 30 : 210;
      const idx = (y * W + x) * 3;
      hardSplit[idx] = v;
      hardSplit[idx + 1] = v;
      hardSplit[idx + 2] = v;
    }
  }
  const splitResult = analyzeRawRgbForSplitOrBadFraming(hardSplit, W, H);
  assert.equal(splitResult.isSplitCollage, true);
});
