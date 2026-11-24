import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRichStagePhotoQueries,
  classifySceneStoryStage,
  cleanCharacterNameForSearch,
  extractHistoricalPhotoYear,
  isGenericOrNonFacePhoto,
  isSpamOrNonCharacterPhoto,
  matchesCharacterPhotoIdentity,
  rankAndAssignStagePhotosToScenes,
  type StorySceneSummaryInput,
  type VerifiedStagePhotoCandidate,
} from './storyStagePhotoPlanner';

const sampleWillSampsonScenes: StorySceneSummaryInput[] = [
  {
    id: 's1',
    order: 1,
    title: 'Mở đầu: Bước vào kiệt tác điện ảnh',
    sceneType: 'video',
    narrationText: 'Yet Will Sampson walked into one of the greatest films ever made.',
    archivalKeywords: 'Will Sampson Chief Bromden 1975',
  },
  {
    id: 's2',
    order: 2,
    title: 'Tuổi thơ tại Okmulgee (1933)',
    sceneType: 'image',
    narrationText: 'Okmulgee, Oklahoma, September 27th, 1933. A baby boy is born and grew up tall.',
    archivalKeywords: 'Will Sampson young Oklahoma',
  },
  {
    id: 's3',
    order: 3,
    title: 'Đam mê đầu đời: Những đấu trường Rodeo',
    sceneType: 'video',
    narrationText: 'His first love was the rodeo. Year after year he climbed onto bucking broncos.',
    archivalKeywords: 'Will Sampson rodeo cowboy',
  },
  {
    id: 's4',
    order: 4,
    title: 'Người nghệ sĩ cầm cọ vẽ giữa những mùa Rodeo',
    sceneType: 'image',
    narrationText: 'He picked up a paintbrush and painted pictures of Native life. The cowboy was a gifted artist.',
    archivalKeywords: 'Will Sampson painter artist',
  },
  {
    id: 's5',
    order: 5,
    title: 'Tù trưởng Ten Bears đối diện Clint Eastwood (1976)',
    sceneType: 'image',
    narrationText: 'As Chief Ten Bears in "The Outlaw Josey Wales", face to face with Clint Eastwood.',
    archivalKeywords: 'Will Sampson The Outlaw Josey Wales 1976',
  },
  {
    id: 's6',
    order: 6,
    title: 'Sự ra đi ở tuổi 53 (1987)',
    sceneType: 'image',
    narrationText: 'On June 3rd, 1987, Will Sampson passed away after a transplant.',
    archivalKeywords: 'Will Sampson 1986 later years',
  },
];

test('cleanCharacterNameForSearch strips Vietnamese documentary subtitles', () => {
  assert.equal(
    cleanCharacterNameForSearch('Will Sampson — Tiểu Sử Huyền Thoại Điện Ảnh'),
    'Will Sampson'
  );
  assert.equal(
    cleanCharacterNameForSearch('Clint Eastwood (Biography)'),
    'Clint Eastwood'
  );
});

test('classifySceneStoryStage detects distinct narrative stages and years', () => {
  const birth = classifySceneStoryStage(sampleWillSampsonScenes[1], 1, 6, 'Will Sampson');
  assert.equal(birth.stage, 'early-life');
  assert.equal(birth.targetYear, 1933);

  const rodeo = classifySceneStoryStage(sampleWillSampsonScenes[2], 2, 6, 'Will Sampson');
  assert.equal(rodeo.stage, 'breakthrough');
  assert.equal(rodeo.allowContextualMultiPerson, false);

  const painter = classifySceneStoryStage(sampleWillSampsonScenes[3], 3, 6, 'Will Sampson');
  assert.equal(painter.stage, 'personal-behind-scenes');

  const western = classifySceneStoryStage(sampleWillSampsonScenes[4], 4, 6, 'Will Sampson');
  assert.equal(western.stage, 'peak-cinema');
  assert.equal(western.targetYear, 1976);
  assert.equal(western.allowContextualMultiPerson, true);

  const passing = classifySceneStoryStage(sampleWillSampsonScenes[5], 5, 6, 'Will Sampson');
  assert.equal(passing.stage, 'later-years');
  assert.equal(passing.targetYear, 1987);
});

