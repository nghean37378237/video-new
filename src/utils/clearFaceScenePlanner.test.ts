import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClearFaceSceneQueries,
  buildRegVideoPromptForClearFaceStill,
  classifyClearFacePhotoCategory,
  extractSceneFilmAndActivityAnchors,
  sortAndBalanceClearFacePhotos,
} from './clearFaceScenePlanner';

test('classifyClearFacePhotoCategory distinguishes movie stills, activity scenes, and portraits', () => {
  assert.equal(
    classifyClearFacePhotoCategory("Will Sampson in One Flew Over the Cuckoo's Nest movie still 1975"),
    'film-still'
  );
  assert.equal(
    classifyClearFacePhotoCategory('Will Sampson behind the scenes on set interview candid'),
    'activity-scene'
  );
  assert.equal(
    classifyClearFacePhotoCategory('Will Sampson studio headshot portrait'),
    'portrait'
  );
});

test('extractSceneFilmAndActivityAnchors extracts movie roles and real-life activities from narration', () => {
  const movieAnchors = extractSceneFilmAndActivityAnchors(
    {
      id: 's1',
      order: 7,
      title: 'Tù trưởng Ten Bears đối diện Clint Eastwood (1976)',
      narrationText:
        'A year later, Western fans met him again, as Comanche Chief Ten Bears in The Outlaw Josey Wales.',
      archivalKeywords: 'Will Sampson Ten Bears Outlaw Josey Wales scene',
    },
    'Will Sampson'
  );
  assert.ok(
    movieAnchors.filmOrRoleTerms.some((t) => /Ten Bears|Outlaw Josey Wales/i.test(t)),
    `Expected film/role anchor, got: ${JSON.stringify(movieAnchors.filmOrRoleTerms)}`
  );
  assert.equal(movieAnchors.targetYear, 1976);

  const activityAnchors = extractSceneFilmAndActivityAnchors(
    {
      id: 's2',
      order: 6,
      title: 'Người nghệ sĩ cầm cọ vẽ giữa những mùa Rodeo',
      narrationText:
        'In between the rodeos, he picked up a paintbrush and painted beautiful pictures of Native life.',
    },
    'Will Sampson'
  );
  assert.ok(activityAnchors.activityTerms.some((t) => /rodeo|cowboy/i.test(t)));
  assert.ok(activityAnchors.activityTerms.some((t) => /paint|artist/i.test(t)));
});

test('buildClearFaceSceneQueries uses Bing face mode and classic still aspect for movie & activity modes', () => {
  const filmPlans = buildClearFaceSceneQueries(
    'Will Sampson',
    {
      id: 's1',
      order: 1,
      title: 'Cảnh phim One Flew Over the Cuckoo Nest (1975)',
      narrationText: 'He played Chief Bromden in "One Flew Over the Cuckoo\'s Nest".',
    },
    'film-still'
  );
  assert.ok(filmPlans.length >= 2);
  assert.ok(filmPlans.every((p) => p.category === 'film-still'));
  assert.ok(filmPlans.every((p) => p.bingFaceMode === 'face' && p.allowClassicStillAspect === true));
  assert.ok(filmPlans[0].query.includes('Will Sampson'));

  const mixedPlans = buildClearFaceSceneQueries(
    'Will Sampson',
    {
      id: 's5',
      order: 5,
      title: 'Đấu trường Rodeo',
      narrationText: 'His first love was the rodeo, riding broncos across the American West.',
    },
    'all'
  );
  const categories = new Set(mixedPlans.map((p) => p.category));
  assert.ok(categories.has('film-still'));
  assert.ok(categories.has('activity-scene'));
  assert.ok(categories.has('portrait'));
});

test('sortAndBalanceClearFacePhotos balances film-still, activity-scene, and portrait and respects preferred category', () => {
  const sample = [
    { id: 'p1', title: 'Will Sampson portrait headshot', dataUrl: 'data:image/jpeg;base64,p1', width: 720, height: 960 },
    { id: 'p2', title: 'Will Sampson studio portrait', dataUrl: 'data:image/jpeg;base64,p2', width: 720, height: 960 },
    { id: 'f1', title: 'Will Sampson movie scene still 1975', dataUrl: 'data:image/jpeg;base64,f1', width: 900, height: 650 },
    { id: 'a1', title: 'Will Sampson rodeo cowboy candid', dataUrl: 'data:image/jpeg;base64,a1', width: 850, height: 620 },
  ];

  const balanced = sortAndBalanceClearFacePhotos(sample, 'all');
  assert.equal(balanced[0].photoCategory, 'film-still');
  assert.equal(balanced[1].photoCategory, 'activity-scene');
  assert.equal(balanced[2].photoCategory, 'portrait');

  const activityFirst = sortAndBalanceClearFacePhotos(sample, 'activity-scene');
  assert.equal(activityFirst[0].photoCategory, 'activity-scene');
});

test('buildRegVideoPromptForClearFaceStill locks exact facial identity and adapts to film vs activity', () => {
  const filmPrompt = buildRegVideoPromptForClearFaceStill({
    characterName: 'Will Sampson',
    sceneTitle: 'Vai diễn Chief Bromden',
    narrationText: 'Chief Bromden stands tall and watches quietly.',
    photoTitle: "One Flew Over the Cuckoo's Nest still",
    photoCategory: 'film-still',
    aspectRatio: '3:4',
  });
  assert.match(filmPrompt, /Will Sampson/);
  assert.match(filmPrompt, /100% exact face identity/i);
  assert.match(filmPrompt, /movie still/i);
  assert.match(filmPrompt, /1080x1440px/);

  const actPrompt = buildRegVideoPromptForClearFaceStill({
    characterName: 'Will Sampson',
    sceneTitle: 'Nghệ sĩ hội họa',
    narrationText: 'He picked up a paintbrush and painted.',
    photoTitle: 'Will Sampson painting candid',
    photoCategory: 'activity-scene',
    aspectRatio: '3:4',
  });
  assert.match(actPrompt, /real-life activity/i);
  assert.match(actPrompt, /unobstructed/i);
});
