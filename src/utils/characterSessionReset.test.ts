import test from 'node:test';
import assert from 'node:assert/strict';
import {
  doesMediaLabelMatchCharacter,
  isDifferentCharacterSession,
  normalizeCharacterSearchKey,
  sanitizeVaultItemsForNewCharacter,
  stripOldCharacterMediaFromScenes,
} from './characterSessionReset';
import type { StoryScene, VaultItem } from '../types';

test('normalizeCharacterSearchKey strips decorative suffixes and diacritics', () => {
  assert.equal(normalizeCharacterSearchKey('Will Sampson — Life Legends'), 'will sampson');
  assert.equal(normalizeCharacterSearchKey('  Bruce Lee (1973) '), 'bruce lee');
});

test('isDifferentCharacterSession detects switching to a new actor vs same actor', () => {
  assert.equal(isDifferentCharacterSession('Will Sampson — Life Legends', 'Will Sampson'), false);
  assert.equal(isDifferentCharacterSession('Will Sampson', 'Bruce Lee'), true);
  assert.equal(isDifferentCharacterSession('Clint Eastwood', 'John Wayne'), true);
  assert.equal(isDifferentCharacterSession('', 'Dolly Parton'), true);
});

test('doesMediaLabelMatchCharacter blocks old characters and same-first-name collisions', () => {
  assert.equal(
    doesMediaLabelMatchCharacter('📸 [Đỉnh cao] Will Sampson Cuckoo Nest', 'Will Sampson'),
    true
  );
  assert.equal(
    doesMediaLabelMatchCharacter('📸 [Đỉnh cao] Will Sampson Cuckoo Nest', 'Bruce Lee'),
    false
  );
  assert.equal(
    doesMediaLabelMatchCharacter('SAMPSON GOT BEEF WITH WILL SMITH', 'Will Sampson'),
    true
  );
  assert.equal(
    doesMediaLabelMatchCharacter('Will Smith Oscars Speech', 'Will Sampson'),
    false
  );
  assert.equal(
    doesMediaLabelMatchCharacter('🎬 Video Thật: John Wayne True Grit', 'Clint Eastwood'),
    false
  );
});

test('sanitizeVaultItemsForNewCharacter wipes all previous character items on new search', () => {
  const oldVault: VaultItem[] = [
    {
      id: 'ws-1',
      name: '📸 Will Sampson portrait',
      type: 'image',
      url: 'data:image/jpeg;base64,ws1',
      durationSec: 8,
      sourceTag: 'uploaded',
      createdAt: 'Ảnh thật',
    },
    {
      id: 'ce-1',
      name: '🎬 Clint Eastwood clip',
      type: 'video',
      url: '/api/youtube/cut-file/ce.mp4',
      durationSec: 8,
      sourceTag: 'uploaded',
      createdAt: 'Đã cắt',
    },
    {
      id: 'custom-1',
      name: 'Uploaded user photo',
      type: 'image',
      url: 'data:image/jpeg;base64,custom',
      durationSec: 8,
      sourceTag: 'uploaded',
      createdAt: 'Đính kèm',
    },
  ];

  const wiped = sanitizeVaultItemsForNewCharacter(oldVault, 'Bruce Lee');
  assert.equal(wiped.length, 0);

  const keepCustom = sanitizeVaultItemsForNewCharacter(oldVault, 'Bruce Lee', {
    preserveIds: new Set(['custom-1']),
  });
  assert.equal(keepCustom.length, 1);
  assert.equal(keepCustom[0].id, 'custom-1');

  const keepOnlyMatching = sanitizeVaultItemsForNewCharacter(oldVault, 'Clint Eastwood', {
    keepOnlyMatchingCharacter: true,
  });
  assert.equal(keepOnlyMatching.length, 1);
  assert.equal(keepOnlyMatching[0].id, 'ce-1');
});

test('stripOldCharacterMediaFromScenes removes old character media while preserving quote/outro and custom attachments', () => {
  const scenes: StoryScene[] = [
    {
      id: 's1',
      order: 1,
      title: 'Opening',
      sceneType: 'video',
      durationSec: 8,
      narrationText: 'Old narration',
      visualPrompt: '',
      mediaId: 'old-1',
      mediaUrl: '/api/youtube/cut-file/will_sampson.mp4',
      mediaKind: 'video',
      hasRealPhoto: true,
      realPhotoTitle: 'Will Sampson (1975)',
      characterRefPhotoUrl: 'data:image/jpeg;base64,old',
      frameStyle: 'full-bleed',
      colorFilter: 'color-warm',
      motionEffect: 'zoom-in',
      showBottomSubtitles: true,
    },
    {
      id: 's2',
      order: 2,
      title: 'Custom Attach',
      sceneType: 'image',
      durationSec: 8,
      narrationText: 'Custom',
      visualPrompt: '',
      mediaId: 'custom-attach-1',
      mediaUrl: 'data:image/jpeg;base64,user',
      mediaKind: 'image',
      hasRealPhoto: true,
      frameStyle: 'full-bleed',
      colorFilter: 'color-warm',
      motionEffect: 'zoom-in',
      showBottomSubtitles: true,
    },
    {
      id: 's3',
      order: 3,
      title: 'Outro',
      sceneType: 'outro',
      durationSec: 5,
      narrationText: '',
      visualPrompt: '',
      frameStyle: 'full-bleed',
      colorFilter: 'original',
      motionEffect: 'static',
      showBottomSubtitles: false,
    },
  ];

  const cleaned = stripOldCharacterMediaFromScenes(scenes, 'Bruce Lee');
  assert.equal(cleaned[0].mediaUrl, undefined);
  assert.equal(cleaned[0].characterRefPhotoUrl, undefined);
  assert.equal(cleaned[0].hasRealPhoto, false);
  assert.equal(cleaned[1].mediaUrl, 'data:image/jpeg;base64,user');
  assert.equal(cleaned[2].sceneType, 'outro');
});
