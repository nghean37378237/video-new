import type { AspectRatioOption } from '../types';
import { getAspectRatioSpec } from './fullFrameHelper';
import { deduplicatePhotoPool } from './photoQualityInspector';
import {
  cleanCharacterNameForSearch,
  classifySceneStoryStage,
  isDrawingOrIllustrationPhoto,
  isGenericOrNonFacePhoto,
  isPosedPortraitOrHeadshotPhoto,
  type StoryPhotoStageId,
  type StorySceneSummaryInput,
} from './storyStagePhotoPlanner';

export type ClearFacePhotoCategory = 'film-still' | 'activity-scene' | 'portrait';
export type ClearFaceSearchMode = 'all' | ClearFacePhotoCategory;

export interface ClearFaceQueryPlan {
  query: string;
  category: ClearFacePhotoCategory;
  categoryLabelVi: string;
  bingFaceMode: 'face' | 'portrait';
  allowClassicStillAspect: boolean;
  allowMultiSubject: boolean;
  stage: StoryPhotoStageId;
  stageLabelVi: string;
  priority: number;
}

export interface ClearFacePhotoItem {
  id?: string;
  title: string;
  dataUrl: string;
  sourceUrl?: string;
  width: number;
  height: number;
  year?: number | null;
  stage?: StoryPhotoStageId;
  stageLabel?: string;
  photoCategory?: ClearFacePhotoCategory;
  photoCategoryLabel?: string;
  visualHash?: string;
  centerVisualHash?: string;
}

export const CLEAR_FACE_CATEGORY_META: Record<
  ClearFacePhotoCategory,
  {
    labelVi: string;
    shortVi: string;
    badgeEmoji: string;
    regTipVi: string;
  }
> = {
  'film-still': {
    labelVi: 'Cảnh Phim & Biểu Diễn Rõ Mặt',
    shortVi: 'Phim & Diễn',
    badgeEmoji: '🎬',
    regTipVi: 'Khung cảnh phim hoặc sân khấu biểu diễn rõ mặt — lý tưởng để reg video diễn xuất tự nhiên (Grok / Kling AI).',
  },
  'activity-scene': {
    labelVi: 'Ảnh Thực Tế & Hậu Trường',
    shortVi: 'Ảnh Thực Tế',
    badgeEmoji: '📸',
    regTipVi: 'Ảnh chụp thực tế ngoài đời / hậu trường / phỏng vấn — tạo chuyển động tự nhiên chân thực khi reg video.',
  },
  portrait: {
    labelVi: 'Chân Dung Studio',
    shortVi: 'Chân Dung',
    badgeEmoji: '👤',
    regTipVi: 'Chân dung studio (đã ẩn mặc định để ưu tiên ảnh thực tế và cảnh phim).',
  },
};

const FILM_STILL_SIGNAL_REGEX =
  /\b(movie|film|still|scene|cinema|starring|character|role|screenshot|screencap|screen\s*cap|episode|tv\s*series|television|western|drama|cuckoo|josey\s+wales|bromden|ten\s+bears|cast|trailer|production\s+still|publicity\s+still|in\s+the\s+movie|as\s+[A-Z][a-z]+|live\s+performance|in\s+concert|concert\s+stage|performing\s+live|on\s+stage|stage\s+performance|singing\s+live)\b/i;

const ACTIVITY_SCENE_SIGNAL_REGEX =
  /\b(behind\s+the\s+scenes|on\s+set|filming|directing|interview|speaking|speech|talk\s+show|press\s+conference|premiere|award|oscar|academy|ceremony|festival|candid|rodeo|horse|horseback|cowboy|riding|studio\s+work|guitar|singing|concert|performing|rehearsal|training|martial\s+arts|boxing|rally|activist|event|gala|backstage|off\s+screen|working|reading|writing|playing|real\s+life|archival|live)\b/i;

