export type StoryPhotoStageId =
  | 'early-life'
  | 'breakthrough'
  | 'peak-cinema'
  | 'personal-behind-scenes'
  | 'later-years'
  | 'legacy-portrait';

export interface StorySceneSummaryInput {
  id: string;
  order?: number;
  title?: string;
  sceneType?: string;
  narrationText?: string;
  archivalKeywords?: string;
  visualPrompt?: string;
}

export interface SceneStageAnalysis {
  sceneId: string;
  stage: StoryPhotoStageId;
  stageLabelVi: string;
  stageShortVi: string;
  targetYear: number | null;
  allowContextualMultiPerson: boolean;
  extractedHints: string[];
  querySuggestions: string[];
}

export interface StageSearchQueryPlan {
  query: string;
  stage: StoryPhotoStageId;
  stageLabelVi: string;
  allowMultiSubject: boolean;
  targetYear: number | null;
  priority: number;
}

export interface VerifiedStagePhotoCandidate {
  title: string;
  dataUrl: string;
  sourceUrl: string;
  width: number;
  height: number;
  year: number | null;
  stage?: StoryPhotoStageId;
  stageLabel?: string;
}

export const STORY_STAGE_META: Record<
  StoryPhotoStageId,
  {
    labelVi: string;
    shortVi: string;
    defaultQueryModifiers: string[];
    allowMultiSubject: boolean;
    chronologicalOrder: number;
  }
> = {
  'early-life': {
    labelVi: 'Tuổi Trẻ & Xuất Thân',
    shortVi: 'Tuổi trẻ',
    defaultQueryModifiers: ['young', 'early life', 'vintage portrait', 'early career'],
    allowMultiSubject: false,
    chronologicalOrder: 1,
  },
  breakthrough: {
    labelVi: 'Khởi Nghiệp & Bước Ngoặt',
    shortVi: 'Bước ngoặt',
    defaultQueryModifiers: ['early role', 'classic photo', 'career beginning', 'vintage'],
    allowMultiSubject: true,
    chronologicalOrder: 2,
  },
  'peak-cinema': {
    labelVi: 'Đỉnh Cao Điện Ảnh & Vai Diễn',
    shortVi: 'Đỉnh cao phim',
    defaultQueryModifiers: ['movie still', 'film scene', 'classic cinema', 'premiere'],
    allowMultiSubject: true,
    chronologicalOrder: 3,
  },
  'personal-behind-scenes': {
    labelVi: 'Đời Tư, Đam Mê & Hậu Trường',
    shortVi: 'Hậu trường',
    defaultQueryModifiers: ['candid photo', 'behind the scenes', 'interview', 'off screen'],
    allowMultiSubject: true,
    chronologicalOrder: 4,
  },
  'later-years': {
    labelVi: 'Những Năm Sau Này',
    shortVi: 'Sau này',
    defaultQueryModifiers: ['later years', 'elder', 'award ceremony', 'press photo'],
    allowMultiSubject: true,
    chronologicalOrder: 5,
  },
  'legacy-portrait': {
    labelVi: 'Chân Dung Huyền Thoại & Di Sản',
    shortVi: 'Di sản',
    defaultQueryModifiers: ['portrait photograph', 'studio portrait', 'classic headshot'],
    allowMultiSubject: false,
    chronologicalOrder: 6,
  },
};

export function extractYearFromStoryText(text: string): number | null {
  const matches = text.match(/\b(19[0-9]\d|20[0-2]\d)\b/g);
  if (!matches || matches.length === 0) return null;
  for (const raw of matches) {
    const yr = Number(raw);
    if (yr >= 1910 && yr <= 2026) return yr;
  }
  return null;
}

export function extractDecadeFromStoryText(text: string): string | null {
  const decadeMatch = text.match(/\b((?:19[2-9]|20[0-2])0s)\b/i);
  if (decadeMatch) return decadeMatch[1];
  const yr = extractYearFromStoryText(text);
  if (yr) return `${Math.floor(yr / 10) * 10}s`;
  return null;
}

