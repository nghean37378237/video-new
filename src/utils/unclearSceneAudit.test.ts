import test from 'node:test';
import assert from 'node:assert/strict';
import type { StoryScene, VaultItem } from '../types';
import {
  auditScenesForUnclearMedia,
  buildBatchUnclearPromptsDocument,
  buildUnclearSceneVideoPromptPack,
} from './unclearSceneAudit';

function makeScene(overrides: Partial<StoryScene>): StoryScene {
  return {
    id: overrides.id || 's1',
    order: overrides.order ?? 1,
    title: overrides.title || 'Test Scene',
    sceneType: overrides.sceneType || 'video',
    durationSec: overrides.durationSec ?? 8,
    narrationText: overrides.narrationText || 'Will Sampson walked into cinema history in 1975.',
    motionEffect: 'zoom-in',
    colorFilter: 'original',
    frameStyle: 'full-bleed',
    showBottomSubtitles: true,
    ...overrides,
  };
}

test('auditScenesForUnclearMedia flags missing media, video scenes without real video, low-res photos, and duplicates', () => {
  const vaultItems: VaultItem[] = [
    {
      id: 'v-low',
      name: 'Small archival thumb',
      type: 'image',
      url: 'data:image/jpeg;base64,LOWRES_PHOTO',
      width: 520,
      height: 680,
      sourceTag: 'extracted',
      createdAt: 'now',
    },
    {
      id: 'v-wide',
      name: 'Wide movie still',
      type: 'image',
      url: 'data:image/jpeg;base64,WIDE_STILL_16_9',
      width: 1280,
      height: 720,
      sourceTag: 'extracted',
      createdAt: 'now',
    },
    {
      id: 'v-real-mp4',
      name: 'Real cut video',
      type: 'video',
      url: '/saved_cuts/cut_01.mp4',
      width: 1080,
      height: 1440,
      sourceTag: 'extracted',
      createdAt: 'now',
    },
    {
      id: 'v-hd-img',
      name: 'Crisp HD portrait',
      type: 'image',
      url: 'data:image/jpeg;base64,HD_PORTRAIT',
      width: 1080,
      height: 1440,
      sourceTag: 'uploaded',
      createdAt: 'now',
    },
  ];

  const scenes: StoryScene[] = [
    makeScene({
      id: 's1',
      order: 1,
      sceneType: 'video',
      mediaId: 'v-low',
      mediaUrl: 'data:image/jpeg;base64,LOWRES_PHOTO',
      mediaKind: 'image',
      hasRealPhoto: true,
    }),
    makeScene({
      id: 's2',
      order: 2,
      sceneType: 'image',
      mediaId: 'v-low',
      mediaUrl: 'data:image/jpeg;base64,LOWRES_PHOTO',
      mediaKind: 'image',
      hasRealPhoto: true,
    }),
    makeScene({
      id: 's3',
      order: 3,
      sceneType: 'image',
      mediaId: 'v-wide',
      mediaUrl: 'data:image/jpeg;base64,WIDE_STILL_16_9',
      mediaKind: 'image',
      hasRealPhoto: true,
    }),
    makeScene({
      id: 's4',
      order: 4,
      sceneType: 'video',
      mediaId: 'v-real-mp4',
      mediaUrl: '/saved_cuts/cut_01.mp4',
      mediaKind: 'video',
      hasRealPhoto: true,
    }),
    makeScene({
      id: 's5',
      order: 5,
      sceneType: 'image',
      mediaId: 'v-hd-img',
      mediaUrl: 'data:image/jpeg;base64,HD_PORTRAIT',
      mediaKind: 'image',
      hasRealPhoto: true,
      isCrispHd: true,
      crispHdDimensions: '1080×1440',
    }),
    makeScene({
      id: 's6',
      order: 6,
      sceneType: 'quote',
      narrationText: 'Okmulgee, Oklahoma, 1933.',
    }),
  ];

  const audits = auditScenesForUnclearMedia(scenes, vaultItems, '3:4', 'Will Sampson');

  // s1: video scene with static low-res duplicate photo -> unclear with 3 reasons
  assert.equal(audits['s1'].isUnclear, true);
  assert.ok(audits['s1'].reasons.some((r) => r.code === 'video-needs-footage'));
  assert.ok(audits['s1'].reasons.some((r) => r.code === 'low-res-or-blurry'));
  assert.ok(audits['s1'].reasons.some((r) => r.code === 'duplicate-media'));
  assert.equal(audits['s1'].needsCrispImageUpgrade, true);

  // s2: image scene with low-res duplicate -> unclear
  assert.equal(audits['s2'].isUnclear, true);
  assert.ok(audits['s2'].reasons.some((r) => r.code === 'duplicate-media'));

  // s3: wide 16:9 photo in 3:4 project -> aspect-mismatch + generic-or-unclear-face
  assert.equal(audits['s3'].isUnclear, true);
  assert.ok(audits['s3'].reasons.some((r) => r.code === 'aspect-mismatch'));
  assert.ok(audits['s3'].reasons.some((r) => r.code === 'generic-or-unclear-face'));

  // s4: real video MP4 -> clear!
  assert.equal(audits['s4'].isUnclear, false);

  // s5: already crisp HD 1080x1440 image -> clear!
  assert.equal(audits['s5'].isUnclear, false);
  assert.equal(audits['s5'].isCrispHdReady, true);

  // s6: quote card -> never flagged unclear
  assert.equal(audits['s6'].isUnclear, false);
});