export function classifyClearFacePhotoCategory(
  title: string,
  sourceUrl = '',
  stage?: StoryPhotoStageId,
  fallbackCategory?: ClearFacePhotoCategory
): ClearFacePhotoCategory {
  const combined = `${title || ''} ${sourceUrl || ''}`;

  if (FILM_STILL_SIGNAL_REGEX.test(combined)) {
    return 'film-still';
  }
  if (ACTIVITY_SCENE_SIGNAL_REGEX.test(combined)) {
    return 'activity-scene';
  }
  if (isPosedPortraitOrHeadshotPhoto(title, sourceUrl)) {
    return 'portrait';
  }
  if (fallbackCategory && fallbackCategory !== 'portrait') {
    return fallbackCategory;
  }
  if (stage === 'peak-cinema') return 'film-still';
  return 'activity-scene';
}

export function getClearFaceCategoryLabel(category: ClearFacePhotoCategory): string {
  const meta = CLEAR_FACE_CATEGORY_META[category] || CLEAR_FACE_CATEGORY_META['activity-scene'];
  return `${meta.badgeEmoji} ${meta.shortVi}`;
}

interface ExtractedSceneVisualAnchors {
  filmOrRoleTerms: string[];
  activityTerms: string[];
  targetYear: number | null;
}

/**
 * Extracts concrete movie titles, named roles, and real-life physical activities
 * from a scene so search queries bring back clear-face film stills and activity frames
 * rather than repetitive studio mugshots.
 */