test('buildRichStagePhotoQueries produces diverse queries covering multiple life stages', () => {
  const withScenes = buildRichStagePhotoQueries('Will Sampson', sampleWillSampsonScenes, {
    maxQueries: 10,
  });
  assert.ok(withScenes.length >= 7, `expected >= 7 stage queries, got ${withScenes.length}`);
  const distinctStages = new Set(withScenes.map((q) => q.stage));
  assert.ok(distinctStages.size >= 4, `expected >= 4 distinct stages, got ${distinctStages.size}`);

  const withoutScenes = buildRichStagePhotoQueries('Clint Eastwood', []);
  assert.ok(withoutScenes.length >= 6);
  assert.ok(withoutScenes.some((q) => q.stage === 'early-life'));
  assert.ok(withoutScenes.some((q) => q.stage === 'peak-cinema'));
  assert.ok(withoutScenes.some((q) => q.stage === 'later-years'));
});

test('rankAndAssignStagePhotosToScenes matches chronological stage photos uniquely without duplicates', () => {
  const pool: VerifiedStagePhotoCandidate[] = [
    {
      title: 'Will Sampson young Oklahoma portrait 1954',
      dataUrl: 'data:image/jpeg;base64,YOUNG',
      sourceUrl: 'https://example.com/young-1954.jpg',
      width: 720,
      height: 960,
      year: 1954,
      stage: 'early-life',
    },
    {
      title: 'Will Sampson rodeo cowboy riding 1965',
      dataUrl: 'data:image/jpeg;base64,RODEO',
      sourceUrl: 'https://example.com/rodeo-1965.jpg',
      width: 900,
      height: 700,
      year: 1965,
      stage: 'breakthrough',
    },
    {
      title: 'Will Sampson painter artist canvas 1972',
      dataUrl: 'data:image/jpeg;base64,ARTIST',
      sourceUrl: 'https://example.com/artist-1972.jpg',
      width: 720,
      height: 900,
      year: 1972,
      stage: 'personal-behind-scenes',
    },
    {
      title: 'Will Sampson One Flew Over the Cuckoos Nest 1975',
      dataUrl: 'data:image/jpeg;base64,CUCKOO',
      sourceUrl: 'https://example.com/cuckoo-1975.jpg',
      width: 800,
      height: 600,
      year: 1975,
      stage: 'peak-cinema',
    },
    {
      title: 'Will Sampson The Outlaw Josey Wales 1976',
      dataUrl: 'data:image/jpeg;base64,WALES',
      sourceUrl: 'https://example.com/wales-1976.jpg',
      width: 800,
      height: 600,
      year: 1976,
      stage: 'peak-cinema',
    },
    {
      title: 'Will Sampson Poltergeist later years 1986',
      dataUrl: 'data:image/jpeg;base64,LATER',
      sourceUrl: 'https://example.com/later-1986.jpg',
      width: 720,
      height: 960,
      year: 1986,
      stage: 'later-years',
    },
  ];

  const result = rankAndAssignStagePhotosToScenes(
    sampleWillSampsonScenes,
    pool,
    'Will Sampson'
  );

  // Image scenes get exact chronological/semantic stage matches
  assert.equal(result.assignedBySceneId['s2']?.dataUrl, 'data:image/jpeg;base64,YOUNG');
  assert.equal(result.assignedBySceneId['s4']?.dataUrl, 'data:image/jpeg;base64,ARTIST');
  assert.equal(result.assignedBySceneId['s5']?.dataUrl, 'data:image/jpeg;base64,WALES');
  assert.equal(result.assignedBySceneId['s6']?.dataUrl, 'data:image/jpeg;base64,LATER');

  // Video scenes get distinct remaining stage-matched reference photos (zero overlap!)
  assert.equal(result.referenceBySceneId['s1']?.dataUrl, 'data:image/jpeg;base64,CUCKOO');
  assert.equal(result.referenceBySceneId['s3']?.dataUrl, 'data:image/jpeg;base64,RODEO');

  const allAssignedRefUrls = Object.values(result.referenceBySceneId).map((p) => p.dataUrl);
  assert.equal(new Set(allAssignedRefUrls).size, 6);
});

test('matchesCharacterPhotoIdentity blocks wrong people, military records, and unrelated titles', () => {
  // Real Will Sampson titles pass
  assert.equal(
    matchesCharacterPhotoIdentity('Will Sampson as Chief Bromden in One Flew Over the Cuckoo Nest 1975', 'Will Sampson'),
    true
  );
  assert.equal(
    matchesCharacterPhotoIdentity('Will Sampson rodeo cowboy vintage photo', 'Will Sampson'),
    true
  );

  // Wrong people & leaks observed in real search must be rejected
  assert.equal(
    matchesCharacterPhotoIdentity('Jeff Koons Height, Weight, Religion, Net Worth, Age, Bio', 'Will Sampson'),
    false
  );
  assert.equal(
    matchesCharacterPhotoIdentity('Obvious Movie Mistakes That Made It Into The Final Cut', 'Will Sampson'),
    false
  );
  assert.equal(
    matchesCharacterPhotoIdentity('Studio portrait of 3445 Private William Eric Sampson, 13th Battalion', 'Will Sampson'),
    false
  );
  assert.equal(
    matchesCharacterPhotoIdentity('Will Eric Sampson portrait', 'Will Sampson'),
    false
  );
  assert.equal(
    matchesCharacterPhotoIdentity('Vintage O/b Native American Scene Painting William Samps', 'Will Sampson'),
    false
  );
});

