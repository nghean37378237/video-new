import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  analyzeRawRgbForSplitOrBadFraming,
  arePerceptuallyDuplicateFingerprints,
  canonicalizePhotoIdentityUrl,
  canonicalizePhotoTitleStem,
  computeVisualFingerprintFromRgb,
  deduplicatePhotoPool,
  evaluateCandidateAspectForClearFace,
  hammingDistanceHex64,
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

test('evaluateCandidateAspectForClearFace accepts clear portraits, accepts 16:9 movie/concert stills when enabled, and rejects 2:1 banners', () => {
  const idealPortrait = evaluateCandidateAspectForClearFace(800, 1066, '3:4');
  assert.equal(idealPortrait.ok, true);
  assert.equal(idealPortrait.isPortraitIdeal, true);

  const squareHeadshot = evaluateCandidateAspectForClearFace(900, 900, '3:4');
  assert.equal(squareHeadshot.ok, true);
  assert.equal(squareHeadshot.isPortraitIdeal, true);

  const wideTwoPanelCollage = evaluateCandidateAspectForClearFace(1600, 900, '3:4');
  assert.equal(wideTwoPanelCollage.ok, false);
  assert.match(wideTwoPanelCollage.reason || '', /too-wide-for-clear-face/);

  // 16:9 HD movie / concert still passes when allowClassicWideStill is true, while 2.1:1 banner is still blocked
  const hdFilmStill = evaluateCandidateAspectForClearFace(1280, 720, '3:4', {
    allowClassicWideStill: true,
  });
  assert.equal(hdFilmStill.ok, true);

  const ultraWideBanner = evaluateCandidateAspectForClearFace(1600, 700, '3:4', {
    allowClassicWideStill: true,
  });
  assert.equal(ultraWideBanner.ok, false);

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

test('computeVisualFingerprintFromRgb detects identical/brightness-shifted photos while distinguishing different scenes', () => {
  const W = 64;
  const H = 64;

  const sceneA = new Uint8Array(W * H * 3);
  const sceneAShifted = new Uint8Array(W * H * 3);
  const sceneB = new Uint8Array(W * H * 3);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 3;
      // Scene A: diagonal spotlight + vertical stage mic motif
      const va = Math.min(255, Math.max(0, Math.round(40 + (x / W) * 140 + Math.sin(y / 6) * 30)));
      sceneA[idx] = va;
      sceneA[idx + 1] = va;
      sceneA[idx + 2] = va;

      // Scene A brightness/contrast re-encoded variant (simulates re-compressed JPEG from another host)
      const vas = Math.min(255, Math.max(0, Math.round(va * 0.9 + 14)));
      sceneAShifted[idx] = vas;
      sceneAShifted[idx + 1] = vas;
      sceneAShifted[idx + 2] = vas;

      // Scene B: completely opposite lighting & structure
      const vb = Math.min(255, Math.max(0, Math.round(220 - (x / W) * 170 + Math.cos(y / 4) * 35)));
      sceneB[idx] = vb;
      sceneB[idx + 1] = vb;
      sceneB[idx + 2] = vb;
    }
  }

  const fpA = computeVisualFingerprintFromRgb(sceneA, W, H);
  const fpAShifted = computeVisualFingerprintFromRgb(sceneAShifted, W, H);
  const fpB = computeVisualFingerprintFromRgb(sceneB, W, H);

  assert.ok(fpA && fpAShifted && fpB);
  assert.equal(hammingDistanceHex64(fpA.dHash, fpAShifted.dHash) <= 4, true);
  assert.equal(arePerceptuallyDuplicateFingerprints(fpA, fpAShifted), true);
  assert.equal(arePerceptuallyDuplicateFingerprints(fpA, fpB), false);
});

test('canonicalizePhotoIdentityUrl, canonicalizePhotoTitleStem, and deduplicatePhotoPool eliminate Wikimedia, Pinterest, cropped, and visual duplicates', () => {
  assert.equal(
    canonicalizePhotoIdentityUrl(
      'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/80/John_Wayne_-_1961.JPG/500px-John_Wayne_-_1961.JPG'
    ),
    canonicalizePhotoIdentityUrl(
      'https://upload.wikimedia.org/wikipedia/commons/8/80/John_Wayne_-_1961.JPG?utm_source=openverse'
    )
  );

  assert.equal(
    canonicalizePhotoIdentityUrl('https://i.pinimg.com/736x/97/1b/27/971b2785.jpg'),
    canonicalizePhotoIdentityUrl('https://i.pinimg.com/originals/97/1b/27/971b2785.jpg')
  );

  assert.equal(
    canonicalizePhotoTitleStem('Bruce Lee with his parents 1940s'),
    canonicalizePhotoTitleStem('Bruce Lee with his parents 1940s (Grace Ho cropped)')
  );

  const deduped = deduplicatePhotoPool([
    {
      title: 'John Wayne in McLintock 1963',
      sourceUrl: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/70/John_Wayne-McLintock.jpg/500px-John_Wayne-McLintock.jpg',
      dataUrl: 'data:image/jpeg;base64,AAA111',
      visualHash: 'f0f0f0f00f0f0f0f',
      centerVisualHash: 'aaaa5555aaaa5555',
    },
    {
      // Same Wikimedia file at full res
      title: 'John Wayne McLintock',
      sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/70/John_Wayne-McLintock.jpg?utm_source=openverse',
      dataUrl: 'data:image/jpeg;base64,BBB222',
      visualHash: 'f0f0f0f00f0f0f0f',
      centerVisualHash: 'aaaa5555aaaa5555',
    },
    {
      // Different host & different filename, but near-identical perceptual hash (1-bit diff)
      title: 'John Wayne western movie scene',
      sourceUrl: 'https://example.com/mirror/cowboy-still-hd.jpg',
      dataUrl: 'data:image/jpeg;base64,CCC333',
      visualHash: 'f0f0f0f00f0f0f0e',
      centerVisualHash: 'aaaa5555aaaa5554',
    },
    {
      // Distinct Bruce Lee parents photo
      title: 'Bruce Lee with his parents 1940s',
      sourceUrl: 'https://example.com/bruce-parents.jpg',
      dataUrl: 'data:image/jpeg;base64,DDD444',
      visualHash: '0123456789abcdef',
      centerVisualHash: 'fedcba9876543210',
    },
    {
      // Cropped derivative of Bruce Lee parents photo -> caught by title stem!
      title: 'Bruce Lee with his parents 1940s (Grace Ho cropped)',
      sourceUrl: 'https://example.com/bruce-parents-grace.jpg',
      dataUrl: 'data:image/jpeg;base64,EEE555',
      visualHash: '1111222233334444',
      centerVisualHash: '5555666677778888',
    },
    {
      // Genuinely different photo -> MUST KEEP
      title: 'Elvis Presley live concert singing on stage 1972',
      sourceUrl: 'https://i.pinimg.com/originals/21/20/72/elvis1972.jpg',
      dataUrl: 'data:image/jpeg;base64,FFF666',
      visualHash: '0f0f0f0ff0f0f0f0',
      centerVisualHash: '5555aaaa5555aaaa',
    },
  ]);

  assert.equal(deduped.length, 3, `Expected 3 unique photos, got ${deduped.length}: ${deduped.map((d) => d.title).join(', ')}`);
  assert.equal(deduped[0].title, 'John Wayne in McLintock 1963');
  assert.equal(deduped[1].title, 'Bruce Lee with his parents 1940s');
  assert.equal(deduped[2].title, 'Elvis Presley live concert singing on stage 1972');
});