export function cleanCharacterNameForSearch(rawTopic: string): string {
  return String(rawTopic || '')
    .replace(/[—–|].*$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(tiểu sử|huyền thoại|cuộc đời|phim|tribute|biography|documentary|story)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const NON_PERSON_ENTITY_BAN_REGEX =
  /\b(uss|hms|radar|destroyer|battleship|submarine|frigate|cruiser|aircraft|airport|station|county|township|highway|bridge|freeway|rifle|gun|firearm|chassis|rail|handguard|receiver|stock|barrel|scope|optic|mount|trigger|ammo|cartridge|knife|blade|tool|wrench|socket|clamp|adapter|gear|device|machine|appliance|hardware|manufacturing|mfg)\b/i;

const MILITARY_SERVICE_RECORD_BAN_REGEX =
  /\b(private|corporal|sergeant|lieutenant|captain|major|colonel|battalion|regiment|infantry|wwi|ww1|australian\s+war\s+memorial|service\s+number|enlisted)\b/i;

const SPAM_OR_NON_CHARACTER_PHOTO_REGEX =
  /\b(net\s*worth|height,\s*weight|weight,\s*height|religion,\s*net|wiki\s*bio|age,\s*bio|bio,\s*wiki|married,\s*wife,\s*net|movie\s+mistakes|mistakes\s+that\s+made|greatest\s+[a-z\s]{0,24}actors|top\s+\d+|best\s+\d+|\d+\s+greatest|\d+\s+best|\d+\s+famous|\d+\s+most\s+|ranked\b|list\s+of\s+|things\s+you\s+didn'?t\s+know|fineartamerica|pixels\.com|saatchiart|artfinder|liveauctioneers|invaluable\.com|artnet\.com|mutualart|art\s+for\s+sale|oil\s+on\s+(board|canvas|panel)|o\/b\b|canvas\s+print|framed\s+print|art\s+print|poster\s+print|scene\s+painting|painting\s+by|watercolor\s+painting|acrylic\s+painting|auction\s+lot)\b/i;

export function matchesCharacterPhotoIdentity(
  rawText: string,
  characterName: string,
  options: { allowMilitaryContext?: boolean } = {}
): boolean {
  const cleanName = cleanCharacterNameForSearch(characterName);
  const tokens = cleanName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (tokens.length === 0) return true;

  const normalized = String(rawText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/.,:|()[\]-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return false;
  if (NON_PERSON_ENTITY_BAN_REGEX.test(normalized)) return false;

  if (
    !options.allowMilitaryContext &&
    MILITARY_SERVICE_RECORD_BAN_REGEX.test(normalized)
  ) {
    return false;
  }

  if (tokens.length === 1) {
    return new RegExp(`\\b${escapeRegExp(tokens[0])}\\b`, 'i').test(normalized);
  }

  const firstToken = tokens[0];
  const lastToken = tokens[tokens.length - 1];

  // Strict whole-word boundary check so "will" does NOT accidentally match "william" (e.g. "Private William Eric Sampson")
  const hasFirst = new RegExp(`\\b${escapeRegExp(firstToken)}\\b`, 'i').test(normalized);
  const hasLast = new RegExp(`\\b${escapeRegExp(lastToken)}\\b`, 'i').test(normalized);

  if (!hasFirst || !hasLast) return false;

  // Reject distinct middle-named person when an unrelated middle name sits right between first & last (e.g. "John Wayne Gacy" or "Will Eric Sampson")
  if (tokens.length === 2) {
    const betweenMatch = normalized.match(
      new RegExp(`\\b${escapeRegExp(firstToken)}\\s+([a-z]{3,16})\\s+${escapeRegExp(lastToken)}\\b`, 'i')
    );
    if (betweenMatch) {
      const middleWord = betweenMatch[1];
      const harmlessBridgeWords = new Set(['jr', 'sr', 'the', 'and', 'with', 'as', 'in', 'at', 'of', 'on']);
      if (!harmlessBridgeWords.has(middleWord)) {
        return false;
      }
    }
  }

  return true;
}

export function isSpamOrNonCharacterPhoto(
  title: string,
  imageUrl = '',
  pageUrl = ''
): boolean {
  const combined = `${title || ''} ${imageUrl || ''} ${pageUrl || ''}`;
  return SPAM_OR_NON_CHARACTER_PHOTO_REGEX.test(combined);
}

export function extractHistoricalPhotoYear(
  title: string,
  fallbackMetadata = ''
): number | null {
  const scan = (raw: string): number | null => {
    if (!raw) return null;
    // 1. Strip birth–death lifespan spans like "(September 27, 1933 – June 3, 1987)" or "1933–1987"
    let cleaned = raw
      .replace(
        /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s*(?:18|19|20)\d{2}\s*[–—-]\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s*(?:18|19|20)\d{2}\b/gi,
        ' '
      )
      .replace(/\b(?:18|19|20)\d{2}\s*[–—-]\s*(?:18|19|20)\d{2}\b/g, ' ')
      .replace(/\b(?:born|died|b\.|d\.)\s*(?:in\s+)?(?:18|19|20)\d{2}\b/gi, ' ');

    // 2. Ignore URL path upload/publish dates if any URL crept into text
    cleaned = cleaned.replace(/https?:\/\/\S+/gi, ' ');

    // 3. Ignore recent article publish years (2020-2026) when the title is a bio/tribute/editorial article
    const looksLikeModernArticle =
      /\b(bio|biography|tribute|remembering|facts|legacy|story|imdb|wiki|alchetron|find\s+a\s+grave|famous|greatest|best|updated)\b/i.test(
        cleaned
      );

    const matches = cleaned.match(/\b(19[1-9]\d|20[0-2]\d)\b/g);
    if (!matches) return null;

    for (const rawYr of matches) {
      const yr = Number(rawYr);
      if (yr < 1910 || yr > 2026) continue;
      if (looksLikeModernArticle && yr >= 2020) continue;
      return yr;
    }
    return null;
  };

  return scan(title) ?? scan(fallbackMetadata);
}

function extractNotableSceneKeywords(
  scene: StorySceneSummaryInput,
  characterName: string
): string[] {
  const charTokens = new Set(
    characterName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );

  const hints: string[] = [];

  // 1. Quoted film or work titles in narration or title (e.g., "One Flew Over the Cuckoo's Nest")
  const combinedRaw = `${scene.title || ''} ${scene.narrationText || ''}`;
  const quotedMatches = combinedRaw.match(/["“']([A-Za-z0-9][A-Za-z0-9\s'’:&-]{3,42})["”']/g) || [];
  for (const m of quotedMatches) {
    const cleaned = m.replace(/^["“']|["”']$/g, '').trim();
    if (cleaned.length >= 4 && !hints.includes(cleaned)) {
      hints.push(cleaned);
    }
  }

  // 2. Clean archivalKeywords (stripped of generic filler)
  if (scene.archivalKeywords) {
    const cleanedKw = scene.archivalKeywords
      .replace(/\b(hd|4k|scene|clip|clips|video|shorts|youtube|tiktok|photo|photograph|portrait|closeup|close-up|solo|single)\b/gi, ' ')
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanedKw.length >= 3) {
      const words = cleanedKw
        .split(' ')
        .filter((w) => w.length >= 2 && !charTokens.has(w.toLowerCase()));
      if (words.length > 0) {
        hints.push(words.slice(0, 5).join(' '));
      }
    }
  }

  // 3. Domain-specific visual motifs from English narration
  const motifPatterns: Array<{ regex: RegExp; hint: string }> = [
    { regex: /\b(rodeo|cowboy|bronco|ranch|horseback|western)\b/i, hint: 'rodeo cowboy western' },
    { regex: /\b(paint|painter|paintbrush|canvas|artist|art)\b/i, hint: 'artist painter' },
    { regex: /\b(oscar|academy\s+award|golden\s+globe|award|ceremony)\b/i, hint: 'academy awards ceremony' },
    { regex: /\b(soldier|army|navy|war|military|marine|veteran)\b/i, hint: 'military uniform vintage' },
    { regex: /\b(martial\s+arts|kung\s+fu|karate|boxing|ring|fight)\b/i, hint: 'martial arts action' },
    { regex: /\b(guitar|singer|concert|stage|music|band|microphone)\b/i, hint: 'concert stage performance' },
    { regex: /\b(director|directing|camera|behind\s+the\s+scenes|on\s+set|filming)\b/i, hint: 'on set behind the scenes' },
    { regex: /\b(family|wife|husband|wedding|married|son|daughter|children)\b/i, hint: 'family candid' },
    { regex: /\b(activist|founder|registry|community|speech|speaking|advocate)\b/i, hint: 'speaking event' },
    { regex: /\b(childhood|born|baby|boy|girl|school|teen|grew\s+up|youth)\b/i, hint: 'young vintage' },
  ];

  const narrationLower = `${scene.title || ''} ${scene.narrationText || ''}`;
  for (const mp of motifPatterns) {
    if (mp.regex.test(narrationLower) && !hints.includes(mp.hint)) {
      hints.push(mp.hint);
    }
  }

  return hints.slice(0, 4);
}

export function classifySceneStoryStage(
  scene: StorySceneSummaryInput,
  index: number,
  totalScenes: number,
  characterName = ''
): SceneStageAnalysis {
  const combined = `${scene.title || ''} ${scene.narrationText || ''} ${scene.archivalKeywords || ''} ${scene.visualPrompt || ''}`;
  const targetYear = extractYearFromStoryText(combined);
  const ratio = totalScenes > 1 ? index / (totalScenes - 1) : 0.5;
  const extractedHints = extractNotableSceneKeywords(scene, characterName);

  let stage: StoryPhotoStageId;

  if (
    /\b(born|birth|childhood|baby|grew\s+up|young\s+man|young\s+woman|teen|youth|hometown|tuổi\s*thơ|xuất\s*thân|chào\s*đời|niên\s*thiếu|thanh\s*niên|trẻ)\b/i.test(
      combined
    )
  ) {
    stage = 'early-life';
  } else if (
    /\b(passed\s+away|died|death|final\s+years|later\s+years|last\s+role|transplant|elder|aging|sự\s*ra\s*đi|qua\s*đời|những\s*năm\s*cuối|tuổi\s*già|về\s*già)\b/i.test(
      combined
    )
  ) {
    stage = 'later-years';
  } else if (
    /\b(legacy|footprints|remember|legend|tribute|inspiration|di\s*sản|huyền\s*thoại|tưởng\s*nhớ|kết\s*thúc)\b/i.test(
      combined
    ) &&
    ratio >= 0.7
  ) {
    stage = 'legacy-portrait';
  } else if (
    /\b(oscar|academy\s+award|theater|film|movie|starring|beside|co-star|face\s+to\s+face|ending|role|cuckoo|wales|hollywood|premiere|điện\s*ảnh|giải\s*oscar|vai\s*diễn|rạp\s*phim|kiệt\s*tác|sánh\s*vai)\b/i.test(
      combined
    )
  ) {
    stage = 'peak-cinema';
  } else if (
    /\b(off\s+screen|painter|paintbrush|artist|family|wife|husband|married|activist|registry|behind\s+the\s+scenes|interview|candid|đời\s*thực|ngoài\s*đời|hậu\s*trường|họa\s*sĩ|gia\s*đình|thế\s*hệ)\b/i.test(
      combined
    )
  ) {
    stage = 'personal-behind-scenes';
  } else if (
    /\b(rodeo|first\s+love|audition|search\s+for|breakthrough|debut|discovered|started|bước\s*ngoặt|khởi\s*đầu|tìm\s*kiếm|đam\s*mê\s*đầu\s*đời)\b/i.test(
      combined
    )
  ) {
    stage = 'breakthrough';
  } else {
    // Fallback by chronological story position
    if (ratio <= 0.2) stage = 'early-life';
    else if (ratio <= 0.4) stage = 'breakthrough';
    else if (ratio <= 0.68) stage = 'peak-cinema';
    else if (ratio <= 0.85) stage = 'personal-behind-scenes';
    else stage = 'legacy-portrait';
  }

  const meta = STORY_STAGE_META[stage];
  const allowContextualMultiPerson =
    meta.allowMultiSubject ||
    /\b(beside|with|co-star|cast|scene|movie|film|award|oscar|family|rodeo|cowboy|couple|ceremony|reunion|interview)\b/i.test(
      combined
    );

  const cleanChar = cleanCharacterNameForSearch(characterName);
  const querySuggestions: string[] = [];

  if (cleanChar) {
    if (extractedHints.length > 0) {
      const leadHint = extractedHints[0];
      const withYear = targetYear && !leadHint.includes(String(targetYear))
        ? `${cleanChar} ${leadHint} ${targetYear}`
        : `${cleanChar} ${leadHint}`;
      querySuggestions.push(withYear.replace(/\s+/g, ' ').trim());
    }
    if (targetYear) {
      querySuggestions.push(`${cleanChar} ${targetYear} photo`);
    }
    querySuggestions.push(`${cleanChar} ${meta.defaultQueryModifiers[0]} photo`);
  }

  return {
    sceneId: scene.id,
    stage,
    stageLabelVi: meta.labelVi,
    stageShortVi: meta.shortVi,
    targetYear,
    allowContextualMultiPerson,
    extractedHints,
    querySuggestions: Array.from(new Set(querySuggestions)).slice(0, 3),
  };
}

export function buildRichStagePhotoQueries(
  rawCharacterName: string,
  scenes: StorySceneSummaryInput[] = [],
  options: {
    storyMode?: string;
    secondaryPerson?: string;
    maxQueries?: number;
  } = {}
): StageSearchQueryPlan[] {
  const cleanChar = cleanCharacterNameForSearch(rawCharacterName);
  if (!cleanChar) return [];

  const maxQueries = Math.max(6, Math.min(14, options.maxQueries ?? 10));
  const plans: StageSearchQueryPlan[] = [];
  const seenNormalized = new Set<string>();

  const addPlan = (plan: StageSearchQueryPlan) => {
    const key = plan.query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!key || seenNormalized.has(key)) return;
    seenNormalized.add(key);
    plans.push(plan);
  };

  const visualScenes = scenes.filter(
    (s) => s && s.sceneType !== 'quote' && s.sceneType !== 'outro'
  );

  // 1. Always start with canonical portrait + diverse core biographical life-stage queries
  addPlan({
    query: `${cleanChar} portrait photograph`,
    stage: 'legacy-portrait',
    stageLabelVi: STORY_STAGE_META['legacy-portrait'].labelVi,
    allowMultiSubject: false,
    targetYear: null,
    priority: 10,
  });

  if (options.secondaryPerson) {
    addPlan({
      query: `${cleanChar} ${options.secondaryPerson} photo`,
      stage: 'personal-behind-scenes',
      stageLabelVi: STORY_STAGE_META['personal-behind-scenes'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 9,
    });
  }

  // 2. Extract targeted storyline-stage queries directly from the user's scenes
  const stageCounts: Partial<Record<StoryPhotoStageId, number>> = {};
  const analyses = visualScenes.map((sc, idx) =>
    classifySceneStoryStage(sc, idx, visualScenes.length, cleanChar)
  );

  for (const analysis of analyses) {
    const countForStage = stageCounts[analysis.stage] || 0;
    if (countForStage >= 2) continue;

    const primarySuggestion = analysis.querySuggestions[0];
    if (primarySuggestion) {
      addPlan({
        query: primarySuggestion,
        stage: analysis.stage,
        stageLabelVi: analysis.stageLabelVi,
        allowMultiSubject: analysis.allowContextualMultiPerson,
        targetYear: analysis.targetYear,
        priority: analysis.extractedHints.length > 0 ? 9 : 7,
      });
      stageCounts[analysis.stage] = countForStage + 1;
    }
  }

  // 3. Ensure every core documentary life stage is represented so photo variety is always rich!
  const coreStageFallbacks: StageSearchQueryPlan[] = [
    {
      query: `${cleanChar} young early life photo`,
      stage: 'early-life',
      stageLabelVi: STORY_STAGE_META['early-life'].labelVi,
      allowMultiSubject: false,
      targetYear: null,
      priority: 8,
    },
    {
      query: `${cleanChar} movie still film scene`,
      stage: 'peak-cinema',
      stageLabelVi: STORY_STAGE_META['peak-cinema'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 8,
    },
    {
      query: `${cleanChar} candid behind the scenes photo`,
      stage: 'personal-behind-scenes',
      stageLabelVi: STORY_STAGE_META['personal-behind-scenes'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 7,
    },
    {
      query: `${cleanChar} premiere awards red carpet`,
      stage: 'breakthrough',
      stageLabelVi: STORY_STAGE_META.breakthrough.labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 7,
    },
    {
      query: `${cleanChar} later years interview photo`,
      stage: 'later-years',
      stageLabelVi: STORY_STAGE_META['later-years'].labelVi,
      allowMultiSubject: true,
      targetYear: null,
      priority: 6,
    },
    {
      query: `${cleanChar} classic vintage archival photograph`,
      stage: 'legacy-portrait',
      stageLabelVi: STORY_STAGE_META['legacy-portrait'].labelVi,
      allowMultiSubject: false,
      targetYear: null,
      priority: 6,
    },
  ];

  for (const fallback of coreStageFallbacks) {
    if (plans.length >= maxQueries) break;
    addPlan(fallback);
  }

  return plans.sort((a, b) => b.priority - a.priority).slice(0, maxQueries);
}

const SEMANTIC_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'their', 'his', 'her',
  'was', 'were', 'are', 'has', 'had', 'have', 'not', 'but', 'one', 'two', 'all',
  'photo', 'photograph', 'portrait', 'image', 'picture', 'jpg', 'jpeg', 'png', 'https', 'http', 'www', 'com',
]);

function tokenizeForOverlap(text: string, excludedTokens?: Set<string>): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        !SEMANTIC_STOPWORDS.has(w) &&
        !(excludedTokens && excludedTokens.has(w))
    );
}

export function inferPhotoStageFromMetadata(
  photo: Pick<VerifiedStagePhotoCandidate, 'title' | 'sourceUrl' | 'year' | 'stage'>,
  minPoolYear: number | null,
  maxPoolYear: number | null
): StoryPhotoStageId {
  if (photo.stage) return photo.stage;
  const text = `${photo.title || ''} ${photo.sourceUrl || ''}`;

  if (/\b(young|youth|child|kid|early|teen|boy|girl|high\s*school)\b/i.test(text)) {
    return 'early-life';
  }
  if (/\b(rodeo|debut|breakthrough|early\s*career|premiere|award|oscar)\b/i.test(text)) {
    return 'breakthrough';
  }
  if (/\b(still|scene|movie|film|cinema|set|character|role|actor|starring)\b/i.test(text)) {
    return 'peak-cinema';
  }
  if (/\b(candid|behind|interview|family|artist|painter|event|festival|press)\b/i.test(text)) {
    return 'personal-behind-scenes';
  }
  if (/\b(later|elder|final|tribute|memorial|veteran|senior)\b/i.test(text)) {
    return 'later-years';
  }

  if (photo.year && minPoolYear && maxPoolYear && maxPoolYear - minPoolYear >= 10) {
    const rel = (photo.year - minPoolYear) / (maxPoolYear - minPoolYear);
    if (rel <= 0.25) return 'early-life';
    if (rel <= 0.5) return 'breakthrough';
    if (rel <= 0.78) return 'peak-cinema';
    return 'later-years';
  }

  return 'legacy-portrait';
}

export interface ScenePhotoAssignmentResult {
  assignedBySceneId: Record<string, VerifiedStagePhotoCandidate>;
  referenceBySceneId: Record<string, VerifiedStagePhotoCandidate>;
  annotatedPool: VerifiedStagePhotoCandidate[];
}

export function rankAndAssignStagePhotosToScenes(
  scenes: StorySceneSummaryInput[],
  rawPool: VerifiedStagePhotoCandidate[],
  characterName = '',
  alreadyAssignedSceneIds: Set<string> = new Set()
): ScenePhotoAssignmentResult {
  // 1. Deduplicate pool by dataUrl / sourceUrl
  const uniquePool: VerifiedStagePhotoCandidate[] = [];
  const seenKeys = new Set<string>();
  for (const item of rawPool) {
    if (!item || !item.dataUrl) continue;
    const key = item.sourceUrl || item.dataUrl.slice(0, 120);
    if (seenKeys.has(key) || seenKeys.has(item.dataUrl.slice(0, 120))) continue;
    seenKeys.add(key);
    seenKeys.add(item.dataUrl.slice(0, 120));
    uniquePool.push({ ...item });
  }

  const years = uniquePool
    .map((p) => p.year)
    .filter((y): y is number => typeof y === 'number' && y >= 1910 && y <= 2026);
  const minYear = years.length > 0 ? Math.min(...years) : null;
  const maxYear = years.length > 0 ? Math.max(...years) : null;

  const annotatedPool = uniquePool.map((p) => {
    const inferredStage = inferPhotoStageFromMetadata(p, minYear, maxYear);
    return {
      ...p,
      stage: inferredStage,
      stageLabel: p.stageLabel || STORY_STAGE_META[inferredStage].labelVi,
    };
  });

  // Sort annotated pool smoothly by chronological order (year asc, then stage chronologicalOrder)
  annotatedPool.sort((a, b) => {
    const orderA = STORY_STAGE_META[a.stage || 'legacy-portrait'].chronologicalOrder;
    const orderB = STORY_STAGE_META[b.stage || 'legacy-portrait'].chronologicalOrder;
    if (a.year && b.year && a.year !== b.year) return a.year - b.year;
    if (orderA !== orderB) return orderA - orderB;
    return 0;
  });

  const visualScenes = scenes.filter(
    (sc) => sc && sc.sceneType !== 'quote' && sc.sceneType !== 'outro'
  );
  const analyses = visualScenes.map((sc, idx) =>
    classifySceneStoryStage(sc, idx, visualScenes.length, characterName)
  );
  const analysisById = new Map<string, SceneStageAnalysis>(
    analyses.map((a) => [a.sceneId, a])
  );
  const charExcludedTokens = new Set(tokenizeForOverlap(cleanCharacterNameForSearch(characterName)));

  const scorePhotoForScene = (
    photo: VerifiedStagePhotoCandidate,
    scene: StorySceneSummaryInput,
    sceneIdx: number,
    totalCount: number
  ): number => {
    const analysis = analysisById.get(scene.id);
    if (!analysis) return 0;

    let score = 0;
    const photoStage = photo.stage || 'legacy-portrait';

    // Exact narrative stage match
    if (photoStage === analysis.stage) {
      score += 18;
    } else {
      const stageDist = Math.abs(
        STORY_STAGE_META[photoStage].chronologicalOrder -
          STORY_STAGE_META[analysis.stage].chronologicalOrder
      );
      score += Math.max(0, 8 - stageDist * 3);
    }

    // Exact or near-year match
    if (analysis.targetYear && photo.year) {
      const diff = Math.abs(photo.year - analysis.targetYear);
      if (diff === 0) score += 30;
      else if (diff === 1) score += 20;
      else if (diff <= 4) score += 14;
      else if (diff <= 10) score += 6;
      else score -= Math.min(12, Math.floor(diff / 5));
    } else if (photo.year && minYear !== null && maxYear !== null && maxYear > minYear) {
      // Smooth chronological alignment across the documentary arc
      const sceneProgress = totalCount > 1 ? sceneIdx / (totalCount - 1) : 0.5;
      const photoProgress = (photo.year - minYear) / (maxYear - minYear);
      const progressDiff = Math.abs(sceneProgress - photoProgress);
      score += Math.round((1 - progressDiff) * 14);
    }

    // Semantic keyword overlap between scene hints/keywords and photo title (excluding character name & stopwords)
    const sceneTokens = new Set(
      tokenizeForOverlap(
        `${analysis.extractedHints.join(' ')} ${scene.archivalKeywords || ''} ${scene.title || ''}`,
        charExcludedTokens
      )
    );
    const photoTokens = new Set(
      tokenizeForOverlap(`${photo.title} ${photo.sourceUrl}`, charExcludedTokens)
    );
    let overlapHits = 0;
    for (const pt of photoTokens) {
      if (sceneTokens.has(pt)) overlapHits++;
    }
    score += Math.min(30, overlapHits * 8);

    // Slight preference for vertical/3:4 framing when scores tie
    const aspect = (photo.width || 720) / Math.max(1, photo.height || 960);
    if (aspect >= 0.6 && aspect <= 1.05) score += 2;

    return score;
  };

  const assignedBySceneId: Record<string, VerifiedStagePhotoCandidate> = {};
  const referenceBySceneId: Record<string, VerifiedStagePhotoCandidate> = {};
  const usedPhotoDataUrls = new Set<string>();

  const imageScenes = visualScenes.filter(
    (sc) => !alreadyAssignedSceneIds.has(sc.id) && sc.sceneType === 'image'
  );
  const videoScenesWithoutMedia = visualScenes.filter(
    (sc) => !alreadyAssignedSceneIds.has(sc.id) && sc.sceneType !== 'image'
  );

  // Prioritize 'image' scenes first so every static photo scene gets its best unique stage photo
  const primaryImageTargets =
    imageScenes.length > 0 ? imageScenes : visualScenes.filter((sc) => !alreadyAssignedSceneIds.has(sc.id));

  const pickBestForScene = (
    sc: StorySceneSummaryInput,
    sceneIdx: number,
    allowReuseFallback: boolean
  ): VerifiedStagePhotoCandidate | null => {
    const unused = annotatedPool.filter((p) => !usedPhotoDataUrls.has(p.dataUrl));
    const candidates = unused.length > 0 ? unused : allowReuseFallback ? annotatedPool : [];
    if (candidates.length === 0) return null;

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const cand of candidates) {
      const s = scorePhotoForScene(cand, sc, sceneIdx, visualScenes.length);
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }
    return best;
  };

  for (const sc of primaryImageTargets) {
    const sceneIdx = visualScenes.findIndex((v) => v.id === sc.id);
    const best = pickBestForScene(sc, sceneIdx, true);
    if (best) {
      usedPhotoDataUrls.add(best.dataUrl);
      assignedBySceneId[sc.id] = best;
      referenceBySceneId[sc.id] = best;
    }
  }

  // Assign distinct stage-matched reference photos to remaining 'video' scenes (so every video scene has a unique stage-relevant Ảnh Gốc!)
  for (const sc of videoScenesWithoutMedia) {
    if (referenceBySceneId[sc.id]) continue;
    const sceneIdx = visualScenes.findIndex((v) => v.id === sc.id);
    const best = pickBestForScene(sc, sceneIdx, true);
    if (best) {
      usedPhotoDataUrls.add(best.dataUrl);
      referenceBySceneId[sc.id] = best;
    }
  }

  return {
    assignedBySceneId,
    referenceBySceneId,
    annotatedPool,
  };
}