test('isSpamOrNonCharacterPhoto filters bio spam, clickbait listicles, and art marketplaces', () => {
  assert.equal(
    isSpamOrNonCharacterPhoto('Jeff Koons Height, Weight, Religion, Net Worth, Age, Bio'),
    true
  );
  assert.equal(
    isSpamOrNonCharacterPhoto('Obvious Movie Mistakes That Made It Into The Final Cut'),
    true
  );
  assert.equal(
    isSpamOrNonCharacterPhoto('16 Greatest Native American Actors of All Time – PeepsTu'),
    true
  );
  assert.equal(
    isSpamOrNonCharacterPhoto('Sampson Art for Sale - Fine Art America', 'https://images.fineartamerica.com/x.jpg'),
    true
  );
  assert.equal(
    isSpamOrNonCharacterPhoto('Vintage O/b Native American Scene Painting William Samps'),
    true
  );
  assert.equal(
    isSpamOrNonCharacterPhoto('Will Sampson behind the scenes painting portrait 1976', 'https://example.com/will.jpg'),
    false
  );
});

test('extractHistoricalPhotoYear ignores birth-death lifespans and modern article publish years', () => {
  assert.equal(
    extractHistoricalPhotoYear('Will Sampson (September 27, 1933 – June 3, 1987)'),
    null
  );
  assert.equal(
    extractHistoricalPhotoYear('Will Sampson 1933–1987 Biography Facts (2024)'),
    null
  );
  assert.equal(
    extractHistoricalPhotoYear('Will Sampson on set of The Outlaw Josey Wales 1976'),
    1976
  );
  assert.equal(
    extractHistoricalPhotoYear('Will Sampson portrait', 'https://blog.example.com/2023/08/will-sampson.jpg'),
    null
  );
});

test('isGenericOrNonFacePhoto blocks split-screen collages, then-and-now comparisons, and distant crowd/back-view shots', () => {
  assert.equal(isGenericOrNonFacePhoto('Dolly Parton Then and Now Transformation'), true);
  assert.equal(isGenericOrNonFacePhoto('Dolly Parton before and after side by side split screen'), true);
  assert.equal(isGenericOrNonFacePhoto('Dolly Parton concert crowd stage wide shot'), true);
  assert.equal(isGenericOrNonFacePhoto('Singer back view silhouette on full stage'), true);
  assert.equal(isGenericOrNonFacePhoto('Dolly Parton solo studio portrait closeup 1977'), false);
});

test('rankAndAssignStagePhotosToScenes strongly prefers clear solo portrait over wide generic stage photo', () => {
  const scenes: StorySceneSummaryInput[] = [
    {
      id: 'd1',
      order: 1,
      title: 'Giọng ca vàng Dolly Parton',
      sceneType: 'image',
      narrationText: 'Dolly Parton smiled warmly under the spotlight.',
      archivalKeywords: 'Dolly Parton singer',
    },
  ];
  const pool: VerifiedStagePhotoCandidate[] = [
    {
      title: 'Dolly Parton concert stage wide shot crowd',
      dataUrl: 'data:image/jpeg;base64,WIDE_GENERIC',
      sourceUrl: 'https://example.com/stage-wide.jpg',
      width: 1600,
      height: 900,
      year: 1978,
      stage: 'peak-cinema',
    },
    {
      title: 'Dolly Parton solo studio portrait closeup face',
      dataUrl: 'data:image/jpeg;base64,CLEAR_PORTRAIT',
      sourceUrl: 'https://example.com/portrait-closeup.jpg',
      width: 800,
      height: 1066,
      year: 1978,
      stage: 'peak-cinema',
    },
  ];

  const res = rankAndAssignStagePhotosToScenes(scenes, pool, 'Dolly Parton');
  assert.equal(res.assignedBySceneId['d1']?.dataUrl, 'data:image/jpeg;base64,CLEAR_PORTRAIT');
});