test('auditScenesForUnclearMedia honors manual flag and dismissal overrides', () => {
  const scenes: StoryScene[] = [
    makeScene({
      id: 's-clear-flagged',
      order: 1,
      sceneType: 'image',
      mediaUrl: 'data:image/jpeg;base64,HD_OK',
      mediaKind: 'image',
      hasRealPhoto: true,
      isCrispHd: true,
      unclearFlagOverride: true,
    }),
    makeScene({
      id: 's-dismissed',
      order: 2,
      sceneType: 'video',
      mediaUrl: 'data:image/jpeg;base64,STATIC_TEMP',
      mediaKind: 'image',
      hasRealPhoto: true,
      unclearFlagOverride: false,
    }),
  ];

  const audits = auditScenesForUnclearMedia(scenes, [], '3:4', 'Clint Eastwood');
  assert.equal(audits['s-clear-flagged'].isUnclear, true);
  assert.equal(audits['s-clear-flagged'].isManuallyFlagged, true);
  assert.equal(audits['s-dismissed'].isUnclear, false);
});

test('buildUnclearSceneVideoPromptPack and batch document generate crisp HD + 3-beat I2V prompts', () => {
  const scenes: StoryScene[] = [
    makeScene({
      id: 's1',
      order: 1,
      title: 'Đam mê Rodeo miền Viễn Tây',
      sceneType: 'video',
      narrationText: 'His first love was the rodeo across the American West.',
      translationText: 'Tình yêu đầu đời của ông là đấu trường Rodeo miền Viễn Tây.',
      mediaUrl: 'data:image/jpeg;base64,TEMP_RODEO',
      mediaKind: 'image',
      hasRealPhoto: true,
    }),
    makeScene({
      id: 's2',
      order: 2,
      title: 'Kiệt tác điện ảnh 1975',
      sceneType: 'video',
      narrationText: 'In 1975 he starred in One Flew Over the Cuckoo Nest.',
      mediaUrl: 'data:image/jpeg;base64,TEMP_CUCKOO',
      mediaKind: 'image',
      hasRealPhoto: true,
    }),
  ];

  const audits = auditScenesForUnclearMedia(scenes, [], '3:4', 'Will Sampson');
  const pack = buildUnclearSceneVideoPromptPack({
    scene: scenes[0],
    index: 0,
    totalScenes: scenes.length,
    characterName: 'Will Sampson',
    aspectRatio: '3:4',
    audit: audits['s1'],
  });

  assert.match(pack.crispImagePrompt, /1080x1440px/i);
  assert.match(pack.crispImagePrompt, /Ultra-sharp/i);
  assert.match(pack.videoDrawPrompt, /Kling AI I2V/i);
  assert.match(pack.combinedCopyBlock, /CẢNH #01\/02/);
  assert.match(pack.combinedCopyBlock, /Chưa có Video thật/);

  const batchDoc = buildBatchUnclearPromptsDocument(
    scenes,
    scenes,
    audits,
    'Will Sampson — Tiểu Sử',
    '3:4'
  );
  assert.match(batchDoc, /Tổng số cảnh cần vẽ \/ làm nét: 2 \/ 2 cảnh/);
  assert.match(batchDoc, /CẢNH #01\/02/);
  assert.match(batchDoc, /CẢNH #02\/02/);
  assert.match(batchDoc, /NEGATIVE PROMPT/);
});