export function extractSceneFilmAndActivityAnchors(
  scene?: StorySceneSummaryInput | null,
  characterName = ''
): ExtractedSceneVisualAnchors {
  if (!scene) {
    return { filmOrRoleTerms: [], activityTerms: [], targetYear: null };
  }

  const combined = `${scene.title || ''} ${scene.narrationText || ''} ${scene.archivalKeywords || ''}`;
  const cleanCharLower = cleanCharacterNameForSearch(characterName).toLowerCase();
  const filmOrRoleTerms: string[] = [];
  const activityTerms: string[] = [];

  const pushUnique = (arr: string[], raw: string) => {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 3) return;
    if (cleaned.toLowerCase() === cleanCharLower) return;
    if (!arr.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
      arr.push(cleaned);
    }
  };

  // 1. Quoted titles / movie names (e.g., "One Flew Over the Cuckoo's Nest")
  const quoted = combined.match(/["“']([A-Za-z0-9][A-Za-z0-9\s'’:&-]{3,48})["”']/g) || [];
  for (const q of quoted) {
    pushUnique(filmOrRoleTerms, q.replace(/^["“']|["”']$/g, ''));
  }

  // 2. Named film / role patterns in English narration (e.g. "play Chief Bromden", "as Comanche Chief Ten Bears in The Outlaw Josey Wales")
  const rolePatterns = [
    /\b(?:play|played|as|role\s+of|starring\s+as)\s+(?:the\s+)?(?:proud\s+|silent\s+|young\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g,
    /\bin\s+((?:The\s+)?[A-Z][A-Za-z0-9'’-]+(?:\s+(?:of|the|in|over|on|and|to|[A-Z][A-Za-z0-9'’-]+)){1,5})/g,
  ];
  for (const regex of rolePatterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(combined)) !== null) {
      const candidate = (m[1] || '').trim();
      if (
        candidate.length >= 4 &&
        !/^(Native\s+American|American\s+West|Academy\s+Awards|Oklahoma|Hollywood|November|September|June)$/i.test(
          candidate
        )
      ) {
        pushUnique(filmOrRoleTerms, candidate);
      }
    }
  }

  // 3. Explicit activity motifs tied to clear visible face
  const activityPatterns: Array<{ regex: RegExp; phrase: string }> = [
    { regex: /\b(rodeo|bronco|cowboy|horseback|ranch|riding|western)\b/i, phrase: 'cowboy rodeo horseback' },
    { regex: /\b(paint|painter|paintbrush|canvas|artist|art)\b/i, phrase: 'painting artist studio' },
    { regex: /\b(oscar|academy\s+award|golden\s+globe|award|ceremony|premiere)\b/i, phrase: 'award ceremony premiere' },
    { regex: /\b(interview|speaking|speech|talk\s+show|registry|founder|advocate|activist)\b/i, phrase: 'interview speaking closeup' },
    { regex: /\b(behind\s+the\s+scenes|on\s+set|filming|director|directing|camera)\b/i, phrase: 'on set behind the scenes' },
    { regex: /\b(guitar|singer|singing|concert|stage|music|microphone)\b/i, phrase: 'singing guitar stage closeup' },
    { regex: /\b(martial\s+arts|kung\s+fu|karate|boxing|ring|training|fight)\b/i, phrase: 'training action closeup' },
    { regex: /\b(soldier|army|navy|war|military|marine|veteran)\b/i, phrase: 'uniform archival scene' },
  ];

  for (const ap of activityPatterns) {
    if (ap.regex.test(combined)) {
      pushUnique(activityTerms, ap.phrase);
    }
  }

  // 4. Clean archivalKeywords fallback if it contains concrete film/role tokens
  if (scene.archivalKeywords) {
    const cleanedKw = scene.archivalKeywords
      .replace(new RegExp(cleanCharLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
      .replace(/\b(hd|4k|video|shorts|youtube|tiktok|portrait|photo|photograph|closeup|close-up|solo|single)\b/gi, ' ')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanedKw.length >= 4) {
      if (/\b(movie|film|scene|still|nest|wales|role|character|chief|episode)\b/i.test(cleanedKw)) {
        pushUnique(filmOrRoleTerms, cleanedKw.split(' ').slice(0, 5).join(' '));
      } else {
        pushUnique(activityTerms, cleanedKw.split(' ').slice(0, 4).join(' '));
      }
    }
  }

  const stageInfo = classifySceneStoryStage(scene, scene.order ? scene.order - 1 : 0, 10, characterName);

  return {
    filmOrRoleTerms: filmOrRoleTerms.slice(0, 3),
    activityTerms: activityTerms.slice(0, 3),
    targetYear: stageInfo.targetYear,
  };
}

/**
 * Builds targeted clear-face search queries across Film Stills, Real-Life Activities,
 * and Clear Portraits for a given actor/character and scene.
 */
export function buildClearFaceSceneQueries(
  rawCharacterName: string,
  scene?: StorySceneSummaryInput | null,
  mode: ClearFaceSearchMode = 'all',
  options: { maxQueries?: number } = {}
): ClearFaceQueryPlan[] {
  const cleanChar = cleanCharacterNameForSearch(rawCharacterName);
  if (!cleanChar) return [];

  const maxQueries = Math.max(2, Math.min(8, options.maxQueries ?? (mode === 'all' ? 6 : 4)));
  const anchors = extractSceneFilmAndActivityAnchors(scene, cleanChar);
  const stageInfo = scene
    ? classifySceneStoryStage(scene, Math.max(0, (scene.order || 1) - 1), 10, cleanChar)
    : null;
  const yearSuffix = anchors.targetYear ? ` ${anchors.targetYear}` : '';

  const plans: ClearFaceQueryPlan[] = [];
  const seen = new Set<string>();

  const addPlan = (plan: ClearFaceQueryPlan) => {
    const key = plan.query.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    plans.push(plan);
  };

  const wantFilm = mode === 'all' || mode === 'film-still';
  const wantActivity = mode === 'all' || mode === 'activity-scene' || mode === 'portrait';

  const contextAll = `${rawCharacterName} ${scene?.title || ''} ${scene?.narrationText || ''} ${scene?.archivalKeywords || ''}`;
  const isPerformerOrSinger =
    /\b(singer|singing|song|concert|guitar|piano|album|musician|band|vocalist|tour|microphone|stage|grammy|elvis|presley|dolly\s+parton|sinatra|johnny\s+cash|whitney|michael\s+jackson|freddie\s+mercury|bob\s+dylan|celine|adele|taylor\s+swift|madonna|beyonce|cher|bowie|lennon|streisand|willie\s+nelson|ca\s*sĩ|biểu\s*diễn|sân\s*khấu)\b/i.test(
      contextAll
    );

  if (wantFilm) {
    if (anchors.filmOrRoleTerms.length > 0) {
      addPlan({
        query: `${cleanChar} ${anchors.filmOrRoleTerms[0]}`,
        category: 'film-still',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'peak-cinema',
        stageLabelVi: '🎬 Cảnh Phim & Biểu Diễn',
        priority: 10,
      });
    }
    if (isPerformerOrSinger) {
      addPlan({
        query: `${cleanChar} live concert singing on stage`,
        category: 'film-still',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'peak-cinema',
        stageLabelVi: '🎤 Cảnh Biểu Diễn Sân Khấu',
        priority: 10,
      });
      addPlan({
        query: `${cleanChar} performing live microphone closeup`,
        category: 'film-still',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'peak-cinema',
        stageLabelVi: '🎤 Cảnh Biểu Diễn Sân Khấu',
        priority: 9,
      });
    }
    addPlan({
      query: `${cleanChar} movie still`,
      category: 'film-still',
      categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
      bingFaceMode: 'face',
      allowClassicStillAspect: true,
      allowMultiSubject: true,
      stage: 'peak-cinema',
      stageLabelVi: '🎬 Cảnh Phim Rõ Mặt',
      priority: 9,
    });
    if (!isPerformerOrSinger) {
      addPlan({
        query: `${cleanChar} performing live stage tv appearance`,
        category: 'film-still',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'peak-cinema',
        stageLabelVi: '🎬 Cảnh Phim & Biểu Diễn',
        priority: 8,
      });
    }
    if (mode === 'film-still') {
      addPlan({
        query: `${cleanChar}${yearSuffix} film scene`,
        category: 'film-still',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'peak-cinema',
        stageLabelVi: '🎬 Cảnh Phim Rõ Mặt',
        priority: 8,
      });
      if (anchors.filmOrRoleTerms.length > 1) {
        addPlan({
          query: `${cleanChar} ${anchors.filmOrRoleTerms[1]}`,
          category: 'film-still',
          categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
          bingFaceMode: 'face',
          allowClassicStillAspect: true,
          allowMultiSubject: true,
          stage: 'peak-cinema',
          stageLabelVi: '🎬 Cảnh Phim Rõ Mặt',
          priority: 8,
        });
      } else {
        addPlan({
          query: isPerformerOrSinger
            ? `${cleanChar} singing stage concert performance`
            : `${cleanChar} actor scene closeup`,
          category: 'film-still',
          categoryLabelVi: CLEAR_FACE_CATEGORY_META['film-still'].labelVi,
          bingFaceMode: 'face',
          allowClassicStillAspect: true,
          allowMultiSubject: true,
          stage: 'peak-cinema',
          stageLabelVi: '🎬 Cảnh Phim & Biểu Diễn',
          priority: 7,
        });
      }
    }
  }

  if (wantActivity) {
    if (anchors.activityTerms.length > 0) {
      const shortAct = anchors.activityTerms[0].split(' ').slice(0, 2).join(' ');
      addPlan({
        query: `${cleanChar} ${shortAct}`,
        category: 'activity-scene',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['activity-scene'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'personal-behind-scenes',
        stageLabelVi: '🎯 Hoạt Động Rõ Mặt',
        priority: 10,
      });
    }
    addPlan({
        query: `${cleanChar} behind the scenes`,
        category: 'activity-scene',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['activity-scene'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'personal-behind-scenes',
        stageLabelVi: '📸 Ảnh Thực Tế',
        priority: 9,
      });
    addPlan({
      query: `${cleanChar} candid real life photo`,
      category: 'activity-scene',
      categoryLabelVi: CLEAR_FACE_CATEGORY_META['activity-scene'].labelVi,
      bingFaceMode: 'face',
      allowClassicStillAspect: true,
      allowMultiSubject: true,
      stage: 'personal-behind-scenes',
      stageLabelVi: '📸 Ảnh Thực Tế',
      priority: 9,
    });
    addPlan({
      query: `${cleanChar} interview on set`,
      category: 'activity-scene',
      categoryLabelVi: CLEAR_FACE_CATEGORY_META['activity-scene'].labelVi,
      bingFaceMode: 'face',
      allowClassicStillAspect: true,
      allowMultiSubject: true,
      stage: 'personal-behind-scenes',
      stageLabelVi: '📸 Ảnh Thực Tế',
      priority: 8,
    });
    if (mode === 'activity-scene') {
      addPlan({
        query: `${cleanChar}${yearSuffix} premiere event candid`,
        category: 'activity-scene',
        categoryLabelVi: CLEAR_FACE_CATEGORY_META['activity-scene'].labelVi,
        bingFaceMode: 'face',
        allowClassicStillAspect: true,
        allowMultiSubject: true,
        stage: 'personal-behind-scenes',
        stageLabelVi: '📸 Ảnh Thực Tế',
        priority: 7,
      });
    }
  }

  // Note: Never generate posed portrait/headshot queries — keep 100% movie scenes & real-life candid photography
  void stageInfo;
  return plans.sort((a, b) => b.priority - a.priority).slice(0, maxQueries);
}

/**
 * Ranks clear-face candidates so movie stills & real-life activity shots with clean faces
 * rise to the top while keeping strong diversity and pushing generic/non-face shots down.
 */
export function sortAndBalanceClearFacePhotos<T extends ClearFacePhotoItem>(
  photos: T[],
  preferredMode: ClearFaceSearchMode = 'all'
): Array<T & { photoCategory: ClearFacePhotoCategory; photoCategoryLabel: string }> {
  type TaggedItem = T & { photoCategory: ClearFacePhotoCategory; photoCategoryLabel: string };
  const cleanedRaw = photos.filter((p) => {
    if (!p || !p.dataUrl) return false;
    // Strictly block drawings/paintings/illustrations and posed studio portraits/headshots
    if (isDrawingOrIllustrationPhoto(p.title, p.sourceUrl || '')) return false;
    if (isPosedPortraitOrHeadshotPhoto(p.title, p.sourceUrl || '')) return false;
    return true;
  });

  // Multi-layer dedup: exact dataUrl, canonical Wikimedia/Pinterest URL, cropped title stem, & perceptual dHash
  const uniqueRaw = deduplicatePhotoPool(cleanedRaw);
  const deduped: TaggedItem[] = [];
  for (const p of uniqueRaw) {
    const classified = classifyClearFacePhotoCategory(p.title, p.sourceUrl || '', p.stage);
    const rawCat = p.photoCategory && p.photoCategory !== 'portrait' ? p.photoCategory : classified;
    if (rawCat === 'portrait') continue;
    deduped.push({
      ...p,
      photoCategory: rawCat,
      photoCategoryLabel:
        p.photoCategoryLabel && !/chân\s*dung/i.test(p.photoCategoryLabel)
          ? p.photoCategoryLabel
          : getClearFaceCategoryLabel(rawCat),
    });
  }

  const scoreItem = (item: TaggedItem): number => {
    let s = 0;
    const cat = item.photoCategory;
    if (preferredMode !== 'all') {
      if (cat === preferredMode) s += 35;
      else s -= 8;
    } else {
      if (cat === 'film-still') s += 16;
      else if (cat === 'activity-scene') s += 14;
    }

    const w = item.width || 720;
    const h = item.height || 960;
    const aspect = w / Math.max(1, h);
    if (aspect >= 0.62 && aspect <= 1.82) s += 12;
    else if (aspect > 1.82 && aspect <= 1.88) s += 4;
    else if (aspect > 1.88) s -= 24;

    if (Math.min(w, h) >= 480) s += 6;
    if (isGenericOrNonFacePhoto(item.title, item.sourceUrl || '')) s -= 50;
    return s;
  };

  const sorted = [...deduped].sort((a, b) => scoreItem(b) - scoreItem(a));

  if (preferredMode !== 'all') {
    return sorted;
  }

  // Interleave film-still and real-life activity-scene 50/50
  const buckets: Record<'film-still' | 'activity-scene', TaggedItem[]> = {
    'film-still': [],
    'activity-scene': [],
  };
  for (const item of sorted) {
    if (item.photoCategory === 'film-still') {
      buckets['film-still'].push(item);
    } else {
      buckets['activity-scene'].push(item);
    }
  }

  const balanced: TaggedItem[] = [];
  const order: Array<'film-still' | 'activity-scene'> = ['film-still', 'activity-scene'];
  let added = true;
  while (added) {
    added = false;
    for (const cat of order) {
      const next = buckets[cat].shift();
      if (next) {
        balanced.push(next);
        added = true;
      }
    }
  }
  return balanced;
}

/**
 * Generates an Image-to-Video (Grok / Kling AI) motion prompt specifically tailored to
 * a clear-face Movie Scene Still, Real-Life Activity Photo, or Portrait so the character's
 * face stays 100% locked and unmistakable during video generation ("reg video").
 */
export function buildRegVideoPromptForClearFaceStill(options: {
  characterName: string;
  sceneTitle: string;
  narrationText?: string;
  photoTitle?: string;
  photoCategory: ClearFacePhotoCategory;
  aspectRatio?: AspectRatioOption;
}): string {
  const cleanChar = cleanCharacterNameForSearch(options.characterName) || 'the character';
  const spec = getAspectRatioSpec(options.aspectRatio || '3:4');
  const contextSnippet = (options.narrationText || options.sceneTitle || '').trim().slice(0, 140);
  const photoRefHint = (options.photoTitle || '').replace(/^\[[^\]]+\]\s*/, '').trim().slice(0, 72);

  if (options.photoCategory === 'film-still') {
    return `[Kling AI / Grok I2V — Clear-Face Film Scene Identity Lock] [0-2s Opening Beat]: Starting from the exact movie still of ${cleanChar}${photoRefHint ? ` (${photoRefHint})` : ''}, keep 100% identical facial features, gaze, wardrobe, and vintage cinema set lighting -> [2-4s Character Acting Beat]: ${cleanChar} breathes naturally, shifts eyes with quiet emotional intensity, and delivers subtle authentic film acting matching "${contextSnippet || options.sceneTitle}" without turning away from camera -> [4-6s Camera & Atmosphere]: Smooth slow 35mm cinema dolly push-in keeping ${cleanChar}'s face sharp and clearly centered in frame, subtle film grain, natural depth of field. [${spec.ratio} vertical ${spec.width}x${spec.height}px, preserve 100% exact face identity of ${cleanChar}, clear front/three-quarter face view, 24fps cinematic realism, no face morphing, no occluded face, no black bars]`;
  }

  if (options.photoCategory === 'activity-scene') {
    return `[Kling AI / Grok I2V — Clear-Face Activity & Real-Life Identity Lock] [0-2s Opening Beat]: Starting from the real-life activity frame of ${cleanChar}${photoRefHint ? ` (${photoRefHint})` : ''}, preserve 100% exact facial likeness, expression, and surrounding real-world setting -> [2-4s Natural Activity Motion]: ${cleanChar} performs natural documentary movement (subtle hand/body motion, candid speaking or warm gaze toward camera) illustrating "${contextSnippet || options.sceneTitle}" while keeping the face fully lit and unobstructed -> [4-6s Documentary Camera]: Gentle handheld documentary lens push-in centered on ${cleanChar}'s clear expression, realistic natural lighting and motion physics. [${spec.ratio} vertical ${spec.width}x${spec.height}px, preserve 100% exact face identity of ${cleanChar}, clear visible face throughout, 24fps documentary realism, no face distortion, no black bars]`;
  }

  return `[Kling AI / Grok I2V — Clear-Face Portrait Identity Lock] [0-2s Opening Beat]: Starting from the sharp portrait of ${cleanChar}, maintain 100% exact facial structure, eyes, and authentic era lighting -> [2-4s Emotional Expression]: ${cleanChar} blinks naturally, breathes calmly, and gives a subtle dignified head turn and expressive gaze matching "${contextSnippet || options.sceneTitle}" -> [4-6s Cinematic Push-In]: Slow smooth dolly push-in on ${cleanChar}'s clear face with warm documentary rim lighting. [${spec.ratio} vertical ${spec.width}x${spec.height}px, preserve 100% exact face identity of ${cleanChar}, high motion realism, 24fps, no face morphing, no black bars]`;
}
